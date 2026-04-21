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

# Convert WebM → MP4 (H.264). Claude Design's video decoder can't read
# WebM but accepts MP4. Drop the WebMs after — MP4s are the deliverable
# and ~3× smaller.
VIDEO_DIR="review/$BUNDLE/videos"
if compgen -G "$VIDEO_DIR/*.webm" > /dev/null; then
  FFMPEG_CANDIDATES=(
    "$(command -v ffmpeg 2>/dev/null || true)"
    "/c/Users/ingra107/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin/ffmpeg.exe"
  )
  FFMPEG=""
  for c in "${FFMPEG_CANDIDATES[@]}"; do
    if [ -n "$c" ] && [ -x "$c" ]; then FFMPEG="$c"; break; fi
  done
  if [ -n "$FFMPEG" ]; then
    echo ">> [4b] Re-encoding videos to MP4 via $(basename "$FFMPEG")"
    for src in "$VIDEO_DIR"/*.webm; do
      base=$(basename "$src" .webm)
      "$FFMPEG" -y -loglevel error -i "$src" \
        -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -movflags +faststart -an \
        "$VIDEO_DIR/${base}.mp4" \
        && rm "$src"
    done
  else
    echo ">> [4b] ffmpeg not found — leaving WebMs as-is."
    echo "   Install: winget install --id=Gyan.FFmpeg -e"
    echo "   Then rerun: bash scripts/regen-design-bundle.sh $NAME"
  fi
fi

# Final stats.
PNG_COUNT=$(find "review/$BUNDLE" -maxdepth 1 -name "*.png" | wc -l)
MP4_COUNT=$(find "review/$BUNDLE/videos" -name "*.mp4" 2>/dev/null | wc -l)
WEBM_COUNT=$(find "review/$BUNDLE/videos" -name "*.webm" 2>/dev/null | wc -l)
echo
echo "============================================================"
echo "Bundle ready: review/$BUNDLE"
echo "  $PNG_COUNT screenshots"
echo "  $MP4_COUNT MP4 videos${WEBM_COUNT:+ (+$WEBM_COUNT WebMs — install ffmpeg to convert)}"
echo
echo "Drop BRIEF.md and FEEDBACK-FOCUS.md into the bundle, then zip:"
echo "  cd review && powershell -Command \\"
echo "    \"Compress-Archive -Path '$BUNDLE' -DestinationPath '$BUNDLE.zip' -Force\""
echo "============================================================"
