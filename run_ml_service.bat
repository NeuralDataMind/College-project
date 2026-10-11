@echo off
echo ========================================================
echo Starting ML Inference Service (FastAPI + Uvicorn)
echo ========================================================

rem Free port 8000 if already in use to prevent Errno 10048
powershell -NoProfile -Command "try { Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction Stop).OwningProcess -Force -ErrorAction SilentlyContinue } catch {} ; exit 0"

cd /d "%~dp0ml_service"
call "..\venv\Scripts\activate.bat"
python predict_server.py
pause
