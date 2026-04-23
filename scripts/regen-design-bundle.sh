#!/usr/bin/env bash
# Regenerate the Claude Design hand-off bundle in one shot.
#
#   bash scripts/regen-design-bundle.sh                  # auto-dated dir
#   bash scripts/regen-design-bundle.sh round-3          # explicit name
#
# CF Access gates prod `/portal/*`. Point BASE_URL at an ungated preview
# deploy (the URL wrangler pages prints on a fresh deploy):
#
#   BASE_URL=https://abc12345.mn-ccore-lab.pages.dev \
#     bash scripts/regen-design-bundle.sh round-3
#
# Output: review/claude-design-<name>/ — desktop screenshots, mobile
# screenshots, focus-asks captures, and 15 interaction WebMs + keyframes
# under videos/. All three capture specs honor CAPTURE_BUNDLE so they
# write to the same dir.
set -uo pipefail
# Note: -e removed so a single flaky focus-ask won't block step 4/4
# (interaction videos). Step exit codes are surfaced in the summary.

# Bundle name. Either explicit arg or YYYY-MM-DD.
NAME="${1:-claude-design-$(date +%Y-%m-%d)}"
# Strip any leading "claude-design-" the user types so we don't double up.
NAME="${NAME#claude-design-}"
BUNDLE="claude-design-${NAME}"

# CAPTURE_BUNDLE is read by all three specs; when set, they share a dir.
export CAPTURE_BUNDLE="$BUNDLE"

# Pass BASE_URL through as CAPTURE_BASE_URL (what the specs read). When
# unset, specs default to https://mn-ccore-lab.pages.dev (CF-Access-gated;
# portal captures will be Google Sign-in pages).
if [ -n "${BASE_URL:-}" ]; then
  export CAPTURE_BASE_URL="$BASE_URL"
  echo ">> Target: $BASE_URL"
else
  echo ">> Target: https://mn-ccore-lab.pages.dev (default — CF Access may gate portal)"
fi

cd "$(dirname "$0")/.."

echo ">> Bundle: review/$BUNDLE"
mkdir -p "review/$BUNDLE/videos"

echo ">> [1/7] Desktop hero captures (35+ surfaces)"
CAPTURE_DEVICE=desktop \
  npx playwright test tests/capture-for-design.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=desktop

echo ">> [2/7] Mobile captures (6 surfaces)"
CAPTURE_DEVICE=mobile \
  npx playwright test tests/capture-for-design.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=mobile

echo ">> [3/7] Focus-asks captures (Quick Add, row outline, ▾ chevrons)"
CAPTURE_DEVICE=desktop \
  npx playwright test tests/capture-focus-asks.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=desktop

echo ">> [4/7] Scroll chunks (12 long pages × viewport)"
CAPTURE_DEVICE=desktop \
  npx playwright test tests/capture-scroll-chunks.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=desktop

echo ">> [5/7] Light-mode variants (8 pages)"
CAPTURE_DEVICE=desktop \
  npx playwright test tests/capture-theme-light.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=desktop

echo ">> [6/7] Rich states (network, modals, pubs carousel)"
CAPTURE_DEVICE=desktop \
  npx playwright test tests/capture-rich-states.spec.ts \
  --config=playwright.config.design-capture.ts \
  --project=desktop

echo ">> [7/7] Interaction videos (15 WebMs + keyframes)"
npx playwright test \
  --config=playwright.config.interactions-capture.ts \
  --project=desktop || echo "   (some interaction tests may flake — videos still recorded)"

# Fallback: copy videos from test-results/ into the bundle. The spec's
# afterEach hook tries to do this too, but Playwright videos are
# finalized after the context closes — afterEach often sees empty
# attachments. Copy here by test-number prefix on the dir name.
VDIR="review/$BUNDLE/videos"
for d in test-results/capture-interactions-*/; do
  src="$d/video.webm"
  [ -f "$src" ] || continue
  num=$(basename "$d" | sed -E 's/capture-interactions-([0-9]+).*/\1/')
  case "$num" in
    01) id=01-status-change-undo ;;
    02) id=02-detail-panel ;;
    03) id=03-detail-tabs ;;
    04) id=04-swipe-dismiss ;;
    05) id=05-hover-badges ;;
    06) id=06-cmd-k ;;
    07) id=07-assignee-picker ;;
    08) id=08-date-picker ;;
    09) id=09-subtasks ;;
    10) id=10-board-drag ;;
    11) id=11-hermes ;;
    12) id=12-pulse-kiosk ;;
    13) id=13-dashboard-drag ;;
    14) id=14-keyboard-nav ;;
    15) id=15-quick-add ;;
    *)  id="" ;;
  esac
  [ -n "$id" ] || continue
  [ -f "$VDIR/$id.webm" ] || cp "$src" "$VDIR/$id.webm"
done

# Convert WebM → MP4 (H.264). Claude Design's video decoder can't read
# WebM but accepts MP4. Drop the WebMs after — MP4s are the deliverable
# and ~3× smaller.
VIDEO_DIR="review/$BUNDLE/videos"
if compgen -G "$VIDEO_DIR/*.webm" > /dev/null; then
  FFMPEG_CANDIDATES=(
    "$(command -v ffmpeg 2>/dev/null || true)"
    "/c/Users/ingra/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin/ffmpeg.exe"
    "/c/Users/ingra107/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin/ffmpeg.exe"
  )
  FFMPEG=""
  for c in "${FFMPEG_CANDIDATES[@]}"; do
    if [ -n "$c" ] && [ -x "$c" ]; then FFMPEG="$c"; break; fi
  done
  if [ -n "$FFMPEG" ]; then
    echo ">> [4b] Re-encoding videos to MP4 + GIF via $(basename "$FFMPEG")"
    for src in "$VIDEO_DIR"/*.webm; do
      base=$(basename "$src" .webm)
      mp4="$VIDEO_DIR/${base}.mp4"
      gif="$VIDEO_DIR/${base}.gif"
      pal="$VIDEO_DIR/${base}.palette.png"
      # Reference-quality MP4 (native size, H.264).
      "$FFMPEG" -y -loglevel error -i "$src" \
        -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -movflags +faststart -an \
        "$mp4"
      # GIF for review tools that can't decode video. 10 fps, 480px wide,
      # palette-quantized for size-vs-quality balance.
      "$FFMPEG" -y -loglevel error -i "$src" \
        -vf "fps=10,scale=480:-1:flags=lanczos,palettegen" "$pal"
      "$FFMPEG" -y -loglevel error -i "$src" -i "$pal" \
        -lavfi "fps=10,scale=480:-1:flags=lanczos [x]; [x][1:v] paletteuse" "$gif"
      rm -f "$pal" "$src"
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
GIF_COUNT=$(find "review/$BUNDLE/videos" -name "*.gif" 2>/dev/null | wc -l)
WEBM_COUNT=$(find "review/$BUNDLE/videos" -name "*.webm" 2>/dev/null | wc -l)
echo
echo "============================================================"
echo "Bundle ready: review/$BUNDLE"
echo "  $PNG_COUNT screenshots"
echo "  $MP4_COUNT MP4 videos · $GIF_COUNT GIFs${WEBM_COUNT:+ (+$WEBM_COUNT WebMs — install ffmpeg to convert)}"
echo
echo "Drop BRIEF.md and FEEDBACK-FOCUS.md into the bundle, then zip:"
echo "  cd review && powershell -Command \\"
echo "    \"Compress-Archive -Path '$BUNDLE' -DestinationPath '$BUNDLE.zip' -Force\""
echo "============================================================"
