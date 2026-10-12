-- MNCCORE Launcher.applescript -- the MN-CCORE member launcher for macOS.
--
-- install.sh compiles this with osacompile into "MNCCORE Launcher.app", adds a
-- CFBundleURLTypes entry for the mnccore scheme, re-signs it ad hoc and registers
-- it with Launch Services. The Hub's buttons then reach `on open location`.
--
-- Handles two kinds of Hub link and nothing else:
--   mnccore://open/<folder>     show the folder in a Finder window
--   mnccore://workon/<folder>   ask first, then open Terminal in the folder and
--                               start Claude Code
--
-- Any web page can fire a mnccore:// link, so every rule below assumes the link
-- is hostile. Checks, in order (any failure = a short fixed message; the reason
-- goes to ~/Library/Logs/mnccore-launcher.log; nothing is opened):
--   1. No control character in the link.
--   2. Only the open and workon verbs.
--   3. The path is %-decoded exactly once (the Hub encodes each segment once),
--      and checked as TEXT before the file system is touched: no control
--      character, absolute (/...), no empty, . or .. segment, and inside your
--      home folder. Nothing outside home is looked at, so a link cannot make the
--      Mac mount a network share (/net/<host>, the automounter).
--   4. Resolved through `cd` + `pwd -P` (symlinks resolved), it must still be
--      inside your home folder (Box Drive: ~/Library/CloudStorage/Box-Box).
--   5. It must not be a file package (an .app or any other bundle): Finder would
--      LAUNCH it instead of showing it. Checked with NSWorkspace
--      isFilePackageAtPath, then opened with `open -a Finder`.
--   6. workon asks in a dialog that names the folder, defaulting to Cancel: the
--      folder may hold someone else's CLAUDE.md or .claude settings.
-- The folder reaches a shell only through AppleScript's `quoted form of`
-- (single quotes), so no character in it can become a command.
--
-- The Terminal command (zsh or bash, the macOS default shells) first refuses a
-- PATH with an empty, "." or relative entry: such an entry means "the current
-- folder", so once inside the project folder a planted `node` (which the
-- claude shim runs) or `claude` could run. Then it resolves claude with
-- `whence -p` (zsh) or `type -P` (bash), which ignore aliases and functions,
-- from / rather than the project folder, requires an absolute path, and only
-- then changes into the folder and runs that exact file.
--
-- UNTESTED ON A MAC as of 2026-10-12: written on Windows and reviewed line by
-- line. Tell Nick what you see if it misbehaves.

use AppleScript version "2.4"
use framework "Foundation"
use framework "AppKit"
use scripting additions

property launcherTitle : "MNCCORE Launcher"
property logRelPath : "Library/Logs/mnccore-launcher.log"

-- Launched by a link, macOS sends `open location`; nothing here may show a
-- dialog first. Opened by hand, there is nothing to do: log it and quit.
on run
	my writeLog("RUN (opened by hand; nothing to do)")
end run

on open location theURL
	try
		my handleLink(theURL as text)
	on error errMsg number errNum
		if errNum is -128 then
			my writeLog("DECLINED by the user")
		else
			my writeLog("FAIL " & errNum & ": " & errMsg)
			activate
			display alert launcherTitle message ("The MN-CCORE Launcher did not open this link. The reason is in ~/" & logRelPath) as warning
		end if
	end try
end open location

-- Append one line to the log. Never raises: a failed log write must not hide
-- the dialog that follows it.
on writeLog(msg)
	try
		set homeDir to POSIX path of (path to home folder)
		set stamp to do shell script "/bin/date '+%Y-%m-%d %H:%M:%S'"
		do shell script "/bin/mkdir -p " & quoted form of (homeDir & "Library/Logs") & " && /usr/bin/printf '%s\\n' " & quoted form of (stamp & " " & my printable(msg)) & " >> " & quoted form of (homeDir & logRelPath)
	end try
end writeLog

-- The code points of t as a list. `id of t` is a number for one character and a
-- list otherwise; `as list` makes both a list. Works for decomposed accents and
-- emoji, which `characters of t` + `id of` may not.
on codePoints(t)
	if t is "" then return {}
	return (id of t) as list
end codePoints

-- Control characters as \x{N}, so one log entry stays one line.
on printable(t)
	set out to ""
	repeat with n in my codePoints(t)
		set n to contents of n
		if n < 32 or n = 127 then
			set out to out & "\\x{" & n & "}"
		else
			set out to out & (character id n)
		end if
	end repeat
	return out
end printable

on refuseControl(t, what)
	repeat with n in my codePoints(t)
		set n to contents of n
		if n < 32 or n = 127 then error (what & " contains a control character.") number 1001
	end repeat
end refuseControl

-- True when thePath is homePath itself or inside it (text; no trailing slashes).
on isUnder(thePath, homePath)
	if thePath is homePath then return true
	return (thePath starts with (homePath & "/"))
end isUnder

on handleLink(u)
	my writeLog("LINK " & u)
	my refuseControl(u, "The link")

	-- Verb: case-insensitive on scheme and verb; the path keeps its case.
	set lowered to ((current application's NSString's stringWithString:u)'s lowercaseString()) as text
	set verb to missing value
	set rawPath to ""
	repeat with candidate in {"open", "workon"}
		set prefix to "mnccore://" & (contents of candidate) & "/"
		if (lowered starts with prefix) and (length of u) > (length of prefix) then
			set verb to (contents of candidate)
			set rawPath to text ((length of prefix) + 1) thru -1 of u
			exit repeat
		end if
	end repeat
	if verb is missing value then error "not an open or workon link: " & u number 1002

	-- Exactly one decode.
	set decoded to (current application's NSString's stringWithString:rawPath)'s stringByRemovingPercentEncoding()
	if decoded is missing value then error "the path is not valid percent-encoding: " & rawPath number 1003
	set p to decoded as text
	my refuseControl(p, "The folder path")

	-- Text checks, before any file-system call.
	if p does not start with "/" then error "not an absolute path: " & p number 1004
	if p contains "//" then error "the path has an empty segment: " & p number 1004
	if (p ends with "/") and (length of p) > 1 then set p to text 1 thru -2 of p
	if (p contains "/../") or (p ends with "/..") or (p contains "/./") or (p ends with "/.") then
		error "the path has a . or .. segment: " & p number 1004
	end if
	set homePath to POSIX path of (path to home folder)
	if homePath ends with "/" then set homePath to text 1 thru -2 of homePath
	if not my isUnder(p, homePath) then error "not inside the home folder (" & homePath & "): " & p number 1006

	-- Resolve symlinks; the result must still be inside home.
	try
		set realPath to do shell script "cd " & (quoted form of p) & " && /bin/pwd -P"
	on error
		error "folder not found: " & p number 1005
	end try
	if not my isUnder(realPath, homePath) then error "resolves outside the home folder: " & realPath number 1006

	-- A bundle (.app and friends) would be launched, not shown.
	set ws to current application's NSWorkspace's sharedWorkspace()
	if ((ws's isFilePackageAtPath:realPath) as boolean) then error "is an application or other package, not a plain folder: " & realPath number 1007

	if verb is "open" then
		my writeLog("OPEN " & realPath)
		do shell script "/usr/bin/open -a Finder " & (quoted form of realPath)
	else
		activate
		display dialog ("Start Claude Code in this folder?" & return & return & realPath & return & return & "Continue only if you just clicked \"Work on this in Claude\" in the MN-CCORE Hub. Claude Code will read the files in this folder, including any CLAUDE.md or .claude settings in it.") buttons {"Cancel", "Start Claude Code"} default button "Cancel" cancel button "Cancel" with title launcherTitle with icon caution
		my writeLog("WORKON " & realPath)
		-- Shell text typed into Terminal (zsh or bash). See the header.
		set q to quoted form of realPath
		set cmd to "cd / && case \":$PATH:\" in *::*|*:[!/]*) echo 'MNCCORE Launcher: your PATH has an empty, \".\" or relative entry, so Claude Code was not started (a program in the project folder could run instead). Fix PATH in your shell settings, then try again.' ;; *) __mnccore_claude=\"$(whence -p claude 2>/dev/null || type -P claude 2>/dev/null)\"; case \"$__mnccore_claude\" in /*) cd " & q & " && \"$__mnccore_claude\" ;; *) echo 'MNCCORE Launcher: Claude Code (claude) was not found on your PATH. Install it from https://docs.claude.com/en/docs/claude-code/setup and try again.' ;; esac ;; esac"
		tell application "Terminal"
			activate
			do script cmd
		end tell
	end if
end handleLink
