@echo off
setlocal enabledelayedexpansion
echo %date% %time% ARGS: %* >> "%TEMP%\mnccore-handler.log"

:: Parse the URL: mnccore://open/C:/path/to/folder or mnccore://launch/C:/path/to/script.bat
set "url=%~1"

:: Remove the protocol prefix
set "url=!url:mnccore://=!"

:: Remove trailing slash if present
if "!url:~-1!"=="/" set "url=!url:~0,-1!"

:: Determine action
if "!url:~0,5!"=="open/" (
    set "path=!url:~5!"
    :: URL decode forward slashes
    set "path=!path:/=\!"
    :: Remove any URL encoding artifacts
    set "path=!path:%%20= !"
    if exist "!path!" (
        explorer.exe "!path!"
    ) else (
        echo Path not found: !path!
    )
) else if "!url:~0,7!"=="launch/" (
    set "script=!url:~7!"
    set "script=!script:/=\!"
    set "script=!script:%%20= !"
    :: Determine extension for dispatch
    for %%F in ("!script!") do set "ext=%%~xF"
    if exist "!script!" (
        if /I "!ext!"==".ps1" (
            powershell -ExecutionPolicy Bypass -File "!script!"
        ) else (
            start "" "!script!"
        )
    ) else (
        echo Script not found: !script!
    )
)
