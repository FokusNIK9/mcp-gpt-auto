# Test Report: PR #8 + PR #9 — Auto-OpenAPI, Cross-Platform, Bug Fixes

**Tested**: Action Bridge with auto-generated OpenAPI endpoints from MCP tools  
**Method**: Local server on port 8788, curl-based API testing + HTML verification  
**Session**: https://app.devin.ai/sessions/0ef0c5795ee1448bb09f2b3cd9ac7baa

---

## Bugs Found & Fixed During Testing

Two critical bugs were discovered and fixed in PR #9:

1. **Zod internals leaking into OpenAPI schema** — Tools with `{}` inputSchema (git.status, gateway.health, etc.) had garbage Zod internal properties (`parse`, `safeParse`, `~standard`) in their generated schemas instead of empty schemas.

2. **`tool.callback is not a function`** — ALL `/tools/*` REST endpoints failed because MCP SDK stores callbacks as `handler`, not `callback`. No tool invocations worked before this fix.

---

## Test Results Summary

| # | Test | Result |
|---|------|--------|
| 1 | Auto-OpenAPI Schema Completeness (24 tools, correct schemas) | PASSED |
| 2 | Direct MCP Tool Invocation — fs.list returns directory listing | PASSED |
| 3 | Auth Enforcement — rejects no-token and wrong-token with 401 | PASSED |
| 4 | Error Handling — nonexistent file returns ok:false + ENOENT | PASSED |
| 5 | Git Tool via REST — git.status returns git output | PASSED |
| 6 | Dashboard UI — /ui returns 19KB HTML with task/queue sections | PASSED |
| 7 | Health + OpenAPI Public Access — no auth needed | PASSED |
| 8 | Cross-Platform Desktop Screenshot — no PowerShell error on Linux | PASSED |

---

## Detailed Evidence

### Test 1: Auto-OpenAPI Schema Completeness

All 24 MCP tools auto-generated as REST endpoints in `/openapi.json`:

```
OpenAPI version: 3.1.0
Total paths: 39 (24 auto-generated + 15 manual)

Auto-generated tool endpoints:
  /tools/desktop/active_window  (hasBody=False)  ← PR #9 fix
  /tools/desktop/screenshot     (hasBody=True)
  /tools/desktop/window_list    (hasBody=False)  ← PR #9 fix
  /tools/fs/list                (hasBody=True)
  /tools/fs/patch               (hasBody=True)
  /tools/fs/read                (hasBody=True)
  /tools/fs/tree                (hasBody=True)
  /tools/fs/write               (hasBody=True)
  /tools/gateway/health         (hasBody=False)  ← PR #9 fix
  /tools/git/branch             (hasBody=False)  ← PR #9 fix
  /tools/git/checkout           (hasBody=True)
  /tools/git/commit             (hasBody=True)
  /tools/git/diff               (hasBody=True)
  /tools/git/log                (hasBody=True)
  /tools/git/pull               (hasBody=True)
  /tools/git/push               (hasBody=True)
  /tools/git/restore            (hasBody=True)
  /tools/git/status             (hasBody=False)  ← PR #9 fix
  /tools/review/bundle          (hasBody=True)
  /tools/review/run             (hasBody=True)
  /tools/shell/run              (hasBody=True)
  /tools/subagent/gemini/run    (hasBody=True)
  /tools/task/create            (hasBody=True)
  /tools/task/done              (hasBody=True)
```

Schema assertions:
- `fs.read`: operationId=`tool_fs_read`, required=`["path"]`, path.type=`"string"` — PASS
- `shell.run`: `command` in required, `args` has default=`[]` — PASS
- `git.status`: No `requestBody` (empty input tool) — PASS (PR #9 fix)
- `gateway.health`: No `requestBody` — PASS (PR #9 fix)

### Test 2: Direct MCP Tool Invocation (fs.list)

```json
POST /tools/fs/list  {"path": "."}
Response: {
  "content": [{"type": "text", "text": "{\"ok\":true, \"entries\":[
    {\"name\":\"package.json\",\"isDirectory\":false},
    {\"name\":\"src\",\"isDirectory\":true},
    {\"name\":\"README.md\",\"isDirectory\":false},
    ... (27 entries total)
  ]}"}]
}
```
- Has `content` array: PASS
- `type=="text"`: PASS
- `ok==true`: PASS
- `package.json` in entries: PASS
- `src` in entries: PASS
- `README.md` in entries: PASS
- Entries have `isDirectory`: PASS

### Test 3: Auth Enforcement

```
No token:    HTTP 401, {"ok":false,"error":"Unauthorized"} — PASS
Wrong token: HTTP 401, {"ok":false,"error":"Unauthorized"} — PASS
```

### Test 4: Error Handling (nonexistent file)

```
POST /tools/fs/read  {"path": "nonexistent-file-abc123.txt"}
HTTP 500, ok=false, error="ENOENT: no such file or directory" — PASS
```

### Test 5: Git Tool via REST

```
POST /tools/git/status  {}
Response: ok=true, stdout=" M src/action-bridge/auto-openapi.ts\n"
```
- Returns valid git status output: PASS

### Test 6: Dashboard UI (/ui)

```
GET /ui -> HTTP 200
HTML size: 19,534 bytes
Contains <!DOCTYPE html>: PASS
Has dashboard branding: PASS (5 matches)
Has task references: PASS (45 matches)
Has WebSocket /ws references: PASS (2 matches)
Has queue status sections (inbox/running/done/failed): PASS (22 matches)
```

Note: Browser GUI testing was not possible (CDP proxy unavailable), so dashboard was verified via HTML content analysis.

### Test 7: Health + OpenAPI Public Access

```
GET /health (no token) -> {"ok":true,"service":"mcp-gpt-auto-action-bridge"} — PASS
GET /openapi.json (no token) -> HTTP 200, version 3.1.0 — PASS
```

### Test 8: Cross-Platform Desktop Screenshot (Linux)

```
POST /tools/desktop/screenshot  {"publish": false}
- No "powershell" in response: PASS
- Valid JSON with content array: PASS
- Screenshot succeeded on Linux: PASS
```

---

## Limitations

- **Browser GUI test**: Could not visually render the dashboard in a browser (CDP proxy unavailable). Verified HTML content via curl instead.
- **macOS testing**: Cross-platform desktop tools could not be tested on macOS (only Linux available). macOS paths use `screencapture` and `osascript` which need to be verified on actual macOS hardware.
- **ngrok/tunnel testing**: `launcher.sh` ngrok detection not tested (no ngrok available).
