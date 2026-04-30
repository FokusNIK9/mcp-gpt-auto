#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAuditLog } from "./gateway/audit-log.js";
import { createContext } from "./gateway/context.js";
import { loadPolicy } from "./gateway/policy.js";
import { registerGatewayTools } from "./servers/gateway.js";
import { registerFilesystemTools } from "./servers/filesystem.js";
import { registerShellTools } from "./servers/shell.js";
import { registerGitTools } from "./servers/git.js";
import { registerTaskTools } from "./servers/tasks.js";
import { registerSubagentTools } from "./servers/subagents/gemini.js";
import { registerReviewTools } from "./servers/review.js";
import { registerDesktopTools } from "./servers/desktop.js";

async function main()
{
	const rootDir = process.env.MCP_GPT_AUTO_WORKSPACE ?? process.cwd();
	const policy = await loadPolicy(rootDir);
	const audit = await createAuditLog(rootDir);
	const context = createContext(rootDir, policy, audit);

	const server = new McpServer({
		name: "mcp-gpt-auto",
		version: "0.1.0"
	});

	registerGatewayTools(server, context);
	registerFilesystemTools(server, context);
	registerShellTools(server, context);
	registerGitTools(server, context);
	registerTaskTools(server, context);
	registerSubagentTools(server, context);
	registerReviewTools(server, context);
	registerDesktopTools(server, context);

	const transport = new StdioServerTransport();
	await server.connect(transport);

	await audit.write({
		tool: "gateway.start",
		ok: true,
		message: "MCP server started",
		data: {
			rootDir,
			pid: process.pid
		}
	});
}

main().catch((error: unknown) =>
{
	const message = error instanceof Error ? error.stack ?? error.message : String(error);
	console.error(message);
	process.exit(1);
});
