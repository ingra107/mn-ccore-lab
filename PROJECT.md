---
record_id: rec6HYkDBk4di5ncw
slug: mn-ccore-lab-hub
created: 2026-03-25
status: active
domain: Research
tier: 2-Biweekly
next_action: Flip VITE_REQUIRE_AUTH=1 + `wrangler pages secret put REQUIRE_AUTH` + `TEST_MODE_KEY` before team launch. See LAUNCH-CHECKLIST.md section 0.
primary_folder: C:/Users/ingra107/mn-ccore-lab
---

# MN-CCORE Lab Hub

React 19 + Vite 8 + Tailwind v4 + Cloudflare Pages/D1 lab management
platform for Nick's critical-care research group at UMN.

**Live:** https://mn-ccore-lab.pages.dev  (PI-only; team not yet onboarded)
**Repo:** https://github.com/ingra107/mn-ccore-lab  (650+ commits)
**Current deploy:** `bd2a7cc` (2026-04-19)
**Quality gate:** 🟢 GREEN — preflight 97 pass / 0 fail, deep-audit 14/14 suites clean, axe WCAG 2.1 AA clean across 29 pages × 2 color schemes.

## 🚨 Read these FIRST every session

1. **`SESSION-HANDOFF.md`** — one-page current state, gotchas, next action, git HEADs, key files touched. Always read this before writing any code.
2. **`LAUNCH-CHECKLIST.md`** — section 0 is the gate for going live. If Nick mentions the team or launch, read this.
3. **`CLAUDE.md`** — full operating guide (design system, palette, sync model, file map).
4. **`REFERENCE.md`** — API endpoints, D1 table list, conventions.
5. **`CHANGELOG.md`** — top entry is the most recent phase; jump there for "what changed recently."
6. **`docs/OBSERVABILITY.md`** — /api/health runbook + how to wire external uptime monitoring.

## Phase 35 COMPLETE — A11y + Sync Parity + Launch Readiness (2026-04-18/19)

**Status:** ✓ Shipped at `bd2a7cc` on origin/main.

### Three tracks this phase

1. **Full WCAG 2.1 AA accessibility** — color tokens pinned to literal
   sRGB hex (axe-core 4.11 mis-parses OKLCH); opacity codemod (640+
   sites) bumped 0.30-0.55 → 0.85; 29 pages × 2 color schemes clean.
2. **Hub ↔ brain.db sync parity** — `task_comments` mirror (read-only
   `d1_task_comments`) + Hub-originated projects now flow back via
   `sync_d1_pull --task-comments` + `--hub-projects`. Suite 15 asserts
   both hard-pass.
3. **Consultant-review launch blockers closed** — `/api/pb/*` PI-gated
   (403 to non-PI), `/api/bug-report` requires auth (401), `X-Test-Mode`
   requires `TEST_MODE_KEY` secret, `REQUIRE_AUTH` + `VITE_REQUIRE_AUTH`
   flags wire full hard-auth, `/api/health` observability + runbook.

### Consultant nice-to-haves (shipped 2026-04-19)

All five closed:
- ✅ Hono router — `api/index.ts` rewritten with `hono@4.12.14`, 1875 → 1330 lines.
- ✅ `lab_settings.pi_emails` — schema-v44 seeded; `getPiEmails(env)` reads with 5-min cache + fallback. Client-side PI_EMAILS duplicates removed; client reads `user.isPi` from `/api/auth/me`.
- ✅ Server-side JWT signature verification — `api/jwt-verify.ts` (RS256 via CF Access JWKS, exp/nbf/iss/aud checks). Needs `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` secrets to enforce. See LAUNCH-CHECKLIST section 1.
- ✅ `team_members.email` — schema-v43, column + backfill; three derivation sites now read the column.
- ✅ `pb-sector.handleCommandCenter` — 11 parallel D1 queries → single `env.DB.batch([...])` RPC.

---

**See the PB-side project folder** for research/strategy docs, competitive
analysis, and the HUB-AUDIT-CHECKLIST:
`C:/Users/ingra/Peripheral-Brain/Projects/mn-ccore-lab-hub/`
