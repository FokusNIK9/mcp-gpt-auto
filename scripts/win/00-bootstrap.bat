@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

echo [mcp-gpt-auto] Bootstrap
echo Workspace: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: git not found.
  exit /b 1
)
git --version

where node >nul 2>nul
if errorlevel 1 (
  echo WARN: node not found. Node is needed for MVP-1 MCP server.
) else (
  node --version
)

where npm >nul 2>nul
if errorlevel 1 (
  echo WARN: npm not found. npm is needed for installing TypeScript/MCP dependencies.
) else (
  npm --version
)

where gemini >nul 2>nul
if errorlevel 1 (
  echo WARN: gemini not found.
  echo Install later with:
  echo   npm install -g @google/gemini-cli
) else (
  gemini --version
)

if not exist ".agent" mkdir ".agent"
if not exist ".agent\tasks" mkdir ".agent\tasks"
if not exist ".agent\logs" mkdir ".agent\logs"
if not exist ".agent\artifacts" mkdir ".agent\artifacts"
if not exist ".agent\artifacts\screenshots" mkdir ".agent\artifacts\screenshots"

if not exist ".agent\policy.json" (
  if exist ".agent\policy.example.json" (
    copy ".agent\policy.example.json" ".agent\policy.json" >nul
    echo Created .agent\policy.json from example.
  )
)

echo.
echo Bootstrap complete.
exit /b 0
