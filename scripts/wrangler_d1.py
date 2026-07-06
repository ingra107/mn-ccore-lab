"""wrangler_d1.py — THE sanctioned programmatic wrangler entry point.

WHY THIS EXISTS
---------------
`secrets.ps1` exports CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID into the
shell. That token is scoped for Pages deploys and lacks D1 scope. When both
env vars are present, wrangler prefers them over the OAuth credentials at
~/.wrangler/config/default.toml (which DO have `d1 (write)` scope). The result
is a 401 / 403 / 7403 / "Authentication error code 10000" on any `wrangler d1`
call — misdiagnosed as "blocked" four times across sessions despite a standing
memory rule. This module makes the strip structural, not remembered.

It is the Python twin of the `scripts/wrangler-d1` shell shim. Both ALWAYS
strip the two env vars and run wrangler from the Hub repo root (so the
repo-local wrangler@^4 devDependency resolves).

PUBLIC API
----------
    run_d1(args, *, db='mnccore-lab', remote=True, json=False, timeout=120,
           command=None, file=None)
        Run a `wrangler d1 <args>` invocation with env stripped. Returns a
        WranglerResult (stdout/stderr/returncode + parsed `.json` when json=True).
        Raises WranglerD1Error on non-zero exit.

    run_wrangler(argv, *, timeout=120)
        Lower-level: run `wrangler <argv...>` with env stripped. Used for
        non-d1 subcommands (whoami, etc.).

Memory rule cross-reference:
  ~/.claude/.../memory/feedback_wrangler-home-auth-works.md
Team-guide cross-reference: CLAUDE.md "Wrangler / D1 auth" section.

DO NOT call `npx wrangler d1 ...` raw from Python anywhere. Import this.
"""
from __future__ import annotations

import json as _json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

# D1 database is `mnccore-lab` (no dash); repo dir is `mn-ccore-lab`.
DEFAULT_DB = os.environ.get("PB_D1_DATABASE", "mnccore-lab")

# The env vars that shadow OAuth and must be stripped before every wrangler run.
_SHADOWING_ENV = ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")


class WranglerD1Error(RuntimeError):
    """Raised when a wrangler invocation exits non-zero."""

    def __init__(self, returncode: int, stderr: str, cmd: Sequence[str],
                 stdout: str = ""):
        self.returncode = returncode
        self.stderr = stderr
        self.stdout = stdout
        self.cmd = list(cmd)
        # `wrangler d1 execute --json` writes its error PAYLOAD to STDOUT, not
        # stderr — on a transient CF flake stderr is often empty, so a
        # stderr-only message was a bare "wrangler exited 1:" with zero
        # diagnostic (the 2026-06-30 + 07-02 activity-gardener crashes; PB
        # backlog #416). Include a stdout tail too so the actual error text
        # survives. stderr-present behavior is unchanged (stdout defaults empty).
        detail = (stderr or "").strip()
        out = (stdout or "").strip()
        if out:
            detail = f"{detail} | stdout: {out}" if detail else f"stdout: {out}"
        super().__init__(
            f"wrangler exited {returncode}: {detail[-2000:]}"
        )


@dataclass
class WranglerResult:
    returncode: int
    stdout: str
    stderr: str
    json: Any = None  # parsed when run_d1(..., json=True)


def _repo_root() -> Path:
    """Hub repo root — this file lives at <root>/scripts/wrangler_d1.py."""
    return Path(__file__).resolve().parent.parent


def _wrangler_cmd() -> list[str]:
    """Resolve a working wrangler invocation, preferring the Hub repo's
    repo-local node_modules (matches the deployed version) before PATH/npx.
    Mirrors scripts/db/backup_d1.py::_wrangler_cmd in PB."""
    root = _repo_root()
    for name in ("wrangler.cmd", "wrangler"):
        cand = root / "node_modules" / ".bin" / name
        if cand.exists():
            return [str(cand)]
    for exe in ("wrangler.cmd", "wrangler"):
        if path := shutil.which(exe):
            return [path]
    for exe in ("npx.cmd", "npx"):
        if path := shutil.which(exe):
            return [path, "wrangler"]
    raise RuntimeError(
        "Neither wrangler nor npx found on PATH or mn-ccore-lab/node_modules"
    )


def _stripped_env() -> dict[str, str]:
    env = os.environ.copy()
    for var in _SHADOWING_ENV:
        env.pop(var, None)  # no-op when absent
    return env


def run_wrangler(argv: Sequence[str], *, timeout: int = 120) -> WranglerResult:
    """Run `wrangler <argv...>` from the Hub repo root with CF env stripped.

    THE STRIP is unconditional — env may or may not be set; after this wrangler
    always uses OAuth.
    """
    cmd = _wrangler_cmd() + list(argv)
    proc = subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        timeout=timeout,
        env=_stripped_env(),
        cwd=str(_repo_root()),
    )
    if proc.returncode != 0:
        raise WranglerD1Error(proc.returncode, proc.stderr, cmd,
                              stdout=proc.stdout)
    return WranglerResult(proc.returncode, proc.stdout, proc.stderr)


def run_d1(
    args: Sequence[str] | None = None,
    *,
    db: str = DEFAULT_DB,
    remote: bool = True,
    json: bool = False,
    timeout: int = 120,
    command: str | None = None,
    file: str | None = None,
) -> WranglerResult:
    """Run a `wrangler d1 <args>` invocation with env stripped.

    Convenience: pass command= for `--command "<sql>"` or file= for
    `--file=<path>`. `args` may carry the d1 subcommand + extra flags;
    defaults to `['execute', <db>]` when omitted (the common case).

    Returns a WranglerResult. When json=True, `--json` is appended and the
    stdout is parsed into `.json`.
    """
    argv: list[str] = ["d1"]
    if args:
        argv += list(args)
    else:
        argv += ["execute", db]
    if remote and "--remote" not in argv:
        argv.append("--remote")
    if json and "--json" not in argv:
        argv.append("--json")
    if command is not None:
        argv += ["--command", command]
    if file is not None:
        argv.append(f"--file={file}")

    result = run_wrangler(argv, timeout=timeout)
    if json:
        try:
            result.json = _json.loads(result.stdout)
        except _json.JSONDecodeError as e:
            raise WranglerD1Error(
                0, f"--json output not parseable: {e}\n{result.stdout[-2000:]}", argv
            )
    return result


if __name__ == "__main__":
    import sys

    # Deploy guard (#500, post-mortem 2026-07-06): the top level of wrangler.toml
    # is deliberately inert — a bare `deploy` would mint a binding-less scratch
    # worker, never the real one. Fail loud instead of deploying the wrong thing.
    if sys.argv[1:2] == ["deploy"] and not any(
        a in ("--env", "-e") or a.startswith(("--env=", "-e=")) for a in sys.argv[2:]
    ):
        sys.stderr.write(
            "deploy without --env is blocked: wrangler.toml's top level is inert "
            "by design (backlog #500).\nProd deploy: "
            "python scripts/wrangler_d1.py deploy --env production\n"
        )
        sys.exit(2)

    # CLI fallback: `python scripts/wrangler_d1.py d1 execute mnccore-lab ...`
    # mirrors the shell shim. Prefer the shell shim for command-line use.
    res = run_wrangler(sys.argv[1:])
    if res.stdout:
        sys.stdout.write(res.stdout)
    if res.stderr:
        sys.stderr.write(res.stderr)
    sys.exit(res.returncode)
