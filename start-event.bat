@echo off
rem TimeAuction event server launcher for Windows. Double-click on the host PC.
cd /d "%~dp0"

rem Portable build: a bundled node\node.exe is used when present, so the PC needs nothing installed.
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22.18 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem A portable copy ships a prebuilt dist\ and needs no npm install or build.
set PREBUILT=
if exist "dist\index.html" if not exist node_modules set PREBUILT=1

if not defined PREBUILT if not exist node_modules (
  echo Installing dependencies, one time only...
  call npm ci
  if errorlevel 1 (
    echo Dependency install failed. See the messages above.
    pause
    exit /b 1
  )
)

rem Let the other PCs reach port 8787. Needs "Run as administrator"; otherwise ask IT to allow inbound TCP 8787.
netsh advfirewall firewall show rule name="TimeAuction 8787" >nul 2>nul
if errorlevel 1 (
  netsh advfirewall firewall add rule name="TimeAuction 8787" dir=in action=allow protocol=TCP localport=8787 >nul 2>nul
  if errorlevel 1 (
    echo WARNING: could not open port 8787 in Windows Firewall. Other PCs will see nothing.
    echo Right-click start-event.bat and choose "Run as administrator", or ask IT to allow inbound TCP 8787.
  ) else (
    echo Opened port 8787 in Windows Firewall.
  )
)

set /p PIN=Superadmin password / PIN (leave empty to generate one):
if not "%PIN%"=="" set TIMEAUCTION_ADMIN_PIN=%PIN%

echo Auctioneer / projector screen: http://^<this-pc^>:8787/#/auctioneer (judge or admin sign-in)
if defined PREBUILT (
  node server\index.ts
) else (
  call npm run event
)
pause
