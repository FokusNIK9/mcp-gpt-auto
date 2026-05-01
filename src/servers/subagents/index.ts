import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, rel, taskDir, run } from "../../gateway/utils.js";
import { root } from "../../gateway/config.js";

export function registerSubagentTools(server: McpServer)
{
	server.tool("subagent.gemini.run", "Run Gemini for task prompt.", { taskId: z.string(), timeoutMs: z.number().default(300000) }, async ({ taskId, timeoutMs }) =>
	{
		const dir = taskDir(taskId);
		const prompt = await fs.readFile(path.join(dir, "prompt.md"), "utf8");
		const resultDir = path.join(dir, "result");
		await fs.mkdir(resultDir, { recursive: true });

		const r = await run("gemini", [], root, prompt, timeoutMs) as any;
		const stdout = r.stdout ?? "";
		const stderr = r.stderr ?? "";

		await fs.writeFile(path.join(resultDir, "subagent-stdout.txt"), stdout);
		await fs.writeFile(path.join(resultDir, "subagent-stderr.txt"), stderr);

		let jsonFound = false;
		let parsed = null;

		const jsonMatch = stdout.match(/```json\s*([\s\S]*?)\s*```/) || stdout.match(/(\{[\s\S]*\})/);

		if (jsonMatch)
		{
			try
			{
				parsed = JSON.parse(jsonMatch[1]);
				await fs.writeFile(path.join(resultDir, "subagent-result.json"), JSON.stringify(parsed, null, 2));
				jsonFound = true;
			}
			catch
			{
				await fs.writeFile(path.join(resultDir, "subagent-result.raw.txt"), stdout);
			}
		}
		else
		{
			await fs.writeFile(path.join(resultDir, "subagent-result.raw.txt"), stdout);
		}

		await audit("subagent.gemini.run", r.ok, { taskId, jsonFound });

		if (r.ok && !jsonFound && stdout)
		{
			return out({ ok: false, status: "partial", reason: "Gemini returned non-JSON output", taskId });
		}

		return out({ ok: r.ok, taskId, jsonFound, result: parsed, stdoutPath: rel(path.join(resultDir, "subagent-stdout.txt")) });
	});
}
