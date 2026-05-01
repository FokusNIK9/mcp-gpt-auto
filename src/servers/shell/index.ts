import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, safe, run } from "../../gateway/utils.js";

export function registerShellTools(server: McpServer)
{
	server.tool("shell.run", "Run allowed command.", { command: z.string(), args: z.array(z.string()).default([]), cwd: z.string().default("."), timeoutMs: z.number().default(120000) }, async ({ command, args, cwd, timeoutMs }) =>
	{
		const r = await run(command, args, safe(cwd), "", timeoutMs);
		await audit("shell.run", Boolean((r as any).ok), { command, args, cwd });
		return out(r);
	});
}
