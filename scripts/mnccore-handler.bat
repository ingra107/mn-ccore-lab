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
::   mnccore://launch/<lnch_token>          → opaque-token launch (@-tag security Wave 2).
::                                            The token is handed to PB's resolve_launch.py,
::                                            which claims the seed from the Hub over an
::                                            AUTHENTICATED channel and launches the verb
::                                            (quickchat|workon) LOCALLY. NO path/script arg
::                                            is accepted — the verb REFUSES anything that is
::                                            not an lnch_<alnum> token, so the old arbitrary
::                                            .bat/.cmd/.ps1 exec (arbitrary local code) is GONE.
::   mnccore://workon/<url-encoded-folder>  → launch "<folder>\Start Claude.bat" in that folder.
::                                            SECURITY: refuses unless the decoded path is a
::                                            directory AND <folder>\Start Claude.bat exists.
::                                            The hardcoded basename "Start Claude.bat" IS the
::                                            allowlist — no other filename is ever executed.
::   mnccore://process                      → run %USERPROFILE%\Peripheral-Brain\Quick_Process.bat.
::   mnccore://bugsquash                     → run <this dir>\bug-squasher.bat (sibling).
::   mnccore://quickchat                    → launch Quick_Chat_seeded.bat in PB root.
::   mnccore://obsidian/<url-encoded-note>  → open a vault note. WARM (Obsidian
::                                            running): the Obsidian CLI shim
::                                            (Obsidian.com open) — the protocol's
::                                            second-instance handoff drops URIs
::                                            intermittently (Nick 2026-06-10), the
::                                            CLI never does. COLD: falls back to
::                                            the obsidian:// protocol (reliable on
::                                            cold start). Needs Settings → General
::                                            → Advanced → "Command line interface"
::                                            ON for the warm path; otherwise the
::                                            protocol fallback fires.
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

:: Wave 2 (@-tag security): seeds NO LONGER travel through the mnccore:// URI.
:: The old `?seed=<encoded>` query parse + per-verb seed-file writes were removed.
:: The seed is fetched from the Hub by resolve_launch.py over an AUTHENTICATED
:: channel — see the launch/<lnch_token> verb below.

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
    rem NO :decode here — the launch arg must stay an opaque token. Decoding would
    rem turn percent-encoded shell metacharacters (%22 %26 ...) into live chars;
    rem leaving them inert lets verb_launch's strict alnum gate reject them.
    call :verb_launch "!arg!"
    exit /b !errorlevel!
)
if "!url:~0,7!"=="workon/" (
    set "arg=!url:~7!"
    call :decode arg
    call :verb_workon "!arg!"
    exit /b !errorlevel!
)
:: obsidian note-target decode is %20 → space ONLY (inline below). Do NOT flip
:: / to \ — the target is a vault-relative note path (or bare name); Obsidian
:: wants forward slashes. (No ::-comments inside the block — batch parse error.)
if "!url:~0,9!"=="obsidian/" (
    set "arg=!url:~9!"
    set "arg=!arg:%%20= !"
    call :verb_obsidian "!arg!"
    exit /b !errorlevel!
)
if /I "!url!"=="process" (
    call :verb_process
    exit /b !errorlevel!
)
if /I "!url!"=="bugsquash" (
    call :verb_bugsquash
    exit /b !errorlevel!
)
if /I "!url!"=="quickchat" (
    call :verb_quickchat
    exit /b !errorlevel!
)

call :fail "Unknown mnccore:// verb: !url!"
exit /b 1


:: ── :decode <varname> ── normalize a path arg in-place ───────────────────────
:: Defense-in-depth (the frontend's normalizeLocalFolderPath already does this,
:: but a hand-built or legacy mnccore:// URL may still carry a file:/// prefix or
:: percent-encoding). Order: strip a leading file:/// or file:// token FIRST
:: (before any slash flip), then URL-decode %20, then map forward → back slashes.
:decode
set "_d=!%~1!"
:: Strip leading file:/// (3 slashes) then file:// (2) — longest first.
if /I "!_d:~0,8!"=="file:///" set "_d=!_d:~8!"
if /I "!_d:~0,7!"=="file://" set "_d=!_d:~7!"
:: URL-decode the space escape before flipping slashes.
set "_d=!_d:%%20= !"
:: Forward → back slashes (Explorer/exists want backslashes; both work for start).
set "_d=!_d:/=\!"
set "%~1=!_d!"
exit /b 0


:: ── :verb_open <path> ── Explorer-open an existing path ──────────────────────
:: ⚠️ The variable MUST NOT be named "path" — `set "path=..."` clobbers %PATH%,
:: after which cmd cannot resolve `explorer.exe` and the open dies with a
:: flash-and-close console ('explorer.exe' is not recognized). That was THE bug
:: behind every silent folder-open failure 2026-06-10; reproduced live before
:: the fix. %SystemRoot% is belt-and-braces so resolution never depends on PATH.
:verb_open
set "target=%~1"
if not exist "!target!" (
    call :fail "Path not found: !target!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN open: "%SystemRoot%\explorer.exe" "!target!"
    exit /b 0
)
"%SystemRoot%\explorer.exe" "!target!"
exit /b 0


:: ── :verb_launch <token> ── opaque-token launch (@-tag security Wave 2) ───────
:: SECURITY: this verb runs NOTHING by path. It accepts ONLY an opaque
:: `lnch_<alnum>` token and hands it to PB's resolve_launch.py, which claims the
:: seed from the Hub over an AUTHENTICATED channel and launches the verb
:: (quickchat|workon) locally. Any other arg is REFUSED — the old arbitrary
:: .bat/.cmd/.ps1 exec (arbitrary local code from a URI-supplied path) is GONE, so
:: no URI path can reach `start` / `powershell -File` via this verb anymore.
:: Charset gate: the quoted echo keeps & | < > inert and the un-decoded arg keeps
:: %-escapes literal, so a crafted arg FAILS ^"lnch_<alnum>"$ instead of injecting
:: (the leading/trailing `.` match the wrapping quotes). resolve_launch.py
:: re-validates the token before any network/launch.
:verb_launch
echo "%~1"| findstr /R /C:"^.lnch_[0-9A-Za-z][0-9A-Za-z]*.$" >nul
if errorlevel 1 (
    call :fail "launch: refused — not an opaque lnch_ token: %~1"
    exit /b 1
)
set "resolver=%USERPROFILE%\Peripheral-Brain\scripts\utils\resolve_launch.py"
if not exist "!resolver!" (
    call :fail "launch: resolver not found at !resolver!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN launch-token: python -X utf8 "!resolver!" "%~1"
    exit /b 0
)
python -X utf8 "!resolver!" "%~1"
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


:: ── :verb_quickchat ── launch Quick_Chat_seeded.bat in PB root ───────────────
:: SECURITY: fixed target, no path arg. The only file run is the literal
:: %USERPROFILE%\Peripheral-Brain\Quick_Chat_seeded.bat. (Wave 2: no longer
:: seeds from the URI — a seeded @quickchat now flows through the launch/<token>
:: verb -> resolve_launch.py, which writes the seed after an authenticated claim.)
:verb_quickchat
set "pbroot=%USERPROFILE%\Peripheral-Brain"
set "qc=!pbroot!\Quick_Chat_seeded.bat"
if not exist "!qc!" (
    call :fail "quickchat: Quick_Chat_seeded.bat not found at !qc!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN quickchat: start "" /D "!pbroot!" "!qc!"
    exit /b 0
)
start "" /D "!pbroot!" "!qc!"
exit /b 0


:: ── :verb_bugsquash ── run the sibling bug-squasher.bat ──────────────────────
:: SECURITY: the only thing this verb runs is the literal sibling file
:: "%~dp0bug-squasher.bat" (same directory as this handler). Refuses if it
:: doesn't exist. No path argument is taken — nothing arbitrary is reachable.
:verb_bugsquash
set "bs=%~dp0bug-squasher.bat"
if not exist "!bs!" (
    call :fail "bugsquash: bug-squasher.bat not found at !bs!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN bugsquash: start "" /D "%~dp0.." "!bs!"
    exit /b 0
)
:: CWD = the Hub repo root so the Claude session starts there (bug-squasher.bat
:: also cd's there itself, but set it here too for the spawned window title/dir).
start "" /D "%~dp0.." "!bs!"
exit /b 0


:: ── :verb_obsidian <note> ── open a vault note (CLI warm / protocol cold) ────
:: SECURITY: the only executables this verb runs are the fixed-path Obsidian CLI
:: shim (%LOCALAPPDATA%\Programs\Obsidian\Obsidian.com) and the obsidian://
:: protocol handler. The note arg is data, never executed.
:verb_obsidian
set "note=%~1"
if "!note!"=="" (
    call :fail "obsidian: empty note target"
    exit /b 1
)
set "obscli=%LOCALAPPDATA%\Programs\Obsidian\Obsidian.com"
:: Re-encode spaces for the protocol-fallback URI (built either way; also used
:: by dry-run output).
set "enc=!note: =%%20!"
:: WARM path: Obsidian running + CLI shim present → CLI open (file= resolves
:: bare names AND vault-relative paths exactly like a wikilink). Success is
:: detected by the CLI's "Opened:" line — a disabled CLI prints an error and
:: we fall through to the protocol instead of silently doing nothing.
:: Full paths (PATH-independence — same lesson as verb_open's explorer.exe).
"%SystemRoot%\System32\tasklist.exe" /FI "IMAGENAME eq Obsidian.exe" 2>nul | "%SystemRoot%\System32\find.exe" /I "Obsidian.exe" >nul
if errorlevel 1 goto :obsidian_proto
if not exist "!obscli!" goto :obsidian_proto
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN obsidian-cli: "!obscli!" open "file=!note!"
    exit /b 0
)
"!obscli!" open "file=!note!" 2>&1 | findstr /I /C:"Opened:" >nul
if not errorlevel 1 (
    echo %date% %time% obsidian CLI opened: !note! >> "%TEMP%\mnccore-handler.log"
    exit /b 0
)
echo %date% %time% obsidian CLI declined (disabled?), protocol fallback: !note! >> "%TEMP%\mnccore-handler.log"
:obsidian_proto
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN obsidian-proto: start "" "obsidian://open?vault=Peripheral-Brain&file=!enc!"
    exit /b 0
)
start "" "obsidian://open?vault=Peripheral-Brain&file=!enc!"
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
