import express from "express";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { root, inboxDir, runningDir, doneDir, failedDir, reportsDir } from "../gateway/config.js";
import { redactText, redactSecrets } from "../gateway/redact.js";
import { QueueTaskRequestSchema } from "./types.js";
import { registerDashboardRoutes, initWebSocket, broadcast, notifyWebhook } from "./dashboard.js";
import { registerWorkspaceRoutes, workspaceOpenApiPaths } from "./workspace.js";
import { registerMcpSseRoutes } from "./mcp-sse.js";
import { generateAutoOpenApi } from "./auto-openapi.js";
import { registerTaskStreamRoutes } from "./task-stream.js";
import { registerTaskSearchRoutes } from "./task-search.js";
import { registerOAuthRoutes, isOAuthEnabled, validateOAuthToken } from "./oauth.js";
import { startTunnel, getPublicUrl, stopTunnel } from "./tunnel.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

// CORS middleware for browser addon
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Agent-Token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "8787");
const TOKEN = process.env.ACTION_BRIDGE_TOKEN;
const PUBLIC_URL = process.env.ACTION_BRIDGE_PUBLIC_URL || `http://${HOST}:${PORT}`;

// Auto-generate OpenAPI + Express routes from MCP tools
const autoOpenApi = generateAutoOpenApi();

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
      "/tasks/search": {
        get: {
          operationId: "searchTasks",
          summary: "Search and filter task history.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["inbox", "running", "done", "failed", "all"], default: "all" } },
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "tag", in: "query", schema: { type: "string" } },
            { name: "query", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
            { name: "sortBy", in: "query", schema: { type: "string", enum: ["createdAt", "modifiedAt", "priority"], default: "createdAt" } },
            { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
            { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { "200": { description: "Search results.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
        },
      },
      "/tasks/stats": {
        get: {
          operationId: "getTaskStats",
          summary: "Get aggregate task statistics.",
          responses: { "200": { description: "Task statistics.", content: { "application/json": { schema: { $ref: "#/components/schemas/BasicOk" } } } } },
        },
      },
      "/tasks/{taskId}/stream": {
        get: {
          operationId: "streamTaskProgress",
          summary: "Subscribe to real-time task progress via SSE.",
          parameters: [{ name: "taskId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "SSE stream of progress events." } },
        },
      },
      "/tasks/stream": {
        get: {
          operationId: "streamAllTasks",
          summary: "Subscribe to all task progress events via SSE.",
          responses: { "200": { description: "SSE firehose of all task events." } },
        },
      },
      // Workspace API — file-based code-agent operations
      ...workspaceOpenApiPaths,
      // Auto-generated MCP tool endpoints (direct invocation)
      ...autoOpenApi.paths,
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
  // OAuth endpoints are public (they handle their own auth)
  if (req.path.startsWith("/oauth/")) return next();
  // Dashboard & Local Sync endpoints — local access only
  if (req.path === "/ui" || req.path.startsWith("/api/") || req.path === "/ws" || req.path === "/workspace/file") {
    if (isLocalRequest(req)) return next();
    return res.status(403).json({ ok: false, error: "This endpoint is only accessible from localhost" });
  }
  
  // Accept token from X-Agent-Token header or Authorization: Bearer header
  const agentToken = req.headers["x-agent-token"];
  const authHeader = req.headers["authorization"];
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const providedToken = agentToken || bearerToken;

  // Try OAuth token validation first (if enabled)
  if (isOAuthEnabled() && typeof bearerToken === "string") {
    const oauthRecord = validateOAuthToken(bearerToken);
    if (oauthRecord) return next();
  }

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

// Register task search & stats routes BEFORE parametric /tasks/:taskId
registerTaskSearchRoutes(app);

// Register task streaming routes (SSE for real-time progress)
registerTaskStreamRoutes(app);

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

// Register auto-generated MCP tool routes (direct invocation via REST)
autoOpenApi.registerRoutes(app);
console.log(`[Bridge] Auto-registered ${autoOpenApi.toolNames.length} MCP tools as REST endpoints: ${autoOpenApi.toolNames.join(", ")}`);

// Register MCP SSE transport (for Devin / external MCP clients)
registerMcpSseRoutes(app);

// Register OAuth2 routes (if enabled)
registerOAuthRoutes(app);

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
initWebSocket(server);

server.listen(PORT, HOST, async () => {
  console.log(`[Bridge] Action bridge listening on http://${HOST}:${PORT}`);
  console.log(`[Bridge] Dashboard: http://${HOST}:${PORT}/ui`);
  console.log(`[Bridge] WebSocket: ws://${HOST}:${PORT}/ws`);
  console.log(`[Bridge] MCP SSE: ${PUBLIC_URL}/mcp`);
  console.log(`[Bridge] OpenAPI: ${PUBLIC_URL}/openapi.json`);
  if (!TOKEN) {
    console.warn("[Bridge] WARNING: ACTION_BRIDGE_TOKEN is not set. Auth will fail.");
  }

  // Auto-start tunnel if requested
  if (process.env.AUTO_TUNNEL === "true") {
    try {
      const provider = (process.env.TUNNEL_PROVIDER || "auto") as "cloudflared" | "ngrok" | "auto";
      const url = await startTunnel({ port: PORT, provider });
      console.log(`[Bridge] Tunnel active: ${url}`);
      console.log(`[Bridge] Use this URL in your Custom GPT Action configuration.`);
    } catch (err: any) {
      console.warn(`[Bridge] Tunnel failed: ${err.message}`);
      console.warn("[Bridge] Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
    }
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Bridge] Shutting down...");
  stopTunnel();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopTunnel();
  server.close();
  process.exit(0);
});
