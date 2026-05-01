import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { root } from "../gateway/config.js";
import { redactText, redactSecrets } from "../gateway/redact.js";
import { QueueTaskRequestSchema } from "./types.js";

const app = express();
app.use(express.json());

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
    },
  };
}

function isValidTaskId(taskId: string) {
  return /^[a-zA-Z0-9._-]+$/.test(taskId);
}

async function ensureQueueDirs() {
  await Promise.all([inboxDir, runningDir, doneDir, failedDir, reportsDir].map(dir => fs.mkdir(dir, { recursive: true })));
}

const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path === "/health" || req.path === "/openapi.json") return next();
  
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

app.listen(PORT, HOST, () => {
  console.log(`[Bridge] Action bridge listening on http://${HOST}:${PORT}`);
  console.log(`[Bridge] OpenAPI: ${PUBLIC_URL}/openapi.json`);
  if (!TOKEN) {
    console.warn("[Bridge] WARNING: ACTION_BRIDGE_TOKEN is not set. Auth will fail.");
  }
});
