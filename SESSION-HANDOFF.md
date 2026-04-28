# Session Handoff — 2026-04-28 (Phase 39 — bug sweep + iCal feeds + auto-create + profile page)

---

## What shipped this session — 4 PRs, 2 schema migrations, 1 IdP swap

- **HEAD `f44605ee` on main, in sync with origin.** Four squash-merges since 2026-04-27 close.
  - `c7bd33f0` — fix(today,settings): close 3 GH bugs (#49) — closed #46 + #47, plus Settings Integrations placeholder
  - `9c6fab10` — feat(calendar): personal iCal feeds for Today timeline (#50) — closed #45
  - `9931421c` — feat(team): auto-provision team_members on first CF Access login (#51)
  - `f44605ee` — feat(profile): /portal/profile page + lock down team update auth (#52)
- **GH issues closed:** #45, #46, #47, #48 (#48 closed without code via CF dashboard config)
- **Deployed:** `722efd9e.mn-ccore-lab.pages.dev`
- **Schemas applied to prod D1:**
  - v52: `user_calendar_feeds` + `user_calendar_events` (Phase 39, 2026-04-27)
  - v53: `team_members.auto_created` (Phase 39, 2026-04-28)
- **CF Access IdP swap (2026-04-28):** preset Google → Generic OIDC `Google UMN` with `Auth URL = https://accounts.google.com/o/oauth2/auth?prompt=select_account&hd=umn.edu`. New Web OAuth client created in Google Cloud Console (Peripheral Brain - UMN project) — separate from the existing Desktop client used by Peripheral Brain CLI.
- **Quality gate green.** `npm run build` + `npx tsc --noEmit` + `npm run test:api` (24/24 parser tests) all clean post-deploy.

## State changes a fresh session needs to know

### iCal feeds (Phase 39 / Rule 64)
- `api/lib/ics-parser.ts` — pure-JS RFC 5545 parser (Workers-compatible). Capabilities: RRULE expansion (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL/BYDAY/BYMONTHDAY/COUNT/UNTIL), TZID resolution via `Intl.DateTimeFormat`, STATUS=CANCELLED filtering, PARTSTAT=DECLINED filtering (per ownerEmail), meeting URL extraction from DESCRIPTION (Zoom/Teams/Meet) with Google `&sa=D` tracking strip, dedup by (summary, startAt). 24 vitest unit tests at `api/lib/ics-parser.test.ts`. Run via `npm run test:api` (uses node mode `vitest.config.api.ts` — separate from browser-mode component tests).
- `api/routes/calendar-feeds.ts` — 4 endpoints under `/api/integrations/calendar/*`:
  - `GET /feeds` — list user's feeds (returns obfuscated host preview, never raw URL)
  - `POST /feeds` — add feed (eager polls + parses on add)
  - `DELETE /feeds/:id` — remove feed (FK cascade clears events)
  - `GET /events?start=&end=` — list user's events; lazy-refreshes any feed with `last_polled_at` >15min stale before returning
- `src/components/CalendarFeedsPanel.tsx` — shared component used by both `/portal/profile` and `/portal/settings#integrations`. Single TanStack cache key `calendar-feeds`.
- `useUserCalendarEvents()` in `useApiData.ts` — TodayPage merges these events with team meetings (timed events sorted, untimed/all-day at top).

### Auto-create + claim (Phase 39 / Rule 24 updated, Rule 66)
- `ensureTeamMember()` in `api/helpers.ts` runs on every authed request. Four-branch: (1) email match no-op; (2) LUT slug match → CLAIM existing row (backfills email + photo_url); (3) email-prefix slug match → same claim path; (4) no match → INSERT auto_created=1 row.
- For new lab members: NO manual provisioning needed. Sign-in creates the row.
- For existing 19 members: first CF Access sign-in via `mesfin@umn.edu` claims the pre-provisioned `nate-mesfin` row, backfills email column from placeholder `nate-mesfin@umn.edu` to real `mesfin@umn.edu`, and adds Google profile photo if not already set. Name is NEVER overwritten — Nick's curated preferred name beats Google's display name.
- Yellow PENDING REVIEW badge on Team page for `auto_created=1` rows. Clears when role is assigned (admin-only update).

### Auth fix on `PUT /api/team/:slug` (Rule 66 footnote)
- Was: any authed user could edit ANY team_members row including role.
- Now: owner (slug derived from JWT email matches path slug) OR PI (lab_settings.pi_emails). 403 otherwise.
- Field tiers: `SELF_EDIT_FIELDS` (bio, photo_url, scholar_id, title, department, full_name, preferred_name, credentials) editable by owner; `ADMIN_ONLY_FIELDS` (role, member_type) PI-only.

### `/portal/profile` page (Rule 67)
- New route. Sidebar nav entry "My Profile" (lucide `User` icon — same as 'My Hub' link, not a conflict).
- `PATHS.profile = /portal/profile` added to `src/constants/paths.ts`.
- Inline-on-blur edit pattern. Saves invalidate `['team']` + `['team-raw']` cache keys.
- Embedded `<CalendarFeedsPanel />` so calendar config is on the same page as profile editing.
- Read-only role + member_type pills (admin-assigned).

### CF Access OIDC swap (Rule 65)
- Preset Google IdP DEPRECATED but still attached to the Access app as fallback. Remove after a few days of `Google UMN` working.
- Web OAuth client in Google Cloud Console: `MN-CCORE Lab Hub - CF Access` in `Peripheral Brain - UMN` project. Authorized redirect URI: `https://<TEAM>.cloudflareaccess.com/cdn-cgi/access/callback`.
- OIDC Claims: `name` + `picture` listed. Claims arrive at TOP LEVEL of the Access JWT (not in `oidc_fields`); the Test UI's empty `oidc_fields: {}` is a UI quirk, NOT a problem.
- `api/jwt-verify.ts` extracts `picture` claim. `AuthUser.picture` now exists.

## Next steps

### Verification (Nick or fresh session)
1. **Verify profile page** — sign in, open `/portal/profile`, edit a field, refresh, confirm persistence
2. **Verify claim flow** — have Nate Mesfin or another existing member sign in, then check:
   ```bash
   npx wrangler d1 execute mnccore-lab --remote --command="SELECT slug, email, photo_url FROM team_members WHERE slug IN ('nate-mesfin', 'casey-eddington', 'emma-bromley')"
   ```
   Their email column should flip from `slug@umn.edu` placeholder to real `mesfin@umn.edu` etc.
3. **Verify auto-create** — when a brand-new lab member (not in EMAIL_PREFIX_TO_SLUG) signs in for the first time, check `/portal/team` for their auto-row with PENDING REVIEW badge.
4. **Add real iCal feed** — paste your Google Calendar secret iCal URL into `/portal/profile` → confirm events appear on `/portal/dashboard`.

### Cleanup (when comfortable)
- Edit Access app in CF dashboard → uncheck old preset Google → keep only `Google UMN`
- Delete the preset Google IdP entry (Settings → Authentication → Login methods)

### Known follow-ups (NOT blocking)
- Adding `.github/workflows/schema-drift.yml` will regenerate the schema bundle next nightly run; v52 + v53 lands in the bundle automatically.
- The `_OldImpl_unused` placeholder in SettingsPage was eliminated during the extraction — clean.

## Don't-forget

- **CF dashboard cleanup** (above) — only thing that needs you, not code.
- **Settings → Integrations tab still shows** as a placeholder of sorts. The real UI lives in `CalendarFeedsPanel`. If you want to redirect that tab somewhere, edit `src/pages/portal/SettingsPage.tsx` line ~680 (`function IntegrationsPanel() { return <CalendarFeedsPanel /> }`).
- **Test database migrated** — `npm run test:local` should still work; if not, the tests/local-db-bootstrap.ts skip list might need v52/v53 added (mirror the skip pattern from v43/v48).

---

## Prior session summary (2026-04-27 Stitch batch) — kept for context

(Full prior handoff archived below the cut.)

---

# Earlier — Session Handoff — 2026-04-27 (Stitch consultant batch shipped)

## 🆕 2026-04-27 update — 5 PRs merged from Stitch batch

- **HEAD `7a79806d` on main, in sync with origin.** Six commits since the 2026-04-26 close (5 squash-merges + 1 PB-side follow-up).
  - `344cd3d8` — feat(manuscripts): category filter pills above the table (#39 / PR #40)
  - `40a8e84a` — feat(settings): RangeSlider for Lab thresholds (#36 / PR #41)
  - `fde6b44c` — feat(hermes): citation pills + Operation Findings callout (#38 / PR #42)
  - `c45c5013` — feat(tasks): Intelligence tab — relevance + velocity + Hermes draft (#35 / PR #43)
  - `3605cf4d` — feat(insights): /portal/insights operational dashboard (#37 EPIC / PR #44)
  - `7a79806d` — feat(api): return ids[] from /tasks/sync-bulk for PB hub_slug capture (PB-side follow-up)
- **All 5 GH issues auto-closed** (#35-#39). Stitch consultant batch fully discharged.

(Earlier content preserved in CHANGELOG.md and prior commits.)
