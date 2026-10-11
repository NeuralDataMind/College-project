@echo off
echo ========================================================
echo   Smart Inventory Forecasting and FEFO System
echo   Final Year Project - ML and Explainable AI (XAI)
echo ========================================================

rem Free any hanging processes on ports 5000 and 8000
powershell -NoProfile -Command "try { Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000, 8000 -State Listen -ErrorAction Stop).OwningProcess -Force -ErrorAction SilentlyContinue } catch {} ; exit 0"

echo [1/3] Starting ML Inference Microservice on port 8000...
start "ML Service (FastAPI)" cmd /k "%~dp0run_ml_service.bat"

timeout /t 3 /nobreak >nul

echo [2/3] Starting Express Backend Gateway on port 5000...
start "Express Backend" cmd /k "%~dp0run_backend.bat"

timeout /t 2 /nobreak >nul

echo [3/3] Opening Login Portal in default browser...
start "" "%~dp0frontend\login.html"

echo ========================================================
echo All services running!
echo Access Portals:
echo   - Store Operations Manager: manager / manager123
echo   - ML Systems and Platform Admin: admin / admin123
echo Login Portal opened in your browser!
echo ========================================================
pause
