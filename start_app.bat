@echo off
setlocal
title Puyan Capital Control Center

cd /d "%~dp0\01_Runnable_System"
if errorlevel 1 (
  echo Cannot find the 01_Runnable_System folder.
  pause
  exit /b 1
)

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

if not exist "%NODE_EXE%" if "%NODE_EXE%" NEQ "node" (
  echo Node.js is not installed or is not available in PATH.
  echo Please install Node.js 24 LTS or newer from:
  echo https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('"%NODE_EXE%" --version') do set "NODE_MAJOR=%%V"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% LSS 24 (
  echo Node.js 24 or newer is required. Current version:
  "%NODE_EXE%" --version
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

echo Starting Puyan Capital Control Center...
echo The browser will open at http://localhost:8787
start "" /min powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8787'"
"%NODE_EXE%" server\server.mjs
exit /b %errorlevel%
