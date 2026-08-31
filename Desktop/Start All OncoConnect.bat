@echo off
title OncoConnect Desktop Suite
echo.
echo   Starting OncoConnect apps...
echo.

cd /d "%~dp0OncoConnect Server"
start "" "OncoConnect Server.exe"
echo   [OK] Server started
timeout /t 3 /nobreak >nul

cd /d "%~dp0OncoConnect Doctor"
start "" "OncoConnect Doctor.exe"
echo   [OK] Doctor started
timeout /t 2 /nobreak >nul

cd /d "%~dp0OncoConnect Patient"
start "" "OncoConnect Patient.exe"
echo   [OK] Patient started
timeout /t 2 /nobreak >nul

cd /d "%~dp0OncoConnect Lab"
start "" "OncoConnect Lab.exe"
echo   [OK] Lab started

echo.
echo   All 4 apps started! You can close this window.
timeout /t 3 /nobreak >nul
