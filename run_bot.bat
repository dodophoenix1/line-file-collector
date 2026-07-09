@echo off
title LINE File Collector - Startup Launcher
echo ==================================================
echo 🚀 LINE File Collector Launcher by N. Vetchagama
echo ==================================================
echo.

:: Ensure we are in the correct directory
cd /d "%~dp0"

echo [1/2] Starting Node.js Server on port 3000...
start "LINE Bot Server" cmd /k "title LINE Bot Server && node server.js"

echo [2/2] Starting Online Tunnel (Tunnelmole)...
start "Online Tunnel" cmd /k "title Online Tunnel && npx -y tunnelmole 3000"

echo.
echo ==================================================
echo ✅ Launcher complete! Both windows are now running.
echo --------------------------------------------------
echo * Look at the "Online Tunnel" window to copy your new https://... URL.
echo * Update the "Webhook URL" in your LINE Developers Console.
echo ==================================================
echo.
pause
