@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

set TASK_ID=%~1
set TITLE=%~2

if "%TASK_ID%"=="" (
  echo Usage: scripts\win\02-new-task.bat ^<task-id^> "Task title"
  exit /b 1
)

if "%TITLE%"=="" set TITLE=%TASK_ID%

set TASK_DIR=.agent\tasks\%TASK_ID%

if exist "%TASK_DIR%" (
  echo ERROR: task already exists: %TASK_DIR%
  exit /b 1
)

mkdir "%TASK_DIR%"
mkdir "%TASK_DIR%\result"
mkdir "%TASK_DIR%\logs"
mkdir "%TASK_DIR%\review"

> "%TASK_DIR%\task.json" (
  echo {
  echo   "taskId": "%TASK_ID%",
  echo   "title": "%TITLE%",
  echo   "status": "planned",
  echo   "createdAt": "%DATE% %TIME%",
  echo   "currentStep": "prompt"
  echo }
)

copy "examples\gemini-task.prompt.md" "%TASK_DIR%\prompt.md" >nul

>> "%TASK_DIR%\prompt.md" (
  echo.
  echo ---
  echo.
  echo # Concrete task
  echo.
  echo %TITLE%
)

echo Created task: %TASK_DIR%
echo Edit prompt: %TASK_DIR%\prompt.md
exit /b 0
