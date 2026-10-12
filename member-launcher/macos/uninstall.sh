#!/bin/bash
# uninstall.sh -- remove the MN-CCORE member launcher from this Mac, and check
# that it is gone.
#
#   bash uninstall.sh             remove it
#   bash uninstall.sh --dry-run   print every step, change nothing (runs on any OS)
#
# Removes: ~/Applications/MNCCORE Launcher.app (only if it is this launcher), its
# Launch Services registration, its "may control Terminal" permission, and its
# log ~/Library/Logs/mnccore-launcher.log. Then it checks each one and says what,
# if anything, is left.
#
# NEW as of 2026-10-12 and not yet run on a Mac. If anything here fails, copy the
# whole Terminal window to Nick.
set -uo pipefail

APP="$HOME/Applications/MNCCORE Launcher.app"
BUNDLE_ID="edu.umn.mnccore.launcher"
LOG="$HOME/Library/Logs/mnccore-launcher.log"
BUDDY=/usr/libexec/PlistBuddy
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (use --dry-run)" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run]'; printf ' %q' "$@"; printf '\n'; else "$@"; fi
}
current_handler() {
  /usr/bin/osascript -l JavaScript -e '
    ObjC.import("AppKit");
    var u = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("mnccore://open/x"));
    (u && !u.isNil()) ? ObjC.unwrap(u.path) : "";' 2>/dev/null || true
}

ON_MAC=0
[ "$(uname)" = "Darwin" ] && ON_MAC=1
if [ "$ON_MAC" = 0 ] && [ "$DRY_RUN" = 0 ]; then
  say "This uninstaller is for macOS. On Windows, double-click Uninstall.cmd instead." >&2
  exit 1
fi
[ "$ON_MAC" = 0 ] && say "(Not a Mac: showing the steps only.)"

say "MNCCORE Launcher uninstaller"
if [ -d "$APP" ] || [ "$DRY_RUN" = 1 ]; then
  if [ "$DRY_RUN" = 0 ]; then
    id="$("$BUDDY" -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist" 2>/dev/null || true)"
    if [ "$id" != "$BUNDLE_ID" ]; then
      say "$APP is not this launcher (its identifier is '${id:-unknown}'). Left it alone."
      exit 1
    fi
  fi
  say "1/4 Unregistering from macOS"
  run "$LSREGISTER" -u "$APP"
  say "2/4 Removing $APP"
  run rm -rf "$APP"
else
  say "1/4 and 2/4: $APP is not there; nothing to remove."
fi
say "3/4 Removing its permission to control Terminal"
run /usr/bin/tccutil reset AppleEvents "$BUNDLE_ID"
say "4/4 Removing its log"
run rm -f "$LOG"

if [ "$DRY_RUN" = 1 ]; then
  say ""
  say "Dry run: nothing was changed."
  exit 0
fi

say ""
say "Checking:"
left=0
if [ -e "$APP" ]; then say "  STILL THERE: $APP"; left=1; else say "  gone: the app"; fi
if [ -e "$LOG" ]; then say "  STILL THERE: $LOG"; left=1; else say "  gone: the log"; fi
handler="$(current_handler)"
if [ "$handler" = "$APP" ]; then
  say "  macOS still lists the app for mnccore:// links (Launch Services can lag; it clears at next login)."
elif [ -n "$handler" ]; then
  say "  mnccore:// links now open with another app: $handler"
else
  say "  gone: nothing opens mnccore:// links"
fi
say ""
if [ "$left" = 0 ]; then
  say "The launcher is removed."
else
  say "Some pieces are left (above). Delete them by hand, or tell Nick."
fi
say "In the Hub, turn off Settings > Integrations > \"I have the launcher installed on this computer\"."
exit "$left"
