-- MNCCORE Launcher.applescript -- the MN-CCORE member launcher for macOS.
--
-- install.sh compiles this with osacompile into "MNCCORE Launcher.app", adds a
-- CFBundleURLTypes entry for the mnccore scheme, re-signs it ad hoc and registers
-- it with Launch Services. The Hub's buttons then reach `on open location`.
--
-- Handles two kinds of Hub link and nothing else:
--   mnccore://open/<folder>     open the folder in Finder
--   mnccore://workon/<folder>   open Terminal in the folder running `claude`
--
-- Rules for <folder> (any failure = a message, nothing opened):
--   1. No control character, raw or %-encoded.
--   2. Only the open and workon verbs; anything else is refused.
--   3. %-decoded once, it must be an absolute path (/...). A //host path is refused.
--   4. Resolved through `cd` + `pwd -P` (symlinks and .. resolved), it must be an
--      existing folder inside your home folder (Box Drive lives at
--      ~/Library/CloudStorage/Box-Box). Network volumes under /Volumes are outside.
-- The folder only ever reaches a shell through AppleScript's `quoted form of`,
-- which single-quotes it, so no character in it can become a command.
--
-- UNTESTED ON A MAC as of 2026-10-12: written and reviewed on Windows.

use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

property launcherTitle : "MNCCORE Launcher"

on run
	display dialog "The MNCCORE Launcher is installed. It opens project folders from the MN-CCORE Hub (the Open folder and Work on in Claude buttons). There is nothing to do here." buttons {"OK"} default button 1 with title launcherTitle
end run

on open location theURL
	try
		handleLink(theURL as text)
	on error errMsg number errNum
		if errNum is not -128 then
			display alert launcherTitle message ("The link was not opened: " & errMsg) as warning
		end if
	end try
end open location

on refuseControl(t, what)
	repeat with c in (characters of t)
		set n to id of (contents of c)
		if n < 32 or n = 127 then error (what & " may not contain a control character.") number 1001
	end repeat
end refuseControl

on handleLink(u)
	my refuseControl(u, "A link")
	set lowered to (current application's NSString's stringWithString:u)'s lowercaseString() as text
	set verb to missing value
	repeat with candidate in {"open", "workon"}
		set prefix to "mnccore://" & (contents of candidate) & "/"
		if lowered starts with prefix and (length of u) > (length of prefix) then
			set verb to contents of candidate
			set rawPath to text ((length of prefix) + 1) thru -1 of u
			exit repeat
		end if
	end repeat
	if verb is missing value then error "this launcher only opens folders; it does not handle this link: " & u number 1002

	set decoded to (current application's NSString's stringWithString:rawPath)'s stringByRemovingPercentEncoding()
	if decoded is missing value then error "the folder path in the link is not valid: " & rawPath number 1003
	set p to decoded as text
	my refuseControl(p, "A folder path")
	if p does not start with "/" or p starts with "//" then error "only a folder on this Mac can be opened from a link: " & p number 1004

	try
		set realPath to do shell script "cd " & (quoted form of p) & " && /bin/pwd -P"
	on error
		error "folder not found: " & p & ". Check the path under My folder on the project page." number 1005
	end try
	set homePath to POSIX path of (path to home folder)
	if homePath ends with "/" then set homePath to text 1 thru -2 of homePath
	if not (realPath is homePath or realPath starts with (homePath & "/")) then
		error "only folders inside your home folder (" & homePath & ") open from a link: " & realPath number 1006
	end if

	if verb is "open" then
		do shell script "/usr/bin/open " & (quoted form of realPath)
	else
		tell application "Terminal"
			activate
			do script "cd " & (quoted form of realPath) & " && claude"
		end tell
	end if
end handleLink
