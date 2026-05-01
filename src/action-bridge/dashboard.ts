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
import { root, agent } from "../gateway/config.js";
import { redactText } from "../gateway/redact.js";

const queueDir = path.join(root, ".agent-queue");
const inboxDir = path.join(queueDir, "inbox");
const runningDir = path.join(queueDir, "running");
const doneDir = path.join(queueDir, "done");
const failedDir = path.join(queueDir, "failed");
const reportsDir = path.join(queueDir, "reports");
const auditLog = path.join(agent, "logs", "audit.jsonl");

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

async function parseTaskFile(dir: string, file: string, status: string) {
  try {
    const filePath = path.join(dir, file);
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const stats = await fs.stat(filePath);
    const ageMs = Date.now() - stats.mtime.getTime();
    return {
      taskId: data.taskId || path.basename(file, ".json"),
      title: data.title || "",
      type: data.type || "unknown",
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

// --- Routes ---

export function registerDashboardRoutes(app: express.Application) {
  // UI page (no auth — local only)
  app.get("/ui", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(DASHBOARD_HTML);
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
      const raw = await fs.readFile(auditLog, "utf8");
      const lines = raw.trim().split("\n").filter(l => l.length > 0);
      const entries = lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean)
        .reverse()
        .slice(0, limit);
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
<title>mcp-gpt-auto — Dashboard</title>
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

  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
  .tab { padding: 8px 16px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; font-size: 14px; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

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
    <h1>mcp-gpt-auto Dashboard</h1>
    <span id="wsStatus" class="ws-status disconnected">disconnected</span>
  </header>

  <div class="stats" id="stats"></div>

  <div class="tabs">
    <div class="tab active" data-panel="activity">Activity</div>
    <div class="tab" data-panel="commands">Commands</div>
    <div class="tab" data-panel="subagents">Sub-agents</div>
    <div class="tab" data-panel="audit">Audit Log</div>
  </div>

  <div id="activity" class="panel active"></div>
  <div id="commands" class="panel"></div>
  <div id="subagents" class="panel"></div>
  <div id="audit" class="panel"></div>
</div>

<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <span class="close" id="modalClose">&times;</span>
    <h2 id="modalTitle"></h2>
    <pre id="modalBody"></pre>
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
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalOverlay'))
    document.getElementById('modalOverlay').classList.remove('open');
});

// --- Notifications ---
function notify(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'notification ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// --- Stats ---
function renderStats(summary) {
  document.getElementById('stats').innerHTML =
    '<div class="stat-card"><div class="num">' + summary.total + '</div><div class="label">Total</div></div>' +
    '<div class="stat-card inbox"><div class="num">' + summary.inbox + '</div><div class="label">In Queue</div></div>' +
    '<div class="stat-card running"><div class="num">' + summary.running + '</div><div class="label">Running</div></div>' +
    '<div class="stat-card done"><div class="num">' + summary.done + '</div><div class="label">Done</div></div>' +
    '<div class="stat-card failed"><div class="num">' + summary.failed + '</div><div class="label">Failed</div></div>' +
    '<div class="stat-card"><div class="num">' + summary.stale + '</div><div class="label">Stale (3d+)</div></div>';
}

// --- Activity Table ---
function renderActivity(tasks) {
  if (!tasks.length) { document.getElementById('activity').innerHTML = '<div class="empty">No tasks yet</div>'; return; }
  let html = '<table><tr><th>Task ID</th><th>Title</th><th>Type</th><th>Status</th><th>Age</th><th>Actions</th></tr>';
  for (const t of tasks) {
    const stale = t.isStale ? ' <span class="badge stale">stale</span>' : '';
    let actions = '<button class="btn" onclick="viewLog(\\'' + t.taskId + '\\')">Log</button> ';
    if (t.status === 'inbox' || t.status === 'running')
      actions += '<button class="btn cancel" onclick="cancelTask(\\'' + t.taskId + '\\')">Cancel</button>';
    if (t.status === 'failed' || t.status === 'done')
      actions += '<button class="btn retry" onclick="retryTask(\\'' + t.taskId + '\\')">Retry</button>';
    html += '<tr><td><code>' + esc(t.taskId) + '</code></td><td>' + esc(t.title) +
      '</td><td><span class="type-badge">' + esc(t.type) + '</span></td><td><span class="badge ' + t.status + '">' + t.status + '</span>' + stale +
      '</td><td>' + t.ageDays + 'd</td><td>' + actions + '</td></tr>';
  }
  html += '</table>';
  document.getElementById('activity').innerHTML = html;
}

// --- Commands Table (shell tasks) ---
function renderCommands(tasks) {
  const shellTasks = tasks.filter(t => t.type === 'shell' && t.commands && t.commands.length > 0);
  if (!shellTasks.length) { document.getElementById('commands').innerHTML = '<div class="empty">No shell commands yet</div>'; return; }
  let html = '<table><tr><th>Task ID</th><th>Commands</th><th>Status</th></tr>';
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
  const geminiTasks = tasks.filter(t => t.type === 'gemini');
  if (!geminiTasks.length) { document.getElementById('subagents').innerHTML = '<div class="empty">No sub-agent tasks yet</div>'; return; }
  let html = '<table><tr><th>Task ID</th><th>Instructions</th><th>Status</th><th>Actions</th></tr>';
  for (const t of geminiTasks) {
    const instr = esc(t.instructions || '').slice(0, 200);
    html += '<tr><td><code>' + esc(t.taskId) + '</code></td><td>' + instr +
      '</td><td><span class="badge ' + t.status + '">' + t.status + '</span></td><td><button class="btn" onclick="viewLog(\\'' + t.taskId + '\\')">Log</button></td></tr>';
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
      document.getElementById('audit').innerHTML = '<div class="empty">No audit entries</div>';
      return;
    }
    let html = '';
    for (const e of data.entries) {
      const cls = e.ok ? '' : ' fail';
      html += '<div class="audit-entry' + cls + '"><span class="ts">' + esc(e.ts || '') + '</span><span class="tool">' + esc(e.tool || '') +
        '</span><span>' + esc(JSON.stringify(e.data || '')) + '</span></div>';
    }
    document.getElementById('audit').innerHTML = html;
  } catch { document.getElementById('audit').innerHTML = '<div class="empty">Failed to load audit</div>'; }
}

// --- Actions ---
async function viewLog(taskId) {
  try {
    const r = await fetch(API + '/api/logs/' + taskId);
    const data = await r.json();
    let body = '';
    if (data.task) body += 'Status: ' + data.task.status + '\\nType: ' + data.task.type + '\\nCreated: ' + data.task.createdAt + '\\n\\n';
    if (data.report) body += data.report;
    else body += '(no report yet)';
    openModal('Task: ' + taskId, body);
  } catch { notify('Failed to load log', 'error'); }
}

async function cancelTask(taskId) {
  if (!confirm('Cancel task ' + taskId + '?')) return;
  try {
    const r = await fetch(API + '/api/tasks/' + taskId + '/cancel', { method: 'POST' });
    const data = await r.json();
    if (data.ok) { notify('Cancelled: ' + taskId); refresh(); }
    else notify(data.error || 'Cancel failed', 'error');
  } catch { notify('Cancel failed', 'error'); }
}

async function retryTask(taskId) {
  try {
    const r = await fetch(API + '/api/tasks/' + taskId + '/retry', { method: 'POST' });
    const data = await r.json();
    if (data.ok) { notify('Retried as: ' + data.newTaskId); refresh(); }
    else notify(data.error || 'Retry failed', 'error');
  } catch { notify('Retry failed', 'error'); }
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

  ws.onopen = () => { statusEl.textContent = 'live'; statusEl.className = 'ws-status connected'; };
  ws.onclose = () => { statusEl.textContent = 'disconnected'; statusEl.className = 'ws-status disconnected'; setTimeout(connectWs, 3000); };
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
      } else if (msg.type === 'cancelled') {
        notify('Task cancelled: ' + msg.taskId);
      } else if (msg.type === 'retried') {
        notify('Task retried: ' + msg.originalTaskId + ' → ' + msg.newTaskId);
      }
    } catch {}
  };
}

// --- Init ---
refresh();
loadAudit();
connectWs();
// Fallback polling if WS fails
setInterval(refresh, 15000);
setInterval(loadAudit, 30000);
</script>
</body>
</html>`;
