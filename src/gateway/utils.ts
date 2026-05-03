import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { root, agent, allowed, blocked } from "./config.js";
import { redactSecrets, redactText } from "./redact.js";
import { EventEmitter } from "node:events";

// Global events for real-time monitoring
export const events = new EventEmitter();

/** Wrap tool output with secret redaction */
export function out(data: unknown) {
  const redacted = redactSecrets(data);
  return { content: [{ type: "text" as const, text: JSON.stringify(redacted, null, 2) }] };
}

/** Log tool usage to audit file with secret redaction and emit live event */
export async function audit(tool: string, ok: boolean, data: any = null) {
  const redactedData = redactSecrets(data);
  const entry = { 
    ts: new Date().toISOString(), 
    tool, 
    ok, 
    data: redactedData,
    // Add intent if available in global context or data
    intent: data?.intent || "Direct Action"
  };

  // Broadcast to Live Feed
  events.emit("audit", entry);

  await fs.mkdir(path.join(agent, "logs"), { recursive: true });
  await fs.appendFile(
    path.join(agent, "logs", "audit.jsonl"),
    `${JSON.stringify(entry)}\n`,
  );
}

/** 
 * Resolve path relative to project root and verify it's inside workspace.
 * Rejects blocked patterns (e.g. .env). 
 */
export function safe(p: string): string {
  const resolved = path.resolve(root, p);
  const rootSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  // 1. Workspace Isolation
  if (resolved !== root && !resolved.startsWith(rootSep)) {
    throw new Error(`Path outside workspace: ${p}`);
  }

  // 2. Blocked Pattern Check
  const low = resolved.replaceAll("\\", "/").toLowerCase();
  for (const b of blocked) {
    if (low.includes(b.toLowerCase())) {
      throw new Error(`Access to blocked path forbidden: ${b}`);
    }
  }

  return resolved;
}

/** Get relative path with forward slashes for cross-platform consistency */
export function rel(p: string): string {
  return path.relative(root, p).replaceAll("\\", "/");
}

/** 
 * Run a command, return result with stdout/stderr. 
 * - Enforces allowed command list.
 * - Automatically redacts secrets from all outputs.
 * - Handles Windows shell execution.
 */
export async function run(
  command: string,
  args: string[],
  cwd: string = root,
  input: string = "",
  timeoutMs: number = 120000,
) {
  if (!allowed.includes(command.toLowerCase())) {
    throw new Error(`Blocked command: ${command}`);
  }

  const started = Date.now();
  const workDir = cwd || root;

  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: workDir,
      windowsHide: true,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, Math.min(timeoutMs, 900000));

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (x: string) => (stdout += x));
    child.stderr.on("data", (x: string) => (stderr += x));

    child.on("error", (e: Error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr + e.message),
        durationMs: Date.now() - started,
        timedOut,
        command,
        args,
        cwd: workDir,
      });
    });

    child.on("close", (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
        durationMs: Date.now() - started,
        timedOut,
        command,
        args,
        cwd: workDir,
      });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

/** Get absolute path for a task artifact directory */
export function taskDir(taskId: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(taskId)) {
    throw new Error("Invalid task ID format.");
  }
  return path.join(agent, "tasks", taskId);
}

/**
 * Add authentication and non-interactive flags to git commands.
 */
export function gitAuthArgs(args: string[]) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return args;

  const remoteUrl = process.env.GITHUB_REMOTE_URL || "https://github.com/FokusNIK9/mcp-gpt-auto.git";
  const authedRemoteUrl = remoteUrl.replace("https://", `https://x-access-token:${encodeURIComponent(token)}@`);

  if (args[0] === "pull") {
    const pullOptions = args.slice(1);
    return ["pull", ...pullOptions, authedRemoteUrl, "main"];
  }

  if (args[0] === "push") {
    return ["push", authedRemoteUrl, ...args.slice(1)]; // fix: was slice(2) in runner, but slice(1) might be better if we call runGit(["push", "origin", "main"])
  }

  return [
    "-c",
    "credential.helper=",
    "-c",
    "core.askPass=",
    ...args
  ];
}

/**
 * Run a git command with authentication and automatic redaction.
 */
export async function runGit(args: string[]) {
  return await run("git", gitAuthArgs(args), root) as any;
}
