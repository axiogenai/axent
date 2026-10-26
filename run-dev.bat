@echo off
title Axent Dev Server (Port 4000)
cd /d "%~dp0frontend"
echo Starting Axent Development Server on http://localhost:4000...
npm run dev
pause
