# GPT Action Bridge

The GPT Action Bridge allows a Custom GPT to interact with your local `mcp-gpt-auto` runner via an HTTPS tunnel.

## Architecture

```text
Custom GPT Action
  -> HTTPS tunnel (e.g., ngrok)
  -> Local Action Bridge (Port 8787)
  -> .agent-queue/inbox/*.json
  -> github-task-runner (Local Runner Loop)
  -> .agent-queue/done / failed / reports
  -> GPT reads result via Bridge
```

## Setup Instructions

### 1. Start Local Runner Loop
In one terminal, start the task runner to process the queue:
```powershell
$env:CONFIRM_PUSH="YES"
.\scripts\win\21-run-task-runner-loop.bat
```

### 2. Start Action Bridge
In another terminal, set a secret token and start the bridge:
```powershell
$env:ACTION_BRIDGE_TOKEN="your-secret-token-here"
.\scripts\win\40-start-action-bridge.bat
```

### 3. Expose the Bridge
Use a tool like `ngrok` or `localtunnel` to expose port 8787 to the internet:
```bash
ngrok http 8787
```

Copy the public HTTPS URL from ngrok, then restart the bridge with it:
```powershell
$env:ACTION_BRIDGE_PUBLIC_URL="https://your-ngrok-host.ngrok-free.app"
.\scripts\win\40-start-action-bridge.bat
```

### 4. Configure OpenAPI Schema
Import this URL in the GPT Builder Action schema:
```text
https://your-ngrok-host.ngrok-free.app/openapi.json
```

### 5. Create GPT Action
1. In the GPT Builder, go to **Configure** -> **Actions** -> **Create new action**.
2. **Authentication**:
   - Type: `API Key`
   - Auth Type: `Custom`
   - Header Name: `X-Agent-Token`
   - Value: (The token you set in step 2)
3. **Schema**: Import the public `/openapi.json` URL.

## Safety
- Public without auth: `GET /health`, `GET /openapi.json`.
- Requires `X-Agent-Token`: `POST /tasks`, `GET /tasks/{taskId}`, `GET /tasks/{taskId}/report`, `GET /reports`.
- The bridge does **not** execute arbitrary shell commands directly.
- It only places tasks into the `.agent-queue/inbox`.
- The `github-task-runner` performs the actual execution based on an allowlist of commands.
- All secrets are redacted in reports and logs.
