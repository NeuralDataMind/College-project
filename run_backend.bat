@echo off
echo ========================================================
echo Starting Express Backend Gateway (Port 5000)
echo ========================================================

rem Free port 5000 if already in use to prevent EADDRINUSE
powershell -NoProfile -Command "try { Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction Stop).OwningProcess -Force -ErrorAction SilentlyContinue } catch {} ; exit 0"

cd /d "%~dp0backend"
node server.js
pause
