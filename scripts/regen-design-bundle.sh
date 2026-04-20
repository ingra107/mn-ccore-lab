#!/usr/bin/env bash
# Regenerate the Claude Design hand-off bundle in one shot.
#
#   bash scripts/regen-design-bundle.sh                  # auto-dated dir
#   bash scripts/regen-design-bundle.sh round-3          # explicit name
#
# Output: review/claude-design-<name>/ — desktop screenshots, mobile
# screenshots, focus-asks captures, and 15 interaction WebMs + keyframes
# under videos/. All three capture specs honor CAPTURE_BUNDLE so they
# write to the same dir.
set -euo pipefail

# Bundle name. Either explicit arg or YYYY-MM-DD.
NAME="${1:-claude-design-$(date +%Y-%m-%d)}"
# Strip any leading "claude-design-" the user types so we don't double up.
NAME="${NAME#claude-design-}"
BUNDLE="claude-design-${NAME}"

# CAPTURE_BUNDLE is read by all three specs; when set, they share a dir.
export CAPTURE_BUNDLE="$BUNDLE"

cd "$(dirname "$0")/.."

echo ">> Bundle: review/$BUNDLE"
mkdir -p "review/$BUNDLE/videos"

echo ">> [1/4] Desktop hero captures (35 surfaces)"
CAPTURE_DEVICE=desktop \
  npx playwright test tests/capture-for-design.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=desktop

echo ">> [2/4] Mobile captures (6 surfaces)"
CAPTURE_DEVICE=mobile \
  npx playwright test tests/capture-for-design.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=mobile

echo ">> [3/4] Focus-asks captures (Quick Add, row outline, ▾ chevrons)"
CAPTURE_DEVICE=desktop \
  npx playwright test tests/capture-focus-asks.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=desktop

echo ">> [4/4] Interaction videos (15 WebMs + keyframes)"
npx playwright test \
  --config=playwright.config.interactions-capture.ts \
  --project=desktop || echo "   (some interaction tests may flake — videos still recorded)"

# Final stats.
PNG_COUNT=$(find "review/$BUNDLE" -maxdepth 1 -name "*.png" | wc -l)
WEBM_COUNT=$(find "review/$BUNDLE/videos" -name "*.webm" | wc -l)
echo
echo "============================================================"
echo "Bundle ready: review/$BUNDLE"
echo "  $PNG_COUNT screenshots"
echo "  $WEBM_COUNT videos"
echo
echo "Drop BRIEF.md and FEEDBACK-FOCUS.md into the bundle, then zip:"
echo "  cd review && powershell -Command \\"
echo "    \"Compress-Archive -Path '$BUNDLE' -DestinationPath '$BUNDLE.zip' -Force\""
echo "============================================================"
