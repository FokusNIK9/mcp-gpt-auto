@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

echo [mcp-gpt-auto] Status
echo Workspace: %CD%
echo.

echo Branch:
git branch --show-current 2>nul

echo.
echo Git status:
git status --short 2>nul

echo.
echo Recent commits:
git log --oneline -5 2>nul

echo.
echo Tasks:
if exist ".agent\tasks" (
  dir /b ".agent\tasks"
) else (
  echo No .agent\tasks directory.
)

echo.
echo Audit log location:
echo .agent\logs\audit.jsonl

echo.
echo Recent task files:
if exist ".agent\tasks" (
  dir ".agent\tasks" /s /b | findstr /i "task.json prompt.md review-bundle.md subagent-stdout.txt subagent-stderr.txt"
)

exit /b 0
