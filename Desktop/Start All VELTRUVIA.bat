@echo off
title VELTRUVIA Desktop Suite
echo.
echo   Starting VELTRUVIA apps...
echo.

cd /d "%~dp0VELTRUVIA Server"
start "" "VELTRUVIA Server.exe"
echo   [OK] Server started
timeout /t 3 /nobreak >nul

cd /d "%~dp0VELTRUVIA Doctor"
start "" "VELTRUVIA Doctor.exe"
echo   [OK] Doctor started
timeout /t 2 /nobreak >nul

cd /d "%~dp0VELTRUVIA Patient"
start "" "VELTRUVIA Patient.exe"
echo   [OK] Patient started
timeout /t 2 /nobreak >nul

cd /d "%~dp0VELTRUVIA Lab"
start "" "VELTRUVIA Lab.exe"
echo   [OK] Lab started

echo.
echo   All 4 apps started! You can close this window.
timeout /t 3 /nobreak >nul
