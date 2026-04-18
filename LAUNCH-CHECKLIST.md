# MN-CCORE Lab Hub — Launch Checklist (April 21, 2026)

> The living, week-by-week launch plan is in the Peripheral Brain repo:
> `Projects/mn-ccore-lab-hub/plans/april-21-launch-readiness.md`. This file
> is the Hub-side quick reference of Nick-must-do items + pre-launch verify steps.

## Prerequisites (Nick must do — blocks launch)

### 0. Flip the auth enforcement flags

As of Phase 35 (2026-04-18), two flags gate hard auth enforcement. Both
default OFF for PI-only public-mode operation — flip them before the team
gets the link.

**Server-side (forces 401 on any POST/PUT without JWT or API key):**
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

Configure in Cloudflare dashboard → Zero Trust → Access → Applications:
- Create application for `mn-ccore-lab.pages.dev`
- Restrict paths: `/dashboard*`, `/personal*`, `/my-hub*`, `/tasks*`, `/my-tasks*`, `/calendar*`, `/deadlines*`, `/projects*`, `/manuscripts*`, `/ideas*`, `/decisions*`, `/search*`, `/meetings*`, `/meeting-notes*`, `/activity*`, `/analytics*`, `/settings*`, `/grants*`, `/digest*`, `/narratives*`, `/transcripts*`, `/sessions*`, `/pi*`, `/ask*`, `/team/*`
- Allow: email ending in `@umn.edu`
- Public paths (no auth): `/`, `/team` (public list), `/publications*`, `/network*`, `/contact*`, `/pulse*`, `/research*`, `/people*`

### 2. RESEND_API_KEY (daily digest email)

Cloudflare dashboard → Pages → mn-ccore-lab → Settings → Environment variables.
Add `RESEND_API_KEY` from [resend.com](https://resend.com) dashboard. Activates
the daily coordinator email digest cron (`api/routes/digest-email.ts`).

Preview (works without key): `https://mn-ccore-lab.pages.dev/api/digest-preview?member=nick`

### 3. GitHub secrets for schema-drift CI

github.com/ingra107/mn-ccore-lab → Settings → Secrets and variables → Actions:
- `CLOUDFLARE_API_TOKEN` — D1 read scope (OAuth-style, not the env var)
- `CLOUDFLARE_ACCOUNT_ID` — from wrangler login

Activates nightly `.github/workflows/schema-drift.yml` that diffs prod D1
schema against committed `api/schema.sql`.

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

### 7. Run Playwright inspection + dogfood

```bash
npx playwright test --config=playwright.config.prod.ts tests/inspection.spec.ts --reporter=list
# Expect ≥213 passed, 0 failed.

npx playwright test --config=playwright.config.dogfood.ts --grep "page health" --reporter=list
# Expect 14/14 passed.
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

## Current state (2026-04-17)

| Item | Status |
|------|--------|
| Code complete | Phase 34 shipped (audit framework + key-link editor) |
| D1 schema | v42 applied (62+ tables) |
| Audit framework | Live — `npx tsx scripts/hub-audit.ts`, 30+ asserted flows, 0 P1 |
| Latest deploy | `b9644c75` (2026-04-17) |
| Dogfood page health | 14/14, 0 console errors |
| Cloudflare Access | **NICK MUST CONFIGURE** |
| RESEND_API_KEY | **NICK MUST SET** |
| GitHub secrets | **NICK MUST SET** |
| Workers tier | Paid ($5/mo, 10M requests/day) |
| Hermes polling | 60s |
| Post-launch audit cadence | Weekly via `hub-audit.ts` |

## Don't do at launch

- Do NOT run `wrangler pages deploy` directly. Use
  `bash /c/Users/ingra107/Peripheral-Brain/scripts/utils/safe_deploy.sh`
  which blocks deploys from untracked directories.
- Do NOT use `npx wrangler` with `CLOUDFLARE_API_TOKEN` env var set — it
  overrides OAuth with narrower scope. Strip the env var or use
  `CLOUDFLARE_API_TOKEN= npx wrangler ...`.
- Do NOT run Claude Desktop + Claude Code simultaneously on the same
  machine (file-lock conflicts per Peripheral Brain `feedback_claude-desktop-conflict.md`).
