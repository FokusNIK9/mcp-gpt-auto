@echo off
setlocal EnableExtensions

cd /d "%~dp0\..\.."

if not exist "dist\index.js" (
  echo dist\index.js not found. Running install/build first.
  call scripts\win\10-install-and-build.bat
  if errorlevel 1 exit /b 1
)

node dist\index.js
