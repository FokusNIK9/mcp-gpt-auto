import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, safe, run } from "../../gateway/utils.js";
import { root } from "../../gateway/config.js";

export function registerGitTools(server: McpServer)
{
	server.tool("git.status", "git status --short.", {}, async () => out(await run("git", ["status", "--short"], root)));
	server.tool("git.diff", "git diff.", { stat: z.boolean().default(false) }, async ({ stat }) => out(await run("git", stat ? ["diff", "--stat"] : ["diff"], root)));

	server.tool("git.commit", "git commit changes.", { message: z.string(), paths: z.array(z.string()) }, async ({ message, paths }) =>
	{
		for (const p of paths)
		{
			safe(p);
		}

		const addR = await run("git", ["add", ...paths], root) as any;

		if (!addR.ok)
		{
			return out(addR);
		}

		const commitR = await run("git", ["commit", "-m", message], root) as any;
		await audit("git.commit", commitR.ok, { message, paths });
		return out(commitR);
	});

	server.tool("git.log", "git log.", { count: z.number().default(10) }, async ({ count }) => out(await run("git", ["log", "--oneline", `-${count}`], root)));
	server.tool("git.branch", "git branch.", {}, async () => out(await run("git", ["branch"], root)));
	server.tool("git.checkout", "git checkout.", { branch: z.string() }, async ({ branch }) => out(await run("git", ["checkout", branch], root)));
	server.tool("git.push", "git push (allowed only if CONFIRM_PUSH is YES).", { remote: z.string().default("origin"), branch: z.string().default("main") }, async ({ remote, branch }) =>
	{
		if (process.env.CONFIRM_PUSH !== "YES")
		{
			throw new Error("Push blocked. Set CONFIRM_PUSH=YES in environment.");
		}
		const r = await run("git", ["push", remote, branch], root);
		await audit("git.push", (r as any).ok, { remote, branch });
		return out(r);
	});
	server.tool("git.pull", "git pull.", { remote: z.string().default("origin"), branch: z.string().default("main") }, async ({ remote, branch }) => out(await run("git", ["pull", remote, branch], root)));
	server.tool("git.restore", "git restore.", { paths: z.array(z.string()) }, async ({ paths }) =>
	{
		for (const p of paths) safe(p);
		return out(await run("git", ["restore", ...paths], root));
	});
}
