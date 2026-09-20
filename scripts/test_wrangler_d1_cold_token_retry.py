"""The cold-OAuth-token retry in wrangler_d1.run_wrangler (PB #1293).

A wrangler process that starts on an expired OAuth access token refreshes it
and can still get ``Authentication error [code: 10000]`` on its first D1
request; the next process, reading the refreshed token, passes. ``run_wrangler``
therefore reruns the command once on that exact text. Two facts are pinned:

1. the text is looked for on BOTH streams -- ``d1 execute --json`` prints the
   error payload on STDOUT (the first deploy after the retry shipped hit exactly
   that and the stderr-only test missed it);
2. a second failure raises, with both attempts' text, so nothing is swallowed.

Run: python -m pytest scripts/test_wrangler_d1_cold_token_retry.py -q
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("wrangler_d1", HERE / "wrangler_d1.py")
wrangler_d1 = importlib.util.module_from_spec(spec)
sys.modules["wrangler_d1"] = wrangler_d1
spec.loader.exec_module(wrangler_d1)

COLD = wrangler_d1._COLD_TOKEN_ERROR


def _proc(rc: int, out: str = "", err: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=["wrangler"], returncode=rc, stdout=out, stderr=err)


def _script(monkeypatch, results):
    calls = []

    def fake_run_once(cmd, timeout):
        calls.append(list(cmd))
        return results.pop(0)

    monkeypatch.setattr(wrangler_d1, "_run_once", fake_run_once)
    monkeypatch.setattr(wrangler_d1, "_wrangler_cmd", lambda: ["wrangler"])
    return calls


def test_cold_token_on_stderr_is_retried_once(monkeypatch):
    calls = _script(monkeypatch, [_proc(1, err=f"X [ERROR] ... {COLD}"), _proc(0, out="[]")])
    res = wrangler_d1.run_wrangler(["d1", "insights", "db"])
    assert res.returncode == 0 and res.stdout == "[]"
    assert len(calls) == 2
    assert "[wrangler_d1] attempt 1 hit" in res.stderr


def test_cold_token_on_stdout_json_is_retried_once(monkeypatch):
    payload = '{"error": {"notes": [{"text": "%s"}], "kind": "error"}}' % COLD
    calls = _script(monkeypatch, [_proc(1, out=payload), _proc(0, out='{"success": true}')])
    res = wrangler_d1.run_wrangler(["d1", "execute", "db", "--json", "--command", "select 1"])
    assert res.returncode == 0
    assert len(calls) == 2


def test_second_failure_raises_with_both_attempts(monkeypatch):
    calls = _script(monkeypatch, [_proc(1, err=COLD), _proc(1, err="still refused")])
    with pytest.raises(wrangler_d1.WranglerD1Error) as ei:
        wrangler_d1.run_wrangler(["d1", "insights", "db"])
    assert len(calls) == 2
    assert "still refused" in str(ei.value) and COLD in str(ei.value)


def test_other_failures_are_not_retried(monkeypatch):
    calls = _script(monkeypatch, [_proc(1, err="Couldn't find DB with name 'x'")])
    with pytest.raises(wrangler_d1.WranglerD1Error):
        wrangler_d1.run_wrangler(["d1", "insights", "x"])
    assert len(calls) == 1
