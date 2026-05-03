/**
 * Workspace API — file-based code-agent endpoints for the Action Bridge.
 */

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { root } from "../gateway/config.js";
import { redactText } from "../gateway/redact.js";
import { safe, rel, run } from "../gateway/utils.js";

const workspace = path.join(root, ".agent-workspace");
const scriptsDir = path.join(workspace, "scripts");
const logsDir = path.join(workspace, "logs");
const tempDir = path.join(workspace, "temp");

async function ensureWorkspace() {
  await Promise.all([scriptsDir, logsDir, tempDir].map(d => fs.mkdir(d, { recursive: true })));
}

export const workspaceOpenApiPaths: Record<string, unknown> = {
  "/workspace/write": {
    post: {
      operationId: "writeFile",
      summary: "Write content to a file. Creates dirs automatically. No shell escaping needed.",
      description: "Directly writes text content to a file on disk. Path is relative to project root.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["path", "content"],
              properties: {
                path: { type: "string" },
                content: { type: "string" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "File written." } },
    },
  },
  "/workspace/read": {
    post: {
      operationId: "readFile",
      summary: "Read a text file. Returns full content.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["path"],
              properties: {
                path: { type: "string" },
                maxLines: { type: "integer", default: 0 },
              },
            },
          },
        },
      },
      responses: { "200": { description: "File content." } },
    },
  },
  "/workspace/patch": {
    post: {
      operationId: "patchFile",
      summary: "Find and replace text in a file.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["path", "search", "replace"],
              properties: {
                path: { type: "string" },
                search: { type: "string" },
                replace: { type: "string" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "File patched." } },
    },
  },
  "/workspace/list": {
    post: {
      operationId: "listDir",
      summary: "List directory contents.",
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { path: { type: "string", default: "." } } },
          },
        },
      },
      responses: { "200": { description: "Directory listing." } },
    },
  },
  "/workspace/tree": {
    post: {
      operationId: "getTree",
      summary: "Get recursive directory tree.",
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { path: { type: "string", default: "." }, depth: { type: "integer", default: 3 } } },
          },
        },
      },
      responses: { "200": { description: "Directory tree." } },
    },
  },
  "/workspace/search": {
    post: {
      operationId: "searchFiles",
      summary: "Search for text in files.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" }, path: { type: "string", default: "." }, glob: { type: "string" }, maxResults: { type: "integer", default: 50 } } },
          },
        },
      },
      responses: { "200": { description: "Search results." } },
    },
  },
  "/workspace/run": {
    post: {
      operationId: "runScript",
      summary: "Write and execute a script.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["scriptContent"], properties: { scriptContent: { type: "string" }, scriptType: { type: "string", enum: ["ps1", "bat", "sh", "py", "js"], default: "ps1" }, cwd: { type: "string", default: "." }, timeoutMs: { type: "integer", default: 120000 } } },
          },
        },
      },
      responses: { "200": { description: "Script result." } },
    },
  },
  "/workspace/exec": {
    post: {
      operationId: "execCommand",
      summary: "Run a single command directly.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["command"], properties: { command: { type: "string" }, args: { type: "array", items: { type: "string" }, default: [] }, cwd: { type: "string", default: "." }, input: { type: "string", default: "" }, timeoutMs: { type: "integer", default: 120000 } } },
          },
        },
      },
      responses: { "200": { description: "Command result." } },
    },
  },
  "/workspace/log/{logId}": {
    get: {
      operationId: "getScriptLog",
      summary: "Get log from a script.",
      parameters: [{ name: "logId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Script log." } },
    },
  },
};

export function registerWorkspaceRoutes(app: express.Application) {
  app.post("/workspace/write", async (req, res) => {
    try {
      const { path: p, content } = req.body;
      if (!p || content == null) return res.status(400).json({ ok: false, error: "path and content required" });
      const file = safe(p);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, "utf8");
      const stats = await fs.stat(file);
      res.json({ ok: true, path: rel(file), size: stats.size });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post("/workspace/read", async (req, res) => {
    try {
      const { path: p, maxLines } = req.body;
      if (!p) return res.status(400).json({ ok: false, error: "path required" });
      const file = safe(p);
      let text = await fs.readFile(file, "utf8");
      const totalLines = text.split("\n").length;
      if (maxLines && maxLines > 0) text = text.split("\n").slice(0, maxLines).join("\n");
      const MAX_CHARS = 100000;
      if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
      res.json({ ok: true, path: rel(file), content: redactText(text), totalLines });
    } catch (err: any) {
      res.status(404).json({ ok: false, error: err.message });
    }
  });

  app.post("/workspace/patch", async (req, res) => {
    try {
      const { path: p, search, replace } = req.body;
      const file = safe(p);
      const before = await fs.readFile(file, "utf8");
      if (!before.includes(search)) return res.status(400).json({ ok: false, error: "Search text not found" });
      const after = before.replace(search, () => replace);
      await fs.writeFile(file, after, "utf8");
      res.json({ ok: true, path: rel(file), replacements: 1 });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post("/workspace/list", async (req, res) => {
    try {
      const p = req.body.path || ".";
      const dir = safe(p);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const result = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
      res.json({ ok: true, path: rel(dir), entries: result });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post("/workspace/tree", async (req, res) => {
    try {
      const p = req.body.path || ".";
      const maxDepth = req.body.depth || 3;
      const dir = safe(p);
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
      res.json({ ok: true, path: rel(dir), tree: await getTree(dir, 0) });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post("/workspace/search", async (req, res) => {
    try {
      const { pattern, path: searchPath, glob, maxResults } = req.body;
      const dir = safe(searchPath || ".");
      const limit = Math.min(maxResults || 50, 200);
      const matches: any[] = [];
      const regex = new RegExp(pattern, "gi");
      async function searchDir(current: string) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const e of entries) {
          if (matches.length >= limit) break;
          if (e.name === ".git" || e.name === "node_modules") continue;
          const full = path.join(current, e.name);
          if (e.isDirectory()) await searchDir(full);
          else {
            try {
              const text = await fs.readFile(full, "utf8");
              const lines = text.split("\n");
              for (let i = 0; i < lines.length && matches.length < limit; i++) {
                if (regex.test(lines[i])) matches.push({ file: rel(full), line: i + 1, text: lines[i].trim().slice(0, 200) });
              }
            } catch {}
          }
        }
      }
      await searchDir(dir);
      res.json({ ok: true, matches });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get("/workspace/file", async (req, res) => {
    try {
      const p = req.query.path as string;
      if (!p) return res.status(400).json({ ok: false, error: "path required" });
      const file = safe(p);
      const stats = await fs.stat(file);
      if (!stats.isFile()) throw new Error("Not a file");
      
      // Fix for "stale" files: disable caching
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      
      res.sendFile(file);
    } catch (err: any) {
      res.status(404).json({ ok: false, error: err.message });
    }
  });

  app.post("/workspace/run", async (req, res) => {
    try {
      await ensureWorkspace();
      const { scriptContent, scriptType, cwd, timeoutMs } = req.body;
      const ext = scriptType || "ps1";
      const logId = `run-${Date.now()}`;
      const scriptFile = path.join(scriptsDir, `${logId}.${ext}`);
      const logFile = path.join(logsDir, `${logId}.json`);
      const workDir = safe(cwd || ".");
      await fs.writeFile(scriptFile, scriptContent, "utf8");
      
      let cmd: string;
      let args: string[];
      if (ext === "py") { cmd = "python"; args = [scriptFile]; }
      else if (ext === "js") { cmd = "node"; args = [scriptFile]; }
      else if (ext === "sh") { cmd = "bash"; args = [scriptFile]; }
      else if (ext === "bat" && process.platform === "win32") { cmd = "cmd"; args = ["/c", scriptFile]; }
      else if (ext === "ps1" && process.platform === "win32") { cmd = "powershell"; args = ["-ExecutionPolicy", "Bypass", "-File", scriptFile]; }
      else { cmd = "bash"; args = [scriptFile]; }
      
      const result = await run(cmd, args, workDir, "", timeoutMs || 120000) as any;
      await fs.writeFile(logFile, JSON.stringify({ logId, ...result, timestamp: new Date().toISOString() }, null, 2));
      res.json({ logId, ...result });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post("/workspace/exec", async (req, res) => {
    try {
      const { command, args, cwd, input, timeoutMs } = req.body;
      const workDir = safe(cwd || ".");
      const result = await run(command, args || [], workDir, input || "", timeoutMs || 120000) as any;
      res.json({ ...result });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get("/workspace/log/:logId", async (req, res) => {
    try {
      const logFile = path.join(logsDir, `${(req.params as any).logId}.json`);
      const data = JSON.parse(await fs.readFile(logFile, "utf8"));
      res.json({ ok: true, ...data });
    } catch {

      res.status(404).json({ ok: false, error: "Log not found" });
    }
  });
}
