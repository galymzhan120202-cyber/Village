@echo off
chcp 65001 > nul
echo.
echo ╔══════════════════════════════════════════╗
echo ║   ТАКСИ ЖАҢАБАЗАР — API СЕРВЕРІ         ║
echo ╚══════════════════════════════════════════╝
echo.
echo [*] FastAPI сервері іске қосылуда...
echo [*] Swagger UI: http://localhost:8000/docs
echo [*] API адресі: http://localhost:8000
echo.
echo Тоқтату үшін: Ctrl+C
echo.
"C:\Users\AMINA\AppData\Local\Programs\Python\Python313\python.exe" run_api.py
pause
