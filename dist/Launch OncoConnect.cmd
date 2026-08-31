@echo off
title OncoConnect Desktop Suite Launcher
echo.
echo   ====================================
echo     OncoConnect Desktop Suite
echo   ====================================
echo.
echo   Starting all apps...
echo.

REM Start Server first (it's the backend)
cd /d "%~dp0OncoConnect Server"
if exist "OncoConnect Server.exe" (
    start "" "OncoConnect Server.exe"
    echo   [OK] OncoConnect Server started
) else (
    echo   [SKIP] OncoConnect Server.exe not found
)
timeout /t 3 /nobreak >nul

REM Start Doctor
cd /d "%~dp0OncoConnect Doctor"
if exist "OncoConnect Doctor.exe" (
    start "" "OncoConnect Doctor.exe"
    echo   [OK] OncoConnect Doctor started
) else (
    echo   [SKIP] OncoConnect Doctor.exe not found
)
timeout /t 2 /nobreak >nul

REM Start Patient
cd /d "%~dp0OncoConnect Patient"
if exist "OncoConnect Patient.exe" (
    start "" "OncoConnect Patient.exe"
    echo   [OK] OncoConnect Patient started
) else (
    echo   [SKIP] OncoConnect Patient.exe not found
)
timeout /t 2 /nobreak >nul

REM Start Lab
cd /d "%~dp0OncoConnect Lab"
if exist "OncoConnect Lab.exe" (
    start "" "OncoConnect Lab.exe"
    echo   [OK] OncoConnect Lab started
) else (
    echo   [SKIP] OncoConnect Lab.exe not found
)

echo.
echo   ====================================
echo     All apps launched!
echo   ====================================
echo.
timeout /t 3 /nobreak >nul
