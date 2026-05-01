#!/usr/bin/env node

import fs from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { agent, root } from "./gateway/config.js";
import { audit } from "./gateway/utils.js";

import { registerFileSystemTools } from "./servers/filesystem/index.js";
import { registerShellTools } from "./servers/shell/index.js";
import { registerGitTools } from "./servers/git/index.js";
import { registerTaskTools } from "./servers/tasks/index.js";
import { registerSubagentTools } from "./servers/subagents/index.js";
import { registerReviewTools } from "./servers/review/index.js";
import { registerDesktopTools } from "./servers/desktop/index.js";

const server = new McpServer({ name: "mcp-gpt-auto", version: "0.2.0" });

registerFileSystemTools(server);
registerShellTools(server);
registerGitTools(server);
registerTaskTools(server);
registerSubagentTools(server);
registerReviewTools(server);
registerDesktopTools(server);

server.tool("gateway.health", "Health check.", {}, async () =>
{
	const data = { ok: true, root, agent };
	await audit("gateway.health", true, data);
	return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
});

await fs.mkdir(agent, { recursive: true });
await audit("gateway.start", true, { root, pid: process.pid });

const transport = new StdioServerTransport();
await server.connect(transport);
