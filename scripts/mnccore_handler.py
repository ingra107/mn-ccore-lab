"""mnccore_handler.py -- the mnccore:// protocol handler (Windows), verb router.

Registered (HKCU\\Software\\Classes\\mnccore) by scripts/register_mnccore_protocol.py as

    "<pythonw.exe>" -I "<this file>" "%1"

Why Python and not the .bat it replaces (2026-10-09). Windows starts a .bat
handler as `cmd /c "<bat>" "%1"`, so cmd.exe parsed the URL before the batch file
ran. A URL with an unbalanced raw quote (`x"&cmd`) was split by that cmd.exe and
the tail ran as a command; a do-nothing stub .bat showed the same injection, so no
line inside the .bat could stop it (6f94a076). Browsers percent-encode `"` in a
`mnccore://host/path` URL but not in the opaque `mnccore:x` form, so the gap was
reachable. pythonw.exe is not a batch file: Windows hands the command line to it
directly and the C runtime splits it into argv. No URL character is ever read by
cmd.exe here:

  - an unbalanced quote can only split the URL into extra argv entries, and the
    handler refuses anything but exactly one argument;
  - every child is started with an argv list (or, for explorer.exe, the same
    pre-quoted command line the .bat used, see verb_open), never shell=True;
  - the .bat files the verbs run (Start Claude.bat and the fixed PB/Hub
    launchers) are started as `cmd.exe /c <fixed path>`. For workon the
    URL-derived folder goes in as the child's working directory, never as text
    cmd.exe parses.

Verbs (parity with mnccore-handler.bat, which stays one release as rollback):

  mnccore://open/<path>        Explorer-open an existing DIRECTORY (file attribute
                               check, because Box Drive answers the trailing-
                               backslash test true for files).
  mnccore://launch/<lnch_tok>  opaque launch token -> PB resolve_launch.py. Only
                               `lnch_<alnum>` passes; no decode.
  mnccore://desk/<slug>/<desk> working-desk session -> resolve_launch.py desk mode.
                               Identifier only, no decode; a resolver refusal is loud.
  mnccore://workon/<folder>    run <folder>\\Start Claude.bat with <folder> as cwd.
                               The basename is the allowlist.
  mnccore://file/<path>        open one .docx/.pdf/.xlsx under %USERPROFILE%\\Box\\.
  mnccore://process            %USERPROFILE%\\Peripheral-Brain\\Quick_Process.bat
  mnccore://quickchat          %USERPROFILE%\\Peripheral-Brain\\Quick_Chat_seeded.bat
  mnccore://bugsquash          <this dir>\\bug-squasher.bat, cwd = Hub repo root
  mnccore://backlogwave        <this dir>\\backlog-wave.bat, cwd = PB root
  mnccore://obsidian/<note>    Obsidian CLI when Obsidian runs and the CLI shim
                               exists, else the obsidian:// protocol.

Path decode (open/file/workon only): strip a leading file:/// or file://, %20 ->
space, / -> \\. Nothing else is decoded, as in the .bat.

MNCCORE_HANDLER_DRYRUN=1 prints (and logs) the resolved action instead of running
it; every existence and security check still runs. Log: %TEMP%\\mnccore-handler.log.
pythonw has no console, so a refusal is shown as a Windows balloon (the
NotifyIcon shape resolve_launch.py uses; the text travels in environment
variables, never in PowerShell source). No balloon under dry-run.

Stdlib only: the handler runs with -I (no user site, no PYTHON* variables, no
script directory on sys.path).
"""
from __future__ import annotations

import base64
import ctypes
import json
import os
import re
import subprocess
import sys
import tempfile
import traceback
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent

CREATE_NEW_CONSOLE = 0x00000010
CREATE_NO_WINDOW = 0x08000000
FILE_ATTRIBUTE_DIRECTORY = 0x10
INVALID_FILE_ATTRIBUTES = 0xFFFFFFFF

LAUNCH_TOKEN_RE = re.compile(r"lnch_[0-9A-Za-z]+", re.ASCII)
# Same pattern as PB resolve_launch.DESK_REF_RE (the strict one); the .bat's
# findstr gate was coarser and relied on the resolver for this.
DESK_REF_RE = re.compile(r"([a-z0-9][a-z0-9-]{0,99})/([A-Za-z0-9_-]{1,120})", re.ASCII)
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
FILE_EXTS = (".docx", ".pdf", ".xlsx")
START_CLAUDE = "Start Claude.bat"


class Refused(Exception):
    """A request the handler will not carry out; the message is shown and logged."""


# ── environment ──────────────────────────────────────────────────────────────

def _dryrun() -> bool:
    return bool(os.environ.get("MNCCORE_HANDLER_DRYRUN"))


def _home() -> str:
    home = os.environ.get("USERPROFILE")
    if not home:
        raise Refused("USERPROFILE is not set; cannot find Peripheral-Brain or Box")
    return home


def _system_root() -> str:
    return os.environ.get("SystemRoot") or r"C:\Windows"


def _sys32(name: str) -> str:
    return os.path.join(_system_root(), "System32", name)


def _python_exe() -> str:
    """python.exe beside the interpreter running this handler (pythonw.exe when
    registered). The resolver runs under a hidden console, like it did under the
    .bat, so its own children (git, cmd /c start) never flash a window."""
    exe = Path(sys.executable)
    cand = exe.with_name("python.exe")
    return str(cand if cand.is_file() else exe)


def _resolver() -> str:
    return os.path.join(_home(), "Peripheral-Brain", "scripts", "utils", "resolve_launch.py")


def _temp() -> str:
    return os.environ.get("TEMP") or tempfile.gettempdir()


# ── file attributes (the same Win32 call cmd's `exist` and %~a use) ───────────

def _attrs(path: str) -> "int | None":
    if os.name != "nt":
        if not os.path.exists(path):
            return None
        return FILE_ATTRIBUTE_DIRECTORY if os.path.isdir(path) else 0
    fn = ctypes.windll.kernel32.GetFileAttributesW
    fn.argtypes = [ctypes.c_wchar_p]
    fn.restype = ctypes.c_uint32
    a = fn(path)
    return None if a == INVALID_FILE_ATTRIBUTES else int(a)


def _exists(path: str) -> bool:
    return _attrs(path) is not None


def _is_dir(path: str) -> bool:
    a = _attrs(path)
    return a is not None and bool(a & FILE_ATTRIBUTE_DIRECTORY)


def _is_file(path: str) -> bool:
    a = _attrs(path)
    return a is not None and not a & FILE_ATTRIBUTE_DIRECTORY


# ── output: log, stdout (dry-run / tests), balloon ───────────────────────────

def _safe(text: str) -> str:
    """Printable form of URL-carried text: control characters become escapes."""
    return "".join(c if c.isprintable() else f"\\x{ord(c):02x}" for c in text)


def _log(msg: str) -> None:
    try:
        with open(os.path.join(_temp(), "mnccore-handler.log"), "a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")
    except OSError:
        pass  # total fallback: the exit code, stdout and the balloon still report


def _say(msg: str) -> None:
    if sys.stdout is not None:  # None under pythonw
        print(msg, flush=True)


def _toast(title: str, message: str) -> None:
    """A Windows balloon, the NotifyIcon shape resolve_launch.py uses. Non-modal;
    the text rides in environment variables, so nothing in it can become code."""
    if os.name != "nt":
        return
    ps = ("[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');"
          "$n = New-Object System.Windows.Forms.NotifyIcon;"
          "$n.Icon = [System.Drawing.SystemIcons]::Warning;"
          "$n.BalloonTipTitle = $env:MNCCORE_TOAST_TITLE; $n.BalloonTipText = $env:MNCCORE_TOAST_TEXT;"
          "$n.Visible = $true; $n.ShowBalloonTip(15000); Start-Sleep -Seconds 16; $n.Dispose()")
    encoded = base64.b64encode(ps.encode("utf-16-le")).decode("ascii")
    env = dict(os.environ, MNCCORE_TOAST_TITLE=title[:60], MNCCORE_TOAST_TEXT=message[:240])
    exe = os.path.join(_system_root(), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    try:
        subprocess.Popen([exe, "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
                          "-EncodedCommand", encoded],
                         env=env, close_fds=True, creationflags=CREATE_NO_WINDOW,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
    except OSError as e:
        _log(f"toast failed ({e}); the FAIL line above is the only trace")


def _fail(msg: str) -> int:
    text = _safe(msg)
    _say(text)
    _log(f"FAIL: {text}")
    if not _dryrun():
        _toast("mnccore:// link not opened", text)
    return 1


def _act(label: str, plan: dict, run) -> int:
    """Dry-run: print + log the plan. Otherwise log it and run it."""
    line = json.dumps(plan)
    if _dryrun():
        _say(f"DRYRUN {label}: {line}")
        _log(f"DRYRUN {label}: {line}")
        return 0
    _log(f"RUN {label}: {line}")
    rc = run()
    return 0 if rc is None else rc


# ── child processes ──────────────────────────────────────────────────────────

def _bat_argv(bat: str, cwd: str) -> "list[str]":
    """`cmd.exe /c <bat>`. When the bat sits in cwd it is named `.\\<basename>`,
    so a URL-derived folder never appears in text cmd.exe parses."""
    if os.path.normcase(os.path.dirname(bat)) == os.path.normcase(cwd.rstrip("\\")):
        bat = ".\\" + os.path.basename(bat)
    return [_sys32("cmd.exe"), "/c", bat]


def _start_bat(bat: str, cwd: str, label: str) -> int:
    argv = _bat_argv(bat, cwd)

    def run() -> int:
        subprocess.Popen(argv, cwd=cwd, close_fds=True, creationflags=CREATE_NEW_CONSOLE)
        return 0
    return _act(label, {"argv": argv, "cwd": cwd}, run)


def _startfile(target: str, label: str) -> int:
    def run() -> int:
        os.startfile(target)  # ShellExecute: the registered app, no command interpreter
        return 0
    return _act(label, {"startfile": target}, run)


# ── verbs ────────────────────────────────────────────────────────────────────

def _decode(arg: str) -> str:
    """file:/// or file:// prefix off, %20 -> space, / -> \\ (the .bat's :decode)."""
    if arg[:8].lower() == "file:///":
        arg = arg[8:]
    elif arg[:7].lower() == "file://":
        arg = arg[7:]
    return arg.replace("%20", " ").replace("/", "\\")


def verb_open(arg: str) -> int:
    target = _decode(arg)
    if not _exists(target):
        raise Refused(f"Path not found: {target}")
    # Directories only, by attribute: Box Drive answers `exist "x\"` true for files.
    if not _is_dir(target) or not _exists(target + "\\"):
        raise Refused(f"open: refused — target is not a directory: {target}")
    explorer = os.path.join(_system_root(), "explorer.exe")
    # explorer.exe reads commas as argument separators, and subprocess quotes an
    # argv entry only when it holds a space, so `C:\a,b` would reach it unquoted.
    # This is the exact command line the .bat ran; `target` cannot hold a quote
    # (the router refuses one, and Windows paths cannot contain one).
    cmdline = f'"{explorer}" "{target}"'

    def run() -> int:
        subprocess.Popen(cmdline, executable=explorer, close_fds=True)
        return 0
    return _act("open", {"cmdline": cmdline}, run)


def verb_file(arg: str) -> int:
    target = os.path.abspath(_decode(arg))  # GetFullPathNameW, as %~f1
    boxroot = os.path.join(_home(), "Box") + "\\"
    if not target.lower().startswith(boxroot.lower()):
        raise Refused(f"file: refused, outside Box: {target}")
    if ":" in target[2:]:  # an alternate data stream (x.exe:y.pdf) is not a plain file
        raise Refused(f"file: refused, not a plain file path: {target}")
    if not _exists(target):
        raise Refused(f"File not found: {target}")
    if _is_dir(target):
        raise Refused(f"file: refused, target is a directory: {target}")
    if os.path.splitext(target)[1].lower() not in FILE_EXTS:
        raise Refused(f"file: refused, only .docx .pdf .xlsx: {target}")
    return _startfile(target, "file")


def verb_launch(arg: str) -> int:
    if not LAUNCH_TOKEN_RE.fullmatch(arg):
        raise Refused(f"launch: refused — not an opaque lnch_ token: {arg}")
    resolver = _resolver()
    if not _exists(resolver):
        raise Refused(f"launch: resolver not found at {resolver}")
    argv = [_python_exe(), "-X", "utf8", resolver, arg]

    def run() -> int:
        # The resolver is silent by design on a bad token; the .bat ignored its
        # exit code too. Hidden console, not waited on.
        subprocess.Popen(argv, close_fds=True, creationflags=CREATE_NO_WINDOW,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
        return 0
    return _act("launch-token", {"argv": argv}, run)


def verb_desk(arg: str) -> int:
    if not DESK_REF_RE.fullmatch(arg):
        raise Refused(f"desk: refused — not a <slug>/<desk-name> ref: {arg}")
    resolver = _resolver()
    if not _exists(resolver):
        raise Refused(f"desk: resolver not found at {resolver}")
    argv = [_python_exe(), "-X", "utf8", resolver, "desk", arg]

    def run() -> int:
        r = subprocess.run(argv, close_fds=True, creationflags=CREATE_NO_WINDOW,
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL)
        if r.returncode != 0:
            log = os.path.join(_temp(), "pb-resolve-launch.log")
            raise Refused(f"desk: could not start a session — see {log}")
        return 0
    return _act("desk", {"argv": argv}, run)


def verb_workon(arg: str) -> int:
    folder = _decode(arg)
    if folder.endswith("\\"):
        folder = folder[:-1]
    if not _is_dir(folder) or not _exists(folder + "\\"):
        raise Refused(f"workon: not a directory: {folder}")
    bat = folder + "\\" + START_CLAUDE
    if not _is_file(bat):
        raise Refused(f"workon: no '{START_CLAUDE}' in {folder}")
    return _start_bat(bat, folder, "workon")


def verb_process(_: str = "") -> int:
    pb = os.path.join(_home(), "Peripheral-Brain")
    qp = os.path.join(pb, "Quick_Process.bat")
    if not _is_file(qp):
        raise Refused(f"process: Quick_Process.bat not found at {qp}")
    return _start_bat(qp, pb, "process")


def verb_quickchat(_: str = "") -> int:
    pb = os.path.join(_home(), "Peripheral-Brain")
    qc = os.path.join(pb, "Quick_Chat_seeded.bat")
    if not _is_file(qc):
        raise Refused(f"quickchat: Quick_Chat_seeded.bat not found at {qc}")
    return _start_bat(qc, pb, "quickchat")


def verb_bugsquash(_: str = "") -> int:
    bs = str(HERE / "bug-squasher.bat")
    if not _is_file(bs):
        raise Refused(f"bugsquash: bug-squasher.bat not found at {bs}")
    return _start_bat(bs, str(HERE.parent), "bugsquash")


def verb_backlogwave(_: str = "") -> int:
    bw = str(HERE / "backlog-wave.bat")
    if not _is_file(bw):
        raise Refused(f"backlogwave: backlog-wave.bat not found at {bw}")
    return _start_bat(bw, os.path.join(_home(), "Peripheral-Brain"), "backlogwave")


def _obsidian_running() -> bool:
    try:
        r = subprocess.run([_sys32("tasklist.exe"), "/FI", "IMAGENAME eq Obsidian.exe", "/NH"],
                           capture_output=True, text=True, errors="replace", timeout=15,
                           creationflags=CREATE_NO_WINDOW, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError) as e:
        _log(f"obsidian: tasklist failed ({e}); using the protocol")
        return False
    return "obsidian.exe" in (r.stdout or "").lower()


def verb_obsidian(arg: str) -> int:
    note = arg.replace("%20", " ")
    if note == "":
        raise Refused("obsidian: empty note target")
    enc = note.replace(" ", "%20")
    uri = f"obsidian://open?vault=Peripheral-Brain&file={enc}"
    local = os.environ.get("LOCALAPPDATA")
    cli = os.path.join(local, "Programs", "Obsidian", "Obsidian.com") if local else ""
    if cli and _obsidian_running() and _is_file(cli):
        argv = [cli, "open", f"file={note}"]
        if _dryrun():
            return _act("obsidian-cli", {"argv": argv}, None)
        try:
            r = subprocess.run(argv, capture_output=True, text=True, errors="replace",
                               timeout=30, creationflags=CREATE_NO_WINDOW,
                               stdin=subprocess.DEVNULL)
            out = (r.stdout or "") + (r.stderr or "")
        except (OSError, subprocess.SubprocessError) as e:
            out = f"<{type(e).__name__}: {e}>"
        if "opened:" in out.lower():
            _log(f"obsidian CLI opened: {_safe(note)}")
            return 0
        _log(f"obsidian CLI declined (disabled?), protocol fallback: {_safe(note)}")
    return _startfile(uri, "obsidian-proto")


PATH_VERBS = (("open/", verb_open), ("launch/", verb_launch), ("desk/", verb_desk),
              ("file/", verb_file), ("workon/", verb_workon), ("obsidian/", verb_obsidian))
BARE_VERBS = {"process": verb_process, "bugsquash": verb_bugsquash,
              "backlogwave": verb_backlogwave, "quickchat": verb_quickchat}


def route(url: str) -> int:
    if '"' in url:
        raise Refused("Refused: a mnccore:// URL may not contain a double quote.")
    if CONTROL_RE.search(url):
        raise Refused("Refused: a mnccore:// URL may not contain a control character.")
    rest = url[10:] if url[:10].lower() == "mnccore://" else url
    if rest.endswith("/"):
        rest = rest[:-1]
    for prefix, verb in PATH_VERBS:  # case-sensitive, as in the .bat
        if rest.startswith(prefix):
            return verb(rest[len(prefix):])
    bare = BARE_VERBS.get(rest.lower())  # case-insensitive, as in the .bat (/I)
    if bare is not None:
        return bare()
    raise Refused(f"Unknown mnccore:// verb: {rest}")


def main(argv: "list[str] | None" = None) -> int:
    argv = list(sys.argv if argv is None else argv)
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    _log("ARGS: " + json.dumps(argv[1:]))
    try:
        if len(argv) != 2:
            # A raw quote in the URL makes the C runtime split it; refuse the pieces.
            raise Refused(f"Refused: expected one mnccore:// URL argument, got {len(argv) - 1}.")
        return route(argv[1])
    except Refused as e:
        return _fail(str(e))
    except Exception:  # noqa: BLE001 -- emission protection: logged + shown, exit 2
        _log("CRASH: " + traceback.format_exc().replace("\n", " | "))
        if not _dryrun():
            _toast("mnccore:// handler crashed", f"See {os.path.join(_temp(), 'mnccore-handler.log')}")
        _say(traceback.format_exc())
        return 2


if __name__ == "__main__":
    sys.exit(main())
