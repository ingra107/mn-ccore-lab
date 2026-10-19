"""wrangler_d1._wrangler_cmd never falls back to `npx wrangler`, and walks
ancestor node_modules/.bin the way Node does (both 2026-10-18).

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


# --- Ancestor walk (2026-10-18) ---------------------------------------------
# A Hub worktree at ~/mn-ccore-lab-wt/<name> has no node_modules of its own; a
# junction at ~/mn-ccore-lab-wt/node_modules serves it, the way Node resolves
# packages. resolve_wrangler walks up from the repo root, nearest first.

_gate_path = HERE / "check-project-identity-gate.py"
_gate_spec = importlib.util.spec_from_file_location("check_project_identity_gate_res", _gate_path)
gate = importlib.util.module_from_spec(_gate_spec)
sys.modules[_gate_spec.name] = gate
_gate_spec.loader.exec_module(gate)


def _nested_tree(tmp_path):
    """tmp/root/a/b/repo, with an empty repo/node_modules/.bin of its own."""
    root = tmp_path / "root"
    repo = root / "a" / "b" / "repo"
    (repo / "node_modules" / ".bin").mkdir(parents=True)
    (repo / "scripts").mkdir()
    for d in tmp_path.parents:
        if (d / "node_modules" / ".bin").exists():
            pytest.skip(f"an ancestor of tmp_path has node_modules/.bin: {d}")
    return root, repo


def _bin(d):
    b = d / "node_modules" / ".bin"
    b.mkdir(parents=True, exist_ok=True)
    (b / "wrangler.cmd").write_text("")
    return b / "wrangler.cmd"


def _no_path(monkeypatch):
    monkeypatch.setattr("shutil.which", lambda exe: None)


def test_ancestor_bin_resolves(tmp_path, monkeypatch):
    root, repo = _nested_tree(tmp_path)
    want = _bin(root)
    _no_path(monkeypatch)
    assert wrangler_d1.resolve_wrangler(repo) == [str(want)]


def test_nearest_ancestor_wins(tmp_path, monkeypatch):
    root, repo = _nested_tree(tmp_path)
    _bin(root)
    nearer = _bin(root / "a" / "b")
    _no_path(monkeypatch)
    assert wrangler_d1.resolve_wrangler(repo) == [str(nearer)]


def test_ancestor_bin_beats_path(tmp_path, monkeypatch):
    root, repo = _nested_tree(tmp_path)
    want = _bin(root)
    monkeypatch.setattr("shutil.which", lambda exe: f"/usr/bin/{exe}")
    assert wrangler_d1.resolve_wrangler(repo) == [str(want)]


def test_none_anywhere_and_no_path_raises_npm_ci(tmp_path, monkeypatch):
    _root, repo = _nested_tree(tmp_path)
    _no_path(monkeypatch)
    with pytest.raises(RuntimeError, match="npm ci"):
        wrangler_d1.resolve_wrangler(repo)


def test_identity_gate_uses_the_ancestor_walk(tmp_path, monkeypatch):
    """The gate's _wrangler_cmd resolves from its own repo root (_HERE.parent)
    through the shared resolver, so a worktree finds the junction above it."""
    root, repo = _nested_tree(tmp_path)
    want = _bin(root)
    _no_path(monkeypatch)
    monkeypatch.setattr(gate, "_HERE", repo / "scripts")
    assert gate._wrangler_cmd() == [str(want)]


def test_identity_gate_raises_npm_ci_when_missing(tmp_path, monkeypatch):
    _root, repo = _nested_tree(tmp_path)
    _no_path(monkeypatch)
    monkeypatch.setattr(gate, "_HERE", repo / "scripts")
    with pytest.raises(RuntimeError, match="npm ci"):
        gate._wrangler_cmd()
