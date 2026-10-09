"""register_mnccore_protocol.py -- point mnccore:// (HKCU) at the Python handler.

    python scripts\\register_mnccore_protocol.py                  show current + proposed, change nothing
    python scripts\\register_mnccore_protocol.py --apply          register the Python handler
    python scripts\\register_mnccore_protocol.py --revert-to-bat  register the deprecated .bat again (rollback)
    python scripts\\register_mnccore_protocol.py --print-command  print the Python-form command only (tests)

Every path is derived, nothing is hardcoded: the handler is the mnccore_handler.py
beside this file, and the interpreter is the pythonw.exe beside the python you run
this with. Run it with the same `python` the handlers have always used (the one on
PATH), from the main checkout, on each laptop. No admin: HKCU only. Writes through
winreg, so no reg.exe or shell is involved. Prints the old and new value and reads
the new one back. Restart the browser afterwards.

Supersedes scripts\\setup-mnccore-protocol.bat (which registers the .bat).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
HANDLER_PY = HERE / "mnccore_handler.py"
HANDLER_BAT = HERE / "mnccore-handler.bat"
KEY = r"Software\Classes\mnccore"
COMMAND_KEY = KEY + r"\shell\open\command"


def python_command() -> str:
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    if not pythonw.is_file():
        raise SystemExit(f"ERROR: no pythonw.exe beside {sys.executable}")
    if not Path(sys.executable).with_name("python.exe").is_file():
        raise SystemExit(f"ERROR: no python.exe beside {sys.executable} (the handler runs the resolver with it)")
    if not HANDLER_PY.is_file():
        raise SystemExit(f"ERROR: handler not found: {HANDLER_PY}")
    return f'"{pythonw}" -I "{HANDLER_PY}" "%1"'


def bat_command() -> str:
    if not HANDLER_BAT.is_file():
        raise SystemExit(f"ERROR: rollback handler not found: {HANDLER_BAT}")
    return f'"{HANDLER_BAT}" "%1"'


def read_command() -> "str | None":
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, COMMAND_KEY) as k:
            return winreg.QueryValueEx(k, "")[0]
    except FileNotFoundError:
        return None


def write(command: str) -> None:
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, KEY) as k:
        winreg.SetValueEx(k, "", 0, winreg.REG_SZ, "URL:MN-CCORE Protocol")
        winreg.SetValueEx(k, "URL Protocol", 0, winreg.REG_SZ, "")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, COMMAND_KEY) as k:
        winreg.SetValueEx(k, "", 0, winreg.REG_SZ, command)


def main(argv: "list[str] | None" = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--apply", action="store_true", help="register the Python handler")
    g.add_argument("--revert-to-bat", action="store_true", help="register the deprecated .bat (rollback)")
    g.add_argument("--print-command", action="store_true", help="print the Python-form command and exit")
    args = p.parse_args(argv)

    if args.print_command:
        print(python_command())
        return 0

    if (args.apply or args.revert_to_bat) and ".claude" in HERE.parts and "worktrees" in HERE.parts:
        print(f"ERROR: {HERE} is a git worktree, which gets deleted. Run this from the main checkout.")
        return 1

    new = bat_command() if args.revert_to_bat else python_command()
    old = read_command()
    print(f"HKCU\\{COMMAND_KEY}")
    print(f"  current : {old if old is not None else '(not registered)'}")
    print(f"  {'new     ' if (args.apply or args.revert_to_bat) else 'proposed'}: {new}")
    if not (args.apply or args.revert_to_bat):
        print("Nothing changed. Re-run with --apply (or --revert-to-bat).")
        return 0
    write(new)
    back = read_command()
    if back != new:
        print(f"ERROR: read back {back!r}, expected {new!r}")
        return 1
    print("  read back matches. Restart the browser, then test: mnccore://process")
    return 0


if __name__ == "__main__":
    sys.exit(main())
