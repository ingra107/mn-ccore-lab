# What's new + Lab pulse pill (#156) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale `PhaseReleaseBanner` with one top-bar pill whose panel has two tabs, What's new (releases drafted at deploy, approved by Nick) and Lab pulse (announcement, active faces, lab-wide counts, recent wins).

**Architecture:** Two new D1 tables (`hub_releases`, `hub_announcements`, schema-v148). Draft visibility is enforced in `api/lib/table-scope.ts` (non-PI viewers only ever read `status='approved'`), not in route code. Lab-wide counts read through ONE narrow function bound to `c.get('unscopedDb')` that returns numbers and slugs only. The deploy chain gains a step that opens or extends the single pending draft. The UI is one component reading `GET /api/pulse` through TanStack Query, with read state in `user_prefs`.

**Tech Stack:** Hono v4 Worker + D1, React 19, TanStack Query v5, Vitest (api suite on `prodSchemaDb`, lib suite for pure functions), Node ESM scripts.

**Spec:** `docs/superpowers/specs/2026-10-26-whats-new-lab-pulse-design.md` (approved by Nick 2026-10-26). Read it first; this plan does not repeat its reasons.

## Global Constraints

- Schema number = next free: **v148** (`python scripts/check-schema-versions.py` must pass).
- Lab-wide aggregate reads carry `// rule-90-aggregate-exempt: #156` and return counts/slugs only, never titles.
- Approve / discard / post-announcement / delete-announcement require a **signed-in PI identity**; the API key alone must get 403. (`isPiRequest` returns true for the key, so it is NOT the gate for these.)
- The API key may create a draft and write its `title`/`blurbs` only.
- At most one `status='draft'` row exists at any time.
- A failed release-draft POST at deploy **warns and exits 0**.
- Pill read state lives in `user_prefs` key `hub.pulse.seen` = `{ releaseId: string|null, announcementId: string|null }`.
- Releases blurbs: 1-4 items, each `{ lead: string, text: string }`; announcement body 1-280 chars.
- Members only (Rule 66); no `servesNonMembers`, no `auth:'public'`.
- Icons ≤20px use `ICON_PROPS`; tabs use `SegmentedToggle`; faces use `Face` from `src/components/today/skin.tsx`; colors via `--job-*` / `--sk-*` gray ramp (the color-jobs commit gate refuses raw `--sk-ac`).
- Commits: path-explicit `git commit -F <msgfile> -- <paths>`, author ingra107, no Claude attribution.

## Review Focus

1. **A non-PI member must never see a draft**, including through `GET /api/pulse`, search, or any future read. Test: as a non-PI person, a draft row exists and `/api/pulse` returns `draft: null` and `release` = the last approved (Task 1, Task 3).
2. **The API key cannot approve.** A Bearer-key `POST /api/releases/:id {action:'approve'}` returns 403 and the row stays `draft` (Task 3).
3. **Two deploys in a row with no approval** extend the one draft instead of creating a second, and a discarded range is not re-offered (Task 4).
4. **Nothing ever released / no announcement / no activity**: `/api/pulse` returns nulls and zeros, and the pill reads "Lab pulse · 0 active" with no gold dot (Task 2, Task 5).
5. **Seen id that no longer exists** (announcement deleted): the pill compares against the newest existing item and does not stay gold forever (Task 5).

---

### Task 1: Schema v148 and draft-hiding scope

**Files:**
- Create: `api/schema-v148-hub-releases-announcements.sql`
- Modify: `api/lib/table-scope.ts` (add both tables to `HUB_TABLES`; scope entries)
- Modify: `api/bootstrap-schema.sql` only if the repo's convention appends new tables there (check how v143 `user_prefs` landed; follow it)
- Test: `api/lib/table-scope.releases.test.ts`

**Interfaces:**
- Produces tables:
  - `hub_releases(id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('draft','approved','discarded')), title TEXT NOT NULL DEFAULT '', blurbs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(blurbs_json)), commit_from TEXT NOT NULL, commit_to TEXT NOT NULL, commits_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(commits_json)), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), approved_at TEXT, approved_by TEXT)` plus `CREATE UNIQUE INDEX hub_releases_one_draft ON hub_releases(status) WHERE status='draft'`.
  - `hub_announcements(id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280), author_slug TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT)`.
- Produces scopes: `hub_announcements: LAB`; `hub_releases: { kind:'scoped', key:['id'], dependsOn:[], where: (v) => v.kind === 'service' || (v.kind === 'person' && v.pi) ? '1' : "hub_releases.status = 'approved'" }` (match the exact `Scope` shape used by neighbours such as `hub_errors`).

- [ ] **Step 1: Write the failing test** `api/lib/table-scope.releases.test.ts` on `prodSchemaDb()`: insert one approved and one draft row; through `viewerDb(raw, personViewer({slug:'casey-eddington', email:'eddin022@umn.edu', pi:false}))` `SELECT id FROM hub_releases` returns only the approved id; through a PI person viewer and `serviceViewer()` it returns both. Second case: inserting a second `status='draft'` row throws (unique index).
- [ ] **Step 2: Run** `npx vitest run --config vitest.config.api.ts api/lib/table-scope.releases.test.ts` → FAIL (no such table).
- [ ] **Step 3: Write the migration** with the header convention of `api/schema-v147-drop-lab-questions.sql` (what, why, APPLY lines for test then prod via `scripts/wrangler-d1`, ROLLBACK = two `DROP TABLE`), then add the scope entries.
- [ ] **Step 4: Run** the test → PASS; run `python scripts/check-schema-versions.py` → OK; run `npx vitest run --config vitest.config.api.ts api/lib/table-scope` → PASS (the HUB_TABLES pin test, if any, updated).
- [ ] **Step 5: Commit** `api/schema-v148-hub-releases-announcements.sql api/lib/table-scope.ts api/lib/table-scope.releases.test.ts` (+ bootstrap if touched).

### Task 2: Pulse aggregates (lab-wide, numbers only)

**Files:**
- Create: `api/lib/pulse-aggregates.ts`
- Test: `api/lib/pulse-aggregates.test.ts`

**Interfaces:**
- Consumes: Task 1 tables (only for the shape of the returned object; aggregates read `tasks`, `entity_seen`, `activity_entries`, `publications`, `team_members`).
- Produces:
  ```ts
  export interface PulseCounts { activeSlugs: string[]; tasksDone: number; milestonesHit: number; newPapers: number }
  export async function labPulseCounts(db: D1Database, args: { nowIso: string; weekStartIso: string }): Promise<PulseCounts>
  ```
  Rules (copy from the spec, "Settled after the builder check"): active = distinct `team_members.slug` with `entity_seen.last_seen_at` or `activity_entries.created_at` (as actor) within 24h of `nowIso`, excluding `claude-ai`, sorted by most recent; tasksDone = tasks with `completed_at >= weekStartIso` and `deleted_at IS NULL`; milestonesHit = same AND `kind='milestone'`; newPapers = `publications.created_at` within 30 days, EXCLUDING rows whose `created_at` is shared by more than 5 publications (bulk sync).
  Note `entity_seen.last_seen_at` is `'YYYY-MM-DD HH:MM:SS'` while others are ISO: normalise with `datetime()` on both sides.

- [ ] **Step 1: Write failing tests** on `prodSchemaDb()` with `d1Adapter`: (a) empty DB → `{activeSlugs:[], tasksDone:0, milestonesHit:0, newPapers:0}`; (b) a seen row 2h old for `casey-eddington` and a 30h-old one for `nick-ingraham` → `activeSlugs` = `['casey-eddington']`; (c) a `claude-ai` activity row is not counted; (d) tasks: one completed after weekStart, one before, one after but `deleted_at` set, one milestone after → `tasksDone:2, milestonesHit:1`; (e) 6 publications sharing one `created_at` + 1 alone → `newPapers:1`.
- [ ] **Step 2: Run** `npx vitest run --config vitest.config.api.ts api/lib/pulse-aggregates.test.ts` → FAIL.
- [ ] **Step 3: Implement** `labPulseCounts` as four prepared statements in one `db.batch`, each preceded by `// rule-90-aggregate-exempt: #156`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** both files.

### Task 3: Routes: pulse read, releases, announcements

**Files:**
- Create: `api/routes/pulse.ts`
- Modify: `api/helpers.ts` (add `isPiIdentity`)
- Modify: `api/index.ts` (five `defineRoute` entries, near the bug-report block)
- Modify: `api/routes/route-contract.generated.test.ts` (route pin +5, via the repo's regenerate script if one exists; grep for how the pin is updated)
- Create: `shared/pulse.ts` (types shared with the UI)
- Test: `api/routes/pulse.test.ts`

**Interfaces:**
- Consumes: `labPulseCounts` (Task 2), tables (Task 1).
- Produces:
  ```ts
  // shared/pulse.ts
  export interface ReleaseBlurb { lead: string; text: string }
  export interface PulseRelease { id: string; title: string; blurbs: ReleaseBlurb[]; approvedAt: string | null; status: 'draft' | 'approved' }
  export interface PulseAnnouncement { id: string; body: string; authorSlug: string; createdAt: string }
  export interface PulseWin { kind: 'milestone' | 'publication'; title: string; date: string; href: string | null }
  export interface PulsePayload {
    release: PulseRelease | null            // newest approved
    pastReleases: { id: string; title: string; approvedAt: string }[]  // up to 10, excluding `release`
    draft: PulseRelease | null              // PI viewers only, else null
    announcement: PulseAnnouncement | null  // newest non-deleted within 14 days
    active: string[]; tasksDone: number; milestonesHit: number; newPapers: number
    wins: PulseWin[]                        // up to 3, viewer-scoped
  }
  // api/helpers.ts
  export async function isPiIdentity(request: Request, env: Env): Promise<boolean> // signed-in PI ONLY; API key => false
  ```
  Routes (all members-only `auth:'authed'` unless noted):
  - `GET /api/pulse?week_start=<iso>` → `{ data: PulsePayload }`. `week_start` missing/invalid → Monday 00:00 America/Chicago of today. Counts via `labPulseCounts(c.get('unscopedDb'), …)` passed in as a bound function (pattern: `slugClaimCheck(c.get('unscopedDb'))`); everything else reads the viewer handle `E(c).DB`, so the draft is hidden by Task 1's scope.
  - `POST /api/releases` (API key only; else 403). Two bodies:
    - `{ probe: true }` → `{ data: { lastCommitTo: string | null } }` = `commit_to` of the newest draft, else of the newest non-draft (approved OR discarded) release; writes nothing.
    - `{ commitTo: string, commits: {sha:string,subject:string}[] }` → if a draft exists: append commits not already present (dedup by sha), set `commit_to`, return `{ data: { id, created: false } }`; else create with `commit_from` = `commit_to` of the newest non-draft release (or `commits[0].sha` if none) → `{ data: { id, created: true } }`. `commits` empty → 200 `{ data: null }`, nothing written.
  - `POST /api/releases/:id` body `{ action: 'edit', title, blurbs } | { action: 'approve' } | { action: 'discard' }`. `edit`: API key or `isPiIdentity`; validate 1-4 blurbs, non-empty `title` ≤ 80. `approve`/`discard`: `isPiIdentity` only (API key → 403); approve requires non-empty title and ≥1 blurb (400 `needs_blurbs` otherwise); only a `draft` row can change (409 otherwise).
  - `POST /api/announcements` body `{ body }` → `isPiIdentity` only; 1-280 chars.
  - `POST /api/announcements/:id/delete` → `isPiIdentity` only; sets `deleted_at`.
  IDs: the repo's ULID helper (grep `ulid` in `api/lib`; reuse it, do not add a dependency), prefixed `rel_` / `ann_`.

- [ ] **Step 1: Write failing tests** in `api/routes/pulse.test.ts` using the real helpers with `TEST_MODE_KEY` + `X-Test-User` (copy the setup of `member-featured-publications.test.ts`):
  - `isPiIdentity` with only a valid Bearer key → `false`; with a PI test user → `true`.
  - non-PI GET with a draft present → `data.draft === null`, `data.release.id` = approved id.
  - PI GET → `data.draft.id` = draft id.
  - key POST /api/releases twice with overlapping commits → one draft row, commits deduped by sha, `created` true then false.
  - after a discard, the next key POST opens a new draft whose `commit_from` equals the discarded row's `commit_to` (discarded commits are never re-offered); `{probe:true}` returns that same value and writes no row.
  - key `{action:'approve'}` → 403 and row still `draft`; PI approve with empty blurbs → 400 `needs_blurbs`; PI approve after key edit → 200, `approved_by` = PI slug.
  - announcement post by non-PI member → 403; by PI with 281 chars → 400; delete hides it from GET.
  - empty DB GET → all nulls, zeros, empty arrays.
- [ ] **Step 2: Run** `npx vitest run --config vitest.config.api.ts api/routes/pulse.test.ts` → FAIL.
- [ ] **Step 3: Implement** `isPiIdentity` (= `getAuthUser` + `getPiEmails`, no key branch), `shared/pulse.ts`, `api/routes/pulse.ts` handlers, and the `defineRoute` entries.
- [ ] **Step 4: Run** the test file → PASS; then `npm run test:api` → all PASS (route-contract pin updated); `npx tsc -b --noEmit` → clean.
- [ ] **Step 5: Commit** the six files.

### Task 4: Deploy step opens/extends the draft

**Files:**
- Create: `scripts/post-release-draft.mjs`
- Create: `scripts/lib/release-commits.mjs` (pure)
- Test: `scripts/lib/release-commits.test.mjs` (run by the lib vitest config; if that config does not include `scripts/`, put the test in `src/lib/__tests__/release-commits.test.ts` importing the `.mjs`)
- Modify: `package.json` (`deploy:pages:gated` ends `&& npm run postdeploy:probe && npm run postdeploy:release-draft`; add `"postdeploy:release-draft": "node scripts/post-release-draft.mjs"`)

**Interfaces:**
- Consumes: `POST /api/releases` `{probe:true}` and `{commitTo, commits}` (Task 3). The server dedups by sha, so re-sending a commit is harmless.
- Produces:
  ```js
  export function selectReleaseCommits(entries /* {sha, subject, files: string[]}[] */) /* -> {sha, subject}[] */
  ```
  Drops an entry when every file matches `^tests/`, `^docs/`, or `\.md$`, or when `files` is empty (merge commits).

- [ ] **Step 1: Write failing tests** for `selectReleaseCommits`: docs-only dropped; tests-only dropped; mixed `src/x.tsx` + `docs/y.md` kept; empty files dropped; order preserved (oldest first).
- [ ] **Step 2: Run** the test → FAIL.
- [ ] **Step 3: Implement** `selectReleaseCommits`, then `post-release-draft.mjs`: read `PB_API_KEY` (missing → warn, exit 0); probe; `git log --reverse --name-only` from `lastCommitTo..HEAD` (or the last 30 commits if null); select; POST; print `release draft <id> (<n> commits): write blurbs with POST /api/releases/<id>`. Any network/HTTP failure → `console.warn` and `process.exit(0)`.
- [ ] **Step 4: Run** the test → PASS; run `PB_API_KEY= node scripts/post-release-draft.mjs` → prints the missing-key warning, exit code 0.
- [ ] **Step 5: Commit** the four files.

### Task 5: Pill state and read tracking (pure + hook)

**Files:**
- Modify: `shared/userPrefKeys.ts` (add `{ key: 'hub.pulse.seen', param: false, merge: 'scalar' }`)
- Create: `src/lib/pulsePill.ts`
- Create: `src/hooks/usePulse.ts`
- Test: `src/lib/__tests__/pulsePill.test.ts`

**Interfaces:**
- Consumes: `PulsePayload` (`shared/pulse.ts`).
- Produces:
  ```ts
  export interface PulseSeen { releaseId: string | null; announcementId: string | null }
  export type PillState = { tone: 'news'; label: "What's new"; openTab: 'news' } | { tone: 'pulse'; label: string; openTab: 'pulse' }
  export function pulsePillState(p: PulsePayload | undefined, seen: PulseSeen, isPi: boolean): PillState
  export function seenAfterOpen(p: PulsePayload): PulseSeen
  export function usePulse(): { data: PulsePayload | undefined; isLoading: boolean }  // queryKey ['pulse'], staleTime 5*60_000, refetchOnWindowFocus true, sends week_start from src/lib/time.ts (viewer-local Monday 00:00 as UTC ISO)
  ```
  Rule: `news` when `release && release.id !== seen.releaseId`, or `announcement && announcement.id !== seen.announcementId`, or (`isPi && draft`). Otherwise `pulse` with label `Lab pulse · ${active.length} active`. `undefined` payload → pulse with `0 active`.

- [ ] **Step 1: Write failing tests**: unseen release → news; seen release + no announcement → `Lab pulse · 2 active` for 2 slugs; announcement deleted (payload `announcement:null`) while `seen.announcementId` names it → pulse; PI with draft and everything seen → news; non-PI never gets news from a draft (payload has `draft:null` anyway, but pass a draft with `isPi=false` and assert pulse); `undefined` payload → `Lab pulse · 0 active`; `seenAfterOpen` returns the current release and announcement ids.
- [ ] **Step 2: Run** `npm run test:lib -- pulsePill` → FAIL.
- [ ] **Step 3: Implement** the two functions, the pref key, and `usePulse`.
- [ ] **Step 4: Run** → PASS; `npx tsc -b --noEmit` → clean.
- [ ] **Step 5: Commit** the four files.

### Task 6: The pill and panel (team view)

**Files:**
- Create: `src/components/pulse/PulsePill.tsx` (pill + anchored panel, outside-click/Escape close, focus return)
- Create: `src/components/pulse/WhatsNewTab.tsx`, `src/components/pulse/LabPulseTab.tsx`
- Modify: `src/components/PortalLayout.tsx` (swap `<PhaseReleaseBanner />` for `<PulsePill />`)
- Delete: `src/components/PhaseReleaseBanner.tsx` (grep for other imports first; remove its `mnccore-phase-banner-seen-v1` key with it)
- Modify: `src/index.css` (pill/panel styles via tokens)
- Test: `src/__tests__/pulse-pill.test.tsx`

**Interfaces:**
- Consumes: `usePulse`, `pulsePillState`, `seenAfterOpen` (Task 5); `useUserPref('hub.pulse.seen', {releaseId:null, announcementId:null})`; `SegmentedToggle`; `Face`.
- Produces: `export default function PulsePill(): JSX.Element`.
  Opening the panel writes `seenAfterOpen(payload)` to the pref. Tabs `What's new | Lab pulse` start on `state.openTab`. What's new: release eyebrow (approved date via `dateUtils`), title, blurbs as `**lead.** text`, "Past releases" expander. Lab pulse: announcement (if any) with gold `--job-wants` left edge, "Active in the last day" faces (max 8 then `+N`), three stat tiles, up to 3 wins rows. Empty states: "Nothing shipped yet" / "No announcement in the last two weeks" / "Nobody active in the last day". Pill: gold dot (`.tk-attn-dot`) + "What's new" for news; teal dot + label for pulse.

- [ ] **Step 1: Write failing component tests** (mock `fetch` for `/api/pulse` and `/api/user-prefs` the way neighbouring `src/__tests__` files do): unseen release renders pill text `What's new` and opens on the What's new tab showing the blurb lead; after opening, the pref PUT carries `{releaseId:<id>}`; seen state renders `Lab pulse · 3 active` and opens on Lab pulse with 3 faces and the tile `23` / `tasks done this week`.
- [ ] **Step 2: Run** `npx vitest run --config vitest.config.ts src/__tests__/pulse-pill.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the components, the CSS, the PortalLayout swap, and delete the banner.
- [ ] **Step 4: Run** the test → PASS; `npm run build` → OK; `npx eslint src/components/pulse src/components/PortalLayout.tsx` → 0 errors.
- [ ] **Step 5: Commit** the files (deletion included in the path list).

### Task 7: PI controls: draft review and announcements

**Files:**
- Create: `src/components/pulse/DraftReleaseCard.tsx`, `src/components/pulse/AnnouncementComposer.tsx`
- Create: `src/hooks/mutations/usePulseMutations.ts`
- Modify: `src/components/pulse/WhatsNewTab.tsx`, `src/components/pulse/LabPulseTab.tsx`
- Test: `src/__tests__/pulse-pi-controls.test.tsx`

**Interfaces:**
- Consumes: routes from Task 3; `useAuth()` PI flag (grep how `isPi` reaches the client, e.g. `/api/auth/me`).
- Produces: `useEditRelease()`, `useApproveRelease()`, `useDiscardRelease()`, `usePostAnnouncement()`, `useDeleteAnnouncement()`; each invalidates `['pulse']`; approve/discard/post show `showSuccess`, failures `showError` with the server message.
  Draft card (PI only, first in What's new): "Draft" chip, inline-editable title and blurbs (Edit → fields, Save = edit action), **Approve** (disabled with hint "Add a title and at least one blurb" when empty), **Discard** (two-step: "Discard?" → "Discard draft" inside the card; no `confirm()`). Collapsible list of the draft's commit subjects so Nick can check the blurbs against what shipped. Composer (PI only, under the announcement): one field, 280-char counter, Post; a posted announcement shows a small Delete for PI.

- [ ] **Step 1: Write failing tests**: non-PI sees no Draft card and no composer; PI sees the draft, Approve disabled with empty blurbs, enabled after typing one; Approve sends `{action:'approve'}`; composer refuses 281 chars (Post disabled) and posts at 12 chars.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`; eslint 0 errors.
- [ ] **Step 5: Commit.**

### Task 8: Ship it

**Files:**
- Modify: `CLAUDE.md` (Quick Reference Deploy row: one sentence: "the deploy ends by opening/extending the release draft; write its title + 1-4 plain-English blurbs with `POST /api/releases/<id>` before you stop; Nick approves in the What's new panel"), `SESSION-HANDOFF.md` (top section), `docs/OBSERVABILITY.md` only if routes are listed there.

- [ ] **Step 1:** `npm run test:api && npm run test:lib && npm run test:src` → all PASS; `npx tsc -b --noEmit`; `npm run build`.
- [ ] **Step 2:** Apply v148 to TEST: `scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v148-hub-releases-announcements.sql`. PROD DDL is classifier-denied for Claude: ask Nick to run the prod line himself with `!` (precedent: v112). Verify on prod: `scripts/wrangler-d1 d1 execute mnccore-lab --remote --command "SELECT name FROM sqlite_master WHERE name IN ('hub_releases','hub_announcements')"` → 2 rows.
- [ ] **Step 3:** `npm run deploy:pages:gated` → probe PASS and the new last line prints a draft id.
- [ ] **Step 4:** Write the first release's title + blurbs (this feature itself) via `curl -H "Authorization: Bearer $PB_API_KEY" -X POST .../api/releases/<id> -d '{"action":"edit",...}'`; confirm `GET /api/pulse` with the key shows the draft.
- [ ] **Step 5:** Commit docs; resolve bug `bug_mvprz02xr9t91d`; `gh issue close 156 --comment "Fixed in <sha> ... Verified present at HEAD <sha>."`; tell Nick the draft is waiting for his Approve.
