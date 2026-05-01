import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { root, agent, allowed, blocked } from "./config.js";

export function out(data: unknown)
{
	return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function audit(tool: string, ok: boolean, data: unknown = null)
{
	await fs.mkdir(path.join(agent, "logs"), { recursive: true });
	await fs.appendFile(path.join(agent, "logs", "audit.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), tool, ok, data })}\n`);
}

export function safe(p: string)
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

export function rel(p: string)
{
	return path.relative(root, p).replaceAll("\\", "/");
}

export async function run(command: string, args: string[], cwd: string, input = "", timeoutMs = 120000)
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
		const child = spawn(command, args, { cwd, windowsHide: true, shell: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] });
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

export function taskDir(taskId: string)
{
	if (!/^[a-zA-Z0-9._-]+$/.test(taskId))
	{
		throw new Error("Bad task id.");
	}

	return path.join(agent, "tasks", taskId);
}
