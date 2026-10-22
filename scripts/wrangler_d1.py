"""wrangler_d1.py — THE sanctioned programmatic wrangler entry point.

WHY THIS EXISTS
---------------
The Pages-deploy token lacks D1 scope. When it sits in the env as
CLOUDFLARE_API_TOKEN (or the legacy CF_API_TOKEN), wrangler prefers it over
the OAuth credentials at ~/.wrangler/config/default.toml (which DO have
`d1 (write)` scope), and any `wrangler d1` call fails 401 / 403 / 7403 /
"Authentication error code 10000" — misdiagnosed as "blocked" eight times.
secrets.ps1 exported it under that name until 2026-08-02; it now exports
PB_CLOUDFLARE_PAGES_API_TOKEN (PB #884), but any shell can still carry the
reserved name. This module makes the strip structural, not remembered.

It is the Python twin of the `scripts/wrangler-d1` shell shim. Both ALWAYS
strip the same token, key and account variables and run wrangler from the Hub
repo root (so the repo-local wrangler@^4 devDependency resolves).

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
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

# D1 database is `mnccore-lab` (no dash); repo dir is `mn-ccore-lab`.
DEFAULT_DB = os.environ.get("PB_D1_DATABASE", "mnccore-lab")

# The env vars that shadow OAuth and must be stripped before every wrangler run.
# Same list as scripts/wrangler-d1's unsets; the legacy CF_* names joined the
# shim on 2026-10-19 (509e29de) after one of them shadowed OAuth there.
_SHADOWING_ENV = ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
                  "CF_API_TOKEN", "CF_API_KEY", "CF_ACCOUNT_ID", "CLOUDFLARE_API_KEY")


def format_wrangler_error(returncode: int, stdout: str | None,
                          stderr: str | None, *, limit: int = 2000) -> str:
    """The ONE message shape for a non-zero wrangler exit (PB backlog #2288).

    `wrangler d1 execute --json` writes its error PAYLOAD to STDOUT, not
    stderr -- on a transient CF flake stderr is often empty, so a stderr-only
    message rendered as a bare "wrangler exited 1:" with zero diagnostic. That
    shape was fixed twice, independently: here (the 2026-06-30 + 07-02
    activity-gardener crashes, PB backlog #416, a4cfd466) and in
    check-project-identity-gate.py::d1_query (PB backlog #2231), and the two
    copies had already drifted (only the gate said so when BOTH streams were
    empty). Both now call this. It formats only: env-stripping stays with each
    caller, because the gate's is CI-conditional and this module's is not.
    """
    detail = (stderr or "").strip()
    out = (stdout or "").strip()
    if out:
        detail = f"{detail} | stdout: {out}" if detail else f"stdout: {out}"
    if not detail:
        detail = "(no stderr or stdout captured)"
    return f"wrangler exited {returncode}: {detail[-limit:]}"


class WranglerD1Error(RuntimeError):
    """Raised when a wrangler invocation exits non-zero."""

    def __init__(self, returncode: int, stderr: str, cmd: Sequence[str],
                 stdout: str = ""):
        self.returncode = returncode
        self.stderr = stderr
        self.stdout = stdout
        self.cmd = list(cmd)
        super().__init__(format_wrangler_error(returncode, stdout, stderr))


@dataclass
class WranglerResult:
    returncode: int
    stdout: str
    stderr: str
    json: Any = None  # parsed when run_d1(..., json=True)


def _repo_root() -> Path:
    """Hub repo root — this file lives at <root>/scripts/wrangler_d1.py."""
    return Path(__file__).resolve().parent.parent


def resolve_wrangler(root: Path) -> list[str]:
    """Resolve wrangler for the Hub checkout at `root`: the nearest
    node_modules/.bin/wrangler at `root` or any ANCESTOR of it (the pinned
    version the Hub deploys with), else an explicit global install on PATH
    (CI). The single resolver: scripts/check-project-identity-gate.py's
    _wrangler_cmd calls it too (that script already imports this stdlib-only
    module, so sharing adds no import cycle).

    Ancestor walk (2026-10-18): Node resolves packages by walking up from the
    working directory, and `npm exec` puts every ancestor node_modules/.bin on
    PATH. A Hub worktree under ~/mn-ccore-lab-wt/<name> has no node_modules of
    its own; a junction at ~/mn-ccore-lab-wt/node_modules serves it. Looking
    only at <root>/node_modules made a direct call from a worktree raise
    "wrangler is not installed" while `npm exec` from the same tree worked.
    Walking up applies Node's rule, nearest directory first.

    NO `npx wrangler` fallback (removed 2026-10-18, 4e51b1b2). With
    node_modules empty, npx went to the registry and installed an UNPINNED
    wrangler into its cache on the call path. On home 2026-10-18 that install
    outran the 120 s timeout and the activity gardener died with what looked
    like a slow D1 query (`subprocess.TimeoutExpired` on a 43-row SELECT). A
    missing install is a setup fault: fail at once and name the fix.

    PB's scripts/db/backup_d1.py::_wrangler_cmd keeps its own copy rooted at
    the MAIN Hub checkout (it runs from PB, never from a Hub worktree), so it
    needs no ancestor walk.
    """
    root = Path(root).resolve()
    for d in (root, *root.parents):
        for name in ("wrangler.cmd", "wrangler"):
            cand = d / "node_modules" / ".bin" / name
            if cand.exists():
                return [str(cand)]
    for exe in ("wrangler.cmd", "wrangler"):
        if path := shutil.which(exe):
            return [path]
    raise RuntimeError(
        f"wrangler is not installed: no node_modules/.bin/wrangler in {root}"
        " or any parent directory, and none on PATH. Run `npm ci` in the Hub"
        f" repo ({root}) to restore the pinned version. (npx is not used: it"
        " installs an unpinned wrangler on the call path.)"
    )


def _wrangler_cmd() -> list[str]:
    """wrangler for this checkout; see resolve_wrangler."""
    return resolve_wrangler(_repo_root())


def _stripped_env() -> dict[str, str]:
    env = os.environ.copy()
    for var in _SHADOWING_ENV:
        env.pop(var, None)  # no-op when absent
    return env


# The error text wrangler prints when the D1 API rejects the bearer token.
_COLD_TOKEN_ERROR = "Authentication error [code: 10000]"


def is_cold_token_failure(returncode: int, stdout: str | None, stderr: str | None) -> bool:
    """True for the one failure worth a rerun: the cold-OAuth-token 401.

    Looked for on BOTH streams -- `--json` commands print the error payload on
    stdout. Shared with scripts/check-project-identity-gate.py so the gate and
    run_wrangler cannot drift on what counts as cold (PB #1293).
    """
    return returncode != 0 and _COLD_TOKEN_ERROR in ((stderr or "") + (stdout or ""))


# Seconds allowed to each kill step (taskkill, then the reap) after a timeout.
_KILL_GRACE_S = 30


def _kill_tree(pid: int) -> None:
    """Kill `pid` and its descendants. On Windows `Popen.kill` ends only the
    direct child (`wrangler.cmd`'s cmd.exe); the node process doing the work is
    a grandchild and survives it. POSIX wrangler is node itself (shebang), so
    the direct kill reaches the worker there."""
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/T", "/F", "/PID", str(pid)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=_KILL_GRACE_S, check=False,
        )
    else:
        try:
            os.kill(pid, 9)
        except ProcessLookupError:
            pass  # already exited between the timeout and the kill


def _run_once(cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    """Run once with a timeout that actually bounds the call.

    `subprocess.run(capture_output=True, timeout=N)` does not, on Windows: on
    expiry it kills only `wrangler.cmd`'s cmd.exe, then drains the pipes with
    no timeout while the node grandchild still holds them. Measured
    2026-10-18 with a .cmd whose child sleeps 25 s: a declared 3 s timeout
    took 25.7 s. The same night the activity gardener's 120 s call took ~480 s
    to fail. So: capture through FILES (no pipe for a grandchild to hold, so
    nothing to drain), wait with the timeout, and on expiry kill the TREE and
    re-raise TimeoutExpired carrying the partial output. Same shape as PB's
    scripts/utils/bounded_subprocess.py::run_bounded (the Hub cannot import PB).
    """
    with tempfile.TemporaryDirectory(prefix="wrangler-d1-",
                                     ignore_cleanup_errors=True) as td:
        out_path = Path(td) / "stdout.txt"
        err_path = Path(td) / "stderr.txt"

        def _read(p: Path) -> str:
            # wrangler emits UTF-8 (box-drawing chars in deploy banners);
            # without an explicit encoding Windows decodes with cp1252 and dies
            # on bytes like 0x8f (hit on the 2026-07-16 worker deploy).
            try:
                return p.read_text(encoding="utf-8", errors="replace")
            except OSError:  # a just-killed grandchild may still hold the file
                return ""

        with open(out_path, "wb") as fout, open(err_path, "wb") as ferr:
            proc = subprocess.Popen(
                cmd, stdout=fout, stderr=ferr,
                env=_stripped_env(), cwd=str(_repo_root()),
            )
            try:
                returncode = proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired as expired:
                _kill_tree(proc.pid)
                try:
                    proc.wait(timeout=_KILL_GRACE_S)
                except subprocess.TimeoutExpired:
                    proc.kill()
                raise subprocess.TimeoutExpired(
                    expired.cmd, expired.timeout,
                    output=_read(out_path), stderr=_read(err_path),
                ) from None
        return subprocess.CompletedProcess(
            cmd, returncode, stdout=_read(out_path), stderr=_read(err_path),
        )


def run_wrangler(argv: Sequence[str], *, timeout: int = 120) -> WranglerResult:
    """Run `wrangler <argv...>` from the Hub repo root with CF env stripped.

    THE STRIP is unconditional — env may or may not be set; after this wrangler
    always uses OAuth.

    COLD-TOKEN RETRY (PB backlog #1293, root-caused 2026-09-02, reproduced on
    home 2026-09-20): the OAuth access token lives 1 hour. A wrangler process
    that starts with an EXPIRED one refreshes it (writes the new token to
    config/default.toml) and then, ~400 ms later, its first D1 request is
    answered 401 -> "Authentication error [code: 10000]" -- while /user and
    /accounts calls in the same process succeed. The very next process, reading
    the refreshed token from disk, passes. So on that exact error text the
    command is run ONCE more, in a fresh process. A second failure raises with
    both attempts' text; nothing is swallowed. The env-shadow class described
    in the module docstring produces the same code 10000 but is stripped
    unconditionally above, so it cannot be what the retry is masking.
    """
    cmd = _wrangler_cmd() + list(argv)
    proc = _run_once(cmd, timeout)
    # `--json` commands (d1 execute) print the error PAYLOAD on stdout, not
    # stderr (the #416 shape) -- so the cold-token text is looked for on both.
    # Measured on the first deploy after the retry shipped: the predeploy
    # identity gate hit code 10000 on stdout and the stderr-only test missed it.
    if is_cold_token_failure(proc.returncode, proc.stdout, proc.stderr):
        first = proc
        proc = _run_once(cmd, timeout)
        if proc.returncode != 0:
            raise WranglerD1Error(
                proc.returncode,
                f"{proc.stderr}\n[cold-token retry: attempt 1 also failed]\n"
                f"{first.stderr}",
                cmd, stdout=proc.stdout,
            )
        proc.stderr = (
            f"[wrangler_d1] attempt 1 hit '{_COLD_TOKEN_ERROR}' on a cold OAuth "
            f"token; attempt 2 (refreshed token) succeeded.\n{proc.stderr or ''}"
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

    # Wrangler's output carries emoji + box-drawing chars; a cp1252 console
    # (Task Scheduler, bare python on Windows) dies re-printing them. Replace,
    # never crash — this wrapper's output is informational.
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(encoding="utf-8", errors="replace")

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
