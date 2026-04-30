@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

set MESSAGE=%~1
if "%MESSAGE%"=="" set MESSAGE=Update agent files

if /I not "%CONFIRM_PUSH%"=="YES" (
  echo Push blocked.
  echo To allow push, run:
  echo   set CONFIRM_PUSH=YES
  echo   scripts\win\05-push-to-github.bat "%MESSAGE%"
  exit /b 2
)

echo [mcp-gpt-auto] Push to GitHub
echo Commit message: %MESSAGE%
echo.

echo Git status:
git status --short
echo.

echo Git diff stat:
git diff --stat
echo.

git add README.md docs scripts schemas examples .agent
if errorlevel 1 exit /b 1

git commit -m "%MESSAGE%"
if errorlevel 1 (
  echo WARN: commit failed. Maybe nothing to commit.
)

git push
if errorlevel 1 exit /b 1

echo Push complete.
exit /b 0
