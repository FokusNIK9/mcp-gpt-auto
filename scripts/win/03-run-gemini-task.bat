@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

set TASK_ID=%~1
if "%TASK_ID%"=="" (
  echo Usage: scripts\win\03-run-gemini-task.bat ^<task-id^>
  exit /b 1
)

set TASK_DIR=.agent\tasks\%TASK_ID%
set PROMPT=%TASK_DIR%\prompt.md
set RESULT_DIR=%TASK_DIR%\result

if not exist "%PROMPT%" (
  echo ERROR: prompt not found: %PROMPT%
  exit /b 1
)

if not exist "%RESULT_DIR%" mkdir "%RESULT_DIR%"

if "%GEMINI_CMD%"=="" set GEMINI_CMD=gemini

where %GEMINI_CMD% >nul 2>nul
if errorlevel 1 (
  echo ERROR: Gemini command not found: %GEMINI_CMD%
  echo Install:
  echo   npm install -g @google/gemini-cli
  exit /b 1
)

echo [mcp-gpt-auto] Running Gemini subagent for task %TASK_ID%
echo Command: type "%PROMPT%" ^| %GEMINI_CMD%
echo.

> "%RESULT_DIR%\run-info.txt" (
  echo taskId=%TASK_ID%
  echo startedAt=%DATE% %TIME%
  echo command=type "%PROMPT%" ^| %GEMINI_CMD%
)

type "%PROMPT%" | %GEMINI_CMD% > "%RESULT_DIR%\subagent-stdout.txt" 2> "%RESULT_DIR%\subagent-stderr.txt"
set EXIT_CODE=%ERRORLEVEL%

>> "%RESULT_DIR%\run-info.txt" (
  echo finishedAt=%DATE% %TIME%
  echo exitCode=%EXIT_CODE%
)

echo Gemini exit code: %EXIT_CODE%
echo stdout: %RESULT_DIR%\subagent-stdout.txt
echo stderr: %RESULT_DIR%\subagent-stderr.txt

exit /b %EXIT_CODE%
