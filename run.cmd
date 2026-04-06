@echo off
setlocal

pushd "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd is not available on PATH.
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    exit /b 1
  )
)

echo Starting Entity Sim at http://127.0.0.1:5173/
call npm.cmd run dev -- --host 127.0.0.1 --port 5173
set EXIT_CODE=%ERRORLEVEL%

popd
exit /b %EXIT_CODE%
