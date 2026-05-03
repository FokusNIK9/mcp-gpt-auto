/**
 * Auto-OpenAPI Generator — introspects MCP tools and generates OpenAPI 3.1
 * paths + Express routes so ChatGPT Custom GPT Actions can call any MCP tool
 * directly without going through the async queue.
 *
 * This replaces the need to manually maintain OpenAPI schemas for each tool.
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerFileSystemTools } from "../servers/filesystem/index.js";
import { registerShellTools } from "../servers/shell/index.js";
import { registerGitTools } from "../servers/git/index.js";
import { registerTaskTools } from "../servers/tasks/index.js";
import { registerSubagentTools } from "../servers/subagents/index.js";
import { registerReviewTools } from "../servers/review/index.js";
import { registerDesktopTools } from "../servers/desktop/index.js";

interface ToolEntry {
	description?: string;
	inputSchema?: unknown;
	callback: (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;
	enabled: boolean;
}

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
	if (!schema || typeof schema !== "object") {
		return { type: "object", properties: {} };
	}

	const z = schema as Record<string, unknown>;

	// ZodObject — has .shape
	if (z._def && typeof z._def === "object") {
		const def = z._def as Record<string, unknown>;
		const typeName = def.typeName as string | undefined;

		if (typeName === "ZodObject" && def.shape && typeof def.shape === "function") {
			const shape = (def.shape as () => Record<string, unknown>)();
			const properties: Record<string, unknown> = {};
			const required: string[] = [];

			for (const [key, val] of Object.entries(shape)) {
				properties[key] = zodToJsonSchema(val);
				if (!isOptionalOrDefault(val)) {
					required.push(key);
				}
			}

			return { type: "object", properties, ...(required.length ? { required } : {}) };
		}

		if (typeName === "ZodString") return { type: "string" };
		if (typeName === "ZodNumber") return { type: "number" };
		if (typeName === "ZodBoolean") return { type: "boolean" };

		if (typeName === "ZodEnum") {
			const values = def.values as string[];
			return { type: "string", enum: values };
		}

		if (typeName === "ZodArray") {
			const itemType = def.type;
			return { type: "array", items: zodToJsonSchema(itemType) };
		}

		if (typeName === "ZodDefault") {
			const inner = zodToJsonSchema(def.innerType);
			const defaultValue = typeof def.defaultValue === "function"
				? (def.defaultValue as () => unknown)()
				: def.defaultValue;
			return { ...inner, default: defaultValue };
		}

		if (typeName === "ZodOptional") {
			return zodToJsonSchema(def.innerType);
		}
	}

	// Raw shape object (Record<string, ZodType>)
	if (!z._def) {
		// Filter out Zod internal properties that leak when {} is passed as inputSchema
		const zodInternals = new Set([
			"~standard", "def", "parse", "safeParse", "parseAsync", "safeParseAsync",
			"check", "clone", "brand", "register", "spa", "refine", "superRefine",
			"transform", "default", "catch", "describe", "pipe", "readonly",
			"isNullable", "isOptional", "optional", "nullable", "nullish",
			"array", "promise", "or", "and", "not",
		]);

		const properties: Record<string, unknown> = {};
		const required: string[] = [];

		for (const [key, val] of Object.entries(z)) {
			if (zodInternals.has(key)) continue;
			if (typeof val === "function") continue;
			properties[key] = zodToJsonSchema(val);
			if (!isOptionalOrDefault(val)) {
				required.push(key);
			}
		}

		return { type: "object", properties, ...(required.length ? { required } : {}) };
	}

	return { type: "object", properties: {} };
}

function isOptionalOrDefault(schema: unknown): boolean {
	if (!schema || typeof schema !== "object") return false;
	const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
	if (!def) return false;
	const typeName = def.typeName as string | undefined;
	return typeName === "ZodOptional" || typeName === "ZodDefault";
}

function createToolServer(): McpServer {
	const server = new McpServer({ name: "mcp-gpt-auto", version: "0.2.0" });
	registerFileSystemTools(server);
	registerShellTools(server);
	registerGitTools(server);
	registerTaskTools(server);
	registerSubagentTools(server);
	registerReviewTools(server);
	registerDesktopTools(server);

	server.tool("gateway.health", "Health check.", {}, async () => ({
		content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
	}));

	return server;
}

export function generateAutoOpenApi(): {
	paths: Record<string, unknown>;
	registerRoutes: (app: express.Application) => void;
	toolNames: string[];
} {
	const server = createToolServer();
	const tools = (server as unknown as { _registeredTools: Record<string, ToolEntry> })._registeredTools;
	const paths: Record<string, unknown> = {};
	const toolNames: string[] = [];

	for (const [name, tool] of Object.entries(tools)) {
		if (!tool.enabled) continue;

		toolNames.push(name);
		const safeName = name.replace(/\./g, "_");
		const pathKey = `/tools/${name.replace(/\./g, "/")}`;

		const inputSchema = zodToJsonSchema(tool.inputSchema);
		const hasProperties = inputSchema.properties && Object.keys(inputSchema.properties as Record<string, unknown>).length > 0;

		const pathDef: Record<string, unknown> = {
			post: {
				operationId: `tool_${safeName}`,
				summary: (tool.description || name).slice(0, 280),
				...(hasProperties
					? {
						requestBody: {
							required: true,
							content: {
								"application/json": {
									schema: inputSchema,
								},
							},
						},
					}
					: {}),
				responses: {
					"200": {
						description: "Tool result.",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										content: {
											type: "array",
											items: {
												type: "object",
												properties: {
													type: { type: "string" },
													text: { type: "string" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};

		paths[pathKey] = pathDef;
	}

	function registerRoutes(app: express.Application) {
		for (const [name, tool] of Object.entries(tools)) {
			if (!tool.enabled) continue;

			const pathKey = `/tools/${name.replace(/\./g, "/")}`;

			app.post(pathKey, async (req: express.Request, res: express.Response) => {
				try {
					const args = req.body || {};
					const result = await tool.callback(args, {} as never);
					res.json(result);
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : String(err);
					res.status(500).json({
						content: [{ type: "text", text: JSON.stringify({ ok: false, error: message }) }],
					});
				}
			});
		}
	}

	return { paths, registerRoutes, toolNames };
}
