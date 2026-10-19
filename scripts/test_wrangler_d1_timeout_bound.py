"""wrangler_d1._run_once: the timeout bounds the call and kills the whole tree.

The bug (2026-10-18, home): `subprocess.run(capture_output=True, timeout=120)`
on `wrangler.cmd` took ~480 s to fail. On expiry run() killed only the .cmd's
cmd.exe, then drained the pipes with no timeout while the node grandchild still
held them. This test runs the REAL _run_once against a .cmd that starts a
pipe-holding, long-sleeping grandchild -- the same process shape as
wrangler.cmd -> node -- with no stubbed seam.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wrangler_d1  # noqa: E402

pytestmark = pytest.mark.skipif(
    os.name != "nt", reason="the .cmd -> grandchild pipe hold is the Windows shape")

SLEEP_S = 40
TIMEOUT_S = 3


def _alive(pid: int) -> bool:
    out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                         capture_output=True, text=True).stdout
    return str(pid) in out


def test_timeout_fires_on_time_and_leaves_no_orphan(tmp_path):
    pid_file = tmp_path / "grandchild.pid"
    child = (
        "import os,time,pathlib;"
        f"pathlib.Path(r'{pid_file}').write_text(str(os.getpid()));"
        "print('partial-marker', flush=True);"
        f"time.sleep({SLEEP_S})"
    )
    script = tmp_path / "fake-wrangler.cmd"
    script.write_text(f'@echo off\r\n"{sys.executable}" -c "{child}"\r\n')

    t0 = time.monotonic()
    with pytest.raises(subprocess.TimeoutExpired) as exc:
        wrangler_d1._run_once([str(script)], TIMEOUT_S)
    wall = time.monotonic() - t0

    # Before the fix this was ~SLEEP_S (the grandchild's whole life).
    assert wall < TIMEOUT_S + 15, f"timeout={TIMEOUT_S}s took {wall:.1f}s"
    assert "partial-marker" in (exc.value.stdout or "")

    pid = int(pid_file.read_text())
    deadline = time.monotonic() + 5
    while _alive(pid) and time.monotonic() < deadline:
        time.sleep(0.2)
    assert not _alive(pid), f"grandchild {pid} survived the timeout"


def test_normal_exit_returns_output_and_code(tmp_path):
    script = tmp_path / "fake-wrangler.cmd"
    script.write_text(
        f'@echo off\r\n"{sys.executable}" -c "import sys;'
        "print('out-ok');print('err-ok',file=sys.stderr);sys.exit(3)\"\r\n"
        "exit /b %ERRORLEVEL%\r\n")
    proc = wrangler_d1._run_once([str(script)], 30)
    assert proc.returncode == 3
    assert "out-ok" in proc.stdout
    assert "err-ok" in proc.stderr
