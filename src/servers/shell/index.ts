import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, safe, run } from "../../gateway/utils.js";

export function registerShellTools(server: McpServer)
{
	server.tool("shell.run", "Run a shell command. Pass full command string in 'command' field (e.g. 'npm run build', 'git status'). Allowed programs: git, node, npm, pnpm, dotnet, python, py, gemini, powershell, pwsh, cmd, bash.", { command: z.string(), args: z.array(z.string()).default([]), cwd: z.string().default("."), timeoutMs: z.number().default(120000) }, async ({ command, args, cwd, timeoutMs }) =>
	{
		// Smart parsing: if command contains spaces and no args provided, split it
		let cmd = command;
		let cmdArgs = args;
		if (args.length === 0 && command.includes(" ")) {
			const parts = command.split(" ");
			cmd = parts[0];
			cmdArgs = parts.slice(1);
		}
		const r = await run(cmd, cmdArgs, safe(cwd), "", timeoutMs);
		await audit("shell.run", Boolean((r as any).ok), { command: cmd, args: cmdArgs, cwd });
		return out(r);
	});
}
