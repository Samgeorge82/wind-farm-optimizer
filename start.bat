@echo off
echo ============================================================
echo  Offshore Wind Farm Development Platform
echo ============================================================
echo.

REM Check if backend is already running
curl -s http://localhost:8000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Backend already running on port 8000
) else (
    echo [INFO] Starting FastAPI backend on port 8000...
    start "WindFarm Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
    timeout /t 3 /nobreak >nul
)

REM Check if frontend is already running
curl -s http://localhost:5173 >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Frontend already running on port 5173
) else (
    echo [INFO] Starting Vite frontend on port 5173...
    start "WindFarm Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
    timeout /t 3 /nobreak >nul
)

echo.
echo ============================================================
echo  App running at: http://localhost:5173
echo  API docs at:    http://localhost:8000/docs
echo ============================================================
echo.
echo Opening browser...
start http://localhost:5173

pause
