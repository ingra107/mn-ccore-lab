#!/bin/bash
# uninstall.sh -- remove the MN-CCORE member launcher from this Mac.
#
#   bash uninstall.sh
#
# UNTESTED ON A MAC as of 2026-10-12: written and reviewed on Windows.
set -euo pipefail

APP="$HOME/Applications/MNCCORE Launcher.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

if [ -d "$APP" ]; then
  "$LSREGISTER" -u "$APP" 2>/dev/null || true
  rm -rf "$APP"
  echo "Removed: $APP"
else
  echo "Nothing to remove: $APP is not there."
fi
echo "In the Hub, turn off Settings > Integrations > \"I have the launcher installed on this computer\"."
