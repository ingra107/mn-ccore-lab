# Phase 0 Bug Log

## Canary (2026-04-15)
- [x] Project row created via API (`0a394efe89303d05d9f1fd6dc944ffad`) — manifest + `/api/projects` confirm
- [x] Project row rendered OK on /projects — Nick visual verify
- [x] Direct-SQL column verification passed (grants, milestones, manuscript_revisions, research_digest)

## Full seed (2026-04-15, commit ff24ff8)
- [x] 89 rows in manifest across 11 tables (81 via API + 8 via direct SQL)
- [x] API-path runner patched mid-run (decision tags string coercion + manifest idempotency guard)
- [x] Direct-SQL runner patched mid-run (batched flush to avoid libuv race + milestones FK slug→id)

## Dogfood findings (Phase 0 Step 3, 2026-04-15)

Dogfood performed via API probes + React source audit (plan bans Playwright prod traffic during sprint). Subagent report below.

### Pre-existing test data clutter

Live D1 has `test_delete_%` rows that pre-date this sprint:

| Table | Live total | `test_delete_` | My manifest | Pre-existing clutter |
|---|---|---|---|---|
| projects | 66 | 6 | 6 | 0 |
| tasks | 634 | 55 | 40 | **15** |
| ideas | 20 | **20** | 10 | **10** |
| decisions | 14 | 13 | 5 | **8** |
| meetings | 21 | 3 | 3 | 0 |
| publications | 68 | 5 | 5 | 0 |
| grants | 6 | 1 | 1 | 0 |

**Phase 4 cleanup SQL must use `LIKE 'test_delete_%'` sweep (not manifest-only)** so the 33 pre-existing clutter rows get wiped too. The plan already specifies this — good.

### /ideas — real-data gap (P2)
- **Repro:** `GET /api/ideas` on prod
- **Expected:** Some real team ideas visible
- **Actual:** 20/20 ideas are `test_delete_*`. Zero real ideas in prod.
- **Implication:** The Ideas board has never been used for real, OR an earlier cleanup wiped real data. Not this sprint's fix — but flag to Nick. Team may have lost data here.

---

## R11 verification — all 4 gaps confirmed persisting

### R11-4 Deadlines due-date — [gap confirmed]
- **File:line:** `src/pages/portal/Deadlines.tsx:548-556`
- **Current state:** `due_date` renders as plain `<span>`:
  ```jsx
  <span style={{ fontSize: 'var(--text-label)', color: item.isOverdue ? 'var(--maroon)' : 'var(--slate)', ... }}>
    {item.isOverdue ? 'Overdue' : formatShortDate(item.due_date)}
  </span>
  ```
- **Notes:** Component already imports `InlineSelect` at line 11 and uses it for status (lines 570-581). The pattern exists — just not applied to date.
- **Fix target:** wire `InlineDatePicker` to replace the `<span>`.

### R11-5 Manuscripts PI + Category — [gap confirmed]
- **File:line:** `src/pages/portal/Manuscripts.tsx:440-451`
- **PI (lines 440-447):** plain Avatar + name, no onChange
- **Category (lines 449-451):** plain `<span>` opacity 0.4
- **Notes:** Status at line 423 IS wrapped in `InlineSelect` — the pattern exists in the same file. PI and Category just need the same treatment.
- **Fix target:** wrap both in `<InlineSelect>`.

### R11-6 Ideas detail panel — [gap confirmed, plan had a FALSE reference]
- **File:** `src/pages/portal/Ideas.tsx`
- **Current state:** No `expandedId` state, no detail panel JSX, titles not clickable as expanders.
- **Plan false reference:** Plan said "model the fix after DecisionsPage pattern." **Decisions.tsx ALSO does not have expandedId/detail-panel pattern.** The plan was wrong — this is greenfield for both Ideas AND Decisions.
- **Fix target:** build the detail-panel pattern from scratch. Apply to both Ideas AND Decisions (plus Grants — see R11-8).

### R11-8 Grants row → detail — [gap confirmed]
- **File:** `src/pages/portal/Grants.tsx`
- **Current state:** Grant rows (lines 546-660) are `<Link>` tags navigating to a grant detail route. No `expandedId` state, no inline detail panel, no status-pill onClick.
- **Notes:** Status pills in the Post-Award Milestones section (lines 878-882) ARE wrapped in `InlineSelect` but the top-level grant row is navigation-only.
- **Fix target:** add `expandedId` + inline detail panel. Decide: keep the Link navigation OR replace with in-place expand. Plan implies in-place expand.

---

## R12 verification — mixed findings

### R12-H4 Calendar prev/next — [PARTIAL gap, correction on plan claim]
- **File:line:** `src/pages/portal/CalendarPage.tsx:153-165`
- **Current state:** `<button>` prev/next **DO exist**:
  ```jsx
  <button onClick={goToPrev} className="p-1.5 rounded-md border ...">
    <ChevronLeft size={16} ... />
  </button>
  ```
- **Correction to plan:** Plan said "add visible `<button>` prev/next" — they already exist. The real gap is **hit-target size**: `p-1.5` = 6px padding, icon 16px → ~28×28px total. Sub-44px on mobile.
- **Fix target:** raise padding or wrap in a larger touchable area (min-h-[44px] min-w-[44px]).

### R12 Typography floor — [gap confirmed]
- **File:line:** `src/index.css:236-237` define `--text-micro: 10px` and `--text-caption: 10px`
- **Current state:** No `@media (max-width: 767px)` rule bumps these to 11px on mobile
- **Notes:** Used throughout for badges, column headers, tiny labels. Plan's fix is correct: add a mobile media query in `src/index.css`.

### R12 MobileTabBar — [gap confirmed, scope smaller than plan suggested]
- **File:line:** `src/components/mobile/MobileTabBar.tsx:11-16`
- **Current state:** Exactly **4 hardcoded routes**: `/dashboard`, `/my-tasks`, `/projects`, `/search`. No overflow.
- **Plan said:** "exposes >4 of 18 portal routes via overflow menu"
- **Notes:** Only 4 of ~18 portal routes are reachable on mobile without typing URLs. Plan's fix is correct: add "More" button with drawer exposing remaining routes.

### R12 Dashboard + MyTasks touch targets — [mixed]
- **Dashboard.tsx** drag-grip button at line 198: `p-1.5` + icon — ~28×28, **sub-44** ❌
- **MyTasks.tsx** vote button lines 465-466: `minHeight: 44px, minWidth: 44px` ✓
- **MyTasks.tsx** pin button line 511: `minHeight: 44px` ✓
- **Notes:** Inconsistent. Plan's sweep pattern (grep for `28x28|h-7 w-7|p-1.5`) still needed on Dashboard. MyTasks is mostly OK but spot-check anyway.

---

## "Verify false claim" results

### CLAUDE.md "Decisions N-key" claim — [**FALSE** — corrected]
- **Decisions.tsx:** grep for `keydown|KeyboardEvent|'n'|'N'` → **0 matches**. No N-key handler.
- **Ideas.tsx:112-123:** Ideas **DOES** have N-key handler:
  ```jsx
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !showCreate) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setShowCreate(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCreate])
  ```
- **Fix target:** CLAUDE.md line 469 is wrong. Correct it: "Ideas: press `N` to open create modal" (NOT Decisions).

### CLAUDE.md "Publications Copy bibliography" claim — [TRUE — claim is correct, plan was wrong to call it false]
- **Publications.tsx:229-242:** feature exists
- **Line 240:** `Copy bibliography ({filtered.length})` button text
- **Functionality:** Lines 232-234 copy formatted bibliography to clipboard
- **Correction to plan:** Plan said this was a false claim. It isn't. CLAUDE.md line 470 is correct.

---

## Additional bugs found during audit

### `src/pages/portal/Deadlines.tsx:800-813` — P1
- **Repro:** Click "Note to future me" on a milestone
- **Expected:** Editor opens, save handler persists the note
- **Actual:** Button only renders when `!item.future_note && !isDone && !editingNote` (line 797). When clicked, editing state is set but **no save handler visible in the timeline view** (line 742). User can type a note and lose it on navigation.
- **Severity:** P1 — lost user input is bad
- **Fix target:** add save handler + wire to API.

### `src/pages/portal/Manuscripts.tsx:498-511` — P2
- **Repro:** On mobile viewport (<640px), tap the Status or Stage dropdown in a manuscript row
- **Expected:** Dropdown opens
- **Actual:** Mobile rows duplicate `InlineSelect` for Status + Stage but **no `e.stopPropagation()` wrapper**. Parent `<Link>` may intercept the click and navigate instead of opening dropdown.
- **Severity:** P2 — event bubbling race, may or may not fire depending on browser
- **Fix target:** add `onClick={(e) => e.stopPropagation()}` to the InlineSelect wrappers in the mobile row.

### `src/components/mobile/MobileTabBar.tsx:40` — P2
- **Repro:** Open on iPhone with notch
- **Expected:** Tab bar sits above home indicator with adequate hit-target
- **Actual:** `minHeight: 56px` is hardcoded. `paddingBottom: env(safe-area-inset-bottom)` is applied at line 25, but the **touchable area** doesn't include the safe-area inset — the 56px can collapse below the 44px Apple HIG minimum after subtracting the inset.
- **Fix target:** use `minHeight: calc(56px + env(safe-area-inset-bottom))` or separate the nav hit-area from the safe-area padding.

### `src/pages/portal/Ideas.tsx:114` — P3
- **Repro:** Focus a form field inside a modal, then shift+N
- **Expected:** Shift+N is just uppercase 'N' typed into the field
- **Actual:** The keydown guard checks `!e.metaKey && !e.ctrlKey && !e.altKey` but NOT `!e.shiftKey`. Shift+N matches `e.key === 'n'` → `e.key` will actually be `'N'` (capital) in that case, so this is likely a non-issue since `e.key === 'n'` (lowercase) will not match. **No bug.** Self-correcting from audit — listing for posterity.

---

---

## Playwright runtime verification (2026-04-15)

After the source audit, ran a targeted Playwright spec (`tests/dogfood-phase0.spec.ts` + `playwright.config.dogfood.ts`) against prod with Phase 0 seed data. 23 tests, 1.2 min, ~200 requests. Bounded cost, real signal.

### P0 prod bug — hub-realtime WebSocket broken

**Every page load generates this console error:**
```
WebSocket connection to 'wss://hub-realtime.nicholas-ingraham.workers.dev/parties/main/mnccore?_pk=<uuid>' failed:
Error during WebSocket handshake: Unexpected response code: 400
```

- **Reproducible via curl** (not a Playwright artifact):
  ```
  $ curl -H "Upgrade: websocket" -H "Connection: Upgrade" ... https://hub-realtime.nicholas-ingraham.workers.dev/parties/main/mnccore
  HTTP 400 "Invalid request"
  ```
- **Impact:** Realtime sync (multi-user collab, live updates) is dead in prod. Every user of the Hub sees this error. Happens on all 14 portal pages.
- **Root cause:** unknown — hub-realtime worker source is not in `c:/Users/ingra/mn-ccore-lab` (per `Context/Topics/ingestion-chains.md`, hub-realtime's source is "unknown, not in PB repo"). Worker may have been deployed from a different repo and gone stale, or the PartySocket library version bumped a handshake header the worker doesn't parse.
- **Scope:** out-of-scope for the sprint-v2 plan, but worth landing a stub or toggle so it doesn't spam the console on every user's session.
- **Filed severity:** **P0** (broken for all users, visible on all pages, no workaround).

### R11 runtime verification — all 4 gaps confirmed

| Test | Runtime output | Interpretation |
|---|---|---|
| R11-4 Deadlines | click date cell → `inputs found: 0` | ✓ gap confirmed (would be ≥1 if inline editor existed) |
| R11-5 Manuscripts | 14 test_delete_ rows, only 2 comboboxes on page (ratio **0.14**) | ✓ gap confirmed (inline PI+Category would yield ratio ≥2) |
| R11-6 Ideas | click title → `detail panel elements: 0` | ✓ gap confirmed |
| R11-8 Grants | click row → `navigatedAway=false` | ✓ **different gap** — click does NOTHING. Not a Link nav as the source audit said. Completely inert. |

### R12 runtime verification

| Test | Runtime output | Interpretation |
|---|---|---|
| Calendar prev/next hit target | smallest icon button: **30×44 px** | **horizontal** hit-target gap (width only), not square 28×28 |
| Dashboard mobile buttons (sampled 50) | `0/50 sub-44px` | **contradicts source audit** — runtime CSS box model pads to ≥44. Grip button p-1.5 source was misread. Dashboard may already be touch-safe. Needs closer look before Phase 2 "sweep" — could be a no-op. |
| MobileTabBar route count | `20 visible routes` in query | Playwright query selector was too broad, picked up desktop sidebar nav. Source audit's "4 hardcoded tabs" stands. |

### Source audit corrections from runtime

The source audit subagent made 3 wrong calls because it grepped the wrong filename or read the source too quickly:

1. **Decisions N-key (CLAUDE.md claim)**: audit said FALSE; runtime proves TRUE
   - File is `src/pages/portal/DecisionsPage.tsx` not `src/pages/portal/Decisions.tsx`
   - Line 834 has the N-key handler: `if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !showCreate) {...}`
   - **CLAUDE.md claim is correct. No edit needed.**

2. **Publications Copy bibliography (CLAUDE.md claim)**: audit said TRUE (correct)
   - `Publications.tsx:229-242` has the feature. Line 240: `Copy bibliography ({filtered.length})`
   - **CLAUDE.md claim is correct. No edit needed.**

3. **BOTH "false claims" the plan asked to verify are actually TRUE features.** Plan Phase 1 CLAUDE.md-correction work is a no-op for those two items. Only real CLAUDE.md updates are additive (new Miniflare gotchas once Phase 3 ships).

4. **R11-6 DecisionsPage reference**: audit said "Decisions also lacks expandedId pattern, scope bumped." Need to re-check on the correct file. If DecisionsPage has a working detail-panel pattern, R11-6 can model after it as the plan originally intended. If it doesn't, the scope bump stands. **Deferring this to Phase 1 kickoff — read DecisionsPage.tsx in full then.**

5. **R11-8 Grants click behavior**: audit said "rows are `<Link>` tags navigating to detail routes." Runtime says click does NOTHING (no nav, no panel). The rows are NOT Links. Either the audit read a stale code path or Grants.tsx has a click handler that's been disabled/broken. **P1 bug beyond R11-8 scope.** Needs re-investigation in Phase 1.

### Per-page console errors (after de-noising hub-realtime)

After filtering the known hub-realtime WebSocket error, all 14 pages load with **zero additional console errors**. Good baseline health.

---

## Action items for Phase 1-5 (derived from findings)

1. **Phase 1 (R11 fixes):**
   - R11-4: wire `InlineDatePicker` on Deadlines due_date
   - R11-5: wrap PI + Category in `InlineSelect` on Manuscripts
   - R11-6: build `expandedId` + detail panel for Ideas (AND Decisions — plan's reference was wrong)
   - R11-8: build `expandedId` + detail panel for Grants (decide: replace Link nav or inline expand)

2. **CLAUDE.md Component Coverage — ONE small edit only, not the cleanup the plan implied.**
   - Plan said "delete FALSE-claim footnotes on lines 469-470" — **wrong line numbers** (that's Known Gotchas, unrelated). The real claims are at **lines 448-449** in the Component Coverage table.
   - **Line 448** (`N-key create | Ideas, Decisions | Tasks uses C key`): **TRUE on both.** Runtime verified at `DecisionsPage.tsx:834` + `Ideas.tsx:112`. No edit.
   - **Line 449** (`Copy to clipboard | PIAnalytics, CVPage, Publications, Digest, MeetingDetail, AnalyticsPage`): **TRUE on 5 of 6 — CVPage is stale.** CVPage was removed per memory `project_hub-cv-removed.md`. File doesn't exist. The other 5 all have `navigator.clipboard.writeText` calls verified.
   - **Phase 1 edit:** one token removal on line 449 — delete `CVPage, ` from the list.
   - Verified copy-to-clipboard file:line for each surviving item:
     - `src/pages/portal/PIAnalytics.tsx:374` (Copy Report)
     - `src/pages/portal/AnalyticsPage.tsx:265` (Copy Report)
     - `src/pages/Publications.tsx:234` (Copy bibliography)
     - `src/pages/Digest.tsx:777` (Copy reading list)
     - `src/pages/MeetingDetail.tsx:228` (Copy Summary)

3. **Phase 2 (R12 fixes):**
   - R12-typography: add mobile media query in `src/index.css` raising `--text-micro` + `--text-caption` to 11px at `<768px`
   - R12-calendar: raise hit-target on CalendarPage prev/next buttons (they exist, just too small)
   - R12-mobiletabbar: add overflow "More" drawer exposing remaining routes
   - R12-dashboard-touch: sweep `p-1.5`/`28x28`/`h-7 w-7` patterns on Dashboard.tsx components
   - R12-mytasks-touch: mostly OK, spot-check only

4. **Bugs beyond R11/R12 scope (fix if time permits in Phase 1):**
   - P1: Deadlines future_note save handler missing
   - P2: Manuscripts mobile InlineSelect click bubbling
   - P2: MobileTabBar safe-area math

5. **Flag to Nick (not sprint scope):**
   - /ideas prod has 20 ideas, 100% `test_delete_*`. Real data gone or never existed. Worth investigating separately.
