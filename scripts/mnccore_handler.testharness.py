"""mnccore_handler.testharness.py -- run the REAL handler with the workon dialog answered.

    python -I mnccore_handler.testharness.py yes|no "<mnccore:// url>"

Test-only (scripts/mnccore_handler.test.mjs); never registered for mnccore://.
It loads mnccore_handler.py from this folder, replaces _confirm_workon (the
native Yes/No box) with the given answer, and calls the handler's own main()
with the URL as argv[1], so every refusal, the bat launch and its environment
are the shipped code. Nothing appears on screen: tests never raise a dialog on
the desktop they run on. The dialog itself is pinned by WORKON_FLAGS and
_workon_prompt, which the test reads without showing it.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in ("yes", "no"):
        print("usage: mnccore_handler.testharness.py yes|no <url>")
        return 64
    answer = sys.argv[1] == "yes"
    spec = importlib.util.spec_from_file_location("mnccore_handler", HERE / "mnccore_handler.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    asked: list[str] = []

    def confirm(folder: str) -> bool:
        asked.append(folder)
        print(f"ASKED {folder} -> {'yes' if answer else 'no'}", flush=True)
        return answer

    mod._confirm_workon = confirm
    return mod.main([str(HERE / "mnccore_handler.py"), *sys.argv[2:]])


if __name__ == "__main__":
    sys.exit(main())
