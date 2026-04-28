#!/usr/bin/env bash
# Deploy after audit wave merges to main.
# Runs: schema migration (idempotent) + build + Pages deploy.
# Idempotent — safe to re-run if a step fails.
#
# Usage:
#   bash scripts/deploy-audit-wave.sh
#
# Prerequisites:
#   - On main, all wave PRs merged
#   - npm install fresh
#   - wrangler authenticated to mn-ccore-lab project

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "═══════════════════════════════════════════════════════════"
echo "  MN-CCORE Hub — audit wave deploy"
echo "  Branch: $(git branch --show-current)"
echo "  HEAD:   $(git rev-parse --short HEAD)"
echo "═══════════════════════════════════════════════════════════"

# ───── Pre-flight ─────
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "✗ ABORT: not on main branch. Switch with: git checkout main"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ ABORT: uncommitted changes. Stash or commit first."
  git status --short
  exit 1
fi

echo
echo "▸ Pulling latest main..."
git pull --ff-only origin main
echo "  HEAD now: $(git rev-parse --short HEAD)"

# ───── Step 1: Schema v54 (idempotent — ALTER TABLE will fail silently if column exists) ─────
echo
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 1/3: Schema v54 (citations columns)"
echo "═══════════════════════════════════════════════════════════"
echo
echo "Adds team_members.{citation_count, h_index, last_scholar_refresh}."
echo "Idempotent — D1 ALTER TABLE will warn 'duplicate column' if already applied."
echo
read -p "Run schema v54 migration on prod D1? [y/N] " -n 1 -r CONFIRM
echo
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  npx wrangler d1 execute mnccore-lab --remote --file=api/schema-v54-team-citations.sql || {
    echo "  ⚠ Schema migration returned non-zero. If 'duplicate column' error, that's fine — already applied."
    read -p "  Continue with deploy? [y/N] " -n 1 -r CONT
    echo
    [[ "$CONT" =~ ^[Yy]$ ]] || exit 1
  }
  echo "  ✓ Schema v54 step done."
else
  echo "  ⊘ Skipped schema migration. /api/citations may return errors if v54 not yet applied."
fi

# ───── Step 2: Build ─────
echo
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 2/3: Build (npm run build)"
echo "═══════════════════════════════════════════════════════════"
echo
npm run build || {
  echo "✗ BUILD FAILED. Fix before deploying."
  exit 1
}
echo
echo "  ✓ Build clean."

# ───── Step 3: Deploy ─────
echo
echo "═══════════════════════════════════════════════════════════"
echo "  STEP 3/3: Deploy to Cloudflare Pages"
echo "═══════════════════════════════════════════════════════════"
echo
read -p "Deploy dist/ to mn-ccore-lab Pages project? [y/N] " -n 1 -r CONFIRM
echo
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  npx wrangler pages deploy dist --project-name mn-ccore-lab
  echo
  echo "  ✓ Deploy done."
else
  echo "  ⊘ Skipped deploy. Re-run script when ready."
  exit 0
fi

# ───── Post-deploy notes ─────
echo
echo "═══════════════════════════════════════════════════════════"
echo "  POST-DEPLOY"
echo "═══════════════════════════════════════════════════════════"
echo
echo "  ▸ Verify /api/health returns 200"
echo "  ▸ Spot-check Lab Overview: stats card, upcoming deadlines (real data now)"
echo "  ▸ Spot-check /portal/manuscripts: stage progress dots, NeedsAttention dashboard"
echo "  ▸ Spot-check /portal/dashboard: morning thought input, Right Now chat"
echo "  ▸ Spot-check /portal/my-tasks: List view inline editing, virtualization"
echo "  ▸ Spot-check /portal/projects/<slug>: title inline-edit, archive menu, file uploader"
echo "  ▸ Spot-check /portal/search: snippets, sticky bar, view picker"
echo "  ▸ Spot-check /portal/insights (if wave 4 includes Bundle M): refresh button, sparklines, Connections panel"
echo
echo "  ⚠ Citations: \`/api/citations\` returns zeros until PB scholarly weekly cron starts"
echo "    populating team_members.citation_count. Spec at scripts/citations-scholar-stub.md."
echo
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ Deploy complete"
echo "═══════════════════════════════════════════════════════════"
