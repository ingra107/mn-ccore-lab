@echo off
rem Removes the MN-CCORE launcher for this Windows user. It runs uninstall.ps1 from this folder.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
echo.
pause
