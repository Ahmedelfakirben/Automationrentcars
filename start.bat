@echo off
title 2S1M Auto-Publisher Launcher
echo =======================================================
echo  🚗 Starting 2S1M Auto-Publisher Background Server...
echo =======================================================
echo.

:: Start Node server in a new window so it runs in background
start cmd /k "node server.js"

:: Wait 3 seconds for Express to boot up
timeout /t 3 /nobreak >nul

:: Open local dashboard in default web browser
echo  🌐 Opening Premium Web Dashboard...
start http://localhost:3000

echo.
echo  ✅ System is active and running!
echo  👉 You can close this terminal. The server will run in the other window.
echo =======================================================
pause
