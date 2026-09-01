@echo off
title VELTRUVIA Desktop Setup
echo.
echo   ====================================
echo     VELTRUVIA Desktop Setup
echo   ====================================
echo.
echo   Creating Start Menu shortcuts...
echo.

REM Create Start Menu folder
set "SM=%APPDATA%\Microsoft\Windows\Start Menu\Programs\VELTRUVIA"
mkdir "%SM%" 2>nul

REM Create shortcuts using PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ws=New-Object -ComObject WScript.Shell;" ^
 "$s=$ws.CreateShortcut('%SM%\VELTRUVIA Server.lnk'); $s.TargetPath='%~dp0VELTRUVIA Server\VELTRUVIA Server.exe'; $s.WorkingDirectory='%~dp0VELTRUVIA Server'; $s.Save();" ^
 "$s=$ws.CreateShortcut('%SM%\VELTRUVIA Doctor.lnk'); $s.TargetPath='%~dp0VELTRUVIA Doctor\VELTRUVIA Doctor.exe'; $s.WorkingDirectory='%~dp0VELTRUVIA Doctor'; $s.Save();" ^
 "$s=$ws.CreateShortcut('%SM%\VELTRUVIA Patient.lnk'); $s.TargetPath='%~dp0VELTRUVIA Patient\VELTRUVIA Patient.exe'; $s.WorkingDirectory='%~dp0VELTRUVIA Patient'; $s.Save();" ^
 "$s=$ws.CreateShortcut('%SM%\VELTRUVIA Lab.lnk'); $s.TargetPath='%~dp0VELTRUVIA Lab\VELTRUVIA Lab.exe'; $s.WorkingDirectory='%~dp0VELTRUVIA Lab'; $s.Save();" ^
 "Write-Host 'Shortcuts created'"

echo.
echo   ====================================
echo     Setup Complete!
echo   ====================================
echo.
echo   All 4 apps are now standalone desktop software:
echo.
echo     - VELTRUVIA Server  (Backend)
echo     - VELTRUVIA Doctor  (EMR & Patient Management)
echo     - VELTRUVIA Patient (Symptom Tracker & Care)
echo     - VELTRUVIA Lab     (Test Management)
echo.
echo   To launch:
echo   1. Press Windows key
echo   2. Type "VELTRUVIA"
echo   3. Click on the app you want to open
echo.
echo   Or use "Launch VELTRUVIA.cmd" to start all apps.
echo.
pause
