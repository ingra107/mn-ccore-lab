# MN-CCORE Lab Hub — Launch Checklist (April 21, 2026)

> The living, week-by-week launch plan is in the Peripheral Brain repo:
> `Projects/mn-ccore-lab-hub/plans/april-21-launch-readiness.md`. This file
> is the Hub-side quick reference of Nick-must-do items + pre-launch verify steps.
>
> **🎉 STATUS: LAUNCHED 2026-04-21.** §0, §1, §3, §5 all DONE. §2
> (RESEND_API_KEY) skipped — optional for daily digest cron, can be added
> anytime. Remaining item: actually share the URL with the team.

## Remaining work before team launch

| Item | Status |
|------|--------|
| §0 flip auth flags (`REQUIRE_AUTH`, `TEST_MODE_KEY`, `VITE_REQUIRE_AUTH`) | ✓ done 2026-04-21 |
| §1 Cloudflare Access + `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` | ✓ done 2026-04-21 |
| §2 `RESEND_API_KEY` | SKIPPED — daily digest email cron inactive until key set. Add anytime. |
| §3 GitHub secrets for schema-drift CI | ✓ done 2026-04-21 |
| Share URL with team | ← Nick action |

## Prerequisites (Nick must do — blocks launch)

### 0. Flip the auth enforcement flags

**✓ DONE 2026-04-21.** All four server secrets set in Cloudflare Pages:
`REQUIRE_AUTH=1`, `TEST_MODE_KEY=<32-char hex>`, `CF_ACCESS_TEAM_DOMAIN`,
`CF_ACCESS_AUD`. Verified via deploy `c5e46630`.

Two flags gate hard auth enforcement. Both default OFF for PI-only
public-mode operation — flip them before the team gets the link.

**Server-side (forces 401 on any POST/PUT without JWT or API key, AND
on `/api/bug-report` so strangers can't spam GitHub Issues):**
```bash
echo 1 | wrangler pages secret put REQUIRE_AUTH --project-name mn-ccore-lab
```

**Client-side (replaces portal routes with a sign-in wall for
unauthenticated users):**
```bash
# In .env.production (create if missing):
echo "VITE_REQUIRE_AUTH=1" >> .env.production
# Then rebuild + deploy:
npm run build
npx wrangler pages deploy dist --project-name mn-ccore-lab
```

**Optional emergency bypass:** appending `?strict=1` to any URL activates
the client-side gate immediately without redeploying (useful for testing
the sign-in wall against a live deploy).

Also make sure the `X-Test-Mode` header cannot flip prod to the test DB
in the wild — set a secret so only Playwright knows it:
```bash
echo "$(openssl rand -hex 16)" | wrangler pages secret put TEST_MODE_KEY --project-name mn-ccore-lab
```
Playwright personas read this from the `HUB_TEST_MODE_KEY` env var when
running against prod D1 isolation.

### 1. Cloudflare Access (team auth)

**✓ DONE 2026-04-21.** App configured in Cloudflare dashboard → Zero
Trust → Access → Applications:
- Application for `mn-ccore-lab.pages.dev`
- **Single destination:** `mn-ccore-lab.pages.dev/portal/*` (post-Phase-37 migration — all gated surfaces live under `/portal/*`)
- Policies: `UMN Team` (allow @umn.edu) + `Nick Only` (allow nicholas.ingraham@gmail.com) + `Audit Service Token` (service auth for audit scripts)
- Public routes (no auth, at root): `/`, `/team`, `/team/:slug`, `/team/:slug/trajectory`, `/nick`, `/nate`, `/publications*`, `/network*`, `/contact*`, `/pulse*`

Legacy root paths like `/dashboard`, `/projects/:slug` still work — `src/App.tsx` has `<Navigate>` redirect shims that bounce to `/portal/...` equivalents. Bookmarks continue working.

**✓ Both secrets set 2026-04-21** — JWT signature verification is
active. Backend validates CF Access JWTs against the JWKS at
`peripheral-brain.cloudflareaccess.com`. No longer decode-only.

```bash
# For reference — already set:
echo "peripheral-brain.cloudflareaccess.com" | wrangler pages secret put CF_ACCESS_TEAM_DOMAIN --project-name mn-ccore-lab
echo "47b7d48e...40139c" | wrangler pages secret put CF_ACCESS_AUD --project-name mn-ccore-lab
```

Verification: after deploy, `curl https://mn-ccore-lab.pages.dev/api/auth/me` with a forged JWT should return `{authenticated: false}`. With a real CF Access cookie, it returns `{authenticated: true, email, name}`. Implementation in `api/jwt-verify.ts`.

### 2. RESEND_API_KEY (daily digest email)

**SKIPPED (optional).** The daily coordinator email digest cron
(`api/routes/digest-email.ts`) is inactive until this key is set.
Add anytime by signing up at [resend.com](https://resend.com) and
adding `RESEND_API_KEY` to Cloudflare dashboard → Pages →
mn-ccore-lab → Settings → Environment variables.

Preview endpoint works without the key:
`https://mn-ccore-lab.pages.dev/api/digest-preview?member=nick`

### 3. GitHub secrets for schema-drift CI

**✓ DONE 2026-04-21.** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
set at github.com/ingra107/mn-ccore-lab → Settings → Secrets and
variables → Actions. Schema-drift workflow green as of 2026-04-21
13:40 UTC.

### 4. Team data (already populated — verify)

- `src/data/team.ts` has 19 team members. v41 naming fields (`full_name`,
  `preferred_name`) are in D1 `team_members` table. Verify via
  `/team/:slug` rendering "formal tier" correctly.
- Team headshots — mostly UMN Med School bio photos. Any missing fall back
  to initials.

### 5. Google Scholar IDs

Most members with publications have their scholar_id populated. If someone
is missing, update `src/data/team.ts`.

## Verification (after prerequisites)

### 6. Run the interaction audit

```bash
npx tsx scripts/hub-audit.ts
# Full 14-section run, ~8 min, cleanup at end.
# Expect 0 P1 FAILs; frictions documented in HUB-AUDIT-CHECKLIST.md are known.
```

### 7. Run Playwright inspection + dogfood + mobile smoke

```bash
npx playwright test --config=playwright.config.prod.ts tests/inspection.spec.ts --reporter=list
# Expect ≥213 passed, 0 failed.

npx playwright test --config=playwright.config.dogfood.ts --grep "page health" --reporter=list
# Expect 14/14 passed.

# Phase 36 mobile smoke (Pixel 5 emulation)
npx playwright test --config=playwright.config.mobile.ts --reporter=list
# Expect 2/2 passed.
```

### 8. CF Access live-check

Open `mn-ccore-lab.pages.dev` in incognito → should redirect to Cloudflare
Access login. Log in with `@umn.edu` account → portal loads.

### 9. Email digest preview

GET `https://mn-ccore-lab.pages.dev/api/digest-preview?member=nick` → should
return HTML email preview (works before RESEND_API_KEY is set).

### 10. Mobile spot-check

Open the site on an actual phone (or DevTools 375×812):
- Dashboard → Tasks → More overflow → Calendar. ≤2 minute flow.
- MobileTabBar "More" drawer opens and closes cleanly.
- No horizontal scroll.

## Current state (2026-04-21 — LAUNCHED)

| Item | Status |
|------|--------|
| Code complete | Phase 37 portal URL migration shipped + round-2 design close + motion close (43 tickets) + Phase 36d + round-1. |
| D1 schema | v49 applied (60 tables — v47 Airtable funeral cols 2026-04-20, v48 27-index reconcile, v49 13 tables + 2 unique indexes reconcile 2026-04-21) |
| Schema drift CI | 🟢 green (nightly 03 CT; `.github/workflows/schema-drift.yml`). Guardrail for post-launch drift. |
| Audit framework | Live — `npx tsx scripts/hub-audit.ts`, 30+ asserted flows, 0 P1 |
| Latest deploy | `c5e46630.mn-ccore-lab.pages.dev` (2026-04-21) — HEAD `143c1db` includes VITE_REQUIRE_AUTH client gate |
| Dogfood page health | 14/14, 0 console errors |
| Inspection suite | 213/213 vs prod |
| Smoke suite | 27/27 (was 26/27 — /network flake fixed) |
| Mobile smoke | 2/2 (Pixel 5 emulation) |
| Desktop journey smoke | 1/1 (was failing on intercept race — fixed) |
| Design handoff | Round-1: 32/33 shipped (P2-14 is a data-entry ask, not design). Round-2: 43/43 shipped. |
| Cloudflare Access | ✅ configured 2026-04-21 — `mn-ccore-lab.pages.dev/portal/*`, policies: UMN Team + Nick Only + Audit Service Token |
| CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD secrets | ✅ set 2026-04-21 (JWT signature verification active) |
| REQUIRE_AUTH + TEST_MODE_KEY secrets | ✅ set 2026-04-21 |
| VITE_REQUIRE_AUTH (client gate) | ✅ set in `.env.production` 2026-04-21 |
| RESEND_API_KEY | SKIPPED (optional — daily digest cron inactive until set) |
| GitHub secrets (schema-drift CI) | ✅ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set 2026-04-21 |
| Workers tier | Paid ($5/mo, 10M requests/day) |
| Hermes polling | 60s |
| Post-launch audit cadence | Weekly via `hub-audit.ts` + nightly schema-drift CI |

## Don't do at launch

- Do NOT run `wrangler pages deploy` directly. Use
  `bash /c/Users/ingra107/Peripheral-Brain/scripts/utils/safe_deploy.sh`
  which blocks deploys from untracked directories.
- Do NOT use `npx wrangler` with `CLOUDFLARE_API_TOKEN` env var set — it
  overrides OAuth with narrower scope. Strip the env var or use
  `CLOUDFLARE_API_TOKEN= npx wrangler ...`.
- Do NOT run Claude Desktop + Claude Code simultaneously on the same
  machine (file-lock conflicts per Peripheral Brain `feedback_claude-desktop-conflict.md`).
