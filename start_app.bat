@echo off
setlocal EnableExtensions
title Isater Investment Management System

set "IASTER_ROOT=%~dp0"
set "SYSTEM_DIR=%IASTER_ROOT%system"
set "DEMO_SOURCE=%IASTER_ROOT%demo-database"
set "DEMO_TARGET=%SYSTEM_DIR%\apps\api\data\review-pg"

if not exist "%SYSTEM_DIR%\package.json" (
  echo [ERROR] Cannot find the Isater system folder:
  echo %SYSTEM_DIR%
  pause
  exit /b 1
)

set "NODE_EXE="
for /f "delims=" %%P in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%P"
if not defined NODE_EXE set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo Install Node.js 22 LTS or newer from https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('"%NODE_EXE%" --version') do set "NODE_MAJOR=%%V"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if not defined NODE_MAJOR (
  echo [ERROR] Unable to read the Node.js version.
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Node.js 22 or newer is required. Current version:
  "%NODE_EXE%" --version
  pause
  exit /b 1
)

for %%N in ("%NODE_EXE%") do set "NODE_DIR=%%~dpN"
set "PATH=%NODE_DIR%;%PATH%"

set "PNPM_CMD="
for /f "delims=" %%P in ('where pnpm.cmd 2^>nul') do if not defined PNPM_CMD set "PNPM_CMD=%%P"
if not defined PNPM_CMD set "PNPM_CMD=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if not exist "%PNPM_CMD%" (
  echo [ERROR] pnpm is not installed or is not available in PATH.
  echo After installing Node.js, run: npm install -g pnpm@10
  pause
  exit /b 1
)

for %%N in ("%PNPM_CMD%") do set "PNPM_DIR=%%~dpN"
set "PATH=%PNPM_DIR%;%PATH%"

if /i "%~1"=="--check" (
  echo [OK] Isater folder found.
  echo [OK] Node.js version:
  "%NODE_EXE%" --version
  echo [OK] pnpm version:
  call pnpm.cmd --version
  echo [OK] start_app prerequisites passed.
  exit /b 0
)

netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port 5173 is already in use. Isater may already be running.
  echo Close the previous window or stop the existing service, then try again.
  pause
  exit /b 1
)
netstat -ano | findstr /r /c:":8790 .*LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port 8790 is already in use. Isater API may already be running.
  echo Close the previous window or stop the existing service, then try again.
  pause
  exit /b 1
)

if not exist "%DEMO_TARGET%\PG_VERSION" (
  if not exist "%DEMO_SOURCE%\PG_VERSION" (
    echo [ERROR] Cannot find the packaged demo database:
    echo %DEMO_SOURCE%
    pause
    exit /b 1
  )
  echo Preparing the local demo database for first use...
  if not exist "%SYSTEM_DIR%\apps\api\data" mkdir "%SYSTEM_DIR%\apps\api\data"
  xcopy "%DEMO_SOURCE%" "%DEMO_TARGET%\" /E /I /H /K /Q /Y >nul
  if errorlevel 1 (
    echo [ERROR] The demo database could not be copied.
    pause
    exit /b 1
  )
)

cd /d "%SYSTEM_DIR%"
if errorlevel 1 (
  echo [ERROR] Cannot enter the Isater system folder.
  pause
  exit /b 1
)

if not exist "node_modules\.pnpm" (
  echo Installing locked project dependencies. This is required only once...
  call "%PNPM_CMD%" install --frozen-lockfile
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed. Check the network and try again.
    pause
    exit /b 1
  )
)

set "NODE_ENV=development"
set "DATABASE_URL=pglite://data/review-pg"
set "WEB_ORIGIN=http://localhost:5173"
set "ENABLE_DEMO_RESET=true"
set "EXTERNAL_CREDENTIAL_ENCRYPTION_KEY=isater-local-demo-key-change-before-production-2026"

echo Applying any new database upgrades...
call "%PNPM_CMD%" --filter @isater/api migrate
if errorlevel 1 (
  echo [ERROR] Database upgrade failed. The application was not started.
  pause
  exit /b 1
)

echo.
echo Starting Isater Investment Management System...
echo Browser address: http://localhost:5173
echo.
echo Keep this window open while using the system.
echo Press Ctrl+C or close this window to stop both services.
echo.

start "" /min powershell.exe -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 60; $i++) { try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:5173' -TimeoutSec 1; if ($r.StatusCode -eq 200) { Start-Process 'http://localhost:5173'; break } } catch {}; Start-Sleep -Milliseconds 500 }"

call "%PNPM_CMD%" dev
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Isater has stopped.
exit /b %EXIT_CODE%
