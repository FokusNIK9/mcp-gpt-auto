@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

echo [mcp-gpt-auto] Start all
echo Workspace: %CD%
echo.

if "%ACTION_BRIDGE_TOKEN%"=="" (
  echo ERROR: ACTION_BRIDGE_TOKEN is not set.
  echo.
  echo Usage:
  echo   cd /d "%CD%"
  echo   set ACTION_BRIDGE_TOKEN=your-token
  echo   scripts\win\50-start-all.bat
  echo.
  echo Optional:
  echo   set ACTION_BRIDGE_PUBLIC_URL=https://your-ngrok-host.ngrok-free.app
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node not found.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found.
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: git not found.
  exit /b 1
)

echo [1/6] Stop old node processes
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force"
if errorlevel 1 exit /b 1

echo [2/6] Pull latest main
git pull origin main
if errorlevel 1 exit /b 1

echo [3/6] Install dependencies
npm install
if errorlevel 1 exit /b 1

echo [4/6] Build
npm run build
if errorlevel 1 exit /b 1

echo [5/6] Verify build output
if not exist "dist\action-bridge\server.js" (
  echo ERROR: dist\action-bridge\server.js not found.
  exit /b 1
)

echo [6/6] Start Runner Loop in a separate window
start "mcp-gpt-auto runner loop" cmd /k "cd /d ""%CD%"" && node dist\runner\github-task-runner.js --loop"

echo.
echo [Bridge] Starting Action Bridge in this window
if not "%ACTION_BRIDGE_PUBLIC_URL%"=="" (
  echo [Bridge] Public URL: %ACTION_BRIDGE_PUBLIC_URL%
)
echo [Bridge] Health: http://127.0.0.1:8787/health
echo [Bridge] Run tunnel in another terminal:
echo   ngrok http 8787
echo.

node dist\action-bridge\server.js
exit /b %ERRORLEVEL%
