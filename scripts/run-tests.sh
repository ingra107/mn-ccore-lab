#!/bin/bash
# MN-CCORE Lab Hub — Full Test Runner
#
# Usage:
#   ./scripts/run-tests.sh           # Run all 4 suites
#   ./scripts/run-tests.sh quick     # Run only API + page render tests (~2 min)
#   ./scripts/run-tests.sh ui        # Run daily-superuser only (~6 min)
#   ./scripts/run-tests.sh sync      # Run sync pipeline only (~5 min)
#   ./scripts/run-tests.sh all       # Run everything (~20 min)
#
# Results saved to: review/test-summary.txt

set -e
cd "$(dirname "$0")/.."

MODE="${1:-all}"
SUMMARY="review/test-summary.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  MN-CCORE Lab Hub — Test Suite Runner                   ║"
echo "║  Mode: $MODE | $(date '+%Y-%m-%d %H:%M')               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Initialize summary
echo "# Test Run: $TIMESTAMP (mode: $MODE)" > "$SUMMARY"
echo "" >> "$SUMMARY"

TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

run_playwright() {
  local name="$1"
  local file="$2"
  echo "▸ Running: $name..."

  local output
  output=$(npx playwright test "$file" --reporter=list 2>&1 | tail -5)

  local passed=$(echo "$output" | grep -oP '\d+(?= passed)' || echo "0")
  local failed=$(echo "$output" | grep -oP '\d+(?= failed)' || echo "0")
  local skipped=$(echo "$output" | grep -oP '\d+(?= skipped)' || echo "0")

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))

  local status="✓"
  [ "$failed" -gt 0 ] && status="✗"

  echo "  $status $name: $passed passed, $failed failed, $skipped skipped"
  echo "| $name | $passed | $failed | $skipped | $status |" >> "$SUMMARY"
}

run_sync() {
  echo "▸ Running: Sync Pipeline (Python)..."

  local output
  output=$(python tests/sync-pipeline.test.py 2>&1 | tail -5)

  local results=$(echo "$output" | grep "RESULTS:" | head -1)
  local passed=$(echo "$results" | grep -oP '\d+(?= passed)' || echo "0")
  local failed=$(echo "$results" | grep -oP '\d+(?= failed)' || echo "0")

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))

  local status="✓"
  [ "$failed" -gt 0 ] && status="✗"

  echo "  $status Sync Pipeline: $passed passed, $failed failed"
  echo "| Sync Pipeline | $passed | $failed | 0 | $status |" >> "$SUMMARY"
}

echo "| Suite | Passed | Failed | Skipped | Status |" >> "$SUMMARY"
echo "|-------|--------|--------|---------|--------|" >> "$SUMMARY"

case "$MODE" in
  quick)
    run_playwright "API + Pages" "tests/inspection.spec.ts"
    ;;
  ui)
    run_playwright "Daily Super-User" "tests/daily-superuser.spec.ts"
    ;;
  sync)
    run_sync
    ;;
  all|"")
    run_playwright "Inspection" "tests/inspection.spec.ts"
    run_playwright "Workflows" "tests/inspection-workflows.spec.ts"
    run_playwright "Daily Super-User" "tests/daily-superuser.spec.ts"
    run_sync
    ;;
esac

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  TOTAL: $TOTAL_PASSED passed, $TOTAL_FAILED failed, $TOTAL_SKIPPED skipped"
TOTAL=$((TOTAL_PASSED + TOTAL_FAILED + TOTAL_SKIPPED))
if [ "$TOTAL" -gt 0 ]; then
  RATE=$(( (TOTAL_PASSED * 100) / TOTAL ))
  echo "  Pass rate: ${RATE}%"
  echo "" >> "$SUMMARY"
  echo "**Total: $TOTAL_PASSED passed, $TOTAL_FAILED failed, $TOTAL_SKIPPED skipped (${RATE}%)**" >> "$SUMMARY"
fi
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Results saved to: $SUMMARY"

# Show recent commits since last test run for context
echo "" >> "$SUMMARY"
echo "## Recent Changes" >> "$SUMMARY"
git log --oneline -10 >> "$SUMMARY"

exit $TOTAL_FAILED
