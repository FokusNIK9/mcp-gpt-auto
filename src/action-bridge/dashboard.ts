/**
 * Local monitoring dashboard for mcp-gpt-auto
 * - HTML UI at GET /ui
 * - API endpoints: /api/activity, /api/logs/:taskId, /api/audit
 * - Cancel / Retry task actions
 * - WebSocket for real-time updates
 * - Optional webhook notifications
 */

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runGit, audit, rel, taskDir, readAuditEntries } from "../gateway/utils.js";
import { root, agent, inboxDir, runningDir, doneDir, failedDir, reportsDir } from "../gateway/config.js";
import { redactText } from "../gateway/redact.js";

const auditLog = path.join(agent, "logs", "audit.jsonl");
const execFileAsync = promisify(execFile);

// --- Live Feed Memory (Circular Buffer) ---
const liveFeed: any[] = [];
const MAX_LIVE_ITEMS = 50;

export function addLiveFeedEntry(entry: any) {
  liveFeed.unshift(entry); // Newest first
  if (liveFeed.length > MAX_LIVE_ITEMS) {
    liveFeed.pop();
  }
  broadcast({ type: "live_feed_update", entry });
}

// --- WebSocket broadcast ---
let wss: WebSocketServer | null = null;

export function initWebSocket(server: http.Server) {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "connected", ts: new Date().toISOString() }));
  });

  // Poll for changes every 5s and broadcast
  let lastSnapshot = "";
  setInterval(async () => {
    try {
      const snap = await buildActivitySnapshot();
      // Compare only tasks+summary (exclude updatedAt which changes every call)
      const compareKey = JSON.stringify({ tasks: snap.tasks, summary: snap.summary });
      if (compareKey !== lastSnapshot) {
        lastSnapshot = compareKey;
        broadcast({ type: "update", data: snap });
      }
    } catch { /* ignore */ }
  }, 5000);
}

function broadcast(data: unknown) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// --- Helpers ---

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files.filter(f => f.endsWith(".json"));
  } catch {
    return [];
  }
}

function inferTaskType(data: any, taskId: string): string {
  // 1. Попытка взять готовый тип, если он есть и он вменяемый
  const rawType = String(data.type || "").toLowerCase();
  if (rawType && rawType !== "unknown" && rawType !== "undefined" && rawType !== "null") {
    return rawType;
  }

  // 2. Если типа нет, ищем признаки Shell-задачи (команды)
  if ((data.commands && data.commands.length > 0) || (data.commandsRun && data.commandsRun.length > 0)) {
    return "shell";
  }

  // 3. Угадываем по тексту из всех доступных полей
  const contextText = [
    taskId,
    data.title,
    data.instructions,
    data.summary,
    data.createdBy
  ].filter(Boolean).join(" ").toLowerCase();

  if (contextText.includes("subagent") || contextText.includes("sub-agent") || contextText.includes("gemini")) return "gemini";
  if (contextText.includes("review")) return "review";
  if (contextText.includes("smoke") || contextText.includes("screenshot")) return "mcp-smoke";
  if (contextText.includes("command") || contextText.includes("shell") || contextText.includes("test")) return "shell";

  return "unknown";
}

function titleFromTaskId(taskId: string): string {
  return taskId
    .replace(/[-_]+/g, " ")
    .replace(/\b\d{8,}\b/g, "")
    .trim();
}

async function parseTaskFile(dir: string, file: string, status: string) {
  try {
    const filePath = path.join(dir, file);
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(redactText(raw)); // Redact on load
    const stats = await fs.stat(filePath);
    const ageMs = Date.now() - stats.mtime.getTime();
    return {
      taskId: data.taskId || path.basename(file, ".json"),
      title: data.title || titleFromTaskId(data.taskId || path.basename(file, ".json")),
      type: inferTaskType(data, data.taskId || path.basename(file, ".json")),
      status,
      instructions: data.instructions || "",
      commands: data.commands || [],
      createdAt: data.createdAt || stats.mtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
      isStale: ageMs > 3 * 24 * 60 * 60 * 1000,
      ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
    };
  } catch {
    return {
      taskId: path.basename(file, ".json"),
      title: "(parse error)",
      type: "unknown",
      status,
      instructions: "",
      commands: [],
      createdAt: "",
      modifiedAt: "",
      isStale: false,
      ageDays: 0,
    };
  }
}

async function getReportContent(taskId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(reportsDir, `${taskId}.md`), "utf8");
    return redactText(raw);
  } catch {
    return null;
  }
}

async function buildActivitySnapshot() {
  const dirs: Array<[string, string]> = [
    [inboxDir, "inbox"],
    [runningDir, "running"],
    [doneDir, "done"],
    [failedDir, "failed"],
  ];

  const allTasks: Array<ReturnType<typeof parseTaskFile> extends Promise<infer T> ? T : never> = [];

  for (const [dir, status] of dirs) {
    const files = await listJsonFiles(dir);
    const tasks = await Promise.all(files.map(f => parseTaskFile(dir, f, status)));
    allTasks.push(...tasks);
  }

  allTasks.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  return {
    tasks: allTasks,
    summary: {
      total: allTasks.length,
      inbox: allTasks.filter(t => t.status === "inbox").length,
      running: allTasks.filter(t => t.status === "running").length,
      done: allTasks.filter(t => t.status === "done").length,
      failed: allTasks.filter(t => t.status === "failed").length,
      stale: allTasks.filter(t => t.isStale).length,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function getGitStatusSummary() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: root, timeout: 5000 });
    const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean);
    return {
      ok: true,
      clean: lines.length === 0,
      changed: lines.length,
      lines: lines.slice(0, 50),
    };
  } catch (err) {
    return {
      ok: false,
      clean: false,
      changed: 0,
      lines: [],
      error: err instanceof Error ? err.message : "Failed to read git status",
    };
  }
}

async function buildHealthSummary() {
  const activity = await buildActivitySnapshot();
  const auditEntries = await readAuditEntries(25);
  const git = await getGitStatusSummary();
  const recentRejected = auditEntries.filter((e: any) => e?.tool === "review.run" && e?.data?.status === "rejected").length;
  const recentFailures = auditEntries.filter((e: any) => e?.ok === false).length;

  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (activity.summary.failed > 0) {
    warnings.push(`${activity.summary.failed} проваленных задач в очереди`);
    recommendations.push("Откройте отчеты об ошибках и повторите или архивируйте задачи.");
  }
  if (activity.summary.running > 0) {
    recommendations.push("Следите за активными задачами, чтобы избежать зависаний.");
  }
  if (activity.summary.stale > 0) {
    warnings.push(`${activity.summary.stale} старых задач (более 3 дней)`);
    recommendations.push("Очистите или перезапустите старые задачи.");
  }
  if (recentFailures > 0) {
    warnings.push(`${recentFailures} сбоев аудита за последнее время`);
    recommendations.push("Проверьте вкладку Аудит на наличие системных ошибок.");
  }
  if (recentRejected > 0) {
    warnings.push(`${recentRejected} правок отклонено ревьюером`);
    recommendations.push("Проверьте последние логи review.run.");
  }
  if (git.ok && !git.clean) {
    warnings.push(`В Git есть ${git.changed} незакоммиченных изменений`);
    recommendations.push("Проверьте статус репозитория перед фиксацией изменений.");
  }

  const health = warnings.length === 0 ? "healthy" : (activity.summary.failed > 0 || recentFailures > 0 ? "degraded" : "warning");

  return {
    ok: true,
    health,
    summary: activity.summary,
    git,
    audit: {
      recent: auditEntries.slice(0, 10),
      recentFailures,
      recentRejected,
    },
    warnings,
    recommendations,
    updatedAt: new Date().toISOString(),
  };
}

// --- Routes ---

export function registerDashboardRoutes(app: express.Application) {
  // UI page (no auth — local only)
  app.get("/ui", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(DASHBOARD_HTML);
  });

  // API: Dashboard 2.0 health summary
  app.get("/api/health-summary", async (_req, res) => {
    try {
      const summary = await buildHealthSummary();
      res.json(summary);
    } catch {
      res.status(500).json({ ok: false, error: "Failed to build health summary" });
    }
  });

  // API: activity feed
  app.get("/api/activity", async (_req, res) => {
    try {
      const snap = await buildActivitySnapshot();
      res.json({ ok: true, ...snap });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Failed to build activity" });
    }
  });

  // API: live feed (in-memory buffer)
  app.get("/api/live-feed", (_req, res) => {
    res.json({ ok: true, feed: liveFeed });
  });

  // API: detailed task log
  app.get("/api/logs/:taskId", async (req, res) => {
    const { taskId } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(taskId)) {
      return res.status(400).json({ ok: false, error: "Invalid task id" });
    }

    // Find task in any dir
    const dirs: Array<[string, string]> = [
      [inboxDir, "inbox"],
      [runningDir, "running"],
      [doneDir, "done"],
      [failedDir, "failed"],
    ];

    let task = null;
    for (const [dir, status] of dirs) {
      const filePath = path.join(dir, `${taskId}.json`);
      if (await fs.stat(filePath).catch(() => null)) {
        task = await parseTaskFile(dir, `${taskId}.json`, status);
        break;
      }
    }

    const report = await getReportContent(taskId);

    if (!task && !report) {
      return res.status(404).json({ ok: false, error: "Task not found" });
    }

    res.json({ ok: true, task, report });
  });

  // API: audit log
  app.get("/api/audit", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 200);
    try {
      const entries = await readAuditEntries(limit);
      res.json({ ok: true, entries });
    } catch {
      res.json({ ok: true, entries: [] });
    }
  });

  // Cancel task (move from inbox/running to failed)
  app.post("/api/tasks/:taskId/cancel", async (req, res) => {
    const { taskId } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(taskId)) {
      return res.status(400).json({ ok: false, error: "Invalid task id" });
    }

    const sourceDirs = [
      [inboxDir, "inbox"],
      [runningDir, "running"],
    ] as const;

    for (const [dir, status] of sourceDirs) {
      const src = path.join(dir, `${taskId}.json`);
      if (await fs.stat(src).catch(() => null)) {
        const dest = path.join(failedDir, `${taskId}.json`);
        await fs.rename(src, dest);

        // Write a cancel report
        const report = `# Task Report: ${taskId}\n\n**Status**: ❌ CANCELLED\n**Cancelled at**: ${new Date().toISOString()}\n**Was in**: ${status}\n\n## Summary\nTask was manually cancelled by user from the dashboard.\n`;
        await fs.writeFile(path.join(reportsDir, `${taskId}.md`), report);

        broadcast({ type: "cancelled", taskId });

        // Trigger webhook
        await notifyWebhook(`Task cancelled: ${taskId}`);

        return res.json({ ok: true, taskId, message: `Task cancelled (was ${status})` });
      }
    }

    res.status(404).json({ ok: false, error: "Task not in inbox or running" });
  });

  // Retry task (copy from done/failed back to inbox)
  app.post("/api/tasks/:taskId/retry", async (req, res) => {
    const { taskId } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(taskId)) {
      return res.status(400).json({ ok: false, error: "Invalid task id" });
    }

    const sourceDirs = [
      [failedDir, "failed"],
      [doneDir, "done"],
    ] as const;

    for (const [dir, status] of sourceDirs) {
      const src = path.join(dir, `${taskId}.json`);
      if (await fs.stat(src).catch(() => null)) {
        const raw = await fs.readFile(src, "utf8");
        const data = JSON.parse(raw);

        // Generate new taskId with retry suffix
        const retryId = `${taskId}-retry-${Date.now()}`;
        const newTask = {
          ...data,
          taskId: retryId,
          createdAt: new Date().toISOString(),
          createdBy: "dashboard-retry",
        };

        await fs.writeFile(path.join(inboxDir, `${retryId}.json`), JSON.stringify(newTask, null, 2));

        broadcast({ type: "retried", originalTaskId: taskId, newTaskId: retryId });

        return res.json({ ok: true, originalTaskId: taskId, newTaskId: retryId, message: `Task retried as ${retryId}` });
      }
    }

    res.status(404).json({ ok: false, error: "Task not in done or failed" });
  });

  // API: Cleanup temp files (screenshots, done, failed, reports) and push to GitHub
  app.post("/api/cleanup", async (req, res) => {
    try {
      const flags = req.body;
      const archivedFiles = [];
      
      const archiveRoot = path.join(root, ".agent-queue", "archive");
      const screenshotsArchive = path.join(root, "screenshots", "archive");
      
      await fs.mkdir(path.join(archiveRoot, "tasks"), { recursive: true });
      await fs.mkdir(path.join(archiveRoot, "reports"), { recursive: true });
      await fs.mkdir(screenshotsArchive, { recursive: true });

      // 1. Screenshots
      if (flags.screenshots) {
        const screenshotsDir = path.join(root, "screenshots");
        try {
          const screens = await fs.readdir(screenshotsDir);
          for (const s of screens) {
            if (s.endsWith(".png") && s !== "latest-screenshot.png" && s !== "archive") {
              await fs.rename(path.join(screenshotsDir, s), path.join(screenshotsArchive, s));
              archivedFiles.push(`screenshots/${s}`);
            }
          }
        } catch (e) { /* ignore */ }
      }

      // 2. Tasks and Reports
      const taskDirs = [];
      if (flags.done) taskDirs.push({ dir: doneDir, rel: ".agent-queue/done" });
      if (flags.failed) taskDirs.push({ dir: failedDir, rel: ".agent-queue/failed" });

      for (const { dir, rel } of taskDirs) {
        try {
          const files = await fs.readdir(dir);
          for (const f of files) {
            if (f.endsWith(".json") && f !== ".gitkeep") {
              await fs.rename(path.join(dir, f), path.join(archiveRoot, "tasks", f));
              archivedFiles.push(`${rel}/${f}`);
            }
          }
        } catch (e) { /* ignore */ }
      }

      if (flags.reports) {
        try {
          const files = await fs.readdir(reportsDir);
          for (const f of files) {
            if (f.endsWith(".md") && f !== ".gitkeep" && f !== "README.md") {
              await fs.rename(path.join(reportsDir, f), path.join(archiveRoot, "reports", f));
              archivedFiles.push(`.agent-queue/reports/${f}`);
            }
          }
        } catch (e) { /* ignore */ }
      }

      // 3. Audit Log Rotation
      if (flags.audit) {
        try {
          const raw = await fs.readFile(auditLog, "utf8");
          const lines = raw.trim().split("\n");
          if (lines.length > 500) {
            const truncated = lines.slice(-500).join("\n") + "\n";
            await fs.writeFile(auditLog, truncated);
            archivedFiles.push("logs/audit.jsonl (rotated)");
          }
        } catch (e) { /* ignore */ }
      }

      if (archivedFiles.length === 0) {
        return res.json({ ok: true, message: "Ничего не выбрано или файлы не найдены." });
      }

      // 4. Git commit and push (sync removal of files from tracked folders)
      try {
        await runGit(["add", "-u", "screenshots/", ".agent-queue/done/", ".agent-queue/failed/", ".agent-queue/reports/"]);
        await runGit(["commit", "-m", `chore: dashboard cleanup/archive (${archivedFiles.length} items)`]);
        await runGit(["push", "origin", "main"]);
      } catch (gitErr) {
        console.error("Git cleanup sync non-fatal error:", gitErr);
      }

      broadcast({ type: "cleanup", count: archivedFiles.length });
      
      // Clear in-memory live feed on cleanup
      liveFeed.length = 0;
      
      return res.json({ ok: true, message: `Архивировано ${archivedFiles.length} элементов локально и синхронизировано с GitHub.` });

    } catch (err) {
      console.error("Cleanup error:", err);
      res.status(500).json({ ok: false, error: "Cleanup failed" });
    }
  });
}

// --- Webhook ---

async function notifyWebhook(text: string) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, timestamp: new Date().toISOString() }),
    });
  } catch { /* webhook is best-effort */ }
}

// Expose for use from other routes
export { broadcast, notifyWebhook };

// --- HTML ---

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mcp-gpt-auto — Панель управления</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --yellow: #d29922; --blue: #58a6ff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); }
  .container { max-width: 1200px; margin: 0 auto; padding: 16px; }

  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
  header h1 { font-size: 20px; font-weight: 600; }
  .ws-status { font-size: 12px; padding: 4px 8px; border-radius: 12px; }
  .ws-status.connected { background: rgba(63,185,80,0.15); color: var(--green); }
  .ws-status.disconnected { background: rgba(248,81,73,0.15); color: var(--red); }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; }
  .stat-card .num { font-size: 28px; font-weight: 700; }
  .stat-card .label { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .stat-card.done .num { color: var(--green); }
  .stat-card.failed .num { color: var(--red); }
  .stat-card.running .num { color: var(--yellow); }
  .stat-card.inbox .num { color: var(--blue); }

  .health-panel { background: linear-gradient(135deg, rgba(88,166,255,0.10), rgba(63,185,80,0.06)); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 20px; }
  .health-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .health-title { font-size: 15px; font-weight: 600; }
  .health-updated { color: var(--muted); font-size: 11px; font-family: monospace; }
  .health-grid { display: grid; grid-template-columns: minmax(160px, 0.8fr) repeat(3, minmax(120px, 1fr)); gap: 12px; margin-bottom: 12px; }
  .health-card { background: rgba(13,17,23,0.55); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
  .health-card .label { color: var(--muted); font-size: 11px; margin-bottom: 6px; }
  .health-card .value { font-size: 20px; font-weight: 700; }
  .health-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
  .health-badge.healthy { background: rgba(63,185,80,0.15); color: var(--green); }
  .health-badge.warning { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .health-badge.degraded { background: rgba(248,81,73,0.15); color: var(--red); }
  .health-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .health-list { background: rgba(13,17,23,0.35); border: 1px solid var(--border); border-radius: 10px; padding: 12px; min-height: 72px; }
  .health-list h3 { font-size: 12px; color: var(--muted); margin-bottom: 8px; font-weight: 600; }
  .health-list ul { margin-left: 18px; color: var(--text); font-size: 12px; line-height: 1.6; }
  .git-lines { margin-top: 8px; font-family: monospace; font-size: 11px; color: var(--muted); max-height: 90px; overflow: auto; white-space: pre-wrap; }
  @media (max-width: 800px) { .health-grid, .health-lists { grid-template-columns: 1fr; } }

  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
  .tab { padding: 8px 16px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; font-size: 14px; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  .live-item { padding: 10px; border-bottom: 1px solid var(--border); font-family: monospace; font-size: 12px; animation: slideIn 0.3s ease-out; }
  .live-item .ts { color: var(--muted); margin-right: 8px; }
  .live-item .tool { color: var(--accent); font-weight: bold; margin-right: 8px; }
  .live-item .intent { color: var(--yellow); font-style: italic; margin-bottom: 4px; display: block; }
  .live-item .data-scroll { max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 4px; margin-top: 4px; color: var(--muted); }
  .live-item.fail { border-left: 3px solid var(--red); background: rgba(248,81,73,0.05); }
  .live-item.success { border-left: 3px solid var(--green); }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }

  .panel { display: none; }
  .panel.active { display: block; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; color: var(--muted); font-weight: 500; border-bottom: 1px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:hover { background: rgba(88,166,255,0.04); }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge.done { background: rgba(63,185,80,0.15); color: var(--green); }
  .badge.failed { background: rgba(248,81,73,0.15); color: var(--red); }
  .badge.running { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .badge.inbox { background: rgba(88,166,255,0.15); color: var(--blue); }
  .badge.stale { background: rgba(210,153,34,0.1); color: var(--yellow); font-size: 10px; margin-left: 4px; }

  .type-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; background: var(--border); color: var(--muted); }

  .btn { padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; font-size: 12px; }
  .btn:hover { border-color: var(--accent); }
  .btn.cancel { border-color: var(--red); color: var(--red); }
  .btn.cancel:hover { background: rgba(248,81,73,0.1); }
  .btn.retry { border-color: var(--green); color: var(--green); }
  .btn.retry:hover { background: rgba(63,185,80,0.1); }

  .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: center; justify-content: center; }
  .modal-overlay.open { display: flex; }
  .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .modal h2 { font-size: 16px; margin-bottom: 12px; }
  .modal pre { background: var(--bg); padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; }
  .modal .close { float: right; cursor: pointer; color: var(--muted); font-size: 18px; }
  .modal .close:hover { color: var(--text); }

  .cleanup-modal { max-width: 400px; }
  .cleanup-option { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; cursor: pointer; }
  .cleanup-option input { cursor: pointer; width: 16px; height: 16px; }

  .audit-entry { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; display: flex; gap: 12px; }
  .audit-entry .ts { color: var(--muted); min-width: 180px; font-family: monospace; font-size: 11px; }
  .audit-entry .tool { color: var(--accent); min-width: 140px; }
  .audit-entry.fail .tool { color: var(--red); }

  .empty { text-align: center; padding: 40px; color: var(--muted); }
  .notification { position: fixed; top: 16px; right: 16px; padding: 12px 20px; border-radius: 8px; font-size: 13px; z-index: 200; animation: fadeIn 0.3s; }
  .notification.error { background: rgba(248,81,73,0.9); color: white; }
  .notification.success { background: rgba(63,185,80,0.9); color: white; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>
<div class="container">
  <header>
    <div style="display: flex; align-items: center; gap: 16px;">
      <h1>mcp-gpt-auto — Дашборд</h1>
      <button class="btn" style="border-color: var(--yellow); color: var(--yellow);" onclick="openCleanupModal()">🧹 Очистка временных файлов</button>
    </div>
    <span id="wsStatus" class="ws-status disconnected">отключено</span>
  </header>

  <div class="stats" id="stats"></div>

  <section class="health-panel" id="healthPanel">
    <div class="health-head">
      <div class="health-title">Состояние системы (Health 2.1)</div>
      <div id="healthUpdated" class="health-updated">загрузка...</div>
    </div>
    <div id="healthSummary"><div class="empty">Загрузка данных о здоровье...</div></div>
  </section>

  <div class="tabs">
    <div class="tab active" data-panel="live">Живой поток</div>
    <div class="tab" data-panel="activity">Активность</div>
    <div class="tab" data-panel="commands">Команды</div>
    <div class="tab" data-panel="subagents">Суб-агенты</div>
    <div class="tab" data-panel="audit">Аудит</div>
  </div>

  <div id="live" class="panel active">
    <div style="padding: 8px 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; background: rgba(88,166,255,0.02);">
      <label style="font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--muted);">
        <input type="checkbox" id="hideNoise" checked onchange="renderLiveFeed()"> Скрыть системный шум (info)
      </label>
    </div>
    <div id="liveContent"></div>
  </div>
  <div id="activity" class="panel"></div>
  <div id="commands" class="panel"></div>
  <div id="subagents" class="panel"></div>
  <div id="audit" class="panel"></div>
</div>

<!-- Task Details Modal -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <span class="close" id="modalClose">&times;</span>
    <h2 id="modalTitle"></h2>
    <pre id="modalBody"></pre>
  </div>
</div>

<!-- Cleanup Modal -->
<div class="modal-overlay" id="cleanupModalOverlay">
  <div class="modal cleanup-modal">
    <span class="close" onclick="closeCleanupModal()">&times;</span>
    <h2>🧹 Архивация и Очистка</h2>
    <p style="color:var(--muted); font-size:12px; margin-bottom:16px;">
      Выбранные файлы будут перемещены в локальный <b>архив</b> и удалены из репозитория GitHub.
    </p>
    
    <label class="cleanup-option"><input type="checkbox" id="cleanDone" checked> Выполненные задачи (.json)</label>
    <label class="cleanup-option"><input type="checkbox" id="cleanFailed" checked> Ошибки (.json)</label>
    <label class="cleanup-option"><input type="checkbox" id="cleanReports" checked> Отчеты (.md)</label>
    <label class="cleanup-option"><input type="checkbox" id="cleanScreens" checked> Скриншоты (.png)</label>
    <label class="cleanup-option"><input type="checkbox" id="cleanAudit" checked> Ротация логов (оставить 500 строк)</label>

    <div style="margin-top:20px; display:flex; gap:10px;">
      <button class="btn retry" style="flex:1" onclick="confirmCleanup()">Начать очистку</button>
      <button class="btn" onclick="closeCleanupModal()">Отмена</button>
    </div>
  </div>
</div>

<script>
const API = window.location.origin;
let allTasks = [];

// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  });
});

// --- Modal ---
function openModal(title, body) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent = body;
  document.getElementById('modalOverlay').classList.add('open');
}
document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.remove('open');
});

function openCleanupModal() { document.getElementById('cleanupModalOverlay').classList.add('open'); }
function closeCleanupModal() { document.getElementById('cleanupModalOverlay').classList.remove('open'); }

// --- Notifications ---
function notify(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'notification ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}


// --- Dashboard 2.0 Health ---
async function loadHealthSummary() {
  try {
    const r = await fetch(API + '/api/health-summary');
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'ошибка здоровья');
    renderHealthSummary(data);
  } catch {
    document.getElementById('healthUpdated').textContent = 'состояние недоступно';
    document.getElementById('healthSummary').innerHTML = '<div class="empty">Не удалось загрузить данные о здоровье системы</div>';
  }
}

function renderHealthSummary(data) {
  const healthMap = { 'healthy': 'стабильно', 'warning': 'внимание', 'degraded': 'деградация' };
  const health = data.health || 'warning';
  const warnings = data.warnings && data.warnings.length ? data.warnings : ['Предупреждений нет'];
  const recommendations = data.recommendations && data.recommendations.length ? data.recommendations : ['Действий не требуется'];
  const gitLines = data.git && data.git.lines && data.git.lines.length ? data.git.lines.map(esc).join('\\n') : 'репозиторий чист';
  const queue = data.summary || { total: 0, running: 0, failed: 0 };
  const audit = data.audit || { recentRejected: 0, recentFailures: 0 };
  document.getElementById('healthUpdated').textContent = 'обновлено ' + new Date(data.updatedAt).toLocaleTimeString();
  document.getElementById('healthSummary').innerHTML =
    '<div class="health-grid">' +
      '<div class="health-card"><div class="label">Общее состояние</div><div class="value"><span class="health-badge ' + esc(health) + '">' + esc(healthMap[health] || health) + '</span></div></div>' +
      '<div class="health-card"><div class="label">Очередь</div><div class="value">' + queue.running + ' активно</div></div>' +
      '<div class="health-card"><div class="label">Ошибки</div><div class="value">' + queue.failed + '</div></div>' +
      '<div class="health-card"><div class="label">Git изменения</div><div class="value">' + (data.git ? data.git.changed : '?') + '</div><div class="git-lines">' + gitLines + '</div></div>' +
    '</div>' +
    '<div class="health-lists">' +
      '<div class="health-list"><h3>Предупреждения</h3><ul>' + warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></div>' +
      '<div class="health-list"><h3>Рекомендации</h3><ul>' + recommendations.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></div>' +
    '</div>' +
    '<div class="health-updated" style="margin-top:10px">Последний аудит: ' + audit.recentFailures + ' сбоев, ' + audit.recentRejected + ' отказов ревью</div>';
}

// --- Live Feed ---
const liveFeedItems = [];
const MAX_LIVE_DISPLAY = 50;

function renderLiveFeed() {
  const el = document.getElementById('liveContent');
  const hideNoise = document.getElementById('hideNoise').checked;
  if (!liveFeedItems.length) { el.innerHTML = '<div class="empty">Ожидание действий агента...</div>'; return; }
  
  let html = '';
  for (const item of liveFeedItems) {
    if (hideNoise && item.level === 'info') continue;
    const cls = item.ok ? 'success' : 'fail';
    const isCritical = item.level === 'critical';
    const time = new Date(item.ts).toLocaleString(); // Local Time
    html += '<div class="live-item ' + cls + '" style="' + (isCritical ? 'background:rgba(210,153,34,0.03)' : '') + '">' +
      '<span class="intent">' + esc(item.intent || 'Прямое действие') + '</span>' +
      '<div>' +
        '<span class="ts">[' + time + ']</span>' +
        '<span class="tool" style="' + (isCritical ? 'color:var(--yellow)' : '') + '">' + esc(item.tool) + '</span>' +
        '<div class="data-scroll">' + esc(JSON.stringify(item.data || '')) + '</div>' +
      '</div>' +
    '</div>';
  }
  el.innerHTML = html || '<div class="empty">Нет критических действий (шум скрыт)</div>';
}

// --- Stats ---
function renderStats(summary) {
  document.getElementById('stats').innerHTML =
    '<div class="stat-card"><div class="num">' + summary.total + '</div><div class="label">Всего</div></div>' +
    '<div class="stat-card inbox"><div class="num">' + summary.inbox + '</div><div class="label">В очереди</div></div>' +
    '<div class="stat-card running"><div class="num">' + summary.running + '</div><div class="label">Выполняется</div></div>' +
    '<div class="stat-card done"><div class="num">' + summary.done + '</div><div class="label">Готово</div></div>' +
    '<div class="stat-card failed"><div class="num">' + summary.failed + '</div><div class="label">Ошибка</div></div>' +
    '<div class="stat-card"><div class="num">' + summary.stale + '</div><div class="label">Старые (3д+)</div></div>';
}

// --- Activity Table ---
function renderActivity(tasks) {
  if (!tasks.length) { document.getElementById('activity').innerHTML = '<div class="empty">Задач пока нет</div>'; return; }
  let html = '<table><tr><th>ID Задачи</th><th>Заголовок</th><th>Тип</th><th>Статус</th><th>Возраст</th><th>Действия</th></tr>';
  for (const t of tasks) {
    const stale = t.isStale ? ' <span class="badge stale">старая</span>' : '';
    let actions = '<button class="btn" onclick="viewLog(\\'' + t.taskId + '\\')">Лог</button> ';
    if (t.status === 'inbox' || t.status === 'running')
      actions += '<button class="btn cancel" onclick="cancelTask(\\'' + t.taskId + '\\')">Отмена</button>';
    if (t.status === 'failed' || t.status === 'done')
      actions += '<button class="btn retry" onclick="retryTask(\\'' + t.taskId + '\\')">Повтор</button>';
    html += '<tr><td><code>' + esc(t.taskId) + '</code></td><td>' + esc(t.title) +
      '</td><td><span class="type-badge">' + esc(t.type) + '</span></td><td><span class="badge ' + t.status + '">' + t.status + '</span>' + stale +
      '</td><td>' + t.ageDays + 'д</td><td>' + actions + '</td></tr>';
  }
  html += '</table>';
  document.getElementById('activity').innerHTML = html;
}

// --- Commands Table (shell tasks) ---
function renderCommands(tasks) {
  const shellTasks = tasks.filter(t => t.type === 'shell' || (t.commands && t.commands.length > 0));
  if (!shellTasks.length) { document.getElementById('commands').innerHTML = '<div class="empty">Команд пока нет</div>'; return; }
  let html = '<table><tr><th>ID Задачи</th><th>Команды</th><th>Статус</th></tr>';
  for (const t of shellTasks) {
    const cmds = t.commands.map(c => esc(c.command + ' ' + (c.args || []).join(' '))).join('<br>');
    html += '<tr><td><code>' + esc(t.taskId) + '</code></td><td style="font-family:monospace;font-size:12px">' + cmds +
      '</td><td><span class="badge ' + t.status + '">' + t.status + '</span></td></tr>';
  }
  html += '</table>';
  document.getElementById('commands').innerHTML = html;
}

// --- Sub-agents Table ---
function renderSubagents(tasks) {
  const geminiTasks = tasks.filter(t => t.type === 'gemini' || (t.taskId || '').toLowerCase().includes('subagent') || (t.title || '').toLowerCase().includes('subagent'));
  if (!geminiTasks.length) { document.getElementById('subagents').innerHTML = '<div class="empty">Суб-агентов пока нет</div>'; return; }
  let html = '<table><tr><th>ID Задачи</th><th>Инструкции</th><th>Статус</th><th>Действия</th></tr>';
  for (const t of geminiTasks) {
    const instr = esc(t.instructions || '').slice(0, 200);
    html += '<tr><td><code>' + esc(t.taskId) + '</code></td><td>' + instr +
      '</td><td><span class="badge ' + t.status + '">' + t.status + '</span></td><td><button class="btn" onclick="viewLog(\\'' + t.taskId + '\\')">Лог</button></td></tr>';
  }
  html += '</table>';
  document.getElementById('subagents').innerHTML = html;
}

// --- Audit ---
async function loadAudit() {
  try {
    const r = await fetch(API + '/api/audit?limit=100');
    const data = await r.json();
    if (!data.entries || !data.entries.length) {
      document.getElementById('audit').innerHTML = '<div class="empty">Записей аудита нет</div>';
      return;
    }
    let html = '';
    for (const e of data.entries) {
      const cls = e.ok ? '' : ' fail';
      html += '<div class="audit-entry' + cls + '"><span class="ts">' + esc(e.ts || '') + '</span><span class="tool">' + esc(e.tool || '') +
        '</span><span>' + esc(JSON.stringify(e.data || '')) + '</span></div>';
    }
    document.getElementById('audit').innerHTML = html;
  } catch { document.getElementById('audit').innerHTML = '<div class="empty">Не удалось загрузить аудит</div>'; }
}

// --- Actions ---
async function viewLog(taskId) {
  try {
    const r = await fetch(API + '/api/logs/' + taskId);
    const data = await r.json();
    let body = '';
    if (data.task) body += 'Статус: ' + data.task.status + '\\nТип: ' + data.task.type + '\\nСоздано: ' + data.task.createdAt + '\\n\\n';
    if (data.report) body += data.report;
    else body += '(отчет пока не готов)';
    openModal('Задача: ' + taskId, body);
  } catch { notify('Не удалось загрузить лог', 'error'); }
}

async function cancelTask(taskId) {
  if (!confirm('Отменить задачу ' + taskId + '?')) return;
  try {
    const r = await fetch(API + '/api/tasks/' + taskId + '/cancel', { method: 'POST' });
    const data = await r.json();
    if (data.ok) { notify('Задача отменена: ' + taskId); refresh(); }
    else notify(data.error || 'Ошибка отмены', 'error');
  } catch { notify('Ошибка запроса отмены', 'error'); }
}

async function retryTask(taskId) {
  try {
    const r = await fetch(API + '/api/tasks/' + taskId + '/retry', { method: 'POST' });
    const data = await r.json();
    if (data.ok) { notify('Перезапуск как: ' + data.newTaskId); refresh(); }
    else notify(data.error || 'Ошибка перезапуска', 'error');
  } catch { notify('Ошибка запроса перезапуска', 'error'); }
}

async function confirmCleanup() {
  const flags = {
    done: document.getElementById('cleanDone').checked,
    failed: document.getElementById('cleanFailed').checked,
    reports: document.getElementById('cleanReports').checked,
    screenshots: document.getElementById('cleanScreens').checked,
    audit: document.getElementById('cleanAudit').checked
  };

  if (!Object.values(flags).some(v => v)) { notify('Выберите хотя бы один пункт', 'error'); return; }
  if (!confirm('Архивировать выбранные элементы и очистить GitHub?')) return;

  closeCleanupModal();
  notify('Выполняется очистка... Пожалуйста, подождите.', 'success');
  
  try {
    const r = await fetch(API + '/api/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flags)
    });
    const data = await r.json();
    if (data.ok) { notify(data.message); refresh(); loadHealthSummary(); }
    else notify(data.error || 'Ошибка очистки', 'error');
  } catch { notify('Запрос на очистку не удался', 'error'); }
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// --- Data loading ---
async function refresh() {
  try {
    const r = await fetch(API + '/api/activity');
    const data = await r.json();
    if (data.ok) {
      allTasks = data.tasks;
      renderStats(data.summary);
      renderActivity(data.tasks);
      renderCommands(data.tasks);
      renderSubagents(data.tasks);
    }
  } catch { /* retry next cycle */ }
}

// --- WebSocket ---
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws');
  const statusEl = document.getElementById('wsStatus');

  ws.onopen = () => { statusEl.textContent = 'в эфире'; statusEl.className = 'ws-status connected'; };
  ws.onclose = () => { statusEl.textContent = 'отключено'; statusEl.className = 'ws-status disconnected'; setTimeout(connectWs, 3000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'update') {
        allTasks = msg.data.tasks;
        renderStats(msg.data.summary);
        renderActivity(msg.data.tasks);
        renderCommands(msg.data.tasks);
        renderSubagents(msg.data.tasks);
        loadHealthSummary();
      } else if (msg.type === 'live_feed_update') {
        liveFeedItems.unshift(msg.entry);
        if (liveFeedItems.length > MAX_LIVE_DISPLAY) liveFeedItems.pop();
        renderLiveFeed();
      } else if (msg.type === 'system_notification') {
        notify(msg.message, msg.level);
      } else if (msg.type === 'cancelled') {
        notify('Задача отменена: ' + msg.taskId);
      } else if (msg.type === 'retried') {
        notify('Задача перезапущена: ' + msg.originalTaskId + ' → ' + msg.newTaskId);
      } else if (msg.type === 'cleanup') {
        if (msg.count > 0) notify('Очистка завершена: ' + msg.count + ' эл.');
      }
    } catch {}
  };
}

async function loadLiveFeed() {
  try {
    const r = await fetch(API + '/api/live-feed');
    const data = await r.json();
    if (data.ok) {
      liveFeedItems.length = 0;
      liveFeedItems.push(...data.feed);
      renderLiveFeed();
    }
  } catch {}
}

// --- Init ---
refresh();
loadHealthSummary();
loadAudit();
loadLiveFeed();
connectWs();
// Fallback polling if WS fails
setInterval(refresh, 15000);
setInterval(loadHealthSummary, 15000);
setInterval(loadAudit, 30000);
</script>
</body>
</html>`;
