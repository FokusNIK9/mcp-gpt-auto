@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

set TASK_ID=%~1
if "%TASK_ID%"=="" (
  echo Usage: scripts\win\04-review-bundle.bat ^<task-id^>
  exit /b 1
)

set TASK_DIR=.agent\tasks\%TASK_ID%
set REVIEW_DIR=%TASK_DIR%\review
set BUNDLE=%REVIEW_DIR%\review-bundle.md

if not exist "%TASK_DIR%" (
  echo ERROR: task not found: %TASK_DIR%
  exit /b 1
)

if not exist "%REVIEW_DIR%" mkdir "%REVIEW_DIR%"

> "%BUNDLE%" (
  echo # Review Bundle: %TASK_ID%
  echo.
  echo Generated: %DATE% %TIME%
  echo.
  echo ## Git status
  echo.
  echo ```text
)

git status --short >> "%BUNDLE%" 2>&1

>> "%BUNDLE%" (
  echo ```
  echo.
  echo ## Git diff stat
  echo.
  echo ```text
)

git diff --stat >> "%BUNDLE%" 2>&1

>> "%BUNDLE%" (
  echo ```
  echo.
  echo ## Git diff
  echo.
  echo ```diff
)

git diff >> "%BUNDLE%" 2>&1

>> "%BUNDLE%" (
  echo ```
  echo.
  echo ## Subagent stdout
  echo.
  echo ```text
)

if exist "%TASK_DIR%\result\subagent-stdout.txt" (
  type "%TASK_DIR%\result\subagent-stdout.txt" >> "%BUNDLE%"
) else (
  echo subagent-stdout.txt not found >> "%BUNDLE%"
)

>> "%BUNDLE%" (
  echo.
  echo ```
  echo.
  echo ## Subagent stderr
  echo.
  echo ```text
)

if exist "%TASK_DIR%\result\subagent-stderr.txt" (
  type "%TASK_DIR%\result\subagent-stderr.txt" >> "%BUNDLE%"
) else (
  echo subagent-stderr.txt not found >> "%BUNDLE%"
)

>> "%BUNDLE%" (
  echo.
  echo ```
  echo.
  echo ## Review checklist
  echo.
  echo - [ ] Diff reviewed
  echo - [ ] Only allowed files changed
  echo - [ ] No secrets
  echo - [ ] Tests/build checked or explicitly skipped
  echo - [ ] Subagent result understood
  echo - [ ] Decision: approved / needs_changes / rejected
)

echo Created: %BUNDLE%
exit /b 0
