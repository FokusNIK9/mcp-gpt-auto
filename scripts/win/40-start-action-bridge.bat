@echo off
setlocal EnableExtensions

cd /d "C:\Users\user\Documents\trash\Program\2026-05\01.05\mcp-gpt-auto"

if "%ACTION_BRIDGE_TOKEN%"=="" (
  echo ERROR: ACTION_BRIDGE_TOKEN is not set.
  echo In PowerShell:
  echo   $env:ACTION_BRIDGE_TOKEN="[REDACTED]"
  exit /b 1
)

npm run build
if errorlevel 1 exit /b 1

node dist\action-bridge\server.js
