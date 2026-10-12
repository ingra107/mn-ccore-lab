@echo off
rem Installs the MN-CCORE launcher for this Windows user. No administrator rights needed.
rem It runs install.ps1 from this folder; see README.txt.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
