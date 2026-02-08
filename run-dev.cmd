@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run-dev.ps1"
if errorlevel 1 (
	echo.
	echo [run-dev] Fallo al ejecutar run-dev.ps1. Revisa el mensaje arriba.
	pause
)
endlocal