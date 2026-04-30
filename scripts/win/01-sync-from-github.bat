@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

echo [mcp-gpt-auto] Sync from GitHub
echo Workspace: %CD%
echo.

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo ERROR: not inside a git repository.
  exit /b 1
)

echo Current status:
git status --short
echo.

for /f "delims=" %%S in ('git status --porcelain') do (
  echo WARN: working tree has local changes. Pull is skipped to avoid conflicts.
  echo Commit/stash/review changes first.
  exit /b 2
)

git pull --ff-only
if errorlevel 1 (
  echo ERROR: git pull failed.
  exit /b 1
)

echo.
echo Sync complete.
exit /b 0
