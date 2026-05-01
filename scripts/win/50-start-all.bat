@echo off
chcp 65001 >nul
setlocal EnableExtensions

cd /d "C:\Users\user\Documents\trash\Program\2026-05\01.05\mcp-gpt-auto"

echo ============================================================
echo   mcp-gpt-auto   Full Startup
echo ============================================================
echo.

REM --- Token ---
if "%ACTION_BRIDGE_TOKEN%"=="" (
  echo ERROR: ACTION_BRIDGE_TOKEN is not set.
  echo.
  echo In CMD:
  echo   set ACTION_BRIDGE_TOKEN=your-secret-token
  echo   scripts\win\50-start-all.bat
  echo.
  echo In PowerShell:
  echo   $env:ACTION_BRIDGE_TOKEN="your-secret-token"
  echo   .\scripts\win\50-start-all.bat
  echo.
  pause
  exit /b 1
)

REM --- 1. Kill old processes ---
echo [1/5] Stopping old node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo       Done.
echo.

REM --- 2. Git pull ---
echo [2/5] Updating from GitHub...
git pull origin main
if errorlevel 1 (
  echo ERROR: git pull failed.
  pause
  exit /b 1
)
echo.

REM --- 3. Install + Build ---
echo [3/5] Installing dependencies and building...
call npm install --silent
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  echo ERROR: build failed.
  pause
  exit /b 1
)
echo.

REM --- 4. Start Runner Loop (background window) ---
echo [4/5] Starting Task Runner Loop...
start "MCP Runner Loop" cmd /k "cd /d "C:\Users\user\Documents\trash\Program\2026-05\01.05\mcp-gpt-auto" && set CONFIRM_PUSH=YES && node dist\runner\github-task-runner.js --loop"
echo       Runner started in separate window.
echo.

REM --- 5. Start Action Bridge ---
echo [5/5] Starting Action Bridge on port 8787...
echo.
echo ============================================================
echo   Runner:   running in separate window
echo   Bridge:   http://127.0.0.1:8787
echo   Health:   http://127.0.0.1:8787/health
echo   OpenAPI:  http://127.0.0.1:8787/openapi.json
echo ============================================================
echo.
echo   Next step: open ANOTHER terminal and run:
echo     ngrok http 8787
echo.
echo   Then in ChatGPT Actions import:
echo     https://your-ngrok-url/openapi.json
echo ============================================================
echo.

node dist\action-bridge\server.js
