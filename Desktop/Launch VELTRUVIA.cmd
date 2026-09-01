@echo off
title VELTRUVIA Desktop Suite Launcher
echo.
echo   ====================================
echo     VELTRUVIA Desktop Suite
echo   ====================================
echo.
echo   Starting all apps...
echo.

REM Start Server first (it's the backend)
cd /d "%~dp0VELTRUVIA Server"
if exist "VELTRUVIA Server.exe" (
    start "" "VELTRUVIA Server.exe"
    echo   [OK] VELTRUVIA Server started
) else (
    echo   [SKIP] VELTRUVIA Server.exe not found
)
timeout /t 3 /nobreak >nul

REM Start Doctor
cd /d "%~dp0VELTRUVIA Doctor"
if exist "VELTRUVIA Doctor.exe" (
    start "" "VELTRUVIA Doctor.exe"
    echo   [OK] VELTRUVIA Doctor started
) else (
    echo   [SKIP] VELTRUVIA Doctor.exe not found
)
timeout /t 2 /nobreak >nul

REM Start Patient
cd /d "%~dp0VELTRUVIA Patient"
if exist "VELTRUVIA Patient.exe" (
    start "" "VELTRUVIA Patient.exe"
    echo   [OK] VELTRUVIA Patient started
) else (
    echo   [SKIP] VELTRUVIA Patient.exe not found
)
timeout /t 2 /nobreak >nul

REM Start Lab
cd /d "%~dp0VELTRUVIA Lab"
if exist "VELTRUVIA Lab.exe" (
    start "" "VELTRUVIA Lab.exe"
    echo   [OK] VELTRUVIA Lab started
) else (
    echo   [SKIP] VELTRUVIA Lab.exe not found
)

echo.
echo   ====================================
echo     All apps launched!
echo   ====================================
echo.
timeout /t 3 /nobreak >nul
