@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\build-standalone.ps1"
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)
echo Build completed.
