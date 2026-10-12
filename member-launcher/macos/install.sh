#!/bin/bash
# install.sh -- build and register the MN-CCORE member launcher on this Mac.
#
#   bash install.sh          build ~/Applications/MNCCORE Launcher.app and register mnccore://
#
# No administrator rights: everything lands in your own ~/Applications. The app is
# compiled HERE from the AppleScript source next to this file (osacompile ships with
# macOS), so it is not a downloaded app and Gatekeeper does not block it.
#
# UNTESTED ON A MAC as of 2026-10-12: written and reviewed on Windows.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/MNCCORE Launcher.applescript"
APPS="$HOME/Applications"
APP="$APPS/MNCCORE Launcher.app"
PLIST="$APP/Contents/Info.plist"
BUDDY=/usr/libexec/PlistBuddy
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

if [ "$(uname)" != "Darwin" ]; then
  echo "This installer is for macOS. On Windows, double-click Install.cmd instead." >&2
  exit 1
fi
if [ ! -f "$SRC" ]; then
  echo "Cannot find 'MNCCORE Launcher.applescript' next to this script. Unzip the whole download first." >&2
  exit 1
fi

mkdir -p "$APPS"
rm -rf "$APP"
/usr/bin/osacompile -o "$APP" "$SRC"

# Tell macOS this app opens mnccore:// links.
"$BUDDY" -c "Delete :CFBundleIdentifier" "$PLIST" 2>/dev/null || true
"$BUDDY" -c "Add :CFBundleIdentifier string edu.umn.mnccore.launcher" "$PLIST"
"$BUDDY" -c "Delete :CFBundleURLTypes" "$PLIST" 2>/dev/null || true
"$BUDDY" -c "Add :CFBundleURLTypes array" "$PLIST"
"$BUDDY" -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
"$BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLName string MN-CCORE Launcher" "$PLIST"
"$BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
"$BUDDY" -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string mnccore" "$PLIST"
"$BUDDY" -c "Delete :NSAppleEventsUsageDescription" "$PLIST" 2>/dev/null || true
"$BUDDY" -c "Add :NSAppleEventsUsageDescription string The launcher opens Terminal in your project folder to start Claude Code." "$PLIST"
# Background-only: no Dock icon while it handles a link.
"$BUDDY" -c "Delete :LSUIElement" "$PLIST" 2>/dev/null || true
"$BUDDY" -c "Add :LSUIElement bool true" "$PLIST"

# Editing Info.plist breaks the signature osacompile made; Apple silicon will not run
# an app with a broken one. Re-sign ad hoc (no developer account needed).
/usr/bin/codesign --force --deep --sign - "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

"$LSREGISTER" -f "$APP"

echo "Installed: $APP"
echo
echo "Next:"
echo "  1. Restart your browser."
echo "  2. In the Hub, open Settings > Integrations and turn on"
echo "     \"I have the launcher installed on this computer\"."
echo "  3. The first time you use Work on in Claude, macOS asks whether"
echo "     MNCCORE Launcher may control Terminal. Click OK."
if ! command -v claude >/dev/null 2>&1; then
  echo
  echo "Note: 'claude' is not on your PATH in this shell. Install Claude Code before using"
  echo "Work on in Claude: https://docs.claude.com/en/docs/claude-code/setup"
fi
