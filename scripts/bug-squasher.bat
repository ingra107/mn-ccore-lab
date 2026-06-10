@echo off
setlocal
echo %date% %time% bug-squasher launched >> "%TEMP%\bug-squasher.log"

:: ============================================================================
:: Bug Squasher — opens a Claude Code session that works through every OPEN
:: bug report filed via the Hub's /api/bug-report and gets after them.
::
:: Invoked by:
::   - mnccore://bugsquash  (scripts\mnccore-handler.bat -> this file)
::   - the Command Palette "Bug Squasher" entry (PI-only, fires that URI)
::   - direct double-click
::
:: Mirrors the PB launcher pattern (Quick_Process.bat): cd to the repo root,
:: then `claude "<initial prompt>"`. Runs on the machine Nick is sitting at.
::
:: PB_API_KEY is a system env var on Nick's machines (the Bearer key the Hub's
:: PI/API-key gated /api/bug-reports endpoints check against env.PB_API_KEY).
:: ============================================================================

:: Repo root = parent of this scripts\ dir.
cd /d "%~dp0.."

if "%PB_API_KEY%"=="" (
    echo PB_API_KEY is not set in this environment — cannot fetch the bug queue.
    echo Set PB_API_KEY ^(system env var^) and re-run.
    echo %date% %time% FAIL: PB_API_KEY unset >> "%TEMP%\bug-squasher.log"
    pause
    goto :eof
)

echo === Bug Squasher ===
echo Repo: %CD%
echo Launching Claude Code session to work through open bug reports...
echo.

claude "You are the Bug Squasher for the MN-CCORE Lab Hub. Read SESSION-HANDOFF.md and CLAUDE.md FIRST (in that order). Fetch the open bug reports: curl -s -H \"Authorization: Bearer %PB_API_KEY%\" https://mn-ccore-lab.pages.dev/api/bug-reports?status=open — each row has id, description, page_url, viewport, theme, issue_number, issue_url. Work through each bug one at a time: reproduce and diagnose it (use the page_url + viewport + theme to match the report), fix it, then commit path-explicit (git add the specific paths, then git commit -F a message file -- those paths; author ingra107, NO Claude attribution, no Co-Authored-By). After each fix lands, mark that bug resolved: curl -s -X POST -H \"Authorization: Bearer %PB_API_KEY%\" -H \"Content-Type: application/json\" -d \"{\\\"status\\\":\\\"resolved\\\"}\" https://mn-ccore-lab.pages.dev/api/bug-reports/<id>/status (use 'dismissed' instead if a bug is invalid or not reproducible — explain why). Run npx tsc -b --noEmit and npm run build before declaring any fix done; run npm run test:api for any api change. When all bugs are handled, if fixes shipped, deploy with npm run deploy:pages:gated, then present a summary of what was fixed, dismissed, and deployed."
echo.
pause
goto :eof
