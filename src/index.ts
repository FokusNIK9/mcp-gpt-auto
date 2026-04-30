#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const root = path.resolve(process.env.MCP_GPT_AUTO_WORKSPACE ?? process.cwd());
const agent = path.join(root, ".agent");
const allowed = ["git", "node", "npm", "pnpm", "dotnet", "python", "py", "gemini", "powershell", "pwsh", "cmd"];
const blocked = [".env", ".ssh", "AppData", "id_rsa", "id_ed25519"];

function out(data: unknown)
{
	return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

async function audit(tool: string, ok: boolean, data: unknown = null)
{
	await fs.mkdir(path.join(agent, "logs"), { recursive: true });
	await fs.appendFile(path.join(agent, "logs", "audit.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), tool, ok, data })}\n`);
}

function safe(p: string)
{
	const r = path.resolve(root, p);
	const rootSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

	if (r !== root && !r.startsWith(rootSep))
	{
		throw new Error(`Path outside workspace: ${p}`);
	}

	const low = r.replaceAll("\\", "/").toLowerCase();

	for (const b of blocked)
	{
		if (low.includes(b.toLowerCase()))
		{
			throw new Error(`Blocked path: ${b}`);
		}
	}

	return r;
}

function rel(p: string)
{
	return path.relative(root, p).replaceAll("\\", "/");
}

async function run(command: string, args: string[], cwd: string, input = "", timeoutMs = 120000)
{
	if (!allowed.includes(command.toLowerCase()))
	{
		throw new Error(`Blocked command: ${command}`);
	}

	const started = Date.now();

	return await new Promise((resolve) =>
	{
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
		const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, Math.min(timeoutMs, 900000));

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (x: string) => stdout += x);
		child.stderr.on("data", (x: string) => stderr += x);
		child.on("error", (e: Error) =>
		{
			clearTimeout(timer);
			resolve({ ok: false, exitCode: null, stdout, stderr: stderr + e.message, durationMs: Date.now() - started, timedOut, command, args, cwd });
		});
		child.on("close", (exitCode: number | null) =>
		{
			clearTimeout(timer);
			resolve({ ok: exitCode === 0 && !timedOut, exitCode, stdout, stderr, durationMs: Date.now() - started, timedOut, command, args, cwd });
		});

		if (input)
		{
			child.stdin.write(input);
		}

		child.stdin.end();
	});
}

function taskDir(taskId: string)
{
	if (!/^[a-zA-Z0-9._-]+$/.test(taskId))
	{
		throw new Error("Bad task id.");
	}

	return path.join(agent, "tasks", taskId);
}

const server = new McpServer({ name: "mcp-gpt-auto", version: "0.1.0" });

server.tool("gateway.health", "Health check.", {}, async () =>
{
	const data = { ok: true, root, agent, tools: ["fs.read", "fs.write", "fs.patch", "shell.run", "git.status", "git.diff", "task.create", "subagent.gemini.run", "review.bundle"] };
	await audit("gateway.health", true, data);
	return out(data);
});

server.tool("fs.read", "Read text file.", { path: z.string() }, async ({ path: p }) =>
{
	const file = safe(p);
	const text = await fs.readFile(file, "utf8");
	await audit("fs.read", true, { path: rel(file) });
	return out({ ok: true, path: rel(file), text });
});

server.tool("fs.write", "Write text file.", { path: z.string(), text: z.string() }, async ({ path: p, text }) =>
{
	const file = safe(p);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, text, "utf8");
	await audit("fs.write", true, { path: rel(file) });
	return out({ ok: true, path: rel(file) });
});

server.tool("fs.patch", "Replace text in file.", { path: z.string(), search: z.string(), replace: z.string() }, async ({ path: p, search, replace }) =>
{
	const file = safe(p);
	const before = await fs.readFile(file, "utf8");

	if (!before.includes(search))
	{
		throw new Error("Search text not found.");
	}

	await fs.writeFile(file, before.replace(search, replace), "utf8");
	await audit("fs.patch", true, { path: rel(file) });
	return out({ ok: true, path: rel(file) });
});

server.tool("shell.run", "Run allowed command.", { command: z.string(), args: z.array(z.string()).default([]), cwd: z.string().default("."), timeoutMs: z.number().default(120000) }, async ({ command, args, cwd, timeoutMs }) =>
{
	const r = await run(command, args, safe(cwd), "", timeoutMs);
	await audit("shell.run", Boolean((r as any).ok), { command, args, cwd });
	return out(r);
});

server.tool("git.status", "git status --short.", {}, async () => out(await run("git", ["status", "--short"], root)));
server.tool("git.diff", "git diff.", { stat: z.boolean().default(false) }, async ({ stat }) => out(await run("git", stat ? ["diff", "--stat"] : ["diff"], root)));

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

server.tool("subagent.gemini.run", "Run Gemini for task prompt.", { taskId: z.string(), timeoutMs: z.number().default(300000) }, async ({ taskId, timeoutMs }) =>
{
	const dir = taskDir(taskId);
	const prompt = await fs.readFile(path.join(dir, "prompt.md"), "utf8");
	const resultDir = path.join(dir, "result");
	await fs.mkdir(resultDir, { recursive: true });
	const r = await run("gemini", [], root, prompt, timeoutMs);
	await fs.writeFile(path.join(resultDir, "subagent-stdout.txt"), (r as any).stdout ?? "");
	await fs.writeFile(path.join(resultDir, "subagent-stderr.txt"), (r as any).stderr ?? "");
	await audit("subagent.gemini.run", Boolean((r as any).ok), { taskId });
	return out({ ok: (r as any).ok, taskId, stdoutPath: rel(path.join(resultDir, "subagent-stdout.txt")) });
});

server.tool("review.bundle", "Create review bundle.", { taskId: z.string() }, async ({ taskId }) =>
{
	const dir = taskDir(taskId);
	const reviewDir = path.join(dir, "review");
	await fs.mkdir(reviewDir, { recursive: true });
	const status = await run("git", ["status", "--short"], root) as any;
	const diff = await run("git", ["diff"], root) as any;
	const stdout = await fs.readFile(path.join(dir, "result", "subagent-stdout.txt"), "utf8").catch(() => "");
	const bundle = `# Review ${taskId}\n\n## Git status\n\`\`\`\n${status.stdout}\n\`\`\`\n\n## Subagent stdout\n\`\`\`\n${stdout}\n\`\`\`\n\n## Diff\n\`\`\`diff\n${diff.stdout}\n\`\`\`\n`;
	await fs.writeFile(path.join(reviewDir, "review-bundle.md"), bundle);
	await audit("review.bundle", true, { taskId });
	return out({ ok: true, path: rel(path.join(reviewDir, "review-bundle.md")) });
});

await fs.mkdir(agent, { recursive: true });
await audit("gateway.start", true, { root, pid: process.pid });

await server.connect(new StdioServerTransport());
