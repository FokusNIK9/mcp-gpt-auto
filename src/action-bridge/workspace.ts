/**
 * Workspace API — file-based code-agent endpoints for the Action Bridge.
 *
 * These endpoints let GPT agents work like proper code agents:
 * write files directly (no shell escaping), read files, list dirs,
 * search, run scripts from files, and get full stdout/stderr.
 *
 * Workspace root: {project}/.agent-workspace/
 * Layout:
 *   scripts/    — temp scripts written by agent, executed by runScript
 *   logs/       — stdout/stderr captures from runScript
 *   temp/       — scratch space for agent
 */

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { root, agent, allowed, blocked } from "../gateway/config.js";
import { redactText } from "../gateway/redact.js";

const workspace = path.join(root, ".agent-workspace");
const scriptsDir = path.join(workspace, "scripts");
const logsDir = path.join(workspace, "logs");
const tempDir = path.join(workspace, "temp");

async function ensureWorkspace() {
  await Promise.all([scriptsDir, logsDir, tempDir].map(d => fs.mkdir(d, { recursive: true })));
}

/** Resolve path relative to project root, reject escapes and blocked patterns */
function safePath(p: string): string {
  const resolved = path.resolve(root, p);
  const rootSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootSep)) {
    throw new Error(`Path outside workspace: ${p}`);
  }
  const low = resolved.replaceAll("\\", "/").toLowerCase();
  for (const b of blocked) {
    if (low.includes(b.toLowerCase())) {
      throw new Error(`Blocked path: ${b}`);
    }
  }
  return resolved;
}

function relPath(p: string): string {
  return path.relative(root, p).replaceAll("\\", "/");
}

/** Run a command, return stdout/stderr/exitCode — no shell escaping issues */
function execCommand(
  command: string,
  args: string[],
  cwd: string,
  input: string,
  timeoutMs: number,
): Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean }> {
  if (!allowed.includes(command.toLowerCase())) {
    return Promise.resolve({ ok: false, exitCode: null, stdout: "", stderr: `Blocked command: ${command}`, durationMs: 0, timedOut: false });
  }

  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
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
      resolve({ ok: false, exitCode: null, stdout, stderr: stderr + e.message, durationMs: Date.now() - started, timedOut });
    });

    child.on("close", (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({ ok: exitCode === 0 && !timedOut, exitCode, stdout, stderr, durationMs: Date.now() - started, timedOut });
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

// --- OpenAPI schema additions ---

export const workspaceOpenApiPaths: Record<string, unknown> = {
  "/workspace/write": {
    post: {
      operationId: "writeFile",
      summary: "Write content to a file. Creates dirs automatically. No shell escaping needed.",
      description: "Directly writes text content to a file on disk. Path is relative to project root. Creates parent directories if needed. Use this instead of shell echo/cat for writing files.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["path", "content"],
              properties: {
                path: { type: "string", description: "File path relative to project root (e.g. 'src/index.ts' or 'scripts/fix.ps1')." },
                content: { type: "string", description: "Full file content as plain text. Supports any characters, Unicode, newlines, HTML, etc." },
              },
            },
          },
        },
      },
      responses: { "200": { description: "File written.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/read": {
    post: {
      operationId: "readFile",
      summary: "Read a text file. Returns full content.",
      description: "Reads a file and returns its content as text. Path is relative to project root.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["path"],
              properties: {
                path: { type: "string", description: "File path relative to project root." },
                maxLines: { type: "integer", description: "Max lines to return (default: all).", default: 0 },
              },
            },
          },
        },
      },
      responses: { "200": { description: "File content.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/patch": {
    post: {
      operationId: "patchFile",
      summary: "Find and replace text in a file.",
      description: "Replaces first occurrence of 'search' with 'replace' in the file. Use for surgical edits without rewriting the whole file.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["path", "search", "replace"],
              properties: {
                path: { type: "string", description: "File path relative to project root." },
                search: { type: "string", description: "Exact text to find." },
                replace: { type: "string", description: "Text to replace it with." },
              },
            },
          },
        },
      },
      responses: { "200": { description: "File patched.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/list": {
    post: {
      operationId: "listDir",
      summary: "List directory contents (files and folders).",
      description: "Lists entries in a directory. Path is relative to project root. Returns name and isDirectory for each entry.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Directory path relative to project root. Default: root.", default: "." },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Directory listing.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/tree": {
    post: {
      operationId: "getTree",
      summary: "Get recursive directory tree.",
      description: "Returns full directory tree up to given depth. Skips .git and node_modules.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Root path. Default: project root.", default: "." },
                depth: { type: "integer", description: "Max depth. Default: 3.", default: 3 },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Directory tree.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/search": {
    post: {
      operationId: "searchFiles",
      summary: "Search for text in files (like grep).",
      description: "Searches for a pattern in files under the given path. Returns matching lines with file paths and line numbers. Skips .git, node_modules, and binary files.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["pattern"],
              properties: {
                pattern: { type: "string", description: "Text or regex pattern to search for." },
                path: { type: "string", description: "Directory to search in. Default: project root.", default: "." },
                glob: { type: "string", description: "File glob filter (e.g. '*.ts', '*.cs'). Default: all files." },
                maxResults: { type: "integer", description: "Max results. Default: 50.", default: 50 },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Search results.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/run": {
    post: {
      operationId: "runScript",
      summary: "Write a script to a temp file and execute it. Returns full stdout/stderr.",
      description: "Writes script content to a temp file (.ps1, .bat, .sh, .py, .js) and executes it. This avoids ALL shell escaping issues. Use this instead of queueTask for complex commands. The script file is saved in .agent-workspace/scripts/ and stdout/stderr in .agent-workspace/logs/.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["scriptContent"],
              properties: {
                scriptContent: { type: "string", description: "Full script content. For PowerShell use .ps1 syntax. For Python use .py syntax. For batch use .bat syntax." },
                scriptType: { type: "string", enum: ["ps1", "bat", "sh", "py", "js"], description: "Script type/extension. Default: ps1 (PowerShell).", default: "ps1" },
                cwd: { type: "string", description: "Working directory (relative to project root). Default: project root.", default: "." },
                timeoutMs: { type: "integer", description: "Timeout in ms. Default: 120000 (2 min).", default: 120000 },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Script result with stdout/stderr.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/exec": {
    post: {
      operationId: "execCommand",
      summary: "Run a single command directly. Returns full stdout/stderr.",
      description: "Runs a single allowed command (git, node, npm, powershell, etc.) and returns the complete stdout and stderr. Faster than queueTask for simple commands since it returns results immediately instead of requiring a separate getTaskReport call.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["command"],
              properties: {
                command: { type: "string", enum: ["git", "node", "npm", "pnpm", "dotnet", "python", "py", "gemini", "powershell", "pwsh", "cmd"], description: "Command to run." },
                args: { type: "array", items: { type: "string" }, description: "Command arguments.", default: [] },
                cwd: { type: "string", description: "Working directory (relative to project root). Default: project root.", default: "." },
                input: { type: "string", description: "Text to pipe to stdin.", default: "" },
                timeoutMs: { type: "integer", description: "Timeout in ms. Default: 120000.", default: 120000 },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Command result.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
  "/workspace/log/{logId}": {
    get: {
      operationId: "getScriptLog",
      summary: "Get stdout/stderr log from a previous runScript execution.",
      parameters: [
        { name: "logId", in: "path", required: true, schema: { type: "string", pattern: "^[a-zA-Z0-9._-]+$" } },
      ],
      responses: { "200": { description: "Script log.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
    },
  },
};

// --- Express route handlers ---

export function registerWorkspaceRoutes(app: express.Application) {
  // writeFile
  app.post("/workspace/write", async (req, res) => {
    try {
      const { path: p, content } = req.body;
      if (!p || content == null) return res.status(400).json({ ok: false, error: "path and content required" });

      const file = safePath(p);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, "utf8");
      const stats = await fs.stat(file);

      res.json({ ok: true, path: relPath(file), size: stats.size });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // readFile
  app.post("/workspace/read", async (req, res) => {
    try {
      const { path: p, maxLines } = req.body;
      if (!p) return res.status(400).json({ ok: false, error: "path required" });

      const file = safePath(p);
      let text = await fs.readFile(file, "utf8");
      const totalLines = text.split("\n").length;

      if (maxLines && maxLines > 0) {
        text = text.split("\n").slice(0, maxLines).join("\n");
      }

      // Truncate very large files to avoid response issues
      const MAX_CHARS = 100000;
      const truncated = text.length > MAX_CHARS;
      if (truncated) text = text.slice(0, MAX_CHARS);

      res.json({ ok: true, path: relPath(file), content: redactText(text), totalLines, truncated });
    } catch (err: any) {
      res.status(404).json({ ok: false, error: err.message });
    }
  });

  // patchFile
  app.post("/workspace/patch", async (req, res) => {
    try {
      const { path: p, search, replace } = req.body;
      if (!p || search == null || replace == null) return res.status(400).json({ ok: false, error: "path, search, replace required" });

      const file = safePath(p);
      const before = await fs.readFile(file, "utf8");

      if (!before.includes(search)) {
        return res.status(400).json({ ok: false, error: "Search text not found in file" });
      }

      const after = before.replace(search, replace);
      await fs.writeFile(file, after, "utf8");

      res.json({ ok: true, path: relPath(file), replacements: 1 });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // listDir
  app.post("/workspace/list", async (req, res) => {
    try {
      const p = req.body.path || ".";
      const dir = safePath(p);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const result = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));

      res.json({ ok: true, path: relPath(dir), entries: result });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // getTree
  app.post("/workspace/tree", async (req, res) => {
    try {
      const p = req.body.path || ".";
      const maxDepth = req.body.depth || 3;
      const dir = safePath(p);

      async function getTree(current: string, depth: number): Promise<any[]> {
        if (depth > maxDepth) return [];
        const entries = await fs.readdir(current, { withFileTypes: true });
        const children: any[] = [];
        for (const e of entries) {
          if (e.name === ".git" || e.name === "node_modules" || e.name === ".agent-queue" || e.name === ".agent-workspace") continue;
          const full = path.join(current, e.name);
          if (e.isDirectory()) {
            children.push({ name: e.name, type: "dir", children: await getTree(full, depth + 1) });
          } else {
            children.push({ name: e.name, type: "file" });
          }
        }
        return children;
      }

      const tree = await getTree(dir, 1);
      res.json({ ok: true, path: relPath(dir), tree });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // searchFiles
  app.post("/workspace/search", async (req, res) => {
    try {
      const { pattern, path: searchPath, glob, maxResults } = req.body;
      if (!pattern) return res.status(400).json({ ok: false, error: "pattern required" });

      const dir = safePath(searchPath || ".");
      const limit = Math.min(maxResults || 50, 200);
      const matches: Array<{ file: string; line: number; text: string }> = [];
      const regex = new RegExp(pattern, "gi");

      async function searchDir(current: string) {
        if (matches.length >= limit) return;
        const entries = await fs.readdir(current, { withFileTypes: true });

        for (const e of entries) {
          if (matches.length >= limit) break;
          if (e.name === ".git" || e.name === "node_modules" || e.name === ".agent-queue" || e.name === ".agent-workspace") continue;
          const full = path.join(current, e.name);

          if (e.isDirectory()) {
            await searchDir(full);
          } else {
            // Apply glob filter
            if (glob && !e.name.match(new RegExp(glob.replace(/\*/g, ".*").replace(/\?/g, "."), "i"))) continue;

            try {
              const text = await fs.readFile(full, "utf8");
              const lines = text.split("\n");
              for (let i = 0; i < lines.length && matches.length < limit; i++) {
                if (regex.test(lines[i])) {
                  matches.push({ file: relPath(full), line: i + 1, text: lines[i].trim().slice(0, 200) });
                }
                regex.lastIndex = 0;
              }
            } catch {
              // Skip binary/unreadable files
            }
          }
        }
      }

      await searchDir(dir);
      res.json({ ok: true, pattern, matches, total: matches.length });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // runScript
  app.post("/workspace/run", async (req, res) => {
    try {
      await ensureWorkspace();

      const { scriptContent, scriptType, cwd, timeoutMs } = req.body;
      if (!scriptContent) return res.status(400).json({ ok: false, error: "scriptContent required" });

      const ext = scriptType || "ps1";
      const logId = `run-${Date.now()}`;
      const scriptFile = path.join(scriptsDir, `${logId}.${ext}`);
      const logFile = path.join(logsDir, `${logId}.json`);
      const workDir = safePath(cwd || ".");

      // Write script to file
      await fs.writeFile(scriptFile, scriptContent, "utf8");

      // Determine how to execute based on type
      let command: string;
      let args: string[];
      switch (ext) {
        case "ps1":
          command = "powershell";
          args = ["-ExecutionPolicy", "Bypass", "-File", scriptFile];
          break;
        case "bat":
          command = "cmd";
          args = ["/c", scriptFile];
          break;
        case "sh":
          command = "cmd";
          args = ["/c", "bash", scriptFile];
          break;
        case "py":
          command = "python";
          args = [scriptFile];
          break;
        case "js":
          command = "node";
          args = [scriptFile];
          break;
        default:
          return res.status(400).json({ ok: false, error: `Unknown script type: ${ext}` });
      }

      const result = await execCommand(command, args, workDir, "", timeoutMs || 120000);

      // Save log
      const logData = {
        logId,
        scriptFile: relPath(scriptFile),
        scriptType: ext,
        cwd: relPath(workDir),
        ...result,
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(logFile, JSON.stringify(logData, null, 2));

      // Truncate stdout/stderr for response if too long
      const MAX = 50000;
      const stdoutTrunc = result.stdout.length > MAX;
      const stderrTrunc = result.stderr.length > MAX;

      res.json({
        ok: result.ok,
        logId,
        exitCode: result.exitCode,
        stdout: redactText(result.stdout.slice(0, MAX)),
        stderr: redactText(result.stderr.slice(0, MAX)),
        stdoutTruncated: stdoutTrunc,
        stderrTruncated: stderrTrunc,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        scriptFile: relPath(scriptFile),
        message: stdoutTrunc || stderrTrunc ? `Output truncated. Full log: GET /workspace/log/${logId}` : undefined,
      });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // execCommand (direct, synchronous)
  app.post("/workspace/exec", async (req, res) => {
    try {
      const { command, args, cwd, input, timeoutMs } = req.body;
      if (!command) return res.status(400).json({ ok: false, error: "command required" });

      const workDir = safePath(cwd || ".");
      const result = await execCommand(command, args || [], workDir, input || "", timeoutMs || 120000);

      const MAX = 50000;
      res.json({
        ok: result.ok,
        exitCode: result.exitCode,
        stdout: redactText(result.stdout.slice(0, MAX)),
        stderr: redactText(result.stderr.slice(0, MAX)),
        stdoutTruncated: result.stdout.length > MAX,
        stderrTruncated: result.stderr.length > MAX,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
      });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // getScriptLog
  app.get("/workspace/log/:logId", async (req, res) => {
    try {
      const { logId } = req.params;
      if (!/^[a-zA-Z0-9._-]+$/.test(logId)) {
        return res.status(400).json({ ok: false, error: "Invalid log id" });
      }

      const logFile = path.join(logsDir, `${logId}.json`);
      const raw = await fs.readFile(logFile, "utf8");
      const data = JSON.parse(raw);

      res.json({ ok: true, ...data });
    } catch {
      res.status(404).json({ ok: false, error: "Log not found" });
    }
  });
}
