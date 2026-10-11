Archived 2026-10-11 (s51 dead-weight lane). The old installers for the mnccore:// URL handler. Both registered the deprecated scripts/mnccore-handler.bat. The .reg hardcoded C:\Users\ingra107, wrong on the HOME laptop.

Proof: on WORK, HKCU\Software\Classes\mnccore\shell\open\command runs pythonw.exe scripts\mnccore_handler.py. The rollback, `python scripts\register_mnccore_protocol.py --revert-to-bat`, builds its command from HANDLER_BAT inside that script and never reads either installer. Not seen: HOME's registry (it does not change the rollback).

scripts/mnccore-handler.bat stays until its one-release rollback window closes.
