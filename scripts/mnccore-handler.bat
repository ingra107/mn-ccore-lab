@echo off
setlocal enabledelayedexpansion
echo %date% %time% ARGS: %* >> "%TEMP%\mnccore-handler.log"

:: ============================================================================
:: DEPRECATED 2026-10-09: superseded by scripts\mnccore_handler.py, registered by
:: scripts\register_mnccore_protocol.py --apply. Windows starts a .bat handler under
:: cmd.exe, which splits a URL holding an unbalanced quote before this file runs, so
:: no line here can stop that injection. Kept for one release as the rollback:
::   python scripts\register_mnccore_protocol.py --revert-to-bat
:: Delete it, setup-mnccore-protocol.bat/.reg and mnccore-handler.test.mjs after that.
::
:: mnccore:// protocol handler — verb router.
::
:: Registered (HKCU\Software\Classes\mnccore) by scripts\setup-mnccore-protocol.bat.
:: Invoked by the browser/OS with a single arg: the full mnccore:// URL.
::
:: Verbs:
::   mnccore://open/<url-encoded-path>      → Explorer-open a directory (legacy; kept).
::                                            Refuses non-directory targets (files, execs).
::                                            Level-1: "!target!\" existence test makes the
::                                            file-exec path unrepresentable — no ext denylist.
::   mnccore://launch/<lnch_token>          → opaque-token launch (@-tag security Wave 2).
::                                            The token is handed to PB's resolve_launch.py,
::                                            which claims the seed from the Hub over an
::                                            AUTHENTICATED channel and launches the verb
::                                            (quickchat|workon) LOCALLY. NO path/script arg
::                                            is accepted — the verb REFUSES anything that is
::                                            not an lnch_<alnum> token, so the old arbitrary
::                                            .bat/.cmd/.ps1 exec (arbitrary local code) is GONE.
::   mnccore://desk/<slug>/<desk-name>      → start a Claude session on a working desk.
::                                            Identifier only (no decode, no path): PB's
::                                            resolve_launch.py desk mode reads the git-tracked
::                                            desk + manifest, mints + claims a launch, then
::                                            starts Quick_Chat_seeded.bat. Refusals are loud.
::   mnccore://workon/<url-encoded-folder>  → launch "<folder>\Start Claude.bat" in that folder.
::                                            SECURITY: refuses unless the decoded path is a
::                                            directory AND <folder>\Start Claude.bat exists.
::                                            The hardcoded basename "Start Claude.bat" IS the
::                                            allowlist — no other filename is ever executed.
::   mnccore://file/<url-encoded-path>      → open ONE .docx/.pdf/.xlsx under %USERPROFILE%\Box\
::                                            in its default app (desk "Open file" buttons).
::                                            Allowlists only: Box root, file attribute, extension.
::   mnccore://process                      → run %USERPROFILE%\Peripheral-Brain\Quick_Process.bat.
::   mnccore://bugsquash                     → run <this dir>\bug-squasher.bat (sibling).
::   mnccore://backlogwave                  → run <this dir>\backlog-wave.bat (sibling).
::                                            Works the PB improvement backlog, not this
::                                            repo — the .bat cd's to Peripheral-Brain.
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

:: SECURITY (2026-10-09): refuse a URL holding a literal double quote before any
:: verb sees it. A quote toggles cmd's quoting, so every later "%~1" or "!x!" line
:: that wraps the value in quotes would have its & | > live again. Both lines use
:: delayed expansion only, which runs after cmd has split commands, so the check
:: itself cannot be fooled by what it is checking. No browser sends a raw quote
:: (they percent-encode it as %22); one arriving here was hand-built.
set "_noq=!url:"=!"
if not "!_noq!"=="!url!" (
    call :fail "Refused: a mnccore:// URL may not contain a double quote."
    exit /b 1
)

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
    rem CALL re-expands percent signs in its arguments, so %%26 arrived at the gate as 6.
    rem Doubling every percent first hands the gate the arg as cmd received it, and a
    rem percent sign then fails the gate. A %%NAME%% pair is expanded by cmd itself
    rem before this file runs; nothing here can see it, the resolver re-validates.
    set "arg=!arg:%%=%%%%!"
    rem NO :decode here — the launch arg must stay an opaque token. Decoding would
    rem turn percent-encoded shell metacharacters (%22 %26 ...) into live chars;
    rem leaving them inert lets verb_launch's strict alnum gate reject them.
    call :verb_launch "!arg!"
    exit /b !errorlevel!
)
if "!url:~0,5!"=="desk/" (
    set "arg=!url:~5!"
    rem NO :decode, and percents doubled before CALL, both for the reasons given at launch/.
    set "arg=!arg:%%=%%%%!"
    call :verb_desk "!arg!"
    exit /b !errorlevel!
)
if "!url:~0,5!"=="file/" (
    set "arg=!url:~5!"
    call :decode arg
    call :verb_file "!arg!"
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
if /I "!url!"=="backlogwave" (
    call :verb_backlogwave
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
:: SECURITY (Level-1): only directories are safe to open via URI.
:: Batch idiom: `exist "path\"` (trailing backslash) resolves only if path is a
:: directory — files, including executables, never match. This makes the "URI
:: hands a .bat/.exe to explorer → OS runs it" path UNREPRESENTABLE; no
:: extension denylist is needed or used (denylist has gaps; directory-only does not).
::   2026-09-25: the trailing-backslash test alone is NOT enough on Box Drive, whose
::   virtual filesystem answers it true for FILES (measured: open/.../build_penultimate.py
::   reached explorer.exe). The attribute check below is the gate that holds everywhere.
set "attr="
for %%A in ("!target!") do set "attr=%%~aA"
if /I not "!attr:~0,1!"=="d" set "attr="
if not defined attr (
    call :fail "open: refused — target is not a directory: !target!"
    exit /b 1
)
if not exist "!target!\" (
    call :fail "open: refused — target is not a directory: !target!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN open: "%SystemRoot%\explorer.exe" "!target!"
    exit /b 0
)
"%SystemRoot%\explorer.exe" "!target!"
exit /b 0


:: ── :verb_file <path> ── open ONE document in its default app ───────────────
:: Added 2026-09-25 (Nick: desk buttons should open the file itself). Three gates,
:: all allowlists, no denylist: (1) the resolved full path must sit inside
:: %USERPROFILE%\Box\ ; (2) it must be an existing FILE (a directory is refused);
:: (3) its extension must be exactly .docx, .pdf or .xlsx. Macro-bearing (.docm,
:: .xlsm) and executable types never match, so the URI still cannot run code.
:verb_file
set "target=%~f1"
set "ext=%~x1"
set "boxroot=%USERPROFILE%\Box\"
set "ok="
::   The Box root can only occur at the start of a valid path (a colon is illegal
::   later), so "contains" is a prefix test. No pipe: a piped echo loses delayed expansion.
if /I not "!target:%boxroot%=!"=="!target!" set "ok=1"
if not defined ok (
    call :fail "file: refused, outside Box: !target!"
    exit /b 1
)
if not exist "!target!" (
    call :fail "File not found: !target!"
    exit /b 1
)
::   Directory test by attribute: on Box Drive's virtual filesystem the usual
::   exist "path\" idiom reports FILES as directories too (measured 2026-09-25).
set "attr="
for %%A in ("!target!") do set "attr=%%~aA"
if /I "!attr:~0,1!"=="d" (
    call :fail "file: refused, target is a directory: !target!"
    exit /b 1
)
set "extok="
for %%X in (.docx .pdf .xlsx) do if /I "!ext!"=="%%X" set "extok=1"
if not defined extok (
    call :fail "file: refused, only .docx .pdf .xlsx: !target!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN file: start "" "!target!"
    exit /b 0
)
start "" "!target!"
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


:: ── :verb_desk <slug>/<desk-name> ── start a session on a working desk ────────
:: Fired by a desk's grey "Start a Claude session on this desk" link (PB
:: working-desk-artifact skill, 2026-10-09). SECURITY: same model as launch/.
:: The arg is an IDENTIFIER, never text or a path: a project slug and a desk file
:: stem. resolve_launch.py (desk mode) refuses unless that names an existing
:: Projects\<slug>\artifacts\<desk>.html in PB, builds the seed only from that
:: git-tracked desk and its .cards.json manifest, then mints + claims a normal
:: launch over the authenticated channel. Charset gate below is coarse (findstr's
:: [a-z] follows collation and also takes most capitals); the resolver's Python
:: regex is the strict one. Unlike launch/, a refusal is LOUD: the resolver exits
:: 1 (and raises a Windows balloon) and :fail shows the reason here.
:verb_desk
echo "%~1"| findstr /R /C:"^.[a-z0-9][a-z0-9-]*/[A-Za-z0-9_-][A-Za-z0-9_-]*.$" >nul
if errorlevel 1 (
    call :fail "desk: refused — not a <slug>/<desk-name> ref: %~1"
    exit /b 1
)
set "resolver=%USERPROFILE%\Peripheral-Brain\scripts\utils\resolve_launch.py"
if not exist "!resolver!" (
    call :fail "desk: resolver not found at !resolver!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN desk: python -X utf8 "!resolver!" desk "%~1"
    exit /b 0
)
python -X utf8 "!resolver!" desk "%~1"
if errorlevel 1 (
    call :fail "desk: could not start a session — see %TEMP%\pb-resolve-launch.log"
    exit /b 1
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


:: ── :verb_backlogwave ── run the sibling backlog-wave.bat ────────────────────
:: SECURITY: identical model to :verb_bugsquash — the only thing this verb runs
:: is the literal sibling file "%~dp0backlog-wave.bat". Refuses if it doesn't
:: exist. No path argument is taken — nothing arbitrary is reachable.
::
:: NOTE the /D difference from bugsquash: this one works the Peripheral-Brain
:: backlog, so the spawned window starts in PB, not this repo. The .bat cd's
:: there itself and refuses if PB is missing; /D just matches so the window
:: title and any relative path a human types land in the right tree.
:verb_backlogwave
set "bw=%~dp0backlog-wave.bat"
if not exist "!bw!" (
    call :fail "backlogwave: backlog-wave.bat not found at !bw!"
    exit /b 1
)
if defined MNCCORE_HANDLER_DRYRUN (
    echo DRYRUN backlogwave: start "" /D "%USERPROFILE%\Peripheral-Brain" "!bw!"
    exit /b 0
)
start "" /D "%USERPROFILE%\Peripheral-Brain" "!bw!"
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
:: SECURITY (2026-10-09): the message carries URL text, and an `echo %~1` line is
:: parsed AFTER %~1 is substituted, so an `&` or `|` from the URL ran as a second
:: command (proven: mnccore://zzz/x&echo PWNED>file wrote the file through the
:: registered handler). The quoted `set` keeps & and | literal, and a !var!
:: expansion happens after the parser has already split commands, so the
:: echo can only ever print the text.
:fail
set "failmsg=%~1"
echo(!failmsg!
>>"%TEMP%\mnccore-handler.log" echo(%date% %time% FAIL: !failmsg!
:: Brief pause so a double-click / protocol-spawned window is readable. Skip the
:: pause under dry-run (tests are non-interactive).
if not defined MNCCORE_HANDLER_DRYRUN (
    timeout /t 3 /nobreak >nul 2>&1
)
exit /b 1
