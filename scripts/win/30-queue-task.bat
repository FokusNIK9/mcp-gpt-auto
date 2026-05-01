@echo off
setlocal

:: Get the directory of this script
set SCRIPT_DIR=%~dp0
set REPO_ROOT=%SCRIPT_DIR%..\..

:: Check if powershell is available
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [Error] PowerShell is required to run this script.
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%31-queue-task.ps1" %*
