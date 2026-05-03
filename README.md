# mcp-gpt-auto

**Turn your regular ChatGPT Plus into a local dev agent** — no API keys, no Developer Mode, no cloud VMs. Your code stays on your machine, ChatGPT stays in your browser.

## What is this?

mcp-gpt-auto is an open-source orchestrator that connects a standard ChatGPT Plus subscription (via Custom GPT Actions) to your local development machine. It combines:

1. **MCP Gateway** — a full set of tools (filesystem, shell, git, desktop, review, subagents) following the [Model Context Protocol](https://modelcontextprotocol.io/) standard.
2. **Action Bridge** — an HTTP/REST layer with auto-generated OpenAPI schema, so ChatGPT Custom GPT Actions can call your local tools directly.
3. **Async Task Runner** — a GitHub-based queue for long-running tasks that survive ChatGPT's 30-second timeout.

### How it differs from alternatives

| Feature | mcp-gpt-auto | Serena+mcpo | CoDeveloper GPT | ChatGPT Agent |
|---|---|---|---|---|
| Works with regular ChatGPT Plus | Yes | Yes | Yes | Cloud-only |
| Async tasks (no 30s timeout) | Yes (GitHub queue) | No | No | N/A |
| Runs on your machine | Yes | Yes | Yes | No (OpenAI VMs) |
| No API keys needed | Yes | Yes | Yes | N/A |
| Cross-platform | Windows, Linux, macOS | Linux/macOS | Java (all) | N/A |
| MCP-native tools | Yes | Yes (via Serena) | No | No |
| Auto-generated OpenAPI | Yes | Yes (via mcpo) | Partial | N/A |
| GitHub as task transport | Yes | No | No | No |

**Unique value**: GitHub-as-queue-transport allows tasks to survive any timeout, provides full audit trail in git, and works even when the HTTPS tunnel drops.

## Quick Start

### Prerequisites
- Node.js 18+
- Git
- An HTTPS tunnel tool: [ngrok](https://ngrok.com/), [cloudflared](https://github.com/cloudflare/cloudflared), or similar
- ChatGPT Plus subscription

### Setup

```bash
git clone https://github.com/FokusNIK9/mcp-gpt-auto.git
cd mcp-gpt-auto
npm install
npm run build
```

### Configuration

Create a `.env` file in the project root:

```env
ACTION_BRIDGE_TOKEN=your-secret-token-here
CONFIRM_PUSH=YES
PORT=8787
HOST=127.0.0.1

# Optional — GitHub integration
# GITHUB_TOKEN=ghp_...          (for task runner git push & issue sync)
# GITHUB_REMOTE_URL=https://github.com/owner/repo.git
# GITHUB_ISSUES_SYNC=true       (auto-create tasks from GitHub Issues with "agent-task" label)

# Optional — Tunnel
# AUTO_TUNNEL=true               (auto-start cloudflared/ngrok on startup)
# TUNNEL_PROVIDER=cloudflared    (or "ngrok" or "auto")
# ACTION_BRIDGE_PUBLIC_URL=https://your-tunnel.ngrok-free.app

# Optional — OAuth2 (for production deployments)
# OAUTH_ENABLED=true
# OAUTH_CLIENT_ID=your-client-id
# OAUTH_CLIENT_SECRET=your-client-secret
# OAUTH_TOKEN_EXPIRY_SECONDS=3600

# Optional — Runner
# RUNNER_ID=my-runner-1          (unique ID for multi-runner setups)
# RUNNER_INTERVAL_SECONDS=30
```

### Run

**Linux / macOS:**
```bash
chmod +x launcher.sh
./launcher.sh
```

**Windows (PowerShell):**
```powershell
.\Launcher.ps1
```

**Manual start (any platform):**
```bash
# Terminal 1: Start task runner
CONFIRM_PUSH=YES node dist/runner/github-task-runner.js --loop

# Terminal 2: Start action bridge
node dist/action-bridge/server.js
```

### Expose to the internet

**Automatic (recommended):**
```bash
# Set AUTO_TUNNEL=true in .env and the bridge will start cloudflared/ngrok automatically
AUTO_TUNNEL=true node dist/action-bridge/server.js
```

**Manual:**
```bash
# Using cloudflared (recommended — free, no limits):
cloudflared tunnel --url http://localhost:8787

# Using ngrok:
ngrok http 8787
```

Copy the HTTPS URL and set it:
```bash
export ACTION_BRIDGE_PUBLIC_URL=https://your-tunnel-url.trycloudflare.com
```

### Connect to ChatGPT

1. Go to [ChatGPT GPT Builder](https://chatgpt.com/gpts/editor)
2. **Configure** -> **Actions** -> **Create new action**
3. **Authentication**: API Key, Custom Header `X-Agent-Token`, value = your `ACTION_BRIDGE_TOKEN`
4. **Schema**: Import from `https://your-tunnel-url/openapi.json`
5. Done! Chat with your GPT and it will control your local machine.

## Architecture

```
ChatGPT Plus (browser chat)
  |
  | HTTPS (ngrok / cloudflared)
  v
Action Bridge (localhost:8787)
  |
  |-- /tools/*     Direct MCP tool invocation (auto-generated REST endpoints)
  |-- /workspace/* File operations, script execution
  |-- /tasks       Async task queue (for long-running ops)
  |-- /dashboard   JSON dashboard
  |-- /ui          Web monitoring dashboard
  |-- /mcp         SSE MCP transport (for MCP-native clients)
  |-- /openapi.json Auto-generated OpenAPI schema
  |
  v
MCP Tool Federation:
  - filesystem (read, write, patch, list, tree)
  - shell (run allowed commands)
  - git (status, diff, commit, push, pull, log, branch)
  - desktop (screenshot, active window, window list)
  - tasks (create, done)
  - subagents (gemini CLI)
  - review (bundle, automated review)
  - gateway (health check)
```

## New Features (v0.2)

### Task Dependencies
Tasks can declare dependencies on other tasks. A task won't execute until all its dependencies are satisfied:
```json
{
  "taskId": "deploy-app",
  "dependsOn": [
    { "taskId": "run-tests", "requiredStatus": "done" },
    { "taskId": "build-app", "requiredStatus": "done" }
  ]
}
```

### Auto-Retry with Exponential Backoff
Failed tasks automatically retry with configurable backoff:
```json
{
  "taskId": "flaky-build",
  "retry": {
    "maxAttempts": 3,
    "initialDelayMs": 5000,
    "backoffMultiplier": 2,
    "maxDelayMs": 300000
  }
}
```

### Real-Time Task Streaming (SSE)
Subscribe to live progress events instead of polling:
```bash
# Stream progress of a specific task:
curl -N http://localhost:8787/tasks/my-task-id/stream

# Stream ALL task events:
curl -N http://localhost:8787/tasks/stream
```

Events: `started`, `progress`, `command_output`, `completed`, `failed`, `retrying`

### Multi-Runner Support
Run multiple runners in parallel with file-based locking:
```bash
RUNNER_ID=runner-1 node dist/runner/github-task-runner.js --loop &
RUNNER_ID=runner-2 node dist/runner/github-task-runner.js --loop &
```
Stale locks (>10 min) are automatically reclaimed.

### GitHub Issues Integration
Create issues with the `agent-task` label → they auto-become tasks:
```bash
GITHUB_ISSUES_SYNC=true GITHUB_TOKEN=ghp_... node dist/runner/github-task-runner.js --loop
```
Results are posted back as issue comments.

### Task Search & Statistics
```bash
# Search tasks
curl "http://localhost:8787/tasks/search?status=failed&type=shell&query=build"

# Get aggregate stats
curl "http://localhost:8787/tasks/stats"
```

### OAuth2 Support
Production-ready OAuth2 alongside existing API key auth:
```bash
# Get a token
curl -X POST http://localhost:8787/oauth/token \
  -d "grant_type=client_credentials&client_id=xxx&client_secret=yyy"

# Use the token
curl -H "Authorization: Bearer oat_..." http://localhost:8787/tools/fs/list
```

### Auto-Tunnel (Cloudflare/ngrok)
Set `AUTO_TUNNEL=true` to automatically start a tunnel on server startup. Prefers cloudflared (free, unlimited) over ngrok.

---

## Available Tools

### MCP Tools (via Stdio or SSE)
- `gateway.health` — Health check
- `fs.read`, `fs.write`, `fs.patch`, `fs.list`, `fs.tree` — File operations
- `shell.run` — Run allowed commands (git, node, npm, python, bash, etc.)
- `git.status`, `git.diff`, `git.commit`, `git.push`, `git.pull`, `git.log`, `git.branch`, `git.checkout`, `git.restore` — Git operations
- `desktop.screenshot`, `desktop.active_window`, `desktop.window_list` — Desktop interaction (cross-platform)
- `task.create`, `task.done` — Task management
- `subagent.gemini.run` — Run Gemini CLI as sub-agent
- `review.bundle`, `review.run` — Code review automation

## New Features (v0.3)

### MCP Proxy — Connect Any External MCP Server

Add any MCP server from the community (1000+ available) and it auto-appears as REST endpoints for ChatGPT:

1. Create `mcp-servers.json` in project root (see `mcp-servers.json.example`):
```json
{
  "servers": [
    { "name": "github", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "..."} },
    { "name": "sqlite", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./data.db"] }
  ]
}
```

2. Restart the server. External tools appear at `/ext/{serverName}/{toolName}` and in OpenAPI schema automatically.

3. Check status: `GET /ext/status`

### Task Creation from Dashboard

Open `http://localhost:8787/ui` → click "+ New Task" tab → fill in the form → submit. Tasks go directly into the queue without needing ChatGPT or curl.

### Telegram & Discord Notifications

Get notified when tasks complete or fail:

```bash
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=987654321

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Generic webhook (any URL)
WEBHOOK_URL=https://your-service.com/webhook
```

All notification channels fire simultaneously. Set any combination — unused ones are silently skipped.

### REST Endpoints (via Action Bridge)
All MCP tools are automatically exposed as REST endpoints at `/tools/<tool.name>` with proper OpenAPI schemas.

Additionally:
- `POST /tasks` — Queue async task
- `GET /tasks/:id` — Check task status
- `GET /tasks/:id/report` — Read task report
- `GET /tasks/:id/stream` — SSE stream of task progress
- `GET /tasks/stream` — SSE firehose of all task events
- `GET /tasks/search` — Search & filter task history
- `GET /tasks/stats` — Aggregate task statistics
- `GET /reports` — List recent reports
- `GET /dashboard` — Dashboard JSON
- `GET /ext/status` — MCP Proxy status (external servers)
- `POST /ext/{server}/{tool}` — Call external MCP tool
- `POST /oauth/token` — OAuth2 token endpoint (if enabled)
- `POST /oauth/revoke` — Revoke OAuth token
- Workspace API: `/workspace/write`, `/workspace/read`, `/workspace/patch`, `/workspace/list`, `/workspace/tree`, `/workspace/search`, `/workspace/run`, `/workspace/exec`

## GitHub Task Runner

For long-running tasks that exceed ChatGPT's 30-second timeout:

1. ChatGPT queues a task via `POST /tasks`
2. Local runner polls (every 30s), picks up tasks from `.agent-queue/inbox/`
3. Checks dependencies (blocks until all prerequisite tasks complete)
4. Acquires lock (supports multi-runner parallel execution)
5. Executes the task (shell commands, Gemini sub-agent, build, etc.)
6. On failure: auto-retries with exponential backoff (if retry policy configured)
7. Pushes results back to GitHub as JSON + Markdown report
8. Reports back to GitHub Issue (if task originated from an issue)
9. ChatGPT reads the result via `GET /tasks/:id/report` or subscribes to `/tasks/:id/stream`

Task types: `shell`, `gemini`, `review`, `mcp-smoke`
Task priorities: `critical` > `high` > `normal` > `low`

## MCP Client Config

For Claude Desktop, Cursor, or other MCP clients:

```json
{
  "mcpServers": {
    "mcp-gpt-auto": {
      "command": "node",
      "args": ["<path-to-repo>/dist/index.js"],
      "env": {
        "MCP_GPT_AUTO_WORKSPACE": "<path-to-repo>"
      }
    }
  }
}
```

## Security

- **Secret Redaction**: All outputs (logs, reports, console) are filtered for GitHub tokens, API keys, passwords, and private keys.
- **Workspace Isolation**: File operations are restricted to the project root.
- **Blocked Paths**: `.env`, `.ssh`, `AppData`, `id_rsa`, `id_ed25519` are blocked from reading.
- **Command Allowlist**: Only approved commands can be executed: `git`, `node`, `npm`, `python`, `bash`, etc.
- **Auth**: Multiple auth modes supported:
  - **API Key**: `X-Agent-Token` header (simple, default)
  - **OAuth2**: Client credentials flow with scoped tokens (production-ready)
  - **Bearer Token**: Standard `Authorization: Bearer ...` header
- **Local-only endpoints**: Dashboard/UI is localhost-only.
- **Multi-runner locking**: File-based locks prevent race conditions.

See [`docs/security-redaction.md`](docs/security-redaction.md) for details.

## Documentation

- [`docs/agentic-mcp-plan.md`](docs/agentic-mcp-plan.md) — Full agentic mode plan
- [`docs/security-redaction.md`](docs/security-redaction.md) — Secret filtering
- [`docs/github-task-runner.md`](docs/github-task-runner.md) — Task runner docs
- [`docs/subagent-contract.md`](docs/subagent-contract.md) — Sub-agent protocol
- [`docs/gpt-action-bridge.md`](docs/gpt-action-bridge.md) — Action Bridge setup
- [`docs/scripts-guide.md`](docs/scripts-guide.md) — Scripts reference

## License

MIT
