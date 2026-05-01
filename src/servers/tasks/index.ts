import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, rel, taskDir } from "../../gateway/utils.js";
import { root, agent } from "../../gateway/config.js";

export function registerTaskTools(server: McpServer)
{
	server.tool("task.create", "Create task prompt.", { taskId: z.string(), title: z.string(), body: z.string() }, async ({ taskId, title, body }) =>
	{
		const dir = taskDir(taskId);
		await fs.mkdir(path.join(dir, "result"), { recursive: true });
		await fs.mkdir(path.join(dir, "review"), { recursive: true });
		const prompt = `# Role\nТы саб-агент разработки.\n\n# Task\n${body}\n\n# Workspace\n${root}\n\n# Rules\n- Do not run git push.\n- Do not read secrets.\n- Return one JSON block with status, summary, filesChanged, commandsRun, tests, risks, requiresApproval, nextSteps.\n`;
		await fs.writeFile(path.join(dir, "task.json"), JSON.stringify({ taskId, title, status: "planned", createdAt: new Date().toISOString() }, null, 2));
		await fs.writeFile(path.join(dir, "prompt.md"), prompt);
		await audit("task.create", true, { taskId, title });
		return out({ ok: true, taskId, promptPath: rel(path.join(dir, "prompt.md")) });
	});

	server.tool("task.done", "Mark task as done.", { taskId: z.string(), summary: z.string() }, async ({ taskId, summary }) =>
	{
		const dir = taskDir(taskId);
		const taskJsonPath = path.join(dir, "task.json");
		const data = JSON.parse(await fs.readFile(taskJsonPath, "utf8"));
		data.status = "done";
		data.finishedAt = new Date().toISOString();
		data.summary = summary;
		await fs.writeFile(taskJsonPath, JSON.stringify(data, null, 2));
		const finalPath = path.join(dir, "final.md");
		await fs.writeFile(finalPath, `# Task Done: ${taskId}\n\n${summary}\n`);
		await audit("task.done", true, { taskId });
		return out({ ok: true, finalPath: rel(finalPath) });
	});
}
