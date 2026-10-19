"""wrangler_d1._wrangler_cmd never falls back to `npx wrangler` (2026-10-18).

With the repo's node_modules empty, `npx wrangler` installed an unpinned
wrangler from the registry on the call path; on home that install outran the
120 s timeout and the activity gardener died on what read as a slow D1 SELECT.
The resolver now returns the repo-local bin or a PATH install, and otherwise
raises at once, naming `npm ci`.

Run: python -m pytest scripts/test_wrangler_d1_resolution.py -q
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("wrangler_d1", HERE / "wrangler_d1.py")
wrangler_d1 = importlib.util.module_from_spec(spec)
sys.modules["wrangler_d1"] = wrangler_d1
spec.loader.exec_module(wrangler_d1)


def _fake_root(tmp_path, monkeypatch, *, local_bin: bool):
    root = tmp_path / "hub"
    bin_dir = root / "node_modules" / ".bin"
    bin_dir.mkdir(parents=True)
    if local_bin:
        (bin_dir / "wrangler.cmd").write_text("")
    monkeypatch.setattr(wrangler_d1, "_repo_root", lambda: root)
    return root


def test_repo_local_bin_wins(tmp_path, monkeypatch):
    root = _fake_root(tmp_path, monkeypatch, local_bin=True)
    monkeypatch.setattr(wrangler_d1.shutil, "which", lambda exe: f"/usr/bin/{exe}")
    assert wrangler_d1._wrangler_cmd() == [str(root / "node_modules" / ".bin" / "wrangler.cmd")]


def test_path_install_is_used_when_no_local_bin(tmp_path, monkeypatch):
    _fake_root(tmp_path, monkeypatch, local_bin=False)
    monkeypatch.setattr(
        wrangler_d1.shutil, "which",
        lambda exe: "/usr/bin/wrangler" if exe == "wrangler" else None,
    )
    assert wrangler_d1._wrangler_cmd() == ["/usr/bin/wrangler"]


def test_npx_alone_raises_and_names_npm_ci(tmp_path, monkeypatch):
    """Only npx on PATH (the home 2026-10-18 state): refuse, never `npx wrangler`."""
    _fake_root(tmp_path, monkeypatch, local_bin=False)
    monkeypatch.setattr(
        wrangler_d1.shutil, "which",
        lambda exe: f"C:/nodejs/{exe}" if exe.startswith("npx") else None,
    )
    with pytest.raises(RuntimeError, match="npm ci"):
        wrangler_d1._wrangler_cmd()
