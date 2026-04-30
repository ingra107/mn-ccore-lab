#!/usr/bin/env bash
# Pre-deploy gate for A3 cutover. Refuses to allow Hub deploys that would
# enable the /api/mutations route in prod without a verified pre-A3 snapshot
# manifest in the sibling Peripheral-Brain checkout.
#
# Per Peripheral-Brain workflow-restructure plan rev 4 sec A3.5 + codex r9 B4.
#
# Usage:
#   bash scripts/verify-pre-a3-gate.sh && npx wrangler deploy
#   bash scripts/verify-pre-a3-gate.sh && npx wrangler pages deploy dist
#
# Or via npm script (see package.json deploy:gated / deploy:pages:gated).
#
# Behavior:
#   - Locates Peripheral-Brain checkout (sibling, $HOME, or hard-coded paths).
#   - Calls scripts/scheduled/verify_pre_a3_snapshot.py.
#   - Exit 0 -> caller may proceed with wrangler deploy.
#   - Exit non-zero -> aborts. Caller (npm script) does not run wrangler.
#
# OPT-OUT (emergency only): set PB_SKIP_A3_GATE=1 to bypass. Used only if
# the manifest is intentionally stale (e.g., emergency Hub-only fix
# unrelated to A3 mutation protocol). Loud warning.

set -e

if [ "$PB_SKIP_A3_GATE" = "1" ]; then
    echo "WARNING: PB_SKIP_A3_GATE=1 -- bypassing pre-A3 snapshot gate." >&2
    echo "WARNING: This is an emergency opt-out. A3-related deploys MUST verify the manifest." >&2
    exit 0
fi

PB_ROOT=""
for cand in "$(cd "$(dirname "$0")/.." && pwd)/../Peripheral-Brain" \
            "$HOME/Peripheral-Brain" \
            "/c/Users/ingra/Peripheral-Brain" \
            "/c/Users/ingra107/Peripheral-Brain"; do
    if [ -f "$cand/scripts/scheduled/verify_pre_a3_snapshot.py" ]; then
        PB_ROOT="$cand"
        break
    fi
done

if [ -z "$PB_ROOT" ]; then
    echo "ERROR: cannot locate Peripheral-Brain checkout for pre-A3 verifier." >&2
    echo "  Expected one of:" >&2
    echo "    ../Peripheral-Brain   $HOME/Peripheral-Brain" >&2
    echo "    /c/Users/ingra/Peripheral-Brain   /c/Users/ingra107/Peripheral-Brain" >&2
    exit 2
fi

cd "$PB_ROOT"
rc=0
python scripts/scheduled/verify_pre_a3_snapshot.py || rc=$?
if [ $rc -ne 0 ]; then
    echo "" >&2
    echo "Hub deploy BLOCKED: pre-A3 snapshot manifest verifier exit=$rc." >&2
    echo "Run snapshot on both PB machines first:" >&2
    echo "  powershell.exe -File scripts/scheduled/snapshot_pre_a3.ps1" >&2
    echo "  (relay peer machine, then commit MANIFEST.json with both blocks)" >&2
    echo "" >&2
    echo "Or set PB_SKIP_A3_GATE=1 to bypass for emergency Hub-only deploy." >&2
    exit $rc
fi

echo "[pre-a3-gate] OK -- pre-A3 snapshot manifest verified." >&2
