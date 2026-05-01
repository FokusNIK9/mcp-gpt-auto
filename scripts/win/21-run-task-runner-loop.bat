@echo off
setlocal EnableExtensions

cd /d "C:\Users\user\Documents\trash\Program\2026-05\01.05\mcp-gpt-auto"

echo [Runner] Build
call npm run build
if errorlevel 1 (
  echo ERROR: build failed.
  exit /b 1
)

echo [Runner] Execution loop
node dist\runner\github-task-runner.js --loop
exit /b %ERRORLEVEL%
