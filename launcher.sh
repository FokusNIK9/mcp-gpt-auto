#!/usr/bin/env bash
# ============================================================
# mcp-gpt-auto Launcher (Linux / macOS)
# ============================================================
# Cross-platform equivalent of Launcher.ps1.
# Starts the Action Bridge + Task Runner in one terminal.
#
# Usage:
#   chmod +x launcher.sh
#   ./launcher.sh
#
# Environment variables (override via .env or export):
#   PORT                    - Bridge port (default: 8787)
#   HOST                    - Bind address (default: 127.0.0.1)
#   ACTION_BRIDGE_TOKEN     - Required API key for bridge auth
#   ACTION_BRIDGE_PUBLIC_URL- Public URL (ngrok/cloudflared)
#   CONFIRM_PUSH            - Set to YES to allow git push
#   GITHUB_TOKEN            - For authenticated git operations
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"

# Load .env if it exists
if [ -f ".env" ]; then
  echo "[Launcher] Loading .env ..."
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Check for token
if [ -z "${ACTION_BRIDGE_TOKEN:-}" ]; then
  echo "[Launcher] WARNING: ACTION_BRIDGE_TOKEN is not set."
  echo "  Set it in .env or export ACTION_BRIDGE_TOKEN=<your-token>"
  echo "  Continuing anyway (auth will fail on protected endpoints)..."
fi

# Check if port is free
if command -v ss &>/dev/null; then
  if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    echo "[Launcher] ERROR: Port $PORT is already in use."
    echo "  Run: lsof -i :$PORT  to see what's using it."
    exit 1
  fi
elif command -v lsof &>/dev/null; then
  if lsof -i :"$PORT" -sTCP:LISTEN &>/dev/null; then
    echo "[Launcher] ERROR: Port $PORT is already in use."
    echo "  Run: lsof -i :$PORT  to see what's using it."
    exit 1
  fi
fi

# Try to detect ngrok/cloudflared public URL
if [ -z "${ACTION_BRIDGE_PUBLIC_URL:-}" ]; then
  NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | sed -n 's/.*"public_url"\s*:\s*"\(https:\/\/[^"]*\)".*/\1/p' | head -1 || true)
  if [ -n "$NGROK_URL" ]; then
    export ACTION_BRIDGE_PUBLIC_URL="$NGROK_URL"
    echo "[Launcher] Detected ngrok URL: $NGROK_URL"
  fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "[Launcher] Installing dependencies..."
  npm install
fi

# Build if dist/ doesn't exist
if [ ! -d "dist" ]; then
  echo "[Launcher] Building project..."
  npm run build
fi

# Start task runner in background
echo "[Launcher] Starting task runner in background..."
node dist/runner/github-task-runner.js --loop &
RUNNER_PID=$!
echo "[Launcher] Task runner PID: $RUNNER_PID"

# Trap to clean up runner on exit
cleanup() {
  echo ""
  echo "[Launcher] Shutting down..."
  kill "$RUNNER_PID" 2>/dev/null || true
  wait "$RUNNER_PID" 2>/dev/null || true
  echo "[Launcher] Done."
}
trap cleanup EXIT INT TERM

# Start Action Bridge in foreground
echo ""
echo "=========================================="
echo " mcp-gpt-auto Action Bridge"
echo "=========================================="
echo " Dashboard:  http://$HOST:$PORT/ui"
echo " OpenAPI:    http://$HOST:$PORT/openapi.json"
echo " MCP SSE:    http://$HOST:$PORT/mcp"
echo " WebSocket:  ws://$HOST:$PORT/ws"
if [ -n "${ACTION_BRIDGE_PUBLIC_URL:-}" ]; then
  echo " Public URL: $ACTION_BRIDGE_PUBLIC_URL"
fi
echo "=========================================="
echo ""

exec node dist/action-bridge/server.js
