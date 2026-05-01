import express from "express";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { root } from "../gateway/config.js";
import { redactText, redactSecrets } from "../gateway/redact.js";
import { QueueTaskRequestSchema } from "./types.js";
import { registerDashboardRoutes, initWebSocket, broadcast, notifyWebhook } from "./dashboard.js";
import { registerWorkspaceRoutes, workspaceOpenApiPaths } from "./workspace.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "8787");
const TOKEN = process.env.ACTION_BRIDGE_TOKEN;
const PUBLIC_URL = process.env.ACTION_BRIDGE_PUBLIC_URL || `http://${HOST}:${PORT}`;

const queueDir = path.join(root, ".agent-queue");
const inboxDir = path.join(queueDir, "inbox");
const runningDir = path.join(queueDir, "running");
const doneDir = path.join(queueDir, "done");
const failedDir = path.join(queueDir, "failed");
const reportsDir = path.join(queueDir, "reports");

function buildOpenApiSchema() {
  return {
    openapi: "3.1.0",
    info: {
      title: "mcp-gpt-auto Action Bridge",
      version: "0.1.0",
      description: "Queue tasks for a local mcp-gpt-auto runner and read task reports.",
    },
    servers: [
      {
        url: PUBLIC_URL,
        description: "Public HTTPS tunnel to local action bridge",
      },
    ],
    security: [{ AgentToken: [] }],
    components: {
      securitySchemes: {
        AgentToken: {
          type: "apiKey",
          in: "header",
          name: "X-Agent-Token",
        },
      },
      schemas: {
        Command: {
          type: "object",
          additionalProperties: false,
          required: ["command", "args"],
          properties: {
            command: {
              type: "string",
              enum: ["git", "node", "npm", "pnpm", "dotnet", "python", "py", "gemini", "powershell", "pwsh", "cmd"],
            },
            args: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        QueueTaskRequest: {
          type: "object",
          additionalProperties: false,
          required: ["taskId", "title", "type", "instructions"],
          properties: {
            taskId: {
              type: "string",
              pattern: "^[a-zA-Z0-9._-]+$",
            },
            title: { type: "string" },
            type: {
              type: "string",
              enum: ["shell", "gemini", "review", "mcp-smoke"],
            },
            priority: {
              type: "string",
              enum: ["low", "normal", "high"],
              default: "normal",
            },
            instructions: { type: "string" },
            commands: {
              type: "array",
              items: { $ref: "#/components/schemas/Command" },
              default: [],
            },
            allowedFiles: {
              type: "array",
              items: { type: "string" },
            },
            requiresPush: {
              type: "boolean",
              default: true,
            },
          },
        },
        BasicOk: {
          type: "object",
          additionalProperties: true,
          required: ["ok"],
          properties: {
            ok: { type: "boolean" },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          operationId: "getAgentHealth",
          summary: "Check local action bridge health.",
          security: [],
          responses: {
            "200": {
              description: "Health response.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BasicOk" },
                },
              },
            },
          },
        },
      },
      "/tasks": {
        post: {
          operationId: "queueTask",
          summary: "Queue a task for the local runner.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QueueTaskRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Task queued.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BasicOk" },
                },
              },
            },
          },
        },
      },
      "/tasks/{taskId}": {
        get: {
          operationId: "getTaskStatus",
          summary: "Get task queue status.",
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              schema: {
                type: "string",
                pattern: "^[a-zA-Z0-9._-]+$",
              },
            },
          ],
          responses: {
            "200": {
              description: "Task status.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BasicOk" },
                },
              },
            },
          },
        },
      },
      "/tasks/{taskId}/report": {
        get: {
          operationId: "getTaskReport",
          summary: "Get task Markdown report.",
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              schema: {
                type: "string",
                pattern: "^[a-zA-Z0-9._-]+$",
              },
            },
          ],
          responses: {
            "200": {
              description: "Task report.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BasicOk" },
                },
              },
            },
          },
        },
      },
      "/reports": {
        get: {
          operationId: "listTaskReports",
          summary: "List latest task reports.",
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 50,
                default: 10,
              },
            },
          ],
          responses: {
            "200": {
              description: "Latest reports.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BasicOk" },
                },
              },
            },
          },
        },
      },
      "/dashboard": {
        get: {
          operationId: "getDashboard",
          summary: "Task queue dashboard with stats and error analysis.",
          description: "Returns all tasks grouped by status with report summaries and error hints for failed tasks. Marks tasks older than 3 days as stale.",
          responses: {
            "200": {
              description: "Dashboard with summary counts and task details.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BasicOk" },
                },
              },
            },
          },
        },
      },
      // Workspace API — file-based code-agent operations
      ...workspaceOpenApiPaths,
    },
  };
}

function isValidTaskId(taskId: string) {
  return /^[a-zA-Z0-9._-]+$/.test(taskId);
}

async function ensureQueueDirs() {
  await Promise.all([inboxDir, runningDir, doneDir, failedDir, reportsDir].map(dir => fs.mkdir(dir, { recursive: true })));
}

function isLocalRequest(req: express.Request): boolean {
  const addr = req.socket.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Public endpoints (no auth needed)
  if (req.path === "/health" || req.path === "/openapi.json") return next();
  // Dashboard endpoints — local access only (blocked through ngrok/tunnels)
  if (req.path === "/ui" || req.path.startsWith("/api/") || req.path === "/ws") {
    if (isLocalRequest(req)) return next();
    return res.status(403).json({ ok: false, error: "Dashboard is only accessible from localhost" });
  }
  
  const providedToken = req.headers["x-agent-token"];
  if (!TOKEN) {
    console.error("[Bridge] ACTION_BRIDGE_TOKEN not set in environment");
    return res.status(500).json({ ok: false, error: "Server misconfigured: missing token" });
  }
  
  if (Array.isArray(providedToken) || providedToken !== TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
};

app.use(auth);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mcp-gpt-auto-action-bridge",
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiSchema());
});

app.post("/tasks", async (req, res) => {
  const result = QueueTaskRequestSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ ok: false, error: "Invalid task request", details: result.error.format() });
  }

  const task = result.data;
  const taskId = task.taskId;

  await ensureQueueDirs();
  
  // Check if already exists
  const dirs = [inboxDir, runningDir, doneDir, failedDir];
  for (const dir of dirs) {
    const p = path.join(dir, `${taskId}.json`);
    if (await fs.stat(p).catch(() => null)) {
      return res.status(409).json({ ok: false, error: `Task ${taskId} already exists in ${path.basename(dir)}` });
    }
  }

  const taskFile = path.join(inboxDir, `${taskId}.json`);
  const content = {
    ...task,
    createdAt: new Date().toISOString(),
    createdBy: "gpt-action-bridge",
    workspace: ".",
  };

  await fs.writeFile(taskFile, JSON.stringify(redactSecrets(content), null, 2));
  
  res.json({
    ok: true,
    taskId,
    path: `.agent-queue/inbox/${taskId}.json`,
    message: "Task queued. Start or keep runner loop running."
  });
});

app.get("/tasks/:taskId", async (req, res) => {
  const { taskId } = req.params;
  if (!isValidTaskId(taskId)) {
    return res.status(400).json({ ok: false, error: "Invalid task id" });
  }

  const statusDirs = {
    inbox: inboxDir,
    running: runningDir,
    done: doneDir,
    failed: failedDir
  };

  for (const [status, dir] of Object.entries(statusDirs)) {
    const p = path.join(dir, `${taskId}.json`);
    if (await fs.stat(p).catch(() => null)) {
      const reportPath = path.join(reportsDir, `${taskId}.md`);
      const hasReport = !!(await fs.stat(reportPath).catch(() => null));
      
      return res.json({
        ok: true,
        taskId,
        status,
        taskPath: `.agent-queue/${status}/${taskId}.json`,
        reportPath: hasReport ? `.agent-queue/reports/${taskId}.md` : null
      });
    }
  }

  res.status(404).json({ ok: false, taskId, status: "missing" });
});

app.get("/tasks/:taskId/report", async (req, res) => {
  const { taskId } = req.params;
  if (!isValidTaskId(taskId)) {
    return res.status(400).json({ ok: false, error: "Invalid task id" });
  }

  const reportPath = path.join(reportsDir, `${taskId}.md`);
  
  try {
    const content = await fs.readFile(reportPath, "utf8");
    res.json({
      ok: true,
      taskId,
      reportPath: `.agent-queue/reports/${taskId}.md`,
      markdown: redactText(content)
    });
  } catch (err) {
    res.status(404).json({ ok: false, error: "Report not found" });
  }
});

app.get("/reports", async (req, res) => {
  const requestedLimit = parseInt(req.query.limit as string || "10", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 10;
  
  try {
    const files = await fs.readdir(reportsDir);
    const reportFiles = files.filter(f => f.endsWith(".md"));
    
    const reports = await Promise.all(
      reportFiles.map(async f => {
        const p = path.join(reportsDir, f);
        const stats = await fs.stat(p);
        return {
          taskId: path.basename(f, ".md"),
          path: `.agent-queue/reports/${f}`,
          modifiedAt: stats.mtime.toISOString()
        };
      })
    );
    
    reports.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    
    res.json({
      ok: true,
      reports: reports.slice(0, limit)
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to list reports" });
  }
});

app.get("/dashboard", async (req, res) => {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  async function listJsonFiles(dir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => f.endsWith(".json"));
    } catch {
      return [];
    }
  }

  async function parseTask(dir: string, file: string) {
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const data = JSON.parse(raw);
      const stats = await fs.stat(path.join(dir, file));
      const ageMs = now - stats.mtime.getTime();
      return {
        taskId: data.taskId || path.basename(file, ".json"),
        title: data.title || "",
        type: data.type || "unknown",
        createdAt: data.createdAt || stats.mtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        isStale: ageMs > THREE_DAYS_MS,
        ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
      };
    } catch {
      return {
        taskId: path.basename(file, ".json"),
        title: "(parse error)",
        type: "unknown",
        createdAt: "",
        modifiedAt: "",
        isStale: false,
        ageDays: 0,
      };
    }
  }

  async function getReportSummary(taskId: string) {
    const reportPath = path.join(reportsDir, `${taskId}.md`);
    try {
      const raw = await fs.readFile(reportPath, "utf8");
      const redacted = redactText(raw);
      const lines = redacted.split("\n");

      let errorLine = "";
      let exitCode = "";
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (!errorLine && (lower.includes("error") || lower.includes("fail") || lower.includes("exception"))) {
          errorLine = line.trim().slice(0, 200);
        }
        const exitMatch = line.match(/exit\s*code[:\s]*(\d+)/i);
        if (exitMatch) {
          exitCode = exitMatch[1];
        }
      }

      return {
        hasReport: true,
        lines: lines.length,
        errorHint: errorLine || null,
        exitCode: exitCode || null,
        previewLines: lines.slice(0, 8).join("\n"),
      };
    } catch {
      return { hasReport: false, lines: 0, errorHint: null, exitCode: null, previewLines: "" };
    }
  }

  try {
    await ensureQueueDirs();

    const [inboxFiles, runningFiles, doneFiles, failedFiles] = await Promise.all([
      listJsonFiles(inboxDir),
      listJsonFiles(runningDir),
      listJsonFiles(doneDir),
      listJsonFiles(failedDir),
    ]);

    const inbox = await Promise.all(inboxFiles.map(f => parseTask(inboxDir, f)));
    const running = await Promise.all(runningFiles.map(f => parseTask(runningDir, f)));
    const done = await Promise.all(doneFiles.map(f => parseTask(doneDir, f)));
    const failed = await Promise.all(failedFiles.map(f => parseTask(failedDir, f)));

    const failedWithReports = await Promise.all(
      failed.map(async t => ({
        ...t,
        report: await getReportSummary(t.taskId),
      }))
    );

    const doneWithReports = await Promise.all(
      done.map(async t => ({
        ...t,
        report: await getReportSummary(t.taskId),
      }))
    );

    const totalTasks = inbox.length + running.length + done.length + failed.length;
    const staleCount = [...inbox, ...running, ...done, ...failed].filter(t => t.isStale).length;

    res.json({
      ok: true,
      summary: {
        total: totalTasks,
        inbox: inbox.length,
        running: running.length,
        done: done.length,
        failed: failed.length,
        stale: staleCount,
      },
      tasks: {
        inbox,
        running,
        done: doneWithReports,
        failed: failedWithReports,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to build dashboard" });
  }
});

// Register dashboard routes (UI, API, cancel, retry)
registerDashboardRoutes(app);

// Register workspace routes (file-based code-agent API)
registerWorkspaceRoutes(app);

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
initWebSocket(server);

server.listen(PORT, HOST, () => {
  console.log(`[Bridge] Action bridge listening on http://${HOST}:${PORT}`);
  console.log(`[Bridge] Dashboard: http://${HOST}:${PORT}/ui`);
  console.log(`[Bridge] WebSocket: ws://${HOST}:${PORT}/ws`);
  console.log(`[Bridge] OpenAPI: ${PUBLIC_URL}/openapi.json`);
  if (!TOKEN) {
    console.warn("[Bridge] WARNING: ACTION_BRIDGE_TOKEN is not set. Auth will fail.");
  }
});
