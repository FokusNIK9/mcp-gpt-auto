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
	handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;
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
	const toolNames: string[] = [];

	// Collect tool metadata for /tools/list and descriptions
	const toolDescriptions: string[] = [];
	for (const [name, tool] of Object.entries(tools)) {
		if (!tool.enabled) continue;
		toolNames.push(name);
		const schema = zodToJsonSchema(tool.inputSchema);
		const props = schema.properties as Record<string, unknown> | undefined;
		const paramHint = props && Object.keys(props).length > 0
			? ` Params: {${Object.keys(props).join(", ")}}`
			: "";
		toolDescriptions.push(`${name} — ${(tool.description || "").slice(0, 100)}${paramHint}`);
	}

	// Only 2 paths exposed in OpenAPI (fits within ChatGPT 30 operation limit)
	const paths: Record<string, unknown> = {
		"/tools/list": {
			get: {
				operationId: "listTools",
				summary: "List all available tools with descriptions and parameter schemas.",
				responses: {
					"200": {
						description: "Array of available tools.",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										tools: {
											type: "array",
											items: {
												type: "object",
												properties: {
													name: { type: "string" },
													description: { type: "string" },
													parameters: { type: "object" },
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
		},
		"/tools/call": {
			post: {
				operationId: "callTool",
				summary: `Call any tool by name. Available: ${toolNames.slice(0, 10).join(", ")}... (${toolNames.length} total). Use listTools to see all.`,
				description: toolDescriptions.join("\n"),
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["tool"],
								properties: {
									tool: {
										type: "string",
										description: `Tool name. One of: ${toolNames.join(", ")}`,
										enum: toolNames,
									},
									args: {
										type: "object",
										description: "Tool-specific arguments (see listTools for schema).",
									},
								},
							},
						},
					},
				},
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
					"400": {
						description: "Unknown tool name.",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										ok: { type: "boolean" },
										error: { type: "string" },
										available: { type: "array", items: { type: "string" } },
									},
								},
							},
						},
					},
				},
			},
		},
	};

	function registerRoutes(app: express.Application) {
		// Unified /tools/call endpoint
		app.post("/tools/call", async (req: express.Request, res: express.Response) => {
			const { tool: toolName, args } = req.body || {};
			if (!toolName || typeof toolName !== "string") {
				return res.status(400).json({ ok: false, error: "Missing 'tool' field.", available: toolNames });
			}
			const tool = tools[toolName];
			if (!tool || !tool.enabled) {
				return res.status(400).json({ ok: false, error: `Unknown tool: ${toolName}`, available: toolNames });
			}
			try {
				const result = await tool.handler(args || {}, {} as never);
				res.json(result);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				res.status(500).json({ content: [{ type: "text", text: JSON.stringify({ ok: false, error: message }) }] });
			}
		});

		// /tools/list endpoint
		app.get("/tools/list", (_req: express.Request, res: express.Response) => {
			const list = [];
			for (const [name, tool] of Object.entries(tools)) {
				if (!tool.enabled) continue;
				list.push({
					name,
					description: tool.description || "",
					parameters: zodToJsonSchema(tool.inputSchema),
				});
			}
			res.json({ tools: list });
		});

		// Keep legacy per-tool routes for backward compatibility
		for (const [name, tool] of Object.entries(tools)) {
			if (!tool.enabled) continue;

			const pathKey = `/tools/${name.replace(/\./g, "/")}`;

			app.post(pathKey, async (req: express.Request, res: express.Response) => {
				try {
					const args = req.body || {};
					const result = await tool.handler(args, {} as never);
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
