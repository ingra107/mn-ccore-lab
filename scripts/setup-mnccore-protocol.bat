@echo off
setlocal

:: ============================================================================
:: setup-mnccore-protocol.bat — register the mnccore:// URL protocol (HKCU).
::
:: SUPERSEDES setup-mnccore-protocol.reg (hardcoded C:\Users\ingra107 path —
:: only worked for the work laptop). This script derives the handler path from
:: its OWN location (%~dp0), so it registers correctly as-is on BOTH machines:
::   - work  (ingra107):  C:\Users\ingra107\mn-ccore-lab\scripts\
::   - home  (ingra):     C:\Users\ingra\mn-ccore-lab\scripts\
::
:: Run once per machine (no admin needed — HKCU). Re-running is idempotent
:: (reg add overwrites). After running, restart the browser so it picks up the
:: new protocol association.
:: ============================================================================

set "HANDLER=%~dp0mnccore-handler.bat"

if not exist "%HANDLER%" (
    echo ERROR: handler not found next to this script: %HANDLER%
    echo Run this script from the repo's scripts\ directory.
    exit /b 1
)

echo Registering mnccore:// protocol -^> "%HANDLER%"
echo.

reg add "HKCU\Software\Classes\mnccore" /ve /d "URL:MN-CCORE Protocol" /f
reg add "HKCU\Software\Classes\mnccore" /v "URL Protocol" /d "" /f
reg add "HKCU\Software\Classes\mnccore\shell\open\command" /ve /d "\"%HANDLER%\" \"%%1\"" /f

if errorlevel 1 (
    echo.
    echo ERROR: registration failed. See messages above.
    exit /b 1
)

echo.
echo Done. mnccore:// now routes to:
echo   "%HANDLER%" "%%1"
echo.
echo Restart your browser, then test:  mnccore://process
exit /b 0
