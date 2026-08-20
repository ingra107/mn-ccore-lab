@echo off
setlocal
echo %date% %time% backlog-wave launched >> "%TEMP%\backlog-wave.log"

:: ============================================================================
:: Backlog Wave — opens a Claude Code session in Peripheral Brain that works
:: the improvement backlog autonomously: picks disjoint-file-set rows, fans out
:: fable agents with the cold re-judge block, pairs codex on the hard ones,
:: lands the work, writes the row statuses, and closes the session.
::
:: Invoked by:
::   - mnccore://backlogwave  (scripts\mnccore-handler.bat -> this file)
::   - the Command Palette "Backlog Wave" entry (PI-only, fires that URI)
::   - direct double-click
::
:: Sibling of bug-squasher.bat and deliberately shaped the same way, with ONE
:: difference that matters: Bug Squasher inlines its whole prompt into the
:: `claude` argument, where batch quoting makes it painful to edit and
:: impossible to version review. This one invokes a SKILL instead
:: (.claude/skills/backlog-wave/SKILL.md in Peripheral-Brain), so the protocol
:: — which models to use, how to compose a wave, what may not ship without
:: Nick — lives in a reviewed file in git rather than in escaped quotes here.
:: Change the protocol by editing the skill; this launcher should not need to
:: change again.
::
:: Runs against Peripheral-Brain, NOT this repo — the backlog and the wave
:: playbook both live there. That is why it cd's away from %~dp0.. instead of
:: to it.
:: ============================================================================

set "PB=%USERPROFILE%\Peripheral-Brain"

if not exist "%PB%\Docs\improvement-backlog.md" (
    echo Peripheral-Brain not found at "%PB%" ^(or the backlog file is missing^).
    echo Nothing to work on — aborting.
    echo %date% %time% FAIL: no backlog at %PB% >> "%TEMP%\backlog-wave.log"
    pause
    goto :eof
)

cd /d "%PB%"

echo === Backlog Wave ===
echo Repo: %CD%
echo Launching Claude Code to work the backlog autonomously...
echo.
echo This runs unattended: two waves of agents, codex on the hard rows, then a
echo session close. You do not need to answer anything. Anything that cannot
echo ship without you comes back as a written plan.
echo.

claude "/backlog-wave"

echo.
pause
goto :eof
