@echo off
setlocal
cd /d "%~dp0"

title Project Sojourn - Hardpoint Editor

echo.
echo ============================================
echo   PROJECT SOJOURN - HARDPOINT EDITOR
echo ============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo FEHLER: npm wurde nicht gefunden.
  echo Bitte Node.js installieren oder den PATH pruefen.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo FEHLER: package.json wurde im Projektordner nicht gefunden.
  echo.
  pause
  exit /b 1
)

echo Starte Hardpoint Editor...
echo.

call npm run hardpoints:edit

if errorlevel 1 (
  echo.
  echo Der Hardpoint Editor konnte nicht gestartet werden.
  pause
)

endlocal
