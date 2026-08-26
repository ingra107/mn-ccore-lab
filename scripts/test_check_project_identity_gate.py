"""Unit test for check-project-identity-gate.py::d1_query error surfacing.

PB backlog #2231 (2026-08-26): `npm run deploy:pages:gated` aborted twice with
`::error::Project-identity gate could not run: wrangler d1 failed:` and NOTHING
after the colon. Root cause: `wrangler d1 execute --json` writes its error  wrangler-d1-allowed
PAYLOAD to STDOUT, not stderr (same shape already fixed once in this repo --
scripts/wrangler_d1.py::WranglerD1Error, PB backlog #416, commit a4cfd466) --
and d1_query's error message only ever read `proc.stderr`. This test locks in
that a non-zero exit with empty stderr but a populated stdout (the observed
shape) produces a message that actually contains that stdout content, and that
a genuinely empty stderr+stdout pair says so explicitly rather than rendering
as a bare, contentless string.

The script's filename uses hyphens (matches its CLI-invocation convention,
`python3 scripts/check-project-identity-gate.py`), so it is not an importable
module name -- load it by file path with importlib, same approach the script
itself uses for nothing (it has no internal cross-imports), keeping this test
self-contained and dependency-free like the script it covers.
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

_MODULE_PATH = Path(__file__).resolve().parent / "check-project-identity-gate.py"
_spec = importlib.util.spec_from_file_location(
    "check_project_identity_gate", _MODULE_PATH
)
gate = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = gate
_spec.loader.exec_module(gate)


def _fake_completed(returncode: int, stdout: str, stderr: str) -> SimpleNamespace:
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


def test_d1_query_surfaces_stdout_when_stderr_is_empty(monkeypatch):
    """The observed #2231 shape: nonzero exit, EMPTY stderr, error payload on
    stdout (wrangler --json routing). The raised message must contain the
    stdout payload, not render as empty after the colon."""
    monkeypatch.setattr(gate, "_wrangler_cmd", lambda: ["wrangler.cmd"])
    monkeypatch.setattr(gate, "_d1_env", lambda: {})
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *a, **k: _fake_completed(
            1, stdout='{"error":"D1_ERROR: too many requests"}', stderr=""
        ),
    )
    with pytest.raises(RuntimeError) as exc_info:
        gate.d1_query("SELECT 1")
    msg = str(exc_info.value)
    assert "D1_ERROR: too many requests" in msg, (
        f"stdout-routed error payload missing from message: {msg!r}"
    )
    assert "exited 1" in msg


def test_d1_query_states_explicitly_when_both_streams_empty(monkeypatch):
    """If wrangler truly produces neither stream, the message must say so --
    never a bare 'wrangler d1 failed: ' with nothing after the colon."""
    monkeypatch.setattr(gate, "_wrangler_cmd", lambda: ["wrangler.cmd"])
    monkeypatch.setattr(gate, "_d1_env", lambda: {})
    monkeypatch.setattr(
        subprocess, "run", lambda *a, **k: _fake_completed(1, stdout="", stderr="")
    )
    with pytest.raises(RuntimeError) as exc_info:
        gate.d1_query("SELECT 1")
    msg = str(exc_info.value)
    assert "no stderr or stdout captured" in msg
    assert msg.strip() != "wrangler d1 failed:"


def test_d1_query_still_surfaces_stderr_when_present(monkeypatch):
    """Regression guard: the common (non-empty-stderr) case is unchanged."""
    monkeypatch.setattr(gate, "_wrangler_cmd", lambda: ["wrangler.cmd"])
    monkeypatch.setattr(gate, "_d1_env", lambda: {})
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *a, **k: _fake_completed(7403, stdout="", stderr="Authentication error"),
    )
    with pytest.raises(RuntimeError) as exc_info:
        gate.d1_query("SELECT 1")
    msg = str(exc_info.value)
    assert "Authentication error" in msg
    assert "exited 7403" in msg
