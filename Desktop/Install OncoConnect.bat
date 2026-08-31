@echo off
title OncoConnect Desktop Setup
echo.
echo   ====================================
echo     OncoConnect Desktop Setup
echo   ====================================
echo.
echo   Creating Start Menu shortcuts...
echo.

REM Create Start Menu folder
set "SM=%APPDATA%\Microsoft\Windows\Start Menu\Programs\OncoConnect"
mkdir "%SM%" 2>nul

REM Create shortcuts using PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ws=New-Object -ComObject WScript.Shell;" ^
 "$s=$ws.CreateShortcut('%SM%\OncoConnect Server.lnk'); $s.TargetPath='%~dp0OncoConnect Server\OncoConnect Server.exe'; $s.WorkingDirectory='%~dp0OncoConnect Server'; $s.Save();" ^
 "$s=$ws.CreateShortcut('%SM%\OncoConnect Doctor.lnk'); $s.TargetPath='%~dp0OncoConnect Doctor\OncoConnect Doctor.exe'; $s.WorkingDirectory='%~dp0OncoConnect Doctor'; $s.Save();" ^
 "$s=$ws.CreateShortcut('%SM%\OncoConnect Patient.lnk'); $s.TargetPath='%~dp0OncoConnect Patient\OncoConnect Patient.exe'; $s.WorkingDirectory='%~dp0OncoConnect Patient'; $s.Save();" ^
 "$s=$ws.CreateShortcut('%SM%\OncoConnect Lab.lnk'); $s.TargetPath='%~dp0OncoConnect Lab\OncoConnect Lab.exe'; $s.WorkingDirectory='%~dp0OncoConnect Lab'; $s.Save();" ^
 "Write-Host 'Shortcuts created'"

echo.
echo   ====================================
echo     Setup Complete!
echo   ====================================
echo.
echo   All 4 apps are now standalone desktop software:
echo.
echo     - OncoConnect Server  (Backend)
echo     - OncoConnect Doctor  (EMR & Patient Management)
echo     - OncoConnect Patient (Symptom Tracker & Care)
echo     - OncoConnect Lab     (Test Management)
echo.
echo   To launch:
echo   1. Press Windows key
echo   2. Type "OncoConnect"
echo   3. Click on the app you want to open
echo.
echo   Or use "Launch OncoConnect.cmd" to start all apps.
echo.
pause
