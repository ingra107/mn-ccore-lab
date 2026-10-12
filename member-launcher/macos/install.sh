#!/bin/bash
# install.sh -- build and register the MN-CCORE member launcher on this Mac.
#
#   bash install.sh             build ~/Applications/MNCCORE Launcher.app, register mnccore://
#   bash install.sh --dry-run   print every step, change nothing (runs on any OS)
#   bash install.sh --force     replace another app that already opens mnccore:// links
#
# No administrator rights: everything lands in your own ~/Applications. The app is
# compiled HERE from the AppleScript source next to this file (osacompile ships with
# macOS), so it is not a downloaded app and Gatekeeper does not block it.
#
# Safe to run twice: a second run rebuilds the app. The new app is built and checked
# in a temporary folder first; the installed copy is replaced only after the new one
# passes every check.
#
# NEW as of 2026-10-12 and not yet run on a Mac. If anything here fails, copy the
# whole Terminal window to Nick.
set -euo pipefail

APP_NAME="MNCCORE Launcher"
BUNDLE_ID="edu.umn.mnccore.launcher"
SCHEME="mnccore"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/$APP_NAME.applescript"
APPS="$HOME/Applications"
APP="$APPS/$APP_NAME.app"
BUDDY=/usr/libexec/PlistBuddy
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (use --dry-run or --force)" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
fail() {
  printf '\nInstall stopped: %s\nYour Mac was not changed by this step. Copy this window to Nick if you need help.\n' "$*" >&2
  exit 1
}
# Run a command, or under --dry-run print it.
run() {
  if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run]'; printf ' %q' "$@"; printf '\n'; else "$@"; fi
}

# The app that opens mnccore:// links now (its path), or nothing.
current_handler() {
  /usr/bin/osascript -l JavaScript -e '
    ObjC.import("AppKit");
    var u = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("mnccore://open/x"));
    (u && !u.isNil()) ? ObjC.unwrap(u.path) : "";' 2>/dev/null || true
}

ON_MAC=0
[ "$(uname)" = "Darwin" ] && ON_MAC=1
if [ "$ON_MAC" = 0 ]; then
  if [ "$DRY_RUN" = 1 ]; then
    say "(Not a Mac: showing the steps only.)"
  else
    fail "this installer is for macOS. On Windows, double-click Install.cmd instead."
  fi
fi

say "MNCCORE Launcher installer"
[ -f "$SRC" ] || fail "cannot find '$APP_NAME.applescript' next to this script. Unzip the whole download first, then run install.sh from that folder."

if [ "$ON_MAC" = 1 ]; then
  for tool in /usr/bin/osacompile /usr/bin/codesign /usr/bin/osascript /usr/bin/plutil "$BUDDY" "$LSREGISTER"; do
    [ -x "$tool" ] || fail "a macOS tool this needs is missing: $tool"
  done
  existing="$(current_handler)"
  if [ -n "$existing" ] && [ "$existing" != "$APP" ]; then
    if [ "$FORCE" = 1 ]; then
      say "Another app opens mnccore:// links now: $existing"
      say "Replacing it because you passed --force."
    else
      fail "another app already opens mnccore:// links on this Mac:
  $existing
If you are sure you want this launcher instead, run: bash install.sh --force"
    fi
  fi
fi

BUILD="$(mktemp -d "${TMPDIR:-/tmp}/mnccore-launcher.XXXXXX")"
trap 'rm -rf "$BUILD"' EXIT
NEW="$BUILD/$APP_NAME.app"
PLIST="$NEW/Contents/Info.plist"

say "1/5 Building the app from the AppleScript source"
run /usr/bin/osacompile -o "$NEW" "$SRC"

say "2/5 Telling macOS it opens $SCHEME:// links"
plist_replace() {  # key type value
  if [ "$DRY_RUN" = 0 ]; then "$BUDDY" -c "Delete :$1" "$PLIST" >/dev/null 2>&1 || true; fi
  run "$BUDDY" -c "Add :$1 $2 $3" "$PLIST"
}
plist_replace CFBundleIdentifier string "$BUNDLE_ID"
if [ "$DRY_RUN" = 0 ]; then "$BUDDY" -c "Delete :CFBundleURLTypes" "$PLIST" >/dev/null 2>&1 || true; fi
run "$BUDDY" -c "Add :CFBundleURLTypes array" "$PLIST"
run "$BUDDY" -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
run "$BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLName string MN-CCORE Launcher" "$PLIST"
run "$BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
run "$BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string $SCHEME" "$PLIST"
plist_replace NSAppleEventsUsageDescription string "The launcher opens Terminal in your project folder to start Claude Code."
# Background-only: no Dock icon while it handles a link.
plist_replace LSUIElement bool true

say "3/5 Signing (ad hoc; editing Info.plist broke the signature osacompile made)"
run /usr/bin/codesign --force --deep --sign - "$NEW"

if [ "$DRY_RUN" = 0 ]; then
  say "    checking the new app"
  [ -f "$NEW/Contents/Resources/Scripts/main.scpt" ] || fail "osacompile did not produce the script inside the app."
  /usr/bin/plutil -lint "$PLIST" >/dev/null || fail "the app's Info.plist is not valid."
  [ "$("$BUDDY" -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0' "$PLIST")" = "$SCHEME" ] \
    || fail "the $SCHEME:// entry did not land in Info.plist."
  [ "$("$BUDDY" -c 'Print :CFBundleIdentifier' "$PLIST")" = "$BUNDLE_ID" ] \
    || fail "the bundle identifier did not land in Info.plist."
  /usr/bin/codesign --verify --deep "$NEW" 2>/dev/null || fail "the new app's signature does not verify."
fi

say "4/5 Installing into $APPS"
run mkdir -p "$APPS"
if [ -d "$APP" ]; then
  run "$LSREGISTER" -u "$APP"
  run rm -rf "$APP"
fi
run mv "$NEW" "$APP"
if [ "$DRY_RUN" = 0 ]; then /usr/bin/xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true; fi

say "5/5 Registering with macOS"
run "$LSREGISTER" -f "$APP"

if [ "$DRY_RUN" = 1 ]; then
  say ""
  say "Dry run: nothing was changed."
  exit 0
fi

handler=""
for _ in 1 2 3 4 5; do
  handler="$(current_handler)"
  [ "$handler" = "$APP" ] && break
  sleep 1
done
say ""
say "Installed: $APP"
if [ "$handler" = "$APP" ]; then
  say "macOS now opens mnccore:// links with it."
else
  say "Note: macOS still reports '${handler:-nothing}' for mnccore:// links. Log out and back in,"
  say "then try the Hub's Open folder button. If it still does nothing, tell Nick."
fi
say ""
say "Next:"
say "  1. Restart your browser."
say "  2. In the Hub, open Settings > Integrations and turn on"
say "     \"I have the launcher installed on this computer\"."
say "  3. The first time you use Work on in Claude, macOS asks whether"
say "     MNCCORE Launcher may control Terminal. Click OK."
if ! command -v claude >/dev/null 2>&1; then
  say ""
  say "Note: 'claude' is not on your PATH in this shell. Install Claude Code before using"
  say "Work on in Claude: https://docs.claude.com/en/docs/claude-code/setup"
fi
