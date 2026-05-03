/**
 * MCP Proxy — connect external MCP servers and expose their tools as REST.
 *
 * Reads mcp-servers.json from project root. Each entry defines:
 *   { "name": "weather", "command": "npx", "args": ["-y", "weather-mcp"], "env": {} }
 *
 * Spawns each server via stdio, discovers tools via MCP protocol,
 * and auto-registers them as /ext/{serverName}/{toolName} REST endpoints.
 */

import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { root } from "../gateway/config.js";

const CONFIG_FILE = "mcp-servers.json";

interface McpServerConfig {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	enabled?: boolean;
}

interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

interface ExternalServer {
	config: McpServerConfig;
	process: ChildProcess;
	tools: McpTool[];
	ready: boolean;
}

const activeServers: Map<string, ExternalServer> = new Map();

// JSON-RPC helpers
let rpcId = 1;

function jsonRpcRequest(method: string, params?: unknown): string {
	return JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params: params || {} }) + "\n";
}

function parseJsonRpcResponse(data: string): unknown {
	try {
		const lines = data.trim().split("\n");
		for (const line of lines) {
			if (!line.trim()) continue;
			const parsed = JSON.parse(line);
			if (parsed.result !== undefined) return parsed.result;
			if (parsed.error) throw new Error(parsed.error.message || "RPC error");
		}
	} catch (e) {
		if (e instanceof Error && e.message !== "RPC error") {
			// Might be partial data, ignore
		} else {
			throw e;
		}
	}
	return null;
}

/**
 * Spawn an external MCP server and discover its tools.
 */
async function spawnMcpServer(config: McpServerConfig): Promise<ExternalServer> {
	const env = { ...process.env, ...(config.env || {}) };

	const proc = spawn(config.command, config.args || [], {
		stdio: ["pipe", "pipe", "pipe"],
		env,
		cwd: root,
		shell: process.platform === "win32",
	});

	const server: ExternalServer = {
		config,
		process: proc,
		tools: [],
		ready: false,
	};

	proc.on("error", (err) => {
		console.error(`[MCP Proxy] Failed to spawn ${config.name}: ${err.message}`);
	});

	proc.on("exit", (code) => {
		console.log(`[MCP Proxy] ${config.name} exited with code ${code}`);
		server.ready = false;
		activeServers.delete(config.name);
	});

	// Wait for the server to be ready and discover tools
	try {
		await waitForReady(server);
		server.tools = await discoverTools(server);
		server.ready = true;
		console.log(`[MCP Proxy] ${config.name}: ${server.tools.length} tools discovered`);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[MCP Proxy] Failed to initialize ${config.name}: ${msg}`);
		proc.kill();
		throw err;
	}

	return server;
}

/**
 * Send initialize request and wait for response.
 */
function waitForReady(server: ExternalServer): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`${server.config.name}: initialization timeout (10s)`));
		}, 10000);

		let buffer = "";

		const onData = (chunk: Buffer) => {
			buffer += chunk.toString();
			// Look for initialize response
			if (buffer.includes('"result"')) {
				server.process.stdout!.off("data", onData);
				clearTimeout(timeout);
				resolve();
			}
		};

		server.process.stdout!.on("data", onData);
		server.process.stderr!.on("data", (chunk: Buffer) => {
			// Some servers log to stderr during init
			const msg = chunk.toString().trim();
			if (msg) console.log(`[MCP Proxy] ${server.config.name} stderr: ${msg}`);
		});

		// Send initialize
		server.process.stdin!.write(jsonRpcRequest("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "mcp-gpt-auto-proxy", version: "0.2.0" },
		}));
	});
}

/**
 * Discover tools from an initialized MCP server.
 */
async function discoverTools(server: ExternalServer): Promise<McpTool[]> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`${server.config.name}: tools/list timeout (5s)`));
		}, 5000);

		let buffer = "";

		const onData = (chunk: Buffer) => {
			buffer += chunk.toString();
			try {
				const lines = buffer.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const parsed = JSON.parse(line);
					if (parsed.result && parsed.result.tools) {
						server.process.stdout!.off("data", onData);
						clearTimeout(timeout);
						resolve(parsed.result.tools);
						return;
					}
				}
			} catch {
				// Partial JSON, wait for more data
			}
		};

		server.process.stdout!.on("data", onData);

		// Send initialized notification then tools/list
		server.process.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
		server.process.stdin!.write(jsonRpcRequest("tools/list", {}));
	});
}

/**
 * Call a tool on an external MCP server.
 */
function callTool(server: ExternalServer, toolName: string, args: Record<string, unknown>): Promise<unknown> {
	return new Promise((resolve, reject) => {
		if (!server.ready || !server.process.stdin || !server.process.stdout) {
			reject(new Error(`Server ${server.config.name} is not ready`));
			return;
		}

		const timeout = setTimeout(() => {
			reject(new Error(`${server.config.name}/${toolName}: call timeout (30s)`));
		}, 30000);

		let buffer = "";
		const requestId = rpcId;

		const onData = (chunk: Buffer) => {
			buffer += chunk.toString();
			try {
				const lines = buffer.split("\n");
				for (const line of lines) {
					if (!line.trim()) continue;
					const parsed = JSON.parse(line);
					if (parsed.id === requestId) {
						server.process.stdout!.off("data", onData);
						clearTimeout(timeout);
						if (parsed.error) {
							reject(new Error(parsed.error.message || "Tool call failed"));
						} else {
							resolve(parsed.result);
						}
						return;
					}
				}
			} catch {
				// Partial JSON, wait for more
			}
		};

		server.process.stdout!.on("data", onData);
		server.process.stdin!.write(jsonRpcRequest("tools/call", { name: toolName, arguments: args }));
	});
}

/**
 * Load mcp-servers.json config.
 */
async function loadConfig(): Promise<McpServerConfig[]> {
	const configPath = path.join(root, CONFIG_FILE);
	try {
		const raw = await fs.readFile(configPath, "utf8");
		const data = JSON.parse(raw);

		if (Array.isArray(data)) return data.filter((s: McpServerConfig) => s.enabled !== false);
		if (data.servers && Array.isArray(data.servers)) return data.servers.filter((s: McpServerConfig) => s.enabled !== false);

		return [];
	} catch {
		return [];
	}
}

/**
 * Initialize all configured external MCP servers.
 */
export async function initMcpProxy(): Promise<void> {
	const configs = await loadConfig();
	if (configs.length === 0) {
		console.log("[MCP Proxy] No mcp-servers.json found or no servers configured");
		return;
	}

	console.log(`[MCP Proxy] Loading ${configs.length} external MCP server(s)...`);

	for (const config of configs) {
		try {
			const server = await spawnMcpServer(config);
			activeServers.set(config.name, server);
		} catch {
			// Error already logged in spawnMcpServer
		}
	}

	const totalTools = Array.from(activeServers.values()).reduce((sum, s) => sum + s.tools.length, 0);
	console.log(`[MCP Proxy] ${activeServers.size} server(s) active, ${totalTools} external tools available`);
}

/**
 * Register REST routes for all external MCP tools.
 * Routes: POST /ext/{serverName}/{toolName}
 */
export function registerMcpProxyRoutes(app: express.Application): void {
	for (const [serverName, server] of activeServers) {
		for (const tool of server.tools) {
			const routePath = `/ext/${serverName}/${tool.name}`;

			app.post(routePath, async (req: express.Request, res: express.Response) => {
				try {
					const args = req.body || {};
					const result = await callTool(server, tool.name, args);
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
}

/**
 * Generate OpenAPI paths for all external MCP tools.
 */
export function getMcpProxyOpenApiPaths(): Record<string, unknown> {
	const paths: Record<string, unknown> = {};

	for (const [serverName, server] of activeServers) {
		for (const tool of server.tools) {
			const routePath = `/ext/${serverName}/${tool.name}`;
			const operationId = `ext_${serverName}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, "_");

			const hasSchema = tool.inputSchema &&
				tool.inputSchema.properties &&
				Object.keys(tool.inputSchema.properties as Record<string, unknown>).length > 0;

			paths[routePath] = {
				post: {
					operationId,
					summary: `[${serverName}] ${(tool.description || tool.name).slice(0, 250)}`,
					...(hasSchema ? {
						requestBody: {
							required: true,
							content: {
								"application/json": { schema: tool.inputSchema },
							},
						},
					} : {}),
					responses: {
						"200": {
							description: "Tool result.",
							content: {
								"application/json": {
									schema: { type: "object" },
								},
							},
						},
					},
				},
			};
		}
	}

	return paths;
}

/**
 * Get list of active external servers and their tools.
 */
export function getMcpProxyStatus(): Array<{ name: string; tools: string[]; ready: boolean }> {
	return Array.from(activeServers.values()).map(s => ({
		name: s.config.name,
		tools: s.tools.map(t => t.name),
		ready: s.ready,
	}));
}

/**
 * Shutdown all external MCP servers.
 */
export function shutdownMcpProxy(): void {
	for (const [name, server] of activeServers) {
		console.log(`[MCP Proxy] Shutting down ${name}`);
		server.process.kill();
	}
	activeServers.clear();
}
