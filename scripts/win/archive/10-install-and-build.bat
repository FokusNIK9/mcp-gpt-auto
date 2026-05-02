@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

echo [mcp-gpt-auto] Install and build
echo Workspace: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node not found.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found.
  exit /b 1
)

npm install
if errorlevel 1 exit /b 1

npm run build
if errorlevel 1 exit /b 1

echo.
echo Build complete.
exit /b 0
