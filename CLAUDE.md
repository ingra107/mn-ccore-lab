# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- not just a website, but where research gets managed, meetings get run, and information flows bidirectionally between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (108 commits) |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Data | TanStack Query v5 + Cloudflare D1 (12 tables, 30 API endpoints) — ALL LIVE |
| Deploy mode | Manual via wrangler -- NO auto-deploy |
| D1 database | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM) |
| Living plan | `Projects/mnccore-minnesota-critical-care/ld-mnccore-hub-plan.md` (PB repo) |

## Design System

- **Fonts:** Fraunces (display) / DM Sans (body) / JetBrains Mono (mono)
- **Palette:** ink `#0f1923` / gold `#c9a84c` / cream `#faf8f3` / maroon `#7a0019` / teal `#2d8a8a`
- **Centering:** ALL containers use `.content-container` -- no custom max-width
- **Dark mode:** CSS variables invert via `.dark` class. Card dark bg: `#162535`.
- **Shared utilities:** `src/lib/dateUtils.ts` (6 formatters), `src/data/team.ts:getPersonInfo()`, `src/lib/api.ts`

## Architecture

```
Nick's CLI (brain.db)                      Team Members (browsers)
     |                                           |
     |  sync_d1_push.py (scheduled)              |  React + TanStack Query
     |  brain.db -> D1                           |  (optimistic UI, initialData)
     |                                           |
     |  sync_d1_pull.py (scheduled)              |  POST /api/* (writes)
     |  D1 updates -> brain.db                   |  (comments, toggles, stage edits)
     |                                           |
     +---- HTTP API / Wrangler -----+------- HTTP API ----+
                                    |
                               D1 (mnccore-lab)
                               12 tables, 350+ rows
```

- **Data layer:** TanStack Query v5 hooks -> D1 API in production, static TS fallback in dev
- **API:** Cloudflare Worker with 14 GET + 13 POST/PUT endpoints (auth-gated writes)
- **Auth:** Cloudflare Access + Google OAuth (TODO: restrict to /dashboard, /projects, /meetings paths only)
- **Sync:** Python scripts in Peripheral Brain (push + pull), scheduled in dispatcher

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Typed D1 API client -- row types + fetch wrappers |
| `src/hooks/useApiData.ts` | 12 TanStack Query hooks with D1->frontend transforms + static fallback |
| `src/hooks/useMutations.ts` | 7 mutation hooks with optimistic cache updates + rollback |
| `src/lib/dateUtils.ts` | Shared date formatters (6 exports) -- single source of truth |
| `src/data/team.ts` | Team members + `getPersonInfo()` shared utility |
| `src/components/Avatar.tsx` | Photo/initials avatar -- uses overflow-hidden + w-full h-full img |
| `src/hooks/useCountUp.ts` | Animated counters -- StrictMode-safe, re-animates on async data |
| `src/pages/MeetingDetail.tsx` | Meeting lifecycle: agenda, action items, decisions, notes |
| `src/pages/ProjectDetail.tsx` | Two-way editing, comments, updates, action items, add-to-agenda |
| `src/components/dashboard/ProjectHealthCard.tsx` | Health indicators from /api/projects/health |
| `api/index.ts` | Cloudflare Worker -- all 27 API endpoints |
| `api/schema-v2.sql` | D1 schema for meetings, action_items, agenda_items, project_updates |
| `api/schema-v3.sql` | D1 schema for research_digest table |
| `functions/api/[[route]].ts` | Pages Function catch-all — proxies /api/* to Worker |
| `src/pages/Digest.tsx` | Research Digest browser (152 papers, topic/date/status filters) |
| `src/components/UpcomingMeetingBanner.tsx` | Homepage meeting banner with action item count |
| `src/components/LatestDigest.tsx` | Homepage digest preview (top 4 papers) |

## Critical Rules

1. **Content visible by default.** `.fade-in-up` starts at opacity:1. NEVER hide content behind animations.
2. **Hero cards use `<a>` tags** (full page load), not React Router `<Link>`. AnimatePresence + useCountUp conflict.
3. **initialData as factory functions.** Always `initialData: () => data`, never `initialData: data`.
4. **Avatar overflow-hidden.** Container has `overflow-hidden` + img uses `w-full h-full object-cover`.
5. **PubMed is truth for publications.** Scholar CSV for completeness check only.
6. **Grants: Active vs Pending.** Display separately with clear labels.
7. **`getPersonInfo()` from `src/data/team.ts`** -- never create local copies.
8. **Date formatting from `src/lib/dateUtils.ts`** -- never create local formatters.

## Roadmap

1. **Phase 1 -- DONE:** Public website (12 pages, 60+ components)
2. **Phase 2 -- DONE:** D1 backend + TanStack Query data layer (12 tables, 30 endpoints)
3. **Phase 3 -- DONE:** Interactive team portal (meetings, action items, comments, updates)
4. **Phase 4 -- DONE:** brain.db <-> D1 sync, meeting automation, digest sync
5. **Phase 5 -- DONE:** D1 API activation, mobile optimization, dark mode, edge cases
6. **Phase 6 -- DONE:** Research Digest page, homepage enhancements, nav badges, SEO
7. **Phase 7 -- NEXT:** Re-enable auth for team launch, PB Sector, real-time features

## Meeting Cadence

- **Biweekly Tuesdays at 3pm CT** (106 attendees on calendar)
- Anchor: `date(2026, 4, 7)`, weekday=1 (Tuesday)
- Sequence: ...Mar 10, Mar 24, **Apr 7**, Apr 21...
- Meeting automation runs Monday mornings (creates D1 meeting + agenda from brain.db)

## Known Gotchas

| Problem | Fix |
|---------|-----|
| Hero cards render loop | Use `<a>` tags, not React Router Link |
| useCountUp StrictMode | Hook handles double-mount cleanly; brief flash in dev is expected |
| initialData flash | Use factory functions: `initialData: () => data` |
| Avatar pill shape | Container needs `overflow-hidden`, img needs `w-full h-full` |
| Meeting ID collision | IDs include random suffix: `mtg-date-random` |
| Tailwind v4 | `@import` syntax, not `@tailwind` directives |
| Cloudflare Access blocks all | Fix: restrict to /dashboard, /projects, /meetings paths only |
| Network chunk 1.3MB | Expected (three.js). Already code-split via React.lazy |

## Peripheral Brain Connection

- **Project record:** `MN-CCORE Lab Hub` (type: Nick_Lab) in brain.db
- **Living plan:** `Projects/mnccore-minnesota-critical-care/ld-mnccore-hub-plan.md` -- READ FIRST
- **Vision doc:** `Projects/mnccore-minnesota-critical-care/ld-mnccore-hub-vision.md`
- **Memory:** `memory/project_mnccore-website-redesign.md`
- **Sync push:** `scripts/db/sync_d1_push.py` (brain.db -> D1)
- **Sync pull:** `scripts/db/sync_d1_pull.py` (D1 -> brain.db)
- **Meeting automation:** `scripts/scheduled/meeting_automation.py`
