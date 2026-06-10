@echo off
setlocal enabledelayedexpansion
echo %date% %time% ARGS: %* >> "%TEMP%\mnccore-handler.log"

:: ============================================================================
:: mnccore:// protocol handler — verb router.
::
:: Registered (HKCU\Software\Classes\mnccore) by scripts\setup-mnccore-protocol.bat.
:: Invoked by the browser/OS with a single arg: the full mnccore:// URL.
::
:: Verbs:
::   mnccore://open/<url-encoded-path>      → Explorer-open a folder/file (legacy; kept).
::   mnccore://launch/<url-encoded-script>  → run a .bat/.cmd/.ps1 (legacy; kept).
::   mnccore://workon/<url-encoded-folder>  → launch "<folder>\Start Claude.bat" in that folder.
::                                            SECURITY: refuses unless the decoded path is a
::                                            directory AND <folder>\Start Claude.bat exists.
::                                            The hardcoded basename "Start Claude.bat" IS the
::                                            allowlist — no other filename is ever executed.
::   mnccore://process                      → run %USERPROFILE%\Peripheral-Brain\Quick_Process.bat.
::   <anything else>                         → message + exit 1.
::
:: Defence-in-depth: the browser's external-protocol confirmation dialog is the
:: first gate; the per-verb existence + basename pin below is the second. A
:: malicious webpage can fire mnccore:// URLs but cannot make this handler run
:: an arbitrary executable.
::
:: MNCCORE_HANDLER_DRYRUN=1 → print the resolved action instead of executing it
:: (used by the routing test). Path-existence checks STILL run in dry-run so the
:: security refusals are exercised; only the final start/explorer call is skipped.
:: ============================================================================

set "url=%~1"

:: Strip the protocol prefix.
set "url=!url:mnccore://=!"

:: Strip a single trailing slash (verb-only URLs like "process/" or trailing on paths).
if "!url:~-1!"=="/" set "url=!url:~0,-1!"

:: ── verb dispatch ───────────────────────────────────────────────────────────
:: Each branch CALLs its verb subroutine then propagates that routine's
:: errorlevel out of the script via `exit /b !errorlevel!` (NOT `goto :eof`,
:: which would drop the code and always return 0).
if "!url:~0,5!"=="open/" (
    set "arg=!url:~5!"
    call :decode arg
    call :verb_open "!arg!"
    exit /b !errorlevel!
)
if "!url:~0,7!"=="launch/" (
    set "arg=!url:~7!"
    call :decode arg
    call :verb_launch "!arg!"
    exit /b !errorlevel!
)
if "!url:~0,7!"=="workon/" (
    set "arg=!url:~7!"
    call :decode arg
    call :verb_workon "!arg!"
    exit /b !errorlevel!
)
if /I "!url!"=="process" (
    call :verb_process
    exit /b !errorlevel!
)

call :fail "Unknown mnccore:// verb: !url!"
exit /b 1


:: ── :decode <varname> ── URL-decode forward slashes + %20 in-place ───────────
:decode
set "_d=!%~1!"
set "_d=!_d:/=\!"
set "_d=!_d:%%20= !"
set "%~1=!_d!"
exit /b 0


:: ── :verb_open <path> ── Explorer-open an existing path ──────────────────────
:verb_open
set "path=%~1"
if not exist "!path!" (
    call :fail "Path not found: !path!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN open: explorer.exe "!path!"
    exit /b 0
)
explorer.exe "!path!"
exit /b 0


:: ── :verb_launch <script> ── run a .bat/.cmd/.ps1 (legacy KeyLinks "Script") ──
:verb_launch
set "script=%~1"
if not exist "!script!" (
    call :fail "Script not found: !script!"
    exit /b 1
)
for %%F in ("!script!") do set "ext=%%~xF"
if defined MNCCORE_HANDLER_DRYRUN (
    if /I "!ext!"==".ps1" (
        echo DRYRUN launch: powershell -ExecutionPolicy Bypass -File "!script!"
    ) else (
        echo DRYRUN launch: start "" "!script!"
    )
    exit /b 0
)
if /I "!ext!"==".ps1" (
    powershell -ExecutionPolicy Bypass -File "!script!"
) else (
    start "" "!script!"
)
exit /b 0


:: ── :verb_workon <folder> ── launch "<folder>\Start Claude.bat" in <folder> ──
:: SECURITY: the only executable this verb ever runs is the literal basename
:: "Start Claude.bat" inside the decoded folder. The folder must exist as a
:: directory and contain that bat. No other filename is reachable.
:verb_workon
set "folder=%~1"
:: Strip a trailing backslash so "<folder>\Start Claude.bat" doesn't double up.
if "!folder:~-1!"=="\" set "folder=!folder:~0,-1!"
if not exist "!folder!\" (
    call :fail "workon: not a directory: !folder!"
    exit /b 1
)
set "bat=!folder!\Start Claude.bat"
if not exist "!bat!" (
    call :fail "workon: no 'Start Claude.bat' in !folder!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN workon: start "" /D "!folder!" "!bat!"
    exit /b 0
)
start "" /D "!folder!" "!bat!"
exit /b 0


:: ── :verb_process ── run Peripheral-Brain\Quick_Process.bat ──────────────────
:verb_process
set "qp=%USERPROFILE%\Peripheral-Brain\Quick_Process.bat"
if not exist "!qp!" (
    call :fail "process: Quick_Process.bat not found at !qp!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN process: start "" /D "%USERPROFILE%\Peripheral-Brain" "!qp!"
    exit /b 0
)
:: CWD = the PB repo root so relative paths inside Quick_Process.bat resolve.
start "" /D "%USERPROFILE%\Peripheral-Brain" "!qp!"
exit /b 0


:: ── :fail <message> ── echo + brief pause for debuggability, exit 1 ──────────
:fail
echo %~1
echo %date% %time% FAIL: %~1 >> "%TEMP%\mnccore-handler.log"
:: Brief pause so a double-click / protocol-spawned window is readable. Skip the
:: pause under dry-run (tests are non-interactive).
if not defined MNCCORE_HANDLER_DRYRUN (
    timeout /t 3 /nobreak >nul 2>&1
)
exit /b 1
