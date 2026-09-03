# MN-CCORE Lab Hub — Changelog
<!-- redeploy-trigger: 2026-04-21T16:13:38.085161 -->

> Historical phase records moved from CLAUDE.md to keep the operating guide focused on current state. Each section is a complete record of what shipped, decisions made, and scores achieved.

## 2026-09-03 — bug sweep #118–#120

Frontend only; no schema, migration, route or API change (still v104 / 257 routes). 2 commits (`9dfee79c`, `6d3f97dd`), deployed, probe PASS. Bug queue and GitHub issue list empty again except #119, which stays open as a feature tracker.

**#120 — "the trash cans don't work" on a task's activity line.** They did: two clicks on a comment card and on a lifecycle row both hit `POST /api/activity/:id/delete` on prod and removed the row, and the 09-01 activity_log shows no delete at all at the time of the report. The delete is a two-step confirm, and the armed state was a 3s colour change on an 11px icon that, on a lifecycle row, is hover-only and vanished the moment the pointer left the 22px row. A first click read as a no-op. The armed state now says "Delete?" in a coral pill, stays visible off-hover via `[data-armed]`, and holds 5s.

**#118 — "can these be much higher on this page."** View Full Meeting, Log Decision and Add Action Item closed the meeting panel after Attendees, Agenda, Decisions, Action Items and Notes. They are one action row under the header now; the Log Decision form still expands in place; the parent-owned quick-add rides a new `addActionItem` slot prop on `MeetingDetail` and takes the full row when open.

**#119 — Hermes reading Gmail.** Feature request, not a bug: the `hub_ai_listener` prompt has no tool access, so this is a Peripheral Brain listener change. Bug row dismissed, GitHub issue left open with the triage.

## 2026-08-18 — bug sweep #114–#117, plus the backlog cleared down to zero

Frontend + two prod D1 backfills; no schema, migration, route or API change (still v104 / 257 routes). 10 commits, deployed, every probe PASS. GitHub issue list is empty for the first time.

**#114 — clicking a task on Lab Overview changed its status.** The Tasks card cycled `todo → in_progress`, everything else → `done`, on any row click. Reading a task mutated it, and nothing opened it. It now opens `TaskDetailPanel`, portalled to `<body>` — `DashboardGrid` puts a CSS transform on every widget, and a transformed ancestor becomes the containing block for `position: fixed`, so an in-place panel would have been clipped into the card.

**#115 — an unreadable dropdown in the top-right.** The release-notes pill painted its popover with `var(--surface-2)`, which in dark mode is `rgba(255,255,255,0.06)` — a tint meant to sit on an opaque surface, so the page showed through it. Now `var(--cream)` (Rule 45). Its `var(--surface-2, var(--cream))` fallback had never fired: the token is always defined. The pill also read "Phase 36c shipped" and the panel said "Just shipped" about an April release; now "What's new" and "Released".

**#116 — a planned task was invisible.** Measured on prod: the gold 3% fill and 18% dashed border composited to **1.38:1** against the strip behind them. Now 8% / 70% — 4.5:1 dark, 3.4:1 light, clearing the 3:1 non-text bar in both themes, outline still dashed.

**#117 — the Work-on and folder icons could not be found.** They were `opacity: 0` behind a self-hover rule, so you had to hover something invisible to learn it was there. They now follow the row's hover state, the same one the drag grip uses.

**A crash nobody reported.** `/portal/team/<anyone>` was dying on `item.description.length` in `MenteeDashboard`; `tasks.description` is nullable and 9 open meeting-linked tasks have none. It renders the task name through the shared `TaskTitle` now — which is the right field anyway, the same correction #112 made to project rows.

**#110 step 1 — the timeline invariant became structural.** `PX_PER_MIN` is module-private; the six px↔minute sites share `minToPx`/`pxToMin`. Importing the bare ratio is now TS2459. No behaviour change: identical arithmetic, wrapped.

**#113 — the synthetic action-item row is retired.** Its stated premise was wrong: PB never bypassed `applyInsert` (August measured 29/29 with real creation rows). The real blocker was `activity_entries.project_id`, captured at INSERT, so a task that got its project later had a creation row pointing at NULL. 37 missing rows backfilled, 43 re-pointed at the task's project, then `actionItemToLifecycleRow`, `createdTaskIds` and `_synthetic` all deleted together.

**#87 was already done.** Publications-per-person works via OpenAlex + ORCID; the crash was hiding it. 77 for Nick, matching D1 exactly.

**#109 and #110 closed as SCHEDULED**, into PB backlog #1593 and #1595, with a decision doc for the meeting-id work. Neither is abandoned; both have specs.

## 2026-08-05 — bug sweep #111/#112: the project activity feed

> ⚠️ **Gap notice.** The 2026-07-24/25 sweep (#98/#101/#102/#103) and the 2026-08-03 sweep (#104–#108 + the Today-timeline work) shipped without a CHANGELOG entry — their record lives in `SESSION-HANDOFF.md`. Read that for anything between 07-22 and 08-05. Two skipped entries in a row is how this file stops being "what changed"; the fix is to write the entry at close, not to backfill three weeks from memory.

Frontend only — no schema, migration, route, or API change (still v104 / 257 routes). 3 commits, deployed + probe PASS, live `bb9af5ec`. 1329 api · 262 lib · 157 src, all green.

**#111 — a task named in the feed navigated you off the project.** Every task link on a project page (130 of them, counted live) pointed at `/portal/my-tasks?openTask=<id>`. `ProjectDetail` already mounts `TaskDetailPanel` and already consumes `?openTask=`, so the panel was there and nothing was wired to it. Links now open it in place via an `onOpenTask(id) => boolean` threaded down to the anchor's onClick, which `preventDefault()`s only when the surface actually opened the task. The `href` stays — it is what makes ⌘-click and copy-link work, and it is the fallback on a miss. **`useOpenParam` was deliberately NOT reused**: it fires once per distinct value, so clicking the same task twice after closing the panel would silently do nothing. CLAUDE.md **Rule 63e** extended.

**#112a — action items never named their task.** The row rendered `task.description`, which for a meeting-extracted task is provenance boilerplate (`From the R01 Meet Follow Up Aim 3 meeting on July 24, 2026. Source: [[Context/Meetings/…]] [meeting:cal-…]`) — measured on all 9 rows of the reporting project; not one carried the task's name. Action items have been tasks since T19/#547, so they now render through the same `LifecycleActivityLine` as "Created this task". The card and its complete-toggle are gone; completing lives on the task, which the name now opens. **The synthetic row exists only because PB's meeting-extraction writer bypasses the Hub's `applyInsert` and never mints a real `created` entry** — when that writer is fixed, `actionItemToLifecycleRow` AND the `createdTaskIds` dedupe both delete together (filed **#113**).

**#112b — the empty reaction band.** On a project-entity row `ReactionBar` renders whether or not anyone has reacted: a measured 26px full-width band holding one right-floated dashed `+`, between the body and Reply. Reactions and thread controls now share one action row.

**Session-close `/simplify`:** lifted the `metadata_json` parse into `shared/activityKinds.ts` (`lifecycleEventOf` / `lifecycleMetadata` — it had two hand-rolled copies), replaced the `action-` id-prefix sniff with an explicit `_synthetic` flag, collapsed the now-single-member `StreamEvent` union. Added the missing contract test for the swallow-on-malformed branch.

**Doc drift caught by the close, not by the work:** `REFERENCE.md` documented `POST /api/meetings/:id/action-items` and `/api/meetings/:id/decisions` — **neither has ever been registered** in `api/index.ts` and the first 404s on prod. `PROJECT.md`'s `next_action` carried a "⚠️ NOTHING COMMITTED YET" warning about files that had been tracked for weeks. Both fixed.

## 2026-07-22 — bug sweep #96–#100, threaded replies (schema v100), two unreported privacy leaks, and `api/` finally typechecked

Full Bug-Squasher pass. Whole open queue cleared; 12 commits, all deployed + pushed, every post-deploy probe PASS; 1176/1176 api tests. Live `e8c0a169`.
**#96** copy button on Meeting Notes (raw markdown — what pastes cleanly into mail/Slack — in the section header, since "copy quick" argues against burying it in the hover layer).
**#97** answered meeting approvals now CLOSE and drop out of both task lists. Accept/Decline wrote `approval_status` alone and the lists filtered only `'pending'`, so a triaged meeting fell straight back in as an ordinary task. The read-side filter keys on the ANSWER rather than on `status` — which is what makes declining from **Telegram** (a PB lane that writes `approval_status` only) drop the row here too. Two stranded prod rows repaired.
**#98 — threaded replies, schema v100 `activity_entries.parent_id`.** One nullable self-column, not `thread_root_id + depth` (two facts derivable from one, and corrupt states representable); no FK, because every existing cascade is entity-scoped and the one gap — single-root delete — is handled explicitly so the cascade stays greppable; no stored `reply_count`, because the count is VIEWER-SPECIFIC (an `@me` reply is visible only to its author + PI, so one global counter would either leak or lie). Replies ride the existing `postActivityEntry` rather than a second writer, so mentions/notifications/artifact-links/Hermes dispatch cannot drift between roots and replies. Parent owns identity; one level enforced (reply-to-a-reply is a 400, never a silent re-parent, so `parent_id IS NULL` stays a reliable root test); visibility inherits downward only. Hermes answers land IN the asking thread, with a bounded `<activity_thread_context>` transcript in the **`prompt`** — deliberately not `context`, whose grammar the external Python listener parses, which is how the whole feature avoided a cross-repo lockstep.
**#99** Hermes answers on a task now raise the attention signal. Root cause was structural, not an edge case: a typed `@hermes` writes `ai_requests`, and the seen system only ever read `activity_entries` — a badge was impossible. Prod confirmed it: zero `claude-ai` activity rows since 2026-06-12 while three asks completed that morning. Fixed with a requester-scoped, 30-day-bounded arm on `/api/seen/unseen` (LEFT JOIN, because asking a question is itself intent to hear the answer) rather than by writing AI rows into the timeline — an author-only AI row cannot satisfy the unseen SQL, and `TaskHermesReplies` would have double-rendered.
**#100** ⌘K: Enter fired a different row than the highlighted one — two copies of the category order with `?? 9` vs `|| 9`, and `recent` ranks 0, which is falsy, so Recent sorted last visually and first for nav. Collapsed to one `CATEGORY_RANK`. Second half: Create Task **navigated** to My Tasks to type a title instead of opening the canonical in-place quick-add — a call site missed by the #71 conversion.
**Dots retired; the left rail now means URGENCY** (Nick). The 7px dot multiplexed priority AND progress through one channel with a precedence rule, was `aria-hidden` with no legend, and two of its four colours were unreachable. The rail moved off overdue because overdue is already the loudest thing on the row (`DueChip`, coral at weight 600, worded), so the one full-height channel went to the signal that had none. One meaning per channel: rail = urgent, due text = when, `AttentionChip` = new, `DoneBox` = done. Urgency also gained the `sr-only` text the dot never had.
**Two privacy leaks, neither reported, same root cause — a handler that never receives the request cannot filter by who is asking.** (1) `GET /api/ai-requests` returned full prompt+response with no requester filter, so any teammate could read anyone's Hermes history; now requester-scoped, PI/API-key unchanged so the PB listener keeps working. (2) `api/routes/search.ts` applied no visibility gate to any of its four `activity_entries` sources and did not even import `activityVisibilityGate` — **`@me` notes were searchable by any authenticated teammate.** Every feed gates in SQL; search was simply never wired. A third instance of this shape should become a lint, not a third fix.
**`api/` had never been typechecked by anything.** `tsc -b` covers only `"src"`, and `@cloudflare/workers-types` was not installed, so `D1Database` was an unresolved global that never errored because nothing looked. The #98 reply endpoint shipped testing `actor.ok` on a `{slug}|{error}` union and 500'd on every request — caught by an end-to-end prod probe, not by the green typecheck being cited all session. Now `tsconfig.api.json` + `npm run typecheck:api`, failing only on NEW errors against a 149-error baseline (a permanently-red advisory gate is one nobody reads), wired into `deploy:pages:gated` and **proven** by reintroducing the exact bug and reverting it.
**Also:** CLAUDE.md counts made self-deriving after the schema line sat 19 migrations stale (v82 documented vs v101 actual) and nearly caused a migration to be misnumbered; rules 76–78 added. A verified implementation plan for collapsing the two Hermes lanes is committed at `docs/superpowers/plans/2026-07-22-hermes-lane-unification.md` — nothing implemented, owner decisions recorded in §0.

## 2026-07-22 — public artifacts move to a cookieless origin (PB #508, security HIGH-2)

`GET /a/:id` no longer serves user-authored HTML from `mn-ccore-lab.pages.dev`. A **third deploy surface** now exists: **`mn-ccore-artifacts.pages.dev`** (`artifacts-site/`, `npm run deploy:artifacts`), a second Pages project whose entire job is that one route. The Hub origin keeps a bodyless 301 to it and nothing else.
**Why** — the Hub host scopes the `CF_Authorization` cookie, so while the body was served there, *one response header* (the CSP `sandbox`) stood between a published artifact's script and full same-origin `/api/*` access as whoever opened the link. The 2026-07-06 public-artifacts security review flagged this as HIGH-2 and Nick took the interim mitigation (`3c6a50a7`, a deploy-time CSP probe) while the durable fix waited on his call; approved 2026-07-22. `*.pages.dev` is on the **Public Suffix List**, so the two hosts are different *sites* — no `Domain=` attribute can bridge them. The class went from "blocked by a header" to "unrepresentable" (ethos #15 Level 1). The hardened CSP is **kept** as defense in depth, not relied on.
**Shape** — the serve handler is *not* forked: `api/routes/public-artifact.ts` runs on both surfaces, and now also exports `handleLegacyPublicArtifactRedirect`, which never touches D1, emits no body, is uniform across visibility/existence (no oracle), and validates `^art_[0-9a-fA-F]+$` before an id can reach a `Location` header. `artifacts-site/wrangler.toml` owns its D1 binding in **code** (surface 1's bindings remain dashboard-owned). The Option-D probe was **re-pointed, not retired**: it asserts the CSP on the artifacts origin *and* adds the load-bearing check that the Hub origin returns a 301 — a 200 there fails the deploy.
**Migration** — exactly one public artifact and one `links` row existed (LLM Ethics Workflow Map), re-verified against prod D1 the morning of the cutover; the PB link contract's `/a/` rule keeps matching *any* host while canonicalizing to the new one, so the pre-split URL re-normalizes instead of forking a duplicate row.
**Also closed: #531 (deploy canary), same wave.** The probe used to be pinned to Nick's LLM Ethics artifact, so unpublishing it would have reddened every deploy for a non-security reason — and re-pointing that at the new origin would have carried the coupling across intact. `schema-v101` seeds a **system-owned canary** artifact (`art_cafe0000…`, inert static HTML, no task/project) and three triggers make it undeletable, id-frozen, and unable to leave `visibility='public'`/`content_type='html'`. Deliberately *not* fixed by setting the CSP on the 404 path — that would let the probe pass on a 404 while a 200-only regression sailed through, deleting the coverage rather than stabilising it. A red probe now means a real header regression.

## 2026-07-21 — bug sweep #94/#95 + Projects-list row alignment

Both open in-app bug reports fixed, then a Nick-driven alignment arc on the Projects list that came out of #95. Six commits (`7fb35371` #94 · `6699a5d2` #95 · `07e40040` alignment · `c192943d` one-line title · `71be3f8d` tip stutter · `97f14638` tip scope), all deployed + pushed, live `97f14638`. No schema/migration change (v82); one additive DERIVED API field.
**#94** — project-feed lifecycle rows rendered a bare `"Completed"` with no subject. Frontend-only: the API already joined `task_title` and `ActivityEntryItem` already computed a task label + deep-link, but the `system|completion` early-return fired before that computation. Fixed at the class (every task lifecycle body is written from the task's POV and was equally subject-less on a project feed), not just "completed".
**#95** — the Projects "last worked on" sort was already built; the DATA had no producer. `Project.lastActivity` was read by 8 UI sites and assigned by nothing, so the sort silently degraded to `updated_at` and the "Xd ago" chip never rendered once. `handleGetProjects` now derives `last_activity` = `MAX(activity_entries.created_at)` per project (its rows ∪ its tasks' rows) in one constant-cost aggregate; the `seq_after` sync branch is deliberately left byte-identical (browser projection vs replication raw row, mirroring the `tasks.project_id` split). 74/84 projects carry a real signal vs 45 on the old fallback.
**Alignment arc** — columns were always aligned; the drift was vertical. The title cell was a two-line stack (title + `short_name`) that alone set the grid track height, so single-line values centered into the gap between the two lines (9px below the title), while PI/Group sat 2px lower still inside bare click-swallowing `<div>`s that dropped flex centering. Same root cause as the "dividers cut through the short name" report: a 44px row with 11px padding gives a 22px content box for 36px of content, so the border-bottom landed mid-subtitle. Nick chose keep-44px + `short_name` to the hover tip → one-line title cell, divider clears by 12px, plain `align-items:center` aligns all five columns. Reverted the interim `start` + `minHeight` shims. Tooltip then re-scoped from the full-width wrapper to the title text (hover zone 677px → 55px).
**Process note:** three false "didn't ship" alarms from stale hashed JS chunks in the browser tab — plain reload / `caches.delete()` / `?cb=` all failed to dislodge one, and it once presented as a convincing layout failure. Verify by diffing the live entry's chunk reference against the local build hash, not by trusting the rendered page (runbook in SESSION-HANDOFF.md).

## 2026-06-15 (PM) — bug sweep #70–#79: full open GitHub bug queue cleared in one pass

Ten reported bugs fixed, codex-reviewed, deployed (`c1e72aa4`), and pushed (`f3322214` 9 bugs · `4a95239b` #74 left rail · `5b9509e1` codex fixes). All 10 GitHub issues closed; 9 `bug_reports` rows resolved. Frontend + one API reader fix — no schema/route change (v82 / 74 tables / 240 routes).
**Headliners:** #76 notifications drawer was empty because the `api/routes/notifications.ts` reader SELECT named columns that don't exist (`message/related_id/related_type`) and omitted `link` — the try/catch returned `[]` while the count still showed unread; fixed to the real schema (verified vs prod D1). #77/#79 key-link chips (Today `LinkRow`, MyTasks `LinksBar`) were dead `<a href="#">`/emoji with "claude" tooltips — rewired to `classifyUrl`+`useProtocolLaunch`+lucide; deleted dead `LinkIcon` + the positional kind hack. #74 all-day/≥3h events moved to a Today-timeline left rail (out of OverlapBand clustering, reuses EventRow, stacks on mobile); codex caught 2 regressions (inMeeting + rail-only drop-gap), both fixed. Plus #71 quick-add modal, #72 opaque mobile nav, #73 zoned `<time>`, #75 newest-at-bottom activity feed + clamp, #78 scroll-anchored expand, #79 emoji→lucide icon sweep. #70 was already fixed (List DoneBox) — closed stale.
**Process note:** a background icon-sweep agent wiped uncommitted edits mid-session (whole-tree reset); recovered + adopted commit-before-dispatch (memory `repo-environment-gotchas`).

## 2026-06-11/12 (LATE EVENING, docket execution) — N1–N8 100% · mobile fix wave · schema v82 · dogfood green

The full Nick-ordered close docket executed in one session (`8a41827a`→`1cc9ea9e`, 17 commits, 5 deploys).
**N1 mobile wave**: Playwright audit at 375/390/430/768/1023/1440 → 70 verified defects → 24
class-collapsed tickets → ALL fixed (`b4c6e6b6` P1s, `9a3afa91` P2+P3). Headliners: List title
column was ZERO-width in the 768–1023 band (collapse gate at 767 vs mobile-nav at 1024); shared
TaskRow now stacks by default <768 (adapters never passed `stack`); quick-add modal centering
(framer transform overwrote style.translateX); blanket 44px button floor deformed DoneBox/stage
dots into capsules (`.done-box`/`.stage-dot` exempt + ::before hit zones); task panel = true
full-screen sheet ABOVE the tab bar; NOW line = inline divider between meetings; drop zones +
drag hints hidden on touch. **Done-bar honesty** (`de9d8f50`): the mobile "Done" button only
CLOSED the panel — now ✓ Complete completes (undo + close) beside Close. **N1c** (`8a41827a`):
@mention typeahead — OverviewQuickAdd was a raw textarea (Rule 7) AND /api/team/slugs had no
hermes entry. **N1b wave 1** (`865d6815`): TableControls view toggle = canonical tint-not-fill
pill (class de-box across every DataPage); ProjectDetail gold band de-boxed. **N2 APPLIED**:
4 long descriptions condensed (length-guarded UPDATEs; review doc preserves originals).
**N3**: PB `collect_artifacts.py` vault collection + ArtifactPage Download .md + `/og/artifact/`
card. **N5** (`87ce5efe`+`03d9fa79`): `hov-*` CSS hover utilities; 51 pure style-mutation
hover pairs converted across 28 files (remaining 67 are stateful-by-design). **N6**
(`70e41a0c`): dogfood suite 17 failed → 17/17 green — it predated the CF gate and was testing
the Access interstitial; now DOGFOOD_BASE_URL=ungated preview + fake auth, stale R11 probes
removed. **N7** (`f43e6fb5`): activity_log = KEEP (71 live writers + 12 analytics readers;
"compat read only" was wrong). **N7b schema v82**: `ai_requests.input_tokens/output_tokens`;
listener on `--output-format json` (PB `4981d9d2`); /api/ai-requests totals rollup. **N8**:
Ask-the-Lab is dead (1 question ever, 0 answers) — retirement recommended, Nick decides.
Close: simplify pass (`1cc9ea9e` — withAlpha fix for invalid `var()+hex` pill CSS, D1 batch,
shared ICON_PROPS lib). Tests 846→848 · routes 240 · tables 74 · D1 v82.

## 2026-06-11 (PARALLEL, Bug Squasher → seen-model arc) — attention signals · schema v81 · the 231-phantom badge · click-opens-the-thing

One Nick-driven arc from bug #70 to a full Slack-style attention model, all deployed same-day.
**Bug #70** (`aa7d55b5`→`f56b0536`): List view DoneBox completion on the side, full-band width
(= Calendar/My Hub), `--content-band` 1296→1440 (universal edge nearer the nav). **One color
language** (`1a19b296`, `b292c47b`): project teal in every view; status/priority/project-status →
`--task-accent-*` tokens. **Seen model** (`911d1ec3`): auto-acknowledge on detail-open (explicit
button deleted), bell mounted in the portal sidebar (mark-all-read on CLOSE), My Hub's dead-end
badge removed; 274 unread = 10 weeks of assignment notices. **Badge honesty** (`611f4257`,
`40d3e83c`): My Tasks badge = unseen (gold, drains on open, clicks → My Items "New for You"
in-place editor); **the 231 "overdue" was 100% soft-deleted phantoms** (overdue-count lacked
deleted_at; true overdue = 0); self-created tasks born-acked at the mutation chokepoint.
**Click-opens-the-thing** (`0e22c430`): 209 notification links were dead — plain `<Navigate>`
shims dropped `?open=`; all legacy redirects → `NavigateKeepSearch`; links minted
`/portal/my-tasks?open=`; owner re-notification on comments/updates (@me/self/mentioned skipped).
**Schema v81 `entity_seen`** (`a496a684`, Nick-approved prod apply): teal ● n NEW activity signal
vs gold ✦ NEW assignment; routes 240, tables 74; reassignment resets ack (`649791f7`) +
AttentionChip = THE premium chip primitive. **Icon discipline** (`4c56c606`): 1.5px absolute
strokes + SquareCheck (Rule 74). Close: simplify pass (`de99aaf9` — merged double SELECT,
ICON_PROPS, NavigateKeepSearch ×22 class closure), canon codified (design-system "Attention &
Notification Canon" + "Icon Discipline", CLAUDE.md Rules 73-74), 5 class-sweep Hub tasks queued,
style memory written. **846/846 API tests · live deploy = HEAD · schema v81.**

## 2026-06-11 (EVENING) — THE STYLE LOCK: 8 panel rounds → house canon ("lock it in this is great!!!")

Nick live-drove rounds 4-8 on TaskDetailPanel to a validated house style, now CANON in
`docs/design-system.md` "THE LOCKED PANEL STYLE": **R4** (`68985776`) borderless-until-interactive
(bare-typography title, ghost field selects, ghost description with one-line empty state, quiet
add-link/subtasks). **R5** (`0f0d7c32`) `GhostSelect` primitive (opaque themed menus replacing
native white dropdowns, Rule 45) + one-surface flattening (band tints dead; composer = the one
inset card). **R6** (`aba74719`) floating composer (no outline), type-to-search project picker,
scroll-stable menus (reposition not close), full pill rounding. **R7** (`6103caa2`) floating
side-peek panel (12px inset, radius-xl all corners, one deep shadow), due-pill inner-hover-border
fix, composer shadow removed. **R8** (`d04cb0b1`+`7c490e01`) calendar icon dropped; metadata
snugged under the title group / fields+composer = the action group. 844/844 throughout. Memory +
design-system codified; N1b sweep propagates app-wide. Parallel session same window: schema
**v81** `entity_seen` new-activity signal (`a496a684`) + AttentionChip (`649791f7`) — routes 240,
74 tables.

## 2026-06-11 (PM, live-review cycle) — Slack-shaped composers + thread anatomy EVERYWHERE · Ask-the-Lab converged · 4 legacy components deleted

Nick live-tested the morning's editor and drove 3 polish rounds + a parity wave, all same-day. **Composers** (`95b2752c`, `ca538d62`): idle = ONE row (COMMENT|NOTE pills inline w/ full-width un-indented input), Slack-style action row BELOW on focus (icons + "Only me"/"Hermes" pill toggles, no wrapped micro-labels); section rhythm title→fields→composer→tabs w/ tinted header band (`702e25a1`); Recent Activity first in Overview; created·acknowledged one-liner; compact avatar-pill assignee; minimal empty states. **Slack-thread entry anatomy** (`a80b7132`): ActivityEntryItem = avatar·name·timestamp·kind-badge / indented body / uniform rhythm; per-kind variation confined to accent bar + badge slot; completions/system events gained the full anatomy; callers' cosmetic props collapsed. **Parity wave** (`a97a0a0b`): AskTheLab answers converged onto ActivityEntryItem via adapter (accepted-answer ring mounted outside the renderer); ProjectComments.tsx + ProjectUpdateFeed.tsx DELETED (grep-proven dead post-P2-A). **Timeline content cleanup:** the 5 prod entries with embedded raw typed IDs rewritten (guarded UPDATEs; incl. Nick's "Comment processed: …[proj_…]" example — class is dead, P2-B killed the writers; gardener owns future machine-entry noise). All patterns codified in `docs/design-system.md` "Conversation Surfaces" + design-prefs memory. Session-close /simplify: MarkdownView parse memoized, artifact GET batched (1 D1 round-trip), 2 deferrals → PB tech-debt backlog; 3 dead-import findings were false positives (verified). docs: hermes.md 60s+artifacts lane, TESTING.md count un-drifted. Nick-side ride-alongs same window: Bug #70, List-view width/teal-project-column, --task-accent-* convergence. **838/838 · final deploy = HEAD.**

## 2026-06-11 (DAY) — H1 task-description migration EXECUTED · Hermes fetch bug (never-worked lane) · editor redesign shipped · Hermes Artifacts v1 · gardener live (deploy `57a09c40`, 838/838)

Docket H1-H5 executed + Nick's live feedback built same-day. **H1:** 592 tasks' dated-log descriptions → 907 `activity_entries` (903 pipeline + 4 residual; emit-as-is per Nick; blocker kept as `update_type='blocker'` after normalizing the pipeline's off-enum `kind='blocker'`); residual sweep caught 18 tasks the dry-run missed (14 empty stubs / 3 truly double-encoded "Sender:" tasks / 1 tagged `[date mechanic]` line — the report's 2 flagged "anomalies" were wikilink false-positives, already clean); post-strip line-start dated descriptions = 0; PB pull applied 590 + 79 stale local `notes` cleared (pull's None-guard skips NULL). Execution record in `docs/superpowers/plans/2026-06-11-task-desc-migration-dryrun.md`. **@me verified** (stored `visibility='author'`, prefix stripped). **Hermes root cause:** the ai-requests polling lane NEVER worked — listener read `resp.json()["requests"]` but the Hub has returned `{data,count}` since the route's first commit (second instance: `answers` nested under `data`); fixed PB `b794fddf` + fail-loud shape guard; Nick's aspiration-PNA lit review processed + delivered live. **H3 gardener** built (PB `1f1e523f`, 41 tests, fail-closed machine-origin gate — live PB breadcrumbs are provenance-indistinguishable from hand-typed notes, so allowlist+template default-DENY) and wired nightly `--apply` 22:40 home (Nick's call). **Editor redesign** (design doc + Nick round-2 addendum, Rule 72): why-callout → NEXT STEP line (first open subtask), composer-on-top on all expand surfaces, InlineDetail 3-entry activity peek, 3-line description clamp, TaskDetailPanel composer above tabs + Status/Priority/Project/Due inline row + SINGLE Activity tab (TaskComments/TaskUpdateFeed deleted, legacy ?tab= remapped) + Overview recent-peek (`cc1f0ec6` + `e3e40683`). **Hermes Artifacts v1** (`0e81d0fe`, schema v79, routes 231→238): long responses (>1500 chars / doc ask) become versioned md artifact pages at `/portal/artifacts/:id` with unified-timeline comments + @hermes comment-driven revision lane; 15th search entity; prod-smoked full cycle (create→revise→comment→cascade-delete). **Drift CI green again:** Nick's failure email = INFRA-5 unacknowledged v78 file + REAL stale committed schema (Slice-D pdeps rekey + daily_plans drop were applied to prod unnumbered) → snapshot ack + retro parity `api/schema-v80-retro-parity.sql`; `artifacts.project_id` registered in both identity-SSOT copies (deploy gate fail-closed catch). Tests **838/838** · schema **v80** · live deploy `57a09c40` = HEAD.

## 2026-06-10/11 (OVERNIGHT, PB ultracode session) — docket T1-T6 executed · 6 D1 tables dropped · Hermes lane live · I40 true-positive fix (final deploy at HEAD, 820/820)

PB-driven overnight session executed the entire next-session docket. **T1:** `daily_plans`+`daily_reflections` DROPPED test+prod (codex cold-read SAFE; snapshots+DDL `Scratch/t1-drop-snapshots-2026-06-10/`; REFERENCE rows removed `82e0558c`). **T2-tail:** `descriptionLog.ts` deleted (`ad11f871`, live muddied-count 0). **T3/P2-C:** 18 legacy-table reader sites + `team-pulse.ts:19` (orchestrator catch) repointed to `activity_entries` (`a8b605dc`+`3cdef5c5`); codex cold-read mandated deploy-before-drop; cascade-removal wave `d0d57028` (schema-v78, seeds/cleanup/deep-audit retargeted — 12.F also gains `'deleted'`; pre-drop artifacts marked; Rule 70 → done); 4 frozen twins (`task_comments`/`task_updates`/`comments`/`project_updates`) DROPPED test+prod (snapshots `Scratch/t3-drop-snapshots-2026-06-10/`). **T4:** Hermes response lane live (`a4e116c1`) — responses resolve the "Thinking…" placeholder in-place w/ inherited visibility; prod-smoked. **Brief-7:** API-key callers act as `nick-ingraham` (4 anonymous rows backfilled). **HUB-4:** CORS `*` fallback re-judged KEEP-as-final (named consumer documented in helpers.ts). **T5:** shared `ActivityEntryItem` (13-difference props contract) + `filterMatchesKind` + `LinkChip` (`c45f9580`). **T6:** system-events audit = ALL LOW, 0/974 imported (report `docs/superpowers/plans/2026-06-11-t6a-system-events-audit.md`); 12 spam clusters collapsed 41→12 (rollback = one DELETE on `source_id LIKE 'spam_collapse:%'`); 112 truncated completions proven source-truncated, unrecoverable. **Morning:** I40 fired TRUE-POSITIVE — Apps Script UPDATE path stamped `source_thread_id` w/o `email_link` on 6 tasks; fixed `e6f3ab45` (derived pair on UPDATE) + Nick-approved backfill; `applyInsert` now stamps `updated_at` (`cd6644bc` — was NULL on every Hub-created row, starving PB pulls paired w/ PB translator fix `e2518446`). Tests **820/820** · live = HEAD. **Next session headline: TASK-description migration** (592 tasks still carry dated-log descriptions — projects-only scope gap Nick caught; dry-run staged, see SESSION-HANDOFF top).

## 2026-06-10 (EVENING) — P2-A composer retarget · activity_log backfill · description migration EXECUTED · Obsidian links solved (final deploy on `78aee46c`)

One evening session ran Nick's queue end-to-end plus live link-debugging to resolution. **P2-A (`5f2890e1`):** project note/comment composers retargeted through `postActivityEntry` (typed `proj_*` entity keys; new `projectSlug` input preserves legacy mention-link shape); GET comments/updates became byte-preserved projections; `comments`(2 rows backfilled, ids+timestamps preserved)/`project_updates`(0) FROZEN like the task twins; `handleClaudeMention` deleted (projects.ts half of the 3rd-copy Hermes debt); ActivityStream = unified-feed-only + ReactionBar on project rows; prod write-path smoke (probe project → composer → projections → cascade 0 orphans). **activity_log backfill (Nick overrode the skip recommendation; `3d194c24`):** all 22,220 rows mined — 30 real completions imported (rest = field-change telemetry, body-less stubs, SYNCTEST artifacts), idempotency-proven, one-DELETE rollback. **Description migration EXECUTED (Nick: "go", LLM-on-parse):** 407 `description_line` entries in prod, 0 dated lines / 0 JSON-encoded descriptions remain; the double-encoded class was 9 projects not the flagged 2 (repaired via raw_decode + same pipeline); `updated_at` bumped on all 55 so PB's pull takes clean descriptions; PB owes the breadcrumb-writer retarget (brief in `Scratch-handoff/`). **Activity feed fixes (`2a5037b9`):** project feed names the originating task (`task_title` JOIN + titled TaskOriginBadge), completions render as compact one-liners, density tightened. **Obsidian links (the day's recurring complaint) — TWO stacked bugs:** IWD key links are stored as WIKILINKS (`[[note|label]]`) that classifyUrl never handled (chips navigated the SPA to a relative URL — `a35848f7` parseWikilink), and the obsidian:// warm second-instance handoff drops URIs intermittently (`998d089d`: chips now fire `mnccore://obsidian/<note>` — handler opens via the Obsidian CLI when running, protocol on cold start; home shell reinstalled + CLI enabled, Nick-confirmed both machines). Ride-along: `fd4f7cb4` HUB-4 CORS (concurrent PB session). Dogfood interim on daily_plans: clean (drop = next session, Nick waived the window remainder). Tests **793/793**; M5 P2 brainstorm-lite + parser-vs-LLM evidence docs; next-session docket at SESSION-HANDOFF top.

## 2026-06-10 (PM) — Unified activity timeline Phase 1: activity_entries, schema v77 (deploy `70e23a6a` on `3c1a493d`)

The task_messages handoff and the M5 timeline plan collided on target store; a codex referee ruling (Design C — NEW entity-generic `activity_entries`, both priors rejected) was adopted, spot-verified, and built in one session. Bounded brainstorm settled the four open decisions (all on recommendation): referee kind spelling (stored `comment|update|completion|system` in `shared/activityKinds.ts`; derived `task-*` render kinds, never stored; `update_type` sub-kinds), `@me` = literal prefix + composer lock toggle (`visibility='author'`, SQL-gated reads, PI/API-key sees all), derived all-kinds project rollups (task entries carry `project_id`), title-click = full editor. **Ground truth first:** the 160-vs-3 `task_updates` discrepancy = brain.db's append-only mirror retaining 151 hard-deleted tasks' rows (FK cascade wiped prod) — backfill scope was exactly the 3 live rows (idempotency-proven). **Backend:** `postActivityEntry()` single write primitive (mentions w/ preserved per-kind notification source_types; Hermes on ALL kinds + `@me` visibility inheritance; source idempotency); task comment/update + pb-sector Hermes writes retargeted; old endpoints became byte-preserved projections (+ compound `?since_id=` cursor — PB collector untouched); NEW `GET /api/tasks/:id/activity` + `GET /api/projects/:slug/activity` (whole-picture: project ∪ task rows); delete cascades clear entries; legacy `activity_log` (22,220 rows) frozen as compat read. **Frontend:** TaskActivityFeed 3-way merge deleted → one query + disciplined kind-render map; `@me` lock toggle; ActivityStream rolls task events into project activity. **UI quick-fixes:** My Tasks picker List | Lanes | Columns with List cold-load default (Rule 60); title-click→editor via shared-row `onOpenEditor` prop (Rule 71). **Gate finds:** `activity_entries.project_id` registered in both identity-SSOT copies; INFRA-5 snapshot was stale since v75 — fixed. HUB-3 verified already-enforced (conflict-hash validator); notes wire-alias + HUB-7 PB-gated (TABLE_FIELDS is generated from the pb-schema submodule; `acknowledged_*` absent from the wire contract) — hand-off filed. Tests **789/789**; CLAUDE.md Rules 70–71; spec `docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md`. Phase 2 deferred: legacy backfill, project composer retarget, nightly Haiku description migration, physical drops.

## 2026-06-10 — Live-review batch 2 + local-launch parity + Bug Squasher (deploys `fab0997b` → `db13bba2` → `1ee47a05`)

Nick live-drove the round and filed a stream of items; all shipped same-day (~33 commits). Three deploys: (1) **edge fixes** — one anchored left edge on ALL surfaces + anchored-left/FLUID-RIGHT wide mode (`.band-anchored-wide`: My Tasks Columns + Projects Pipeline expand rightward, no h-scroll), page tints removed, planned rows show short_title, 📌 after title; (2) **local-launch parity** — `mnccore://` verb router (open/workon/process/bugsquash) registered on BOTH machines (home via the home-work chat; its classifier correctly required Nick's in-session approval), folder-path normalization both ends (`normalizeLocalFolderPath` — primary_folder data is heterogeneous file:///%20/backslash), Obsidian vault `.md` chips, ProjectDetail/TaskDetailPanel/Today launch buttons, Hub-comments→/process collector (`GET /api/task-comments/recent` extended + PB `process_hub_comments.py`, scope: Nick's comments + team @claude); (3) **batch 2** — task editor short_title/quiet-Delete-with-undo/h-scroll fix, "Posted note" double-entry killed, **viewer-local timestamps class fix** (`parseDbUtc`/`formatDbLocal`, ~45 sites over two sweeps), description dated-log newest-first (`descriptionLog.ts`, interim until M5), ⌘K `create=true` class fixed (4 dead pairs + `NavigateKeepSearch`), create-task default due=today, **Bug Squasher** (schema **v76** `bug_reports` + GET/POST endpoints + bat + ⌘K-only PI-only command). M5 plan gained Nick's Description-vs-Activity addendum. Tests 766/766; schema v76; route count 238.

## 2026-06-09 (evening) — Design-polish round + Today plan store + ENG backlog: ALL THREE WORKSTREAMS SHIPPED (deploy `8c5b8950` on `0f3d09a8`)

One session executed Workstreams A+B+C end-to-end: **52 commits, 5 agent waves, build + tsc green throughout, 751/751 API tests, deployed + smoke-verified.** Schema **v75**.

**Cold audit first (Nick's directive).** Before reading the Claude Design package, an independent 4-lens audit ran (code-UX, code-visual-consistency, width ground-truth, screenshot judge on 40 fresh prod captures). Verdict: excellent rooms, broken hallways — task deep-links generated in 6 places consumed in 0; Manuscripts filter tautology rendered ALL 78 projects as manuscripts; fake undo on bulk snooze (`() => {}`); ProjectDetail category editor offered retired 4-bucket values (silent revert); Activity actors all "anonymous"; skeleton-as-final-state on 3 pages. 21 supplemental tickets (S1–S21) merged into the Design round per Nick: `docs/design-audits/2026-06-09-polish/SUPPLEMENTAL-TICKETS.md` (alongside the imported TICKETS.md).

**Workstream A — all 30 Design tickets + all 21 supplemental shipped.** Highlights: anchored-column width tokens (`--content-band` 1296 / `--col-main` 960 / `--col-rail` 320; My Tasks 1100px drift gone) + `DataPage` shell (Projects/Manuscripts adopted); light-mode bg inversion fixed (page=cream lightest, cards step down); first-click date popover (presets + in-app month grid, no native input); honest sync clock (StatusBar reads real PB→Hub age, "unknown" over fake green); one staleness truth (`useLabPrefs` per-domain thresholds, Settings sliders); heartbeat loaders replace spinners; overdue-first default sort + coral left-edge + `OverdueBanner` (Nick's #1 friction); deep-link consumer `useOpenParam` (search→task/⌘K→task/copy-link now work); Manuscripts = stage ≥ writing; ProjectDetail ONE activity stream (tabs → filters; `ProjectActivity.tsx` deleted); one modal shell (responsive bottom-sheet <768, z-layering fixed); one capture surface (⌘K modal canonical; shortcut rebound Cmd+N→`q` — Cmd+N is browser-reserved and could never fire); EntityNotFound branded 404s; Activity actor canonicalization at the `logActivity` chokepoint; Ideas→project promotion; instant+undo stage grammar everywhere; global density (compact default, per-view toggles removed); token-snap lint (WARN, 342-site baseline); UX-9 tablet split-brain resolved (`useIsMobile` 768→**1024**; 768–1023 = mobile-nav + tablet paddings; 0px horizontal overflow verified on 13 routes × 4 widths).

**Workstream B — Today plan is now durable + synced (decision: Today = THE cockpit).** New synced task columns `planned_for`/`plan_slot`/`plan_rank` (D1 **v75** prod+test; brain.db migrations 100/101; pb-schema **0.3.3**; generic pull-back carries them with zero new sync code). `useTodayState` re-backed onto the columns via `src/lib/todayPlan.ts` (same TodayStateApi; one-time LS migration; `right_now` singleton enforced at write; LS `thoughts` unchanged). MyTasks raw localStorage pokes re-pointed. TODAY.md pins `right_now` (`📌▶`) + planned (`📌`) via `v_section_assignments` (which also UN-inerted `group_override` on the view path). Meeting-capture persistence: Today timeline notes hydrate from + debounce-save to `meetings.notes` (iCal `cal-*` events get an honest disabled state). Decision doc: PB `Context/Decisions/2026-06-09-today-plan-task-columns.md`. IA consolidation (PB Sector planner / Personal strips / stale today_md view) = written plan only: `docs/superpowers/plans/2026-06-09-today-cockpit-ia-consolidation-plan.md`.

**Workstream C — ENG backlog (4 commits, pre-round).** Dead `handleUpsertTodayMd` deleted; Narratives contract fixed (lowercase stage + `year`, via new canonical `stageLabel()`/`stageColor()` in `stageNormalize.ts`); `UnifiedMyTasks` shim deleted; PersonalPage→PATHS. Query-Resource primitive = written proposal (65 swallow-sites; needs paired error-UI, phased).

**Smoke (live):** deploy `8c5b8950` on `0f3d09a8` Production/main; `/api/version` 200 production; plan fields present on authed `/api/tasks` (null = unplanned); bogus `plan_slot` → 400. pb-schema submodule reconciled to canonical pushed `6f61981` (`fd5182da`).

## 2026-06-09 — Slice C/D/E deployed to pages.dev (deploy `90626636` on `7bb1ccef`); B-5 wrong-surface skew closed

Pages.dev had been stuck on B-5 (`dbf9cf97`/`1cd193f2`) for 2 days while `main` carried Slice C/D/E. Root cause: the PB sessions that shipped Slice C (`18680afa`) and Slice D (`7bb1ccef`) deployed the Hub Worker via **`wrangler deploy` → the unused `mn-ccore-lab-api.workers.dev`** and smoke-tested *that* surface, while the team's real surface (`pages.dev`) only updates via `wrangler pages deploy`. Slice D's **prod-D1 migration WAS applied** (shared D1), so live B-5 code (queried `from_slug`/`to_slug`) hit a table re-keyed to `from_project_id`/`to_project_id` → **`/api/dependencies` + `/api/narratives` 500'd in prod**, unnoticed. Fixed by `npm run deploy:pages:gated`. `/api/version` 200; `/api/dependencies` 401 (clean auth-gate); identity deploy-gate PASS.

- **Slice C — replication wire flipped slug→typed `proj_*`** (PB `2af4538e`/`755d7345`; Hub `18680afa`). `applyPatch` now FK-canonicalizes slug→typed (slug-stored FK unrepresentable on UPDATE); new sync-only `TASK_SELECT_COLS_TYPED` + `?wire=typed` (gated to `canSeePb`); `predeploy:identity` deploy gate added. Browser `/api/tasks` stays slug. Tests 741/741.
- **Slice D — `project_dependencies` typed-PK migration applied to prod** (`7bb1ccef`). Re-keyed `(from_slug,to_slug)` → `from_project_id`/`to_project_id` typed FK `REFERENCES projects(id) ON UPDATE/DELETE CASCADE`, `UNIQUE(from,to)`, `CHECK(from<>to)`. DROP+recreate (D1 has no DROP COLUMN); started empty (all 8 prod rows were slug-rename-stranded double-orphans). API wire still emits `from_slug`/`to_slug` via JOIN → zero frontend changes. Rollback bookmark in the PB decision doc. Tests 751/751.
- **Slice E gate gap fixed (this session).** Slice D never registered its two typed FK columns in the Project-Identity Completeness Gate SSOT → `predeploy:identity` fail-closed on `introspection_fail_closed`. Registered `project_dependencies.from_project_id`/`to_project_id` (`typed_required`) in both byte-equal copies (PB `scripts/db/project_identity_surfaces.json` + Hub `scripts/project-identity-surfaces.json`). Gate → PASS.
- **Doc reconciliation (this session).** Hub docs lagged PB reality: schema v70→**v74** (CLAUDE.md/REFERENCE.md), `tasks.project_id` rule corrected (sync wire now typed; the "Hub kg still slug-format" justification was obsolete after Slice A), SESSION-HANDOFF rewritten.
- **Context (PB-side, not in this repo's history):** B-5 (`waiting_since`/`email_link` → Hub-canonical, v74, deployed pages.dev `dbf9cf97` 2026-06-07), Slice A (kg re-keyed typed on Hub+work), pb-schema sole-emitter manifest (VERSION 0.3.2; Hub CI runs `python -m pb_schema.verify`).

## 2026-06-05 — project_id read-boundary fix + edit-more + P6 + 9a007fd1 deploy (deploy `7653955d` on `8cc00130`)

Ultracode session clearing the WORKPLAN "NEXT SESSION" queue. **Build + `tsc` green; API suite 732/732; journeys 6/6; resolver verified against live prod data. Deployed `7653955d` on `8cc00130`; both repos pushed; /api/version 200.**

- **`tasks.project_id` slug↔id half-migration FIXED (`e7d00d04`).** P2 (`aa85c71b`) flipped the WRITE path to store the typed `proj_*` PK but left the slug-keyed frontend (~12 sites) and the PB→Hub pull on slug → ~20 open tasks rendered unlinked + sync silently broken. **Decided Direction 1 (store typed PK, present slug at the read boundary)** via a dual cold-plan + Codex + live-prod ground truth (which overturned the handoff's premise: Hub `projects.id` is ALREADY 76/76 typed + cross-machine convergent — the gated `p2_hub_rekey_apply.py` is moot for the parent table). Resolver embedded ONCE in `TASK_SELECT_COLS` (`COALESCE((SELECT p.slug FROM projects p WHERE p.id=t.project_id), t.project_id) AS project_id`) — fixes all ~10 consumers + the sync (same `/api/tasks` seq handler) from one chokepoint; `?project=` resolves slug→id; `meetings.ts` aliased `tasks t` (dropped the fragile `.replace(/\bt\./g,'')`). Internal mutation paths keep the stored typed PK. **5 slug-straggler task rows backfilled → typed PK in prod D1** (Codex amendment; for the id-only `advanceProjectMovement`/cascade paths). Decision doc + registry + consolidated-plan banner: PB `63367967`. CLAUDE.md contract rule + regression guard `api/lib/task-cols.test.ts`. **Why slug-on-wire:** the documented layering (master plan 2026-05-26: "slugs are Hub-owned display/routing fields"), consumer-fit (frontend + sync are slug-keyed), and fragile cross-store PK convergence (Hub D1 `kg_*` still hold slug-format project keys; local kg re-key never propagated to Hub). (A same-day draft's "cross-machine PK divergence" example was wrong — `peripheral-brain-system` is a `superseded_pk` alias; work+Hub converged. Corrected post-audit.)
- **`9a007fd1` Today row fixes runtime-verified + deployed (`897d5d81`).** Extended `drag-to-plan.spec.ts` (undo-on-complete + planned-strip DoneBox/grip + Completed-today uncheck) — 6/6 green. These 3 fixes (committed last session, undeployed) are now LIVE.
- **edit-more (`73977e43`):** shared `TaskQuickEditChips` (Status/Priority/Due/Project chips + "Open full editor →") on Today's `TaskDetailDrawer` + MyTasks `InlineDetail`, reusing `FieldControls` + existing mutation hooks (compact ChipPopover so the pill grids don't overflow the narrow drawer). The design-promised inline quick-editor + first path to the full editor from Today.
- **P6 responsive (`8cc00130`):** BottomSheet focus trap (UX-7); CreateTaskModal→BottomSheet below 768px; MyTasks ListView mobile grid via class hooks + an `index.css` `@media(max-width:767px)` rule (desktop 9-col power grid + j/k/e/x untouched, Rule 60). PAGE-7 (Mentee/Deadlines mobile cards) already present. **UX-9 tablet breakpoint deferred** (global layout change).
- **key_links PB→Hub: NOT a sync gap** — both sides have the same 3 projects with key_links; push (`hub_payload.py`) + pull (`PROJECT_PULLBACK_FIELDS`) fully wired; the rest is a data-entry gap.

## 2026-06-04 — Today drag-to-plan fix + Round-6 design audit P3–P6 (commits `a231fea7`…`663043e5`)

Resolved Nick's "can't drag on Today" report (multi-agent runtime diagnosis: post-P0 the drag grip was `opacity:0` until hover so users grabbed the non-draggable row body; and all timeline drop zones render *above* the task list with no native HTML5 auto-scroll). **Drag verified 3/3 on the local journeys stack; re-verified green after P3–P6.** Then completed the deferred Round-6 design phases. **Build + `tsc --noEmit` green throughout; presentation-only — no routes/API/hooks/schema. Deployed `0d024aee` on `1bbb2406` (2026-06-05); live frontend bundle hash verified == local build, `/api/version` 200 production.**

- **Drag fix (`a231fea7`):** grip always faintly visible (0.3 → 0.6 hover) + larger hit target; new additive `onTogglePlan` prop renders a 📌 plan button (the planned chip becomes the unplan control) — a reliable no-drag path that also works on touch; `useDragAutoScroll` window auto-scroll near viewport edges during a drag; `data-task-id`/`data-plan-btn` hooks + `tests/local/journeys/drag-to-plan.spec.ts`. Rule 58 intact (drag=plan-slot, 📌=plan-no-drag, body=expand, ▶=promote).
- **P3 (`c4fbb3ec`):** consolidated due-date rendering onto the shared `<DueLabel>` in 5 hand-rolled surfaces (ActionBoardCard, MyItemsCard, TaskCard, EveningTaskSlot, FocusTaskSlot). Deliberately NOT the full row into cards — that would violate the dashboard=cards taxonomy (Critical Rule 17). EveningTaskSlot/FocusTaskSlot now actually show the due date (was in the data, never rendered).
- **P4 (`958d835f`):** global Table-density control in Settings→Appearance (reuses the shared `hub-table-density` key, so it's the default every table inherits); 📌 button made touch-reachable (`@media hover:none`); skeleton shimmer timing reconciled (1.5s→1.8s) + AskTheLab adopts `<TextSkeleton>`. Per-view density toggles kept (additive); desktop 44px NOT forced (Critical Rule 9 precise-click).
- **P5 (`4a21efce`):** new `src/components/ui/` primitives — `Button`/`Chip`/`Field`/`Modal` codifying the *dominant existing* patterns with design tokens baked in; adopted one proof each (CreateTaskModal footer / Today workflow badges / CreateProjectModal fields / BugReportModal — the last also removes a Rule-45-violating backdrop blur). Adoption is incremental.
- **P6 (`663043e5`):** mobile pass — iOS focus-zoom guard (16px inputs <768px), `[data-hover-actions]` touch-reveal, RightNowCard overflow fix, IdeasPage mobile Edit/Archive (PAGE-6), sidebar `aria-modal` (UX-8). Deferred (need responsive redesign, not additive CSS): CreateTaskModal→BottomSheet, MyTasks ListView fixed-grid, MenteeMilestones/Deadlines grid, UX-9 tablet breakpoint.

## 2026-06-04 — Hub renders `short_title` on the shared TaskRow (`4d17036f`; simplify `fc4069bf`)

The brain.db/D1 `short_title` field (PB-generated for long task names, in `TASK_SELECT_COLS`, returned by `/api/tasks`) synced to the Hub but was read **nowhere** in the frontend — so 219–365-char titles (the RO3 resubmission tasks) dominated Today/MyTasks rows after Round-6 removed truncation (Rule 68). **Pure display gap; the short titles already existed in D1.**

- `src/lib/api.ts`: `short_title?` added to the `TaskRow` interface (value already arrived via the response cast).
- `src/components/tasks/TaskRow.tsx`: renders `short_title || title`, full title on hover (native `title=`) + still full in the detail drawer. Covers Today / My Hub / My Tasks (Columns + Lanes) via the one shared row. CLAUDE.md Rule 68 updated.
- Backlog reconciled to 0 (1 straggler generated via `BrainDB.update_task`). Generation stays automated via PB `generate-today` Phase 1b (daily) — not a cron; no new schedule added.
- Deployed `59b02aa8` (LIVE). `fc4069bf` = behavior-identical session-close simplify (derive `fullTitleHover` from `displayTitle`); ships next deploy.

Also landed 06-02→06-04 (earlier sessions; see SESSION-HANDOFF): DH-4 `dueLabelText`, DH-3 `isTaskDone` sweep, DH-6 page empty-states, B-8 mutations/projects allowlist-lag (`12036dc5`…`b5f38d10`); F1 pb-schema submodule import + P2 drop-slug (typed project PK on FK cols) (`33293abe`/`aa85c71b`). The P2 prod-D1 data rekey itself remains **un-run + gated** (`scripts/p2_hub_rekey_apply.py`).

## 2026-06-01 — Task-UI consistency refactor (Round 6 design handoff, P0–P2; commits `4ed8e657`, `b1f10a04`, `aa15f556`, `a19a7aa0`)

Executed `review/MN-CCORE Lab Hub Design System (5)/design/` (the "Unified Task Model" handoff). **tsc + build green; P0 surfaces visually verified light + dark on the local stack.** Pushed to `main`.

- **P0 — one shared `<TaskRow>`** (`src/components/tasks/TaskRow.tsx`, new): replaces the ~10 divergent per-surface row renderers. Contract: square = complete everywhere (never select/promote), body-click = expand, shift-click / long-press = select, full non-truncating titles on one fixed left edge, reserved priority dot, theme-aware `--task-*` tokens. Today / My Hub / My Tasks (Columns + Lanes) now render via **thin adapters** (`today/TaskRow`, `MyTasksRow`, `HubTaskRow`) that preserve every prior behavior (drag-to-plan, Right Now, v55 workflow badges, bulk bar, lane peek, inline detail). My Tasks **List view left as the protected power grid** (Rule 60).
- **P1 — editor + due-date consistency:** uniform Due-date field (`noContainer` on the `FieldBlock`); Key Links → compact inline chips (`KeyLinksEditor`, also ProjectDetail); single date control (`DateInput` → `InlineDatePicker`); new `<DueLabel>` (`src/components/DueLabel.tsx`) + a sweep replacing hand-rolled `new Date(due+'T23:59:59') < new Date()` overdue math with `dateUtils.isOverdue()` across dashboard cards, Analytics, Deadlines, Grants, task/standup/timeline views, MemberPage, CommandPalette, ConferencePrep, Pulse, lab-health signals.
- **P2 §4 — status-as-truth:** `lib/taskGrouping.isTaskDone(t)` (= `status === 'done'`) on the core surfaces; `completed`/`completed_at` still written through mutations. **§5 verified already-compliant** (no double-bg on data pages; TaskGridView already body=open / checkbox=select) — no code changes.
- **Test harness fix:** `scripts/local-db-bootstrap.ts` skips the superseded monolithic `schema-v48.sql` (collided with v20's `pomodoro_sessions`, aborting the chain → `tasks.blocked_by` missing → `/api/tasks` 500). Local setup works again.
- **Incident:** a concurrent second Claude session in the same worktree triggered a `git stash` (likely `pull --autostash`) that swept ~17 uncommitted files mid-session; recovered by hand + commit, no work lost. Lesson recorded in SESSION-HANDOFF: commit-per-chunk or isolate the second session in a `git worktree`.

## 2026-05-28 — Primitive-enforcement pass: 11 class-of-bug eliminators + codex-pass-5 BLOCK→fix arc (branch `hub-hardening-2026-05-27`, +28 commits over the hardening pass; PB branch `primitive-write-result-2026-05-28`, +3 commits)

Follow-on to the 2026-05-27/28 hardening below. **Codex pass-4 (meta-review)** of 7 prior review rounds noticed the SAME bug classes kept recurring (alpha-suffix concat caught 3 times across rounds, missing visibility gate caught 3+, optional-Request footgun) and codified the principle: *"the fix is a new primitive, not another rule"* (codex ethos #4). Nick authorized the full sweep before merge. **691/691 Hub API tests, build green; PB 458 db + 1290 integration tests green.**

**Pipeline:** codex pass-4 (meta) → `/writing-plans` (builder) → 17 parallel subagents across 4 waves → codex pass-5 (final verify, **returned BLOCK**) → Wave 4 fixes → re-verify.

**The 11 primitives shipped (each kills a class structurally, not by convention):**

1. **`defineRoute()` DSL** (`api/lib/route-dsl.ts`, `3186c5b6`) — metadata-first registration with EXPLICIT auth/entity/visibility per route. 236 routes migrated in `api/index.ts` (`65f53ad3`). Codex anti-rec honored: metadata is explicit, never inferred from path strings.

2. **Generated route contract test** (`api/routes/route-contract.generated.test.ts`, `083021e6`) — reads ROUTE_REGISTRY, auto-emits non-PI→PB-403 assertion per route. Adding an unregistered route fails the test on first run. Replaces manual `pb-visibility-contract.test.ts` enumeration. **Codex pass-5 amend:** test is shape-only; the four-caller behavior matrix (revision oracle, cross-project feeds) is still manual. Future enhancement.

3. **Typed branded Request** (`api/lib/typed-request.ts`, `67e9c710`) — `AuthedRequest`, `PIRequest`, `ProjectVisibleRequest`. Z1.6 (`be73a5bd`) removed the last 2 `request?:` from `inbox-events`/`regulatory`. Z5.2 lint (`5013bd99`) enforces no regression. **Codex pass-5 amend (deferred):** the branded TYPES are unused — ~200 handlers still take raw `Request`. Codex offered "adopt OR narrow P3 to lint-only"; we shipped the lint, deferred full adoption to a follow-on branch.

4. **Runtime entity guard wrappers** (`api/lib/route-guards.ts`, `3bdb914d`/`8d705aa9`) — `withProjectWrite`, `withOptionalProjectWrite`, `withTaskProject`, `withExistingRowProject`. 4 hand-rolled `resolveAndGuardProject` create-sites migrated (Wave 2: submissions/conferences/regulatory/revisions). **Codex pass-5 amend → Wave 4 fix** (`b0121565`): 5 sibling UPDATE handlers also migrated (`handleUpdateRevision`, `handleUpdateConference` + reparent path, `handleUpdateSubmissionEvent`, `handleUpdateRegulatoryItem`). `deadline-cascade.ts:165` inspected → confirmed GET-by-URL-param, exemption-commented.

5. **TABLE_PRIVATE_COLS expansion** (`api/lib/task-cols.ts`, `58979229`) — `email_drafts`/`inbox_events`/`regulatory_items` added (was tasks-only). **Codex pass-5 amend → Wave 4 fix** (`04d3f3e5`): `email_drafts.gmail_draft_url` + `file_attachments.r2_key` (a previously-unregistered table) added. `safeRow('file_attachments', r)` applied at `uploads.ts:164` (the list path; the delete-handler R2-side-effect exemption was already documented separately).

6. **FK_SLUG_FIELDS expansion** (same commit) — 6 new project-linked tables added. **Codex pass-5 FAIL → Wave 4 fix** (`92e2349f`): registry was DEAD CODE because `/api/mutations` `ALLOWED_TABLES` rejected the 6 tables BEFORE `applyInsert` could fire canonicalize. `ALLOWED_TABLES` expanded to match. **Wave 4 sibling sweep** (`e2343f3d`): 6 ADDITIONAL routes that accept `project_slug` directly from body (bypassing `/api/mutations` entirely) — `ai-requests`, `decisions`, `meetings.handleAddAgendaItem`, `pb-sector.handleAddToDispatch`, `questions`, `paper-links` — now call `projectRefToCanonical` at body parse time.

7. **SELECT * lint** (`scripts/check-select-star.mjs`, `0f3ffa2f`) — table-aware: flags `SELECT *` from tables with registered private cols UNLESS file uses `safeRow()` or all routes from the file are PI-auth via `defineRoute` metadata. Initial baseline 8 sites; **W3-A migrated all 8** (`a6d5bed2`) to `safeRow()` or explicit projection; baseline now empty. **Codex pass-5 amend → Wave 4 fix** (`6c9fc5d3`): `--enforce` mode wired in package.json composite (was warn-only). Same fix wired `lint:color-concat` and `lint:no-optional-request`.

8. **`hiddenResource()` helper** (`api/lib/hidden-resource.ts`, `cf057a36`) — single `error('Not found', 404)` envelope. **Codex pass-5 FAIL → Wave 4 fix** (`b0121565`): the Phase 10 "fix" for the revision existence oracle (`pb-visibility-contract.test.ts:769-817`) was incomplete — `handleGetRevisionComments` STILL returned 404 for unknown id and 403 for known-hidden via `assertProjectVisible`. Wave 4 routed both paths through `hiddenResource()`; the manual test was updated to assert the unified 404 envelope (4 new cases: non-PI on PB → 404, non-PI on non-PB → 200, PI on PB → 200, API-key on PB → 200).

9. **`idempotentDelete()` wrapper** (`api/lib/idempotent-delete.ts`, same commit) — `mode: 'soft'|'hard'` per call site (codex anti-rec honored: encodes table capability, doesn't force soft). Wave 2 migrated 3 sites (`submissions`, `conferences`, `project-documents`); `deadline-cascade` (double-project gate) and `uploads` (R2 side-effect) carry explicit `Z4.3 exempt:` block comments (`b69d5340`). **Codex pass-5 amend → Wave 4 fix** (`88f7a308`): 6 sibling hand-rolled deletes migrated — `calendar-feeds` (hard), `dependencies` (hard), `expertise` (hard), `inbox-events` (soft), `paper-links` (hard), `subtasks` (hard). Hard-delete 404→200 semantics is the intended idempotency fix (no frontend callers parse the body on these endpoints, confirmed).

10. **PB `WriteResult` typed return** (`~/Peripheral-Brain/scripts/db/write_result.py`, PB `4bffd0ac` + `1ffff54d` + `b3396e2e`) — replaces `bool` at 11 Hub-first writer signatures in `query.py` + 22 callers + 13 test files. **`__bool__` raises TypeError** — silent `if result:` truthiness bypass is now a runtime error. The doctrinal Hub-first rule "check the return" is type-enforced, not documented. Contract registered in `Context/Topics/shared-schema-registry.md`. Status semantics: `accepted`/`merged_clean`/`conflict` all have `.ok=True` (Hub-wins convergence is rest state, not failure); `transport_error`/`error` have `.ok=False` and trigger the retry envelope established in Phase 3.

11. **`cleanupWrapper.runCleanup()`** (`scripts/cleanup-wrapper.mjs`, `146b3021`) — pre-counts → mutation batch IDs → post-counts → validator cache wait/reset → writes `_final_summary.json` ONLY on verified success (`after===0` for every metric). Contract documented in `docs/cleanup-ledger.md`. Phase 5's missing `_final_summary.json` was the canary that surfaced this gap. **Codex pass-5 amend (accepted):** future-use enforcement is discipline-only; no structural mechanism forces future cleanup scripts to use the wrapper.

**Defensive lints (warn-on-new, ENFORCE in CI):**
- **Color-concat lint** (`scripts/check-color-string-concat.mjs`, `16319b55`) — flags `${COLOR}HH` + `var(--token)NN` + token-rgba literals. Baseline of 339 existing sites locked; new violations block. Codex anti-rec honored: chrome `rgba(255,255,255,.05)` style literals NOT flagged.
- **`request?:` lint** (`scripts/check-no-optional-request.mjs`, `5013bd99`) — 3 grandfathered cron-dual-invoke sites (`digest-email`, `lane3`, `sessions`) baselined; future Z1.7 to split cron path from HTTP path so the lint can flip to ENFORCE without splitting handlers.

**Plan + execution:** `docs/superpowers/plans/2026-05-28-primitive-enforcement-plan.md` (committed `828fcac4`). 7 phases (Z1-Z7), 25 tasks, 17 parallel subagent dispatches across 4 waves (foundation → wrappers/registries → migration burndown → codex-pass-5 BLOCK fixes).

**Method capture:** Two compounding insights for future audits.
1. **Pass-4 meta-review pattern** — when reviewer N+1 catches the same bug class as reviewer N, stop reviewing harder and build the registry/wrapper/lint that makes the class extinct. The codex ethos rule (#4) is now the trigger condition for opening a "primitive-enforcement" pass.
2. **Pass-5 "shipped ≠ used" check** — three of the eight class-of-bug primitives shipped on paper but were defeated by downstream gates (FK_SLUG_FIELDS was registered but ALLOWED_TABLES rejected the tables before canonicalization fired). A registry without a corresponding "consumer-exists-AND-fires" test will silently rot. The generated route contract test (P2) is the right shape of this kind of test; expand it to assert the FK+private-col paths next. Recorded for the next audit cycle.

## 2026-05-27/28 — Hub Hardening: full-system audit + 11-phase remediation (branch `hub-hardening-2026-05-27`, 34 commits)

End-to-end hardening triggered by the PB Phase-D/E/F simplification. Pipeline: 11-lane parallel audit → collated plan → Codex pass-1 (verify+tier) → `/writing-plans` → Codex pass-2 (comprehensiveness/while-we're-in-here, found `primitives-first` consolidation + write-side gap) → subagent-driven execution → Codex pass-3 (final, BLOCK→fixes-then-ship) → drift cleanup. **602/602 API tests, build green, working tree clean. Not yet merged or deployed** — next session reviews + decides.

**Shipped on branch `hub-hardening-2026-05-27`:**
- **Security/ACL primitives + sweep (Phase 1a/1b):** `actorSlugFromRequest`/`assertProjectVisible`/`projectRefToCanonical`/`safeTaskRow` in `api/helpers.ts`; gates applied across **~50 endpoints** — notifications, task-files (attach/list/delete), sessions/lane3/inbox-events PI-gated, every project-linked CRUD (projects/tasks subresources + submissions/conferences/regulatory/revisions/deadline-cascade), cross-project feeds (recent task-comments, conferences upcoming, regulatory expiring/ICS, deadline impact/all, manuscripts active), meeting prep/generate-agenda PB-filtered. API-key/PB-sync passthrough preserved.
- **`notes` privacy leak (Phase 2):** `tasks.ts:226` `handleToggleTask` + `meetings.ts:38` task list use `TASK_SELECT_COLS` + `safeTaskRow`; `/api/mutations` `readCanonical` projects task payloads. Defense-in-depth.
- **Hub-first silent-write-loss closed (Phase 3, PB):** `apply_hub_first` soft-failures durably INSERT a retry envelope into the outbox (drain processes it; dead-letter after 3); `/process` doctrine + `complete_task`/`update_task`/`uncomplete_task` callers must check the bool (TODAY.md cannot lie). PB commits `6f361780` + `22a2bb69` (push canonicalize closes orphan-class at producer).
- **Correctness (Phase 4):** Hermes project-comment slug→id FK + task-comment Hermes path; upsert enum guard on `handleUpdateProject`; delete idempotency-before-cascade in projects AND tasks route handlers; single-project conflict→409 (client `fetchApi` rolls back); regulatory enum drift (`action_needed`/`expiring_soon` added to `VALID_STATUSES`); `projectRefToCanonical` applied across submissions/conferences/regulatory/revisions/deadline-cascade; `/api/mutations` insert path resolver guard.
- **Phase-5 prod data cleanup:** 27 zz-test/fixture projects soft-deleted, 30 enum normalizations (2 stage `Idea`→`idea`, 28 priority NULL/`normal`→`medium`), 78 orphan tasks reconciled (69 + 9 drift re-clean), schema **v70** (`idx_projects_slug_active` UNIQUE partial index). Drift log: `~/Peripheral-Brain/Scratch/phase5-cleanup/_drift_cleanup_2026-05-28.json`. Lab_settings validators flag-ON since 2026-05-26 but **CODE deploy-gated** (live deploy `a3ff900` predates `fc7c08f9`) — activation pending merge+deploy.
- **UX (Phase 6):** Ideas Edit wired; Settings AI dead-form replaced with Team Directory link; Grants row-expand reachable; DeadlineCascade reset; Mentee slugs derived from `team_members.member_type`; theme toggle state-driven; PIAnalytics mentee velocity uses quoted-LIKE (no `lee`⊂`mcleery` false positives); grants relabeled "active" (no invented "funded"); Day Score rename resolves the dual-Lab-Health conflict; shared `<QueryState>` distinguishes loading/auth-error/empty.
- **Design ethos (Phase 7):** semantic `--task-*` CSS vars in light + dark (axe-AA-pinned); JS palette swapped in `taskGrouping.ts` + Today/MyTasks constants + inline literals (proactive `withAlpha()` helper for the `${color}NN` class); Today + MyTasks no longer dark-locked (light mode works); `section-ink` preserved as `--always-dark-section-bg` (intentional); opacity-floor lint added (WARN, 365→335 sites); monospace removed from pb-sector cards; lucide Sparkles → HermesMark; sub-24px tap targets bumped.
- **Simplifications (Phase 8):** WebSocket invalidation one-liner (was a silent no-op — broadcast `'data'` invalidated `['data']` key matching nothing); Manuscripts redundant stage dots removed; Grants milestones consolidated to Post-Award only.
- **Doc drift (Phase 9):** REFERENCE routing table (`/portal/pb`, `/portal/sessions`, dropped portal `/network`); PB skill docs corrected (`sync.py push` is a no-op for tasks/projects); `hub-schema-sync/agent.md` DB name + wrapper.
- **Coverage gaps (Phase 10):** global error handler sanitized in prod (request_id + server-side log); PB-visibility contract test (15 reads + 18 writes + 8 feeds with body inspection + drift guard, `pb-visibility-contract.test.ts`); delete-semantics standardized (idempotent 200 across submissions/conferences/project-documents/deadline-cascade/uploads); rate-limit middleware absent — documented + `RATE_LIMIT_ENABLED` flag recommended.
- **Codex pass-3 fixes (final round, all closed):** ~12 missed write-side gates + ~6 cross-project feed leaks + meeting sub-routes + task-files PB-visibility + contract-test expansion + PillStrip invalid CSS-var alpha-concat (`var(--task-accent-green)10` → `withAlpha()`) + 2 missing optimistic rollbacks (`useVoteIdea`, `useUpdateDigestStatus`). Verified by re-running tests + a targeted Phase-5 prod re-verify (caught 2 surviving zz-test projects + 9 orphan tasks the original run missed; cleaned).

**Method capture (re-usable):** the 3-pass Codex cadence worked. Pass-1 tiered findings + made the architectural call. Pass-2 with the "while we're in here" lens caught the primitives-first restructuring + a write-side gap the initial spec missed + a notes leak in `/api/mutations` canonical_payload that the 11-lane audit also missed. Pass-3 caught the residual write-side gates the implementer dispatch under-specified + a CSS regression. Lesson: when applying a sibling pattern across many endpoints, the dispatch must enumerate WRITES separately from READS, and the contract test must inspect response bodies, not just status codes. Recorded in this CHANGELOG so it compounds.

## 2026-05-23 — Increment 1A Phase α: time-discipline foundation + LWW churn-fix (deploy `17d7cdd1`)

Full reviews-before-code pipeline: **6-review wave** (3 Opus specialist reviews + 2 Codex plan-audits) on three interrelated plans (activity-timeline/comments, LWW timezone v2, canonical time-discipline) → reconciled into ONE Nick-approved design (`docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md`) → `writing-plans` (builder draft → **Codex BLOCK-and-rework** → amended `217989c3` → spot-checked) → `subagent-driven-development` execution of Phase α. A reviewer contradiction (snapshot needed?) was resolved against ground-truth code: wrong LWW overwrites are **unrecoverable in place** (`audit_log`=hash only `query.py:314`; CRDT=hash+latest-only `crdt.py:247-255`) → snapshot is mandatory for Phase β.

**Shipped + LIVE** (deploy `17d7cdd1` on `68b8d861`, `/api/health` ok, Hub api 208/208):
- **Task 4 — killed the live LMM churn bug** (`api/routes/mutations.ts` `advanceProjectMovement`): UTC-normalize `client_ts` + the stored operand before the atomic single-UPDATE `CASE` MAX, so a naive-CT `client_ts` no longer lexically mis-orders against a UTC `last_meaningful_movement` (`d9398a83` + comment-accuracy fix `68b8d861`). Atomicity preserved (no SELECT-then-write race). The deploy also batched the **`tasks.notes` privacy redaction** (`66e5c9d0` — 4 post-write re-fetches + proactive-brief now use `TASK_SELECT_COLS`) → live.
- **Tasks 1/2 — canonical time chokepoints:** PB `scripts/db/timez.py` + `now_instant()`/`now_instant_wire()` in `outbox.py` (`569a604a`); Hub `src/lib/time.ts` (`Instant`/`CivilDate` branded types, `nowInstant`, `formatLocal`, `todayCivil`) (`be2eb1d4`). No callers yet — pure additions.
- **Task 3 — time-discipline lint R20-R23, WARN mode** (executable contract): PB `check_sync_antipatterns.py` (reuses `PB_LINT_MODE`; R10 was taken) (`43b9eb68`) + Hub stdlib `scripts/check-time-discipline.mjs` in `schema-drift.yml` (no `|| true`) (`40058df6`). 114 PB + 138 Hub raw-date sites flagged (warn, exit 0); ERROR-flip wired for Phase β Task 9.
- **Task 10 — hazards:** `sync/operations.py:920` second freshness-guard caller `local_time_is_localtime` `True`→`False` (latent Bug-2); `backfill_last_meaningful_movement.py` quarantined behind `--allow-post-utc-cutover` (would re-poison LMM with CT post-flip); per-column timestamp zone contract registered in PB `shared-schema-registry.md` (`c00db519`).

**Principle established:** store every instant UTC, display in the viewer's local zone — browser zone on the Hub (traveler-aware), rendering-machine OS zone server-side (TODAY.md/CLI); `completed_at` is UTC-store/display-local, not a CT exception.

**Deferred to a coordinated session — Phase β (Tasks 5-9):** snapshot both repos → fail-closed LWW enforce flip → `client_ts` cutover → stopped-world legacy UTC migration (`088_normalize_timestamps_utc.py`) → delete the `to_utc_dt` scaffold. Preconditions in SESSION-HANDOFF (home laptop quiescent, triage 16 pre-existing `tests/sync/` failures, snapshot-first, watch window). **⚠️ Standing:** 16 pre-existing `tests/sync/` failures at HEAD (unrelated to 1A).

## 2026-05-22 (evening) — Pre-adoption SECURITY tier (T0) + correctness, orchestrated 3-agent batch

Plan → codex plan-audit (gpt-5.5, BLOCK→ship-after-amend, 217K tokens) → 3 parallel Opus agents (BACKEND `api/` · FRONTEND `src/` · SYNC PB) → integrate/build/test/commit/deploy. Plan + amendments: `docs/superpowers/plans/2026-05-22-hub-pre-adoption-batch.md`.

**Shipped** (`0a612459` api · `45911e6d` frontend · `7c222e65` data; deploy `b9e31ca8`; PB sync `148138e3`):
- **SEC-T0-1/+** auth-aware public-GET projections — `/api/team` & `/api/meetings` redact email/notes/agenda for unauth (verified live); `/api/team/pulse` aggregate-only; `/api/projects/health` + `/api/activity` filter PB-category for non-PI. Full `isPublicGet` allowlist audited.
- **SEC-T0-2** search now requires auth + a shared visible-project predicate across projects/comments/notes/tasks/files (PI sees all; others exclude PB).
- **SEC-T0-3** owner-or-PI authz on digest generate/send.
- **SEC-T0-4** `tasks.notes` redacted from BOTH list and single-task endpoints (explicit column list).
- **SEC-T0-5** shared `assertProtectedNotNull` rejects NULL on protected fields across all 3 write paths (mutations insert+patch, project update, task update — codex caught the task + insert gaps the original plan missed).
- **SEC-T0-6** unified actor-identity policy (`resolveActor`) at ~11 sites — default own slug, overrides must be known team slugs, impersonation gated to PI/API-key (claude-ai exempt).
- **SEC-T0-7** project delete cascades the newer child tables; PB-origin delete mirrors it.
- **NEW (codex-found) attachment visibility** — `/api/files` list/download/delete enforce parent-entity visibility; non-PI blocked from PB-category project files.
- **SEC-T0-8/9** JWT fails closed when `REQUIRE_AUTH=1`; api-key middleware also accepts `X-API-Key`.
- **CT-2** remaining UTC "today" anchors → CT helper (server: projects/index/pb-sector/regulatory/submissions/conferences) + `localDateKey()` (frontend: Calendar/PBSector/TodayView/ConferencePrep/SubmissionTimeline/meeting classifier). `pb-sector.ts:142` correctly LEFT (prev-date arithmetic, not a today anchor).
- **FAKE-2** `<HermesPending>` (pulse card + elapsed timer, clears via realtimeBus) replaces literal "Thinking…" in Ask the Lab + project comments.
- **CON-2** emailSlug LUT mirrored 3→21 to match backend; `fetchManuscriptsAttention` res.ok guard; TaskRow v55 op-field types.
- **DH-1** grant_milestones seed TEMPLATE (real data TBD). **DH-2/FAKE-1 dropped** — already satisfied.
- **PB sync symmetry** — key-presence gates so a Hub NULL clears `stale_active_since`/`next_artifact` in brain.db; `last_meaningful_movement` MAX-wins preserved.

Build GREEN, **api tests 199/199** (+21 guard tests). Deploy verified live on `b9e31ca8`; `run-tests.sh quick` 113/0/4 post-deploy.

**Then CT-3 + docs** (`a8bd7a9e`, deploy `cd30f61e`): the 12 remaining frontend UTC-today sites (CommandPalette/Dashboard/Layout/useOnboarding/UpcomingCard/NotificationBell/ProjectDetail/GrantsPage/ActivityPage/UpcomingMeetingBanner/TaskTimeline/TaskGrid) → `localDateKey()` — **timezone-correctness sweep (CT-2+CT-3) now complete**. CLAUDE.md deploy guidance fixed (`e3adaf36`): Claude runs `npm run deploy:pages:gated` directly (wrangler already authed); powershell.exe + reading secrets.ps1 are classifier-denied dead ends — don't punt the deploy. The `isPublicGet` regex for `GET /api/team/:slug` was assessed and LEFT (no handler exists, but likely forward-provisions a public profile endpoint — not "dead"); the "single-profile email leak" the agent flagged was a false positive.

**Then Increment B — resilience + correctness/a11y** (`bb2db3c3` search · `7a4599a0` frontend; deploy `8c8188ac`; api 204/204; `run-tests.sh quick` re-verified): **UX-5** search source isolation (`Promise.allSettled` — one slow/failing table returns `[]` + additive `{partial, failedSources}` instead of sinking all 14 sources; auth/PB-visibility unchanged). **T3' safe correctness/a11y:** ProjectDetail + TodayPage real query-error states (EmptyStateArt + retry; loading vs missing-slug distinguished); MeetingDetail attendance toggle rolls back + toasts on save-fail (was silently swallowed); CreateTaskModal dangling `aria-labelledby` fixed. No design restructuring (MyTasks ListView→TableContainer deferred to a design pass).

## 2026-05-22 (PM) — T1 correctness batch + deploy + 5-pass Codex simplify review

**Shipped** (`5f5f597d`, `909c6e8b`; deploy `af3189f0` live on `909c6e8`):
- **CT date helper** (`api/lib/ct-date.ts` `ctToday(offsetDays)`) replacing 10 UTC "today" anchors + paired window-bounds across tasks/meetings/pb-sector/proactive-brief/projects/digest-email (rolled to tomorrow after ~6pm CT). DST-safe via formatToParts.
- **STATE-1** (TodayPage done-from-cache: reconciliation prunes optimistic flag on cache-confirm + markDone onError rollback + `isToday()` not UTC slice + `localDoneIds` dedup).
- **STATE-2** (ProfilePage `['team-raw']` → real `useQuery`; auth-gated).
- Enum-drift audit + DAT-4 realtimeBus: verified clean, no change.
- **Codex verification gate** fixed 2 critical (pb-sector meetings `date('now')` UTC vs CT `today`; digest date labels missing timeZone) + 5 minor.
- **test D1 reconciled to prod** (hub-schema-sync): was missing 27 tables + columns (v54/v55/v57/v58); now 76 tables exact match.
- Deploy-mechanism docs corrected (manual-only via `npm run deploy:pages:gated`; `CLOUDFLARE_API_TOKEN` not OAuth); librarian fixed 3 stale brain.db agent_knowledge entries.

**5-pass Codex "simplify + improve" review** (`8cb953df`/`8ebb490e`; `docs/reviews/2026-05-22-codex-simplify/`): WORKPLAN-blind, exclusion-chained. Surfaced a pre-adoption SECURITY tier (over-exposed public GETs, search PB-visibility, `/api/mutations` protected-field nulls, 9 identity bypasses, cascade gaps), ~12 more CT/UTC sites, simplify deletes/consolidations, UX gaps. Graduated into WORKPLAN. Clean negatives: no new optimistic-staleness/enum/PK/Buffer/cron-guard bugs.

## Phase 38 — Today B2 + MyTasks Round 2 (2026-04-24)

**Headline.** New CD design pass shipped on `feature/today-b2-mytasks-r2`.
Two page-level cutovers + new API endpoint + 6 new CLAUDE.md rules.

**Source design (CD memory):** `review/handoff_today_my_tasks_2026.04.24/`
— full mental model in CLAUDE.md, prototype in `today-explore/option-b2.jsx`
+ `mytasks-explore/unified-mytasks.jsx`, pixel ground-truth in
`reference/*.png`. Read these before touching either page.

**Plan source:** `~/.claude/plans/a-couple-things-that-curious-popcorn.md`
— Context, file map, phase boundaries, verification gates, and the
verdict matrix for unshipped CD round-5 tickets (3 dropped as obviated,
2 folded into P1, 9 kept as follow-ups).

### Commits (in branch order)

1. **`2e518d2` — Routes + Lab Overview rename.** PATHS gets `overview` +
   `myTasksLegacy`; new `/portal/overview` + `/portal/my-tasks-legacy`
   routes. Sidebar primary nav: Dashboard label → "Today" (route still
   `/portal/dashboard` for URL compat); add "Lab Overview" entry. Mobile
   tab bar overflow Work section gets Lab Overview. Tests/helpers/paths
   mirror updated. Both new routes render existing Dashboard / MyTasks
   for now (single-step cutover comes in subsequent commits).
2. **`d9f4188` — Today B2 page port.** Single-file translation of
   `option-b2.jsx` to `src/pages/portal/TodayPage.tsx`. Surfaces:
   - Pill strip: overdue / stalled / planned / meetings / done-today +
     Lab Health (formula 100 − 4×overdue − 2×stalled, links to
     `/portal/overview`)
   - Right Now: gold-glow promoted slot, swap queue, expand for
     trail/chat
   - Timeline: today's meetings + drop zone strip (calendar empty-state
     links to Settings; OAuth deferred to Phase 3)
   - 5 task groups (deep / priorities / quick / pb / etl) bucketed via
     `getGroupForTask()`; sort planned → active → done
   - Task drawer: Why / Subtasks / Recent Updates / Blocks / inline chat
   - Right rail: Hermes suggests (cheap algorithmic) / Needs Attention /
     Projects / Pulse
   State: `useTodayState` localStorage-backed, keyed by
   `today_state_${YYYY-MM-DD}`, drops stale entries on each render.
   Wired `/portal/dashboard` → `TodayPage`; `/portal/overview` keeps the
   old Dashboard component.
3. **`da8331d` — UnifiedMyTasks port.** `src/pages/portal/UnifiedMyTasks.tsx`
   ports `unified-mytasks.jsx` + the three view files. Three views
   (Columns / Lanes / List) share ONE toolbar (Rule 55). View picker
   far-left of filter row, persists to `localStorage.mt_view`. Quick-view
   tabs: All / Today / Overdue / Waiting / Stale. Custom `FilterChip`
   dropdown so Guardrail #4 (no raw `<select>`) holds. Bulk handlers
   stubbed for P0 (alert + console.warn — wired in P2). 'Today' quick-view
   reads planned-set from TodayPage's `today_state_YYYY-MM-DD` key, so
   promoting from Today flows through here without a separate state
   store. `/portal/my-tasks` → `UnifiedMyTasks`;
   `/portal/my-tasks-legacy` → old `MyTasks.tsx`.
4. **`6ccf1ed` — `/api/tasks/:id/detail` endpoint.** New
   `handleGetTaskDetail` returns `{why, updates, subtasks, blocks}` in
   one round-trip. `why` = description first paragraph (no new column).
   `updates` = task_updates merged with activity_log entries (sorted DESC,
   capped 30). `subtasks` = task_subtasks with sort_order. `blocks` =
   tasks whose `blocked_by` mentions this id (LIKE).
5. **`d920528` — Wire TodayPage drawer to real data.** New
   `useTaskDetail(taskId)` hook in `useApiData.ts`. Drawer renders
   real subtasks (with completion checkboxes), real blocks, and merged
   updates color-coded by author (Hermes=gold, Nick=teal, others=grey
   per Rule 54). Loading skeleton inline. UnifiedMyTasks drawer stays
   static for this commit.

### Decisions

- **Single-file ports over component-per-file split.** Faster ship; the
  HANDOFF §2 file map can be honored by a follow-up refactor commit.
  Both ports come in at ~1000 lines each — large but manageable.
- **localStorage state for `rightNow / planned / done`.** Day-keyed,
  resets daily. v2 will add a `planned_for` D1 column for cross-device
  sync (deferred to its own /substrate-swap-shaped change).
- **Lab Health formula = design's spec.** `100 − 4×overdue − 2×stalled`
  floored at 0. Plan called for fallback to existing `LabHealthScore`
  hook; the existing hook lives in old Dashboard and is hard to extract
  without a follow-up. Use design formula for now; refactor later if
  the numbers diverge in practice.
- **Hermes-suggests rail card uses cheap algorithm for P0.** "If overdue
  > 0: work the longest one first; if stalled > 0: pick one and ship a
  30-min nudge; else: block 90 minutes for deep work." Real LLM call
  deferred until /api/hermes/today-suggestion endpoint.

### CD round-5 ticket verdicts (post-Phase 38)

3 obviated by Today B2 / MyTasks Round 2: **T-07, T-08, T-09** (TodayHero
density / scroll / redundancy — replaced by new design).
2 folded into Phase 38 deferred: **T-05** (compose @-/emoji/📎 toolbar),
**T-06** (reactions flush-left). Will ship alongside MyTasks drawer
wiring in a follow-up.
9 kept for follow-up sessions: T-16, T-20, T-23, T-24, T-29, T-32, T-34,
T-40, T-47. See plan §6 verdict matrix.

### Out of scope / deferred

- T-05, T-06 polish on the Today drawer + UnifiedMyTasks drawer wiring
- Component split per HANDOFF §2 (currently single-file ports)
- Calendar OAuth + personal shortcuts (Phase 3)
- `planned_for` D1 column for cross-device sync (Phase 3+)
- Mobile responsive pass (design is desktop-first 1440w per CD memory)
- A11y pass (focus rings, screen reader labels, tab order)
- Bulk-action wiring on UnifiedMyTasks (P2)
- The 7 CD design-direction structural proposals (separate strategic
  discussion)

### Quality gate (local)

`tsc -b && vite build` green. TodayPage chunk ~36 KB / 9 KB gz;
UnifiedMyTasks chunk reuses existing MyTasks chunk size class. Branch
not deployed yet — verify `npm run test:local` and inspection suite
before merging to main.

## Phase 38 closure r2 — CD verification pass (2026-04-25 evening)

**Headline.** Two parallel verification agents compared shipped
TodayPage.tsx + UnifiedMyTasks.tsx against the CD handoff at
`review/handoff_today_my_tasks_2026.04.24/`. Found 12 spec gaps, all
shipped across 4 deploys the same evening. Hub-audit retargeted for
Phase 38 UI (was failing on selectors that no longer exist). One-time
agent scheduled to retire `/portal/my-tasks-legacy` after one-sprint
soak (`trig_01Mobbas7u1o7xGGizxfkmPp`, fires 2026-05-02 14:00 UTC).

### Deploys

- **r2 `b7fe974e` (commit `6c6252c`).** 8 verification-flagged gaps:
  - Mentee filter chip on UnifiedMyTasks (was missing despite
    `filter.mentee` state field existing) + apply via researchTeam
    slug match.
  - Stale threshold reconciled 14d → 10d (chip count and quickView
    were disagreeing).
  - Group sort planned → active → done within byGroup buckets
    (CLAUDE.md Rule 62 was violated).
  - Tag glyph on Card / LaneRow / ListRow + PlannedTaskRow +
    TaskRowDisplay (CD spec; `tagForTask()` picks emoji from project
    category or task source).
  - ▶ Work button on Today's RightNow hero (was: only ✓ Done).
  - between-N drop zones in Today timeline + render planned tasks
    in matching gap (was: "drag into gaps" copy was a lie).
  - PulseCard restored to spec — FOCUS / SYNC tiles + MENTEES section.
    SYNC turns coral if >24h (Rule 59).
  - LinkRow on PlannedTaskRow (was: drawer-only).
  - ReactionBar T-06 `+` button right-aligned + picker opens leftward.

- **r2b `1eab1007` (commit `545954f`).** InlineDetail wired + bulk
  picker popover:
  - InlineDetail's ▶ Work / 📌 Plan today / Snooze +1d / Archive were
    pure decoration (no onClick). Wired to `useUpdateTask` +
    `today_state_<date>` localStorage helpers. SmartCompose replaces
    the bare input.
  - Bulk Reassign / Priority / Status replaced `window.prompt()` with
    inline popover (dark-first picker; Esc / outside-click close;
    `assigneeOptions` from researchTeam + directors).

- **`dca0d7e` (audit retarget, no deploy needed).** `scripts/hub-audit.ts`
  tasks section retargeted for Phase 38 UI (~280 line rewrite). 12 PASS
  / 2 INFO / 0 FAIL. Plus CF Access service-token forwarding via
  `extraHTTPHeaders` (`CF_ACCESS_CLIENT_ID/SECRET` env vars) — was
  missing since the 2026-04-21 launch; every audit was hitting Google
  Sign-In.

- **r2c `32ffa0e7` (commit `dc79ed4`).** HermesSuggests upgraded from
  one focus sentence to focus + 3-bullet ul per CD spec parity.
  Algorithmic bullets: longest-overdue task / most-stalled project /
  mentee with overdue-or-today task. Real Hermes async wiring (60s
  listener poll) deferred — needs daily ai_request cache pattern.

- **r2d `5a5962c9` (commit `45351c1`).** Two more decoration-to-real
  gaps swept after the verification pass:
  - TodayPage ProjectsCard.nextAction was hardcoded `null` (no
    `next_action` column on projects in D1, verified via PRAGMA);
    now derives soonest-due open task assigned to current user per
    project.
  - UnifiedMyTasks TaskDrawer (List view side panel) ▶ Work / 📌
    Plan today buttons had no onClick; wired to the same
    `readTodayState`/`writeTodayState` helpers as InlineDetail.

### Quality gate

- Build clean across 5 commits (`6c6252c` → `545954f` → `dca0d7e` →
  `dc79ed4` → `45351c1`).
- Hub-audit on `5a5962c9`: 12 PASS / 2 INFO / 0 FAIL. INFO is
  GlobalQuickAdd persistence check (needs `injectFakeAuth` or
  preview-deploy auth path).
- `/api/health` 626 tasks / 69 projects / 86 ms.

### Out of scope / deferred at r2 close (most superseded same evening — see r2e through r2k below)

- **Move → button** on InlineDetail / TaskDrawer — was DEFERRED at r2
  close pending CD round-trip. **SHIPPED in r2e (priority-based,
  superseded) → r2f (group_override schema) → r2g (Today parity).**
- **Component split per HANDOFF §2** — was deferred at r2 close.
  **SHIPPED in r2i (`44fa6a5` merge); pure refactor; audit clean.**
- **GlobalQuickAdd persistence audit path** — was INFO at r2 close.
  **PASS in r2k via test-mode auth bypass (`X-Test-Mode-Key` +
  `X-Test-User`); audit now 14/0/0 on tasks.**
- **OverlapBand + Join/Brief/Attendees on EventRow** — STILL deferred
  (Phase 3 calendar OAuth prereq).
- **Real Hermes async wiring** — STILL deferred (algorithmic 3-bullet
  stub shipped r2c covers most value; real async needs daily
  `ai_request` cache pattern).

## Phase 38 closure r2c through r2k — same-day continuation (2026-04-25 night)

**Headline.** Continued the r2 close-out across 7 more deploys + 1
cross-repo schema migration + 1 component split refactor + 1 test-mode
auth bypass. Final state: hub-audit 14 PASS / 0 INFO / 0 FAIL.

### Deploys

- **r2c `32ffa0e7` (commit `dc79ed4`).** HermesSuggests upgraded from
  one focus sentence to focus + 3-bullet ul per CD spec. Algorithmic
  bullets: longest-overdue / most-stalled / mentee-with-overdue.
- **r2d `5a5962c9` (commit `45351c1`).** ProjectsCard.nextAction was
  hardcoded `null` — now derives soonest-due open task per project.
  TaskDrawer ▶ Work / 📌 Plan today buttons wired to today_state
  localStorage helpers (same gap that InlineDetail had).
- **r2e `c454e1c9` (commit `b1f92c1`).** Move → button (priority-based
  mapping). **Superseded by r2f.** Nick caught the semantic gap: a
  Move click is a preference, not a derivation input.
- **r2f `6ec99e0f` (commit `84afe65`) + PB `adf104be`.** `tasks.group_override`
  schema v50 + brain.db migration 037. Cross-repo: Hub Move click writes
  field; D1 → brain.db sync carries it via `hub_payload.translate_task_*`;
  `generate_today_markdown.py::_GROUP_OVERRIDE_TO_SECTION` honors it for
  next-morning TODAY.md bucketing (pb→peripheral_brain, etl→clif_etl,
  others map directly). Decision doc + shared-schema-registry entry per
  cross-repo discipline. CLAUDE.md rule 63 captures the contract.
- **r2g `fb308a88` (commit `3681018`).** Today TaskDetailDrawer Move
  parity — same MOVE_OPTIONS + popover as UnifiedMyTasks.
- **r2h `3481f102` (commit `00d6565`).** 📍 indicator on rows with
  `group_override` set — across 5 surfaces (Card / LaneRow / ListRow /
  TaskRowDisplay / PlannedTaskRow). Tooltip explains "Moved manually".
- **r2i `4cc8517d` (merge `44fa6a5`).** Component split via background
  agent in isolated worktree. TodayPage 1357 → 300 LOC composing parent
  (16 files under `src/components/today/` + `src/hooks/useTodayState.ts`).
  UnifiedMyTasks 1351 → 8 LOC re-export shim (15 files under
  `src/pages/MyTasks/`). Pure refactor, no behavior change. Two extra
  files vs spec: `today/primitives.tsx` + `MyTasks/primitives.tsx` for
  shared sub-components used 4+ places. Audit clean post-merge.
- **r2j `ee39f4ee` + r2k `bd0386c0` (commits `fa1c96e` + `ed02570`).**
  Test-mode auth bypass via `X-Test-Mode-Key` + `X-Test-User` headers
  in `getAuthUser()`. Decoupled from DB swap (no `X-Test-Mode: true`
  required) so audit can write to prod. Closes 3 prior INFOs:
  GlobalQuickAdd persistence + reload survival + Move group_override
  write all PASS now (14/0/0 on tasks). Audit also extended with
  section 1.13 covering the Move → group_override flow end-to-end.

### Schema (cross-repo)

- D1 `api/schema-v50-task-group-override.sql` applied to prod
  (`changed_db: true`). Adds `tasks.group_override TEXT` (nullable).
  Values: `'deep' | 'priorities' | 'quick' | 'pb' | 'etl' | NULL`.
- brain.db `scripts/db/migrations/037_tasks_group_override.sql` applied.
  Same column. PB-side decision doc:
  `Context/Decisions/2026-04-25-tasks-group-override.md`. Registry entry:
  `Context/Topics/shared-schema-registry.md`.

### Auth (security-adjacent)

- `getAuthUser()` in `api/helpers.ts` checks test-mode bypass FIRST when
  `env.TEST_MODE_KEY` is set. Activates on `X-Test-Mode-Key` (Cloudflare
  secret match) + `X-Test-User` (email-shaped) header pair. Identity
  comes from the X-Test-User header. Trust boundary: TEST_MODE_KEY is
  already a Cloudflare secret + CF Access still gates the request.
  Knowing the secret already grants test-DB writes — auth bypass
  doesn't widen blast radius.

### Quality gate

- Build clean across 11 closure-r2 commits (r2 → r2k).
- Hub-audit on `bd0386c0`: **14 PASS / 0 INFO / 0 FAIL** on tasks
  section. Every assertion green: toolbar, view shapes, GlobalQuickAdd
  create + persistence + reload survival, all 4 filter chips
  (Group/Priority/Project/Mentee), search, List `e` drawer, BulkBar
  with 7/7 actions, SavedViewsMenu, Move → group_override write.
- `/api/health` 626 tasks / 69 projects / 19 team / ~70ms.

### Out of scope / still deferred (post-r2k)

- **Real Hermes async wiring** — daily `ai_request` cache pattern;
  algorithmic 3-bullet stub from r2c is good enough for now.
- **OverlapBand + Join/Brief/Attendees on EventRow** — Phase 3 calendar
  OAuth prereq (Google + Outlook OAuth flows + per-user tokens).
- **Audit nightly cron** — could schedule a routine to run the now-clean
  audit nightly; useful regression catcher, not urgent.

## Claude Design round-5 batches 3-4 (2026-04-23 night, later)

Nick pushed back on the T-49 mobile-swipe removal; restored with a
framer-motion-backed implementation that fixes both original bugs.
Plus three more P1s shipped: T-18 inline pills on ProjectDetail, T-31
Personal TodayHero, T-04 extended to all 3 compose surfaces.

**Batch 3 — `674928e` / `abf9bd41`:**
- **T-31** Personal TodayHero 2-col (Overdue | Due Today) above
  regulatory strip. Mirrors MyTasks. Hidden when no overdue + no due
  today.
- **T-04** ProjectDetail Overview compose: inline file drop +
  paperclip + clipboard-paste. Uploads through presigned R2 → appends
  `[filename](url)` into compose.

**Batch 4 — `3c6d20a` / `7077314e` (current):**
- **T-49 RESTORED.** Swipe-right-to-dismiss on TaskDetailPanel via
  framer-motion `drag="x"` on `<motion.div>`. `edgeGuardRef` blocks
  drag activation when initial touch is within 32px of viewport left
  (iOS Safari edge-swipe-back compat). `touch-action: pan-y` lets
  vertical content scroll. Dismiss at 30% panel width OR velocity >
  500px/s. Backdrop opacity fades via `useTransform(dragX, [0, 320],
  [1, 0])`. Desktop skips drag entirely (conditional on
  `window.innerWidth < 768`). Prior raw-touch implementation was
  removed 2026-04-20 due to Pixel 5 inert-drag — framer-motion owns
  the transform via MotionValue + RAF so there's no React setState
  race per touchmove frame.
- **T-18** ProjectDetail header pills inline-editable. Category →
  InlineSelect (4 canonical values). PI → InlineAssigneePicker. Status
  + stage already inline. Row now fully Airtable-pattern. Removed
  dead CATEGORY_COLORS const + cat/pi locals + Avatar/getPersonInfo
  imports.
- **T-04 extended.** TaskDetailPanel OverviewQuickAdd
  (entityType='task') + MeetingDetail AddActionItemForm
  (entityType='meeting'; attachments bind to meeting, not forthcoming
  task). Same presigned-R2 flow as ProjectDetail. Slack-parity
  loop (paste image → attachment → inline link) now works in every
  compose surface.
- **T-37** My Items NotificationCard left-border accent is now
  type-coded: mention=gold (existing), assignment=teal,
  deadline=maroon, other=slate. Read cards drop to transparent. Card
  padding 1rem → 0.75rem (~8px row-height reduction).
- **T-10** MyTasks "+N more →" on TodayHero now sets filter AND
  smooth-scrolls to main list so the click pays off.

**Updated CLAUDE.md Known Gotchas:** "Mobile swipe on TaskDetailPanel"
entry rewritten for the framer-motion implementation. Prior `onTouchStart
/Move/End` guidance is obsolete — that pattern caused the 2026-04-20
removal.

## Claude Design round-5 ticket execution (2026-04-23 night)

**Headline.** 49 tickets received from Claude Design round-5 handoff
(37 primary + 12 addendum). Shipped ~28 across 2 deploys. 3 P0s
resolved (T-01 raw-select eradication rolling up T-17 Ideas + T-33
Settings + T-43 mobile / T-38 verified false alarm / T-49 verified
intentional prior removal). HEAD `a034e47`. Deploy
`87beb596.mn-ccore-lab.pages.dev`.

**Batch 1 — `ab8ba90` / `45129bde`:**
- **T-01 Raw `<select>` codemod.** 36 sites / 22 files →
  `InlineSelect` + `InlineAssigneePicker`. Guardrail #4 honored.
- **T-02** Deleted "Your progress log" dead label on ProjectDetail
  Overview compose.
- **T-03** RecentActivity falls back to event-type attribution
  (Note/Comment · date) when actor slug is null; never renders literal
  "Unknown" again.
- **T-12** SearchPage per-type filter chip strip above results — 14
  entity types with live counts, shift-multi-select, sticky under
  search input.
- **T-13 / T-14** `usePresence` extended into TaskDetailPanel header
  and MeetingDetail header. `<PresenceAvatars>` renders nothing when
  peer list empty.
- **T-30 / T-48** Dashboard greeting shrunk from clamp(1.1rem, 2.5vw,
  1.4rem) 600-weight to 14px / 500-weight. Dual-mode (light + dark).
  Welcome banner already auto-stales after 7d via useOnboarding.
- **T-35** AskTheLab empty state coaches `@hermes` usage in the
  subtitle.
- **T-41** GlobalQuickAdd panel clamped to `min(560px, calc(100vw -
  32px))` + TokenHint rows `nowrap` / `flex-shrink: 0` so mobile
  token hints (`@name assignee` / `#project`) don't clip.
- **T-42** CommandPalette task rows — sublabel = `project · due`
  (assignee only when ≠ current user). Airtable pattern replaces
  `assignee · status`.
- **T-44** PBSector empty state: "Connect Peripheral Brain…" + Learn
  more CTA.
- **T-45** SessionHistory empty state: "Set up SessionEnd hook…" +
  Open install guide CTA.
- **T-46** Dashboard Customize panel header gets sticky Done button
  that closes panel + scrolls to top.

**Batch 2 — `a034e47` / `87beb596`:**
- **T-11** MyTasks `Stale` quickFilter — `status=in_progress AND
  updated_at < now - 14d`. Badge count wired into pill row.
- **T-21** Decisions tag-chip filter row hides when
  `allDecisions.length < 15`. Cuts ~48px of noise on light boards.
- **T-22** Activity page date headers (Today / Yesterday / Apr 21)
  now sticky with page-bg — long feeds stay oriented on scroll.
- **T-36** MeetingNotesPage "How Meeting Transcripts Work" 4-step
  educational band → collapsible "What is this?" panel. Auto-collapsed
  when processedCount ≥ 3. Preference persists in localStorage.
- **T-39** NateLab section order — Grants & Proposals lifted above
  Research Projects; Publications dropped to bottom. Parity shape
  with NickLab so Nate's page doesn't lead with empty Publications.

**Skipped with reasoning:**
- **T-38 Projects stage-data bug** — verified false alarm. Live API
  distribution varies (33 Idea / 12 DC / 9 W / 9 DA / 3 Submitted).
  Chunk capture landed inside Idea group where default sort groups by
  stage. Not a rendering bug.
- **T-49 Mobile swipe regression** — verified intentional prior
  removal (commit 428183f, 2026-04-20) due to Pixel 5 inert-drag +
  iOS Safari edge-swipe-back conflicts. Replaced with enlarged X +
  sticky Done + tap-backdrop. TaskDetailPanel.tsx:93 carries rationale.

**Verified already-in-code (CD claimed needed, reality is done):**
T-25 Calendar Today button. T-26 Deadlines timeline-hint
localStorage + 10s auto-dismiss. T-27 Deadlines overdue compact
banner. T-28 Projects ColumnHeader chevron. T-15 CommandPalette
jump-to sections. T-19 MeetingDetail action-item hint hides when
input has text. T-29 Manuscripts "Needs your attention" — CD
described UI that doesn't exist in current Manuscripts.tsx; need
re-audit.

**Deferred for next round** (high-effort or pairs with other work):
T-04 inline file drop compose. T-05 @-/emoji/📎 toolbar affordance.
T-06 reactions flush-left first-class placement. T-18 ProjectDetail
header pills inline-edit. T-24 Research Digest rows view. T-31
Personal operational restructure. Plus ~9 P2 punch-list items
(T-07/08/09/10/16/20/23/32/34/37/40/47).

**Quality gate.** Build green both batches (`tsc -b && vite build`).
No test regressions run this round.

## GH bug sweep + Overview refocus + Slack-parity (2026-04-23 late evening)

**Headline.** 7 GH bugs closed (#26-#27, #29-#33), 5 deploy rounds, 30+ commits.
Deploy `d76a60a0.mn-ccore-lab.pages.dev`; HEAD `2ef6cc4` on main. Claude
Design round-3 packaged with 174 PNGs + 30 WebM videos.

### Ship rounds

**Round 1 — Tier-1 fixes + Track A first-landing hoists** (commits `f7b1bed` → `0af271f`)
- **#26** Revisions project-stage between Submitted and Accepted. Cross-repo: brain.db `enums.py` PROJECT_STAGE canonical 7→8 + aliases (R&R / Revise and Resubmit / In Revisions). Hub: `PROJECT_STAGE_VALUES` Set, `ApiStage` union, 6 page `STAGES` arrays, 2 `stageColors` maps, CSS `--stage-fill-revisions: #5b4fa8`.
- **#31** PI name consistency via existing `displayName(slug, tier)` from `src/lib/nameUtils.ts`. Retrofitted 4 ad-hoc `.split(' ')` sites. **K23 IHCA D1 data fix:** `pi nick→nate-mesfin`, `category nate→lab`.
- **#30** Notes/Comments tab restructure (Option B, user-chosen). ProjectDetail: `Overview | Tasks | Notes | Comments | Activity | Revisions | Literature`. `ProjectUpdateFeed` heading + placeholder + empty-state renamed "Project Updates" → "Notes." DB tables unchanged.
- **#32** CreateTaskModal default assignee = current user via `useAuth()` + `emailToSlug()`. Plain `<select>` → `InlineAssigneePicker`. `GlobalQuickAdd` + `MeetingDetail` hardcoded fallbacks → `emailToSlug(user.email)`.
- **Track A §A1** — new inline OverviewLandingCard on ProjectDetail: Key Links + Recent Activity + Top 3 tasks + Quick compose. Description `whiteSpace: pre-wrap`.
- **Track A §A2** — new TodayHero 2-col block (Overdue | Due Today) on MyTasks above Focus Next.

**Round 2 — Overview refocus** (PI feedback: "timeline is a big waste of space"; commits `6c609ab` → `fa8de71`)
- Project Timeline deleted (157 lines).
- OverviewLandingCard restructured to 2-col grid:
  - Left 2/3: Open Tasks — ALWAYS visible with `+ Add task` CTA. Max 5 rows sorted by due date. Empty state: "No open tasks. Add one."
  - Right 1/3: Key Links (top) + Recent Activity (bottom, compact).
  - Bottom full-width: Quick compose.

**Round 3 — #12 + #11 + #10 polish** (commits `f5fd507` → `8bbb201`)
- **#12** Description auto-linkify. New `src/lib/urlClassify.ts` (extracted `classifyUrl` + added `shortLabelForUrl`) and `src/components/LinkifiedText.tsx`. Used on ProjectDetail description.
- **#11** Work-on single-click. Project pill on `TaskGridView` rows is now `<Link>` to `/portal/projects/:slug`. Uses `projectMap` label (not slug regex).
- **#10 (partial)** Plain `<select>` sweep. CreateProjectModal + CreateDecisionModal migrated to InlineSelect / InlineAssigneePicker. CreateProjectModal STAGES include Revisions; CATEGORIES trimmed to 4 canonical (dropped legacy research/clinical/quality-improvement/education/infrastructure).

**Round 4 — Legacy slug root-cause fix** (PI: "is that a bandaid"; commits `480c2c0` → `deaee4c`)
- **Root cause:** brain.db had 532 tasks with `assignee='nick'` (CLI shorthand). `hub_payload.py:286` passed them unchanged to D1, bypassing `team_members` validation (Rule 20). D1 rendered two entries for same human.
- **PB fix (root):** new `TEAM_SLUG_ALIASES` + `canonicalize_team_slug()` in `scripts/db/enums.py`. `scripts/db/sync/hub_payload.py` imports + applies at both outbound assignee sites.
- **brain.db migration:** 532 `assignee='nick'` → `nick-ingraham`. D1 10 rows fixed earlier.
- **Hub revert:** removed read-side `canonicalSlug()` bandaid from `team.ts` + `MyTasks.tsx` + `emailSlug.ts`. Root is fixed; if `nick` reappears, UI renders literally as a drift signal.
- **Folder-link UX:** `mnccore://` protocol has no Windows handler → clicks silent. Now non-http links copy raw path to clipboard + toast. Applies to KeyLinksEditor + LinkifiedText.

**Round 5 — Slack-parity (#13 + #14 + #15)** (commits `cc4b081` → `2ef6cc4`)
- **#13 Unified search** — `/api/search` extended 6 → 14 entity types. New: notes (project_updates), task notes (task_updates), task comments, decisions, files, action items, publications, grants. Return cap 20→50. Completed action items -2 score. Projects/meetings body-search added. `deleted_at IS NULL` filter. SearchPage `typeConfig` extended with icons.
- **#14 Files tab** on ProjectDetail (8 tabs now). `FileUpload` reused at `entity_type='project'`. Drag-drop R2 upload. Filenames searchable via #13.
- **#15 Live presence.** New `src/hooks/usePresence.ts` (15s pings on hub-realtime `mnccore` WS room; 45s staleness; `presence-leave` on unmount). New `src/components/PresenceAvatars.tsx` (avatar stack + green live dot + "N viewing" count). Wired into ProjectDetail header next to WatchButton.

### Additional packaging

- **Design brief rewrite:** `docs/design-briefs/2026-04-23-first-landing-utility.md` rewritten post-Round-5 with 3-priority ask + 9 guardrails + design-system constraints.
- **Claude Design bundle** `review/post-track-a-2026-04-23/`: 174 PNGs + 30 WebM (47 hero, 79 scroll-chunks, 20 rich-states, 8 focus-asks, 20 light-mode, 30 videos).
- **`tests/capture-for-design.spec.ts`** accepts `CAPTURE_BASE_URL` env (preview-hash URL bypasses CF Access via injected fake-auth cookie).
- **`scripts/local-db-bootstrap.ts`** skips `schema-v43.sql` + `schema-v48-index-reconcile.sql` on fresh bootstrap. `npm run test:local` now green.
- **`.gitignore`** adds `review/post-track-a-*/` + `review/post-*-*/` for future bundles (today's bundle force-added as one-time handoff).

### Known issues

- 4 interaction capture tests failed (stale selectors for `01-status-change-undo`, `08-date-picker`). Partial captures produced; not blocking CD review.
- Presence only on ProjectDetail (hook is entity-agnostic; extend to TaskDetailPanel / MeetingDetail).
- SearchPage lacks per-type filter chips for 14-type output.

### Deploy & test state

- HEAD `2ef6cc4` pushed; deploy `d76a60a0.mn-ccore-lab.pages.dev`.
- Build clean, `npm run test:local` 5/5 pass, `/api/health` 65-90ms, 606 tasks / 69 projects / 19 team_members.
- 15/15 public smoke routes PASS; portal CF-gated (expected).

---

## Whole-hub /simplify sweep (2026-04-23 evening)

Two parallel Claude agents on isolated branches (simplify half =
clarity + dead-code; perf half = render + query + bundle + deps),
merged sequentially into main.

**Headline.** `+314 / -5,667` across 93 files; **24 commits** (2 merges
+ 13 simplify + 9 perf). **22 files deleted**, all 0-caller verified
via grep before removal. Build clean, `tests/inspection.spec.ts`
149/2/0 (passed/skipped/failed, 10.6 min).

**Deploy:** `18f2aea6.mn-ccore-lab.pages.dev` (HEAD `6e431eaa`).

### Simplify half (13 commits)

- **Files deleted (22):** `Button`, `DecisionCard`, `ExpertSuggestion`,
  `FilterChip`, `ImpactMetrics`, `MeetingCard`, `SectionHeader`,
  `Skeleton`, `StageSelector`, `ViewDropdown`, `tasks/{SavedViewsBar,
  TaskFilters,TaskListView,TaskPeekOverlay}`, `pages/Grants.tsx`
  (superseded by `portal/Grants`), `pages/portal/Tasks.tsx` (route now
  redirects to `/portal/my-tasks`), `useLocalData`, `useSavedViews`,
  `lib/transitions`, `data/affiliates`, `data/index`, `App.css`.
- **Mutation trim:** 17 unused hooks pruned from `usePBMutations`,
  `useOtherMutations`, `useDecisionMutations`. Re-export aliases in
  `mutations/index.ts` narrowed to actual consumers.
- **`src/lib/api.ts`:** removed 9 unused fetch helpers
  (`fetchCollaborationGraph`, `fetchExpertSuggestions`,
  `fetchDeadlineCascade`, etc.) + 9 unused mutation wrappers. Many
  types demoted to module-private.
- **`src/hooks/useApiData.ts`:** catch-all re-export block of 30 types
  narrowed to 6 actually consumed. Dropped 10 unused `lib/api` imports.
- **Rule 6 compliance:** `pages/Meetings.tsx`'s `formatListDate` and
  `components/Layout.tsx`'s inline next-meeting formatter both
  consolidated to `formatShortDate` from `src/lib/dateUtils.ts`.
- **`components/BrandName.tsx`:** trimmed to `formatBrandName()` only;
  JSX component version had 0 imports.
- **Type exports demoted:** ~40 interfaces/types shifted to
  module-private across `src/hooks/*`, `src/lib/*`,
  `src/components/*`, `api/types.ts`, `api/routes/*`.
- **Knip scorecard** (before → after): unused exports 32 → 2, unused
  exported types 33 → 2, unused files 108 → 87 (remaining are scripts
  invoked via `tsx` CLI + Cloudflare runtime entrypoints knip can't
  follow).

### Perf half (9 commits)

- **Context-value memo** — `AuthContext` + `UndoToast` providers
  wrap portal subtrees. Prior plain `{...}` value objects forced all
  `useAuth()` / `useUndoToast()` consumers to re-render on every
  internal state change. Now `useMemo`-wrapped. Est. 60-80% fewer
  cascaded re-renders during QuickCapture typing / tab switches /
  status-change bursts.
- **`env.DB.batch()` for @mention notification inserts** — 4 serial
  loops in `api/routes/tasks.ts` + `projects.ts` consolidated into
  one batched call each. Worst case (5-mention comment): ~50ms →
  ~15ms Worker time.
- **`/api/digest?with_relevance=true` N+1 fix** — 20 D1 round-trips
  → 1 full-table scan + in-memory filter. Worker time roughly halves.
- **`useCallback` on task-page handlers** — `MyTasks.tsx`,
  `Tasks.tsx`, `Personal.tsx`'s `handleStatusChange` +
  `handleFieldChange` (Deadlines already had it).
- **`isProductionVisible` localStorage cache** — called per-row in
  600+ task filter passes; now cached with event-based invalidation
  (`storage` + custom `showDebugItems-changed` event from
  `SettingsPage`).
- **Dashboard + Sidebar memo** — Dashboard card partitioning (prop
  thrash into `DashboardGrid`) and Sidebar `allGroups` rebuild
  inline-per-render both fixed. `nextMeetingLabel` dep added to
  close stale closure.
- **Debounced search** — `ExpertSuggestion` 250ms debounce
  (component was deleted by simplify half shortly after).
- **Dropped deps:** `tailwindcss-motion` (0 `motion-*` classnames
  in src/), `@tiptap/extension-mention` (0 imports).

### Conflicts resolved

Two `modify/delete` conflicts where perf edited a file simplify had
deleted: `src/components/ExpertSuggestion.tsx` and
`src/pages/portal/Tasks.tsx`. Both verified 0-caller in merged state
before accepting delete side.

### Artifact

Duplicate commit `5758ddd8 perf: memoize AuthContext + UndoToast
context values` landed on both branches mid-run (perf agent
accidentally wrote to simplify worktree early in session before
catching itself); its content is a no-op duplicate of `d2502098` on
the perf branch and was absorbed at merge.

### CLAUDE.md edits

- Rule 38 — `FilterChip.tsx` marked deleted (it used to say "delete
  rather than retrofit if it resurfaces"; file no longer exists).
- Current-state bullet + Quick Reference row — HEAD + deploy updated.
- Phase 17 history — `TaskPeekOverlay` entry annotated as removed
  2026-04-23 during /simplify.

### Flagged but not removed (for human review)

- `HeartbeatDivider` + `EmptyStateArt` — knip reports 0 imports but
  CLAUDE.md Rule 29 protects brand primitives.
- `functions/api/[[route]].ts`, `functions/og/[type]/[slug].ts`,
  `workers/hub-realtime/src/index.ts` — Cloudflare runtime
  entrypoints (knip false positive).
- All audit/seed/dogfood scripts in `scripts/` (44 files) — invoked
  directly via `tsx`, knip can't track.
- Dashboard eagerly imports 20 card components — converting non-
  default ones to `React.lazy` would trim ~50-80KB but needs
  `CARD_REGISTRY` + `<Suspense>` reshape. Separate commit.
- `TaskGridRow` not wrapped in `React.memo` — big win on keystroke
  perf in the virtualizer but depends on every parent passing stable
  callback props. Perf half stabilized MyTasks; other 5 call sites
  (Deadlines, Personal, Tasks, Grants list, etc.) would need audit.
- Framer Motion ~120KB `proxy-*.js` chunk used by 79 files — too
  widespread to swap.
- No cache headers on read-heavy authenticated endpoints (per-user
  responses make edge caching tricky; `Cache-Control: private` would
  help browser caching but invalidation timing needs thought).

### Next

Re-run massive-audit B-visual + mobile smoke + desktop journey after
CF edge propagation to confirm no runtime regression from the 22 file
deletions (build + TS compile green is a strong signal, not a
complete one for runtime).

## Capture infrastructure — Claude Design round 4 (2026-04-23)

Repaired the Claude Design capture pipeline after two post-launch
environment changes broke it, then broadened coverage. The existing
three-spec suite had been capturing Google Sign-in pages and
`RequireAuth` splashes instead of the actual Hub.

**Two blockers fixed:**

1. **CF Access gates prod `/portal/*`.** Captures against
   `mn-ccore-lab.pages.dev` redirected to
   `peripheral-brain.cloudflareaccess.com`. Every 17KB "capture" was
   the same Google Sign-in screenshot.
   - Fix: `CAPTURE_BASE_URL` env var on all three specs + plumbed
     through `regen-design-bundle.sh` as `BASE_URL=<preview>`.
     Preview deploys bypass CF Access while serving the same code.
2. **`VITE_REQUIRE_AUTH=1` flipped 2026-04-21** (commit `143c1dbd`)
   shows a branded sign-in splash to unauth'd sessions even on
   ungated preview hosts.
   - Fix: `tests/helpers/capture-auth.ts` injects a fake
     `CF_Authorization` JWT cookie. `useAuth` decodes payload
     client-side only (no signature verification), so a well-formed
     unsigned token flips `isAuthenticated` true. Backend writes
     are still gated by real JWKS verification in `api/jwt-verify.ts`
     — captures are read-only.

**Round-3 gap fixes (hardcoded paths + missing surfaces):**

- `tests/helpers/paths.ts` — added `nickLab` + `nateLab` +
  `publicTrajectory` helpers, replacing hardcoded strings in
  `capture-for-design.spec.ts`.
- Added 5 hero surfaces: `36-trajectory-portal` (gated chrome vs
  public at `35`), `37-contact`, `38-meeting-detail`,
  `39-meeting-prep`, `40-publication-detail`.

**Three new capture specs (wired into `playwright.config.design-capture.ts`):**

- **`capture-scroll-chunks.spec.ts`** — 12 long pages broken into
  viewport-sized chunks (capped at 8 per page). Output
  `desktop-<slug>-ch<n>.png`. Designer can review 900px bands
  instead of one fullPage blob.
- **`capture-theme-light.spec.ts`** — 8 key pages with
  `test.use({ colorScheme: 'light' })`. Simpler + more reliable
  than localStorage injection: `useDarkMode` falls back to
  `getSystemPreference()` when nothing is stored, so flipping
  the colorScheme flips the theme.
- **`capture-rich-states.spec.ts`** — Network WebGL multi-state
  (default + zoom + mid-drag + post-drag + 3 hovers), 6 modals
  (Create Task / Command Palette / Shortcut Help / Create Idea /
  Create Decision / Create Project), Publications carousel at 3
  scroll positions, Dashboard customize-mode.

**Script + config changes:**

- `regen-design-bundle.sh`: `BASE_URL` plumb-through,
  `set -e` dropped (single focus-ask flake no longer halts step
  4/7), 7 steps (hero → mobile → focus → chunks → light → rich →
  interactions), `ffmpeg` path candidates include work-machine
  location, video-copy fallback after interactions step
  (Playwright videos finalize post-`context.close()`, so the
  `afterEach` hook in `capture-interactions.spec.ts` often sees
  empty attachments).
- `playwright.config.design-capture.ts`: `testMatch` extended
  with the three new specs.

**Bundle produced:** `claude-design-2026-04-22-full-r4`
(`review/claude-design-2026-04-22-full-r4.zip` — 57MB). 119 PNGs +
15 MP4s + 15 GIFs + 37 interaction keyframes. `BRIEF.md` +
`FEEDBACK-FOCUS.md` included (9 ranked asks). Same 2 interaction
flakes as round 3 (`01-status-change-undo` dropdown race,
`08-date-picker` cell click) — keyframes still captured,
non-blocking.

**Commit:** `00aea896`.

## Audit r7 + GH-issue sweep (2026-04-22 → 2026-04-23)

Massive audit B-visual contrast went **37 → 0 violations** across 204
page × viewport × theme combos. Six iteration rounds, each closing a
distinct class of bug surfaced by the prior round. Closed 14 in-app
GH bug-reports on the way.

**Commits:** `d366464` (r7 audit + 4 GH) → `394fbd7` (3 more GH) →
`d7091ec` (final 4 GH). Deploys: `cc42d36f` → `861cc2d6` → `953a571a`
→ `7994e428` → `d2d9fa5c` → `602037d0` → `55b5fe73` → `71503509` →
`a519de60` (live HEAD).

**New CSS tokens:**
- `--stage-fill-{idea,data-collection,analysis,writing,review,submitted,published}` — theme-agnostic dark hex values for stage-bar fills. `--slate`/`--teal`/`--gold` flip to LIGHT dark-mode variants (e.g. `--teal` dark = `#5cbcb4`), so `#fff` text on those failed ~2:1. New tokens stay dark in both modes → 5.4-7.5:1 with white. Applied at AnalyticsPage + PIAnalytics stage bars, member workload bars, Dashboard active tab, Meetings save/filter/view buttons.
- `--gold-on-emphasis` (light `#5a4518` / dark `#dcb355`) — gold text on `--gold-emphasis` pill bg. `--gold` flipped gave 4.25:1 light fail. Used on MyTasks streak badge.

**Token value changes:**
- `--ink-hint` light `0.62 → 0.68` — slate × 0.62 on white = `#717a84` @ 4.35:1 fail. 0.68 gives 5.4:1 AA pass. Closes ~60 notification/mobile-card hits on MyItems + MyTasks.

**Systemic compound-opacity fixes:** parent `opacity` on cards multiplied with child green/maroon/gold spans → effective alpha below AA. Removed parent opacity on:
- `MetricCard` delta chip container (parent was `--ink-label` 0.70)
- Deadlines stat row
- DecisionsPage stat row
- MyItems `NotificationCard` (`opacity: 0.85` read state) + `CommitmentCard` (done state) + `doneCommitments` wrapper
- Replaced with direct `--muted` text + strikethrough / border-left for visual distinction.

**Axe false-positive mid-animation fixes:** pages using `opacity: 0 → 1` mount animations triggered contrast checks before the transition settled. Now transform-only:
- `staggerItem.hidden` (shared — used across 12 pages via `animations.ts`)
- `.fade-in-up.will-animate` (shared CSS — used on Home + others)
- `PageTooltip` motion.div
- `Deadlines` / `MenteeMilestones` / `DeadlineCascadePage` motion.div variants

**GH issues closed:**

| # | Title | Fix |
|---|-------|-----|
| #8 | mobile photo attach | Removed `capture="environment"` from BugReportModal input. Mobile picker now shows Take Photo + Photo Library + Files. |
| #10 | notes vs comments clarity | Added `ProjectUpdateFeed` + `ProjectComments` to Overview tab (previously Activity-only) with inline Notes-vs-Comments legend. |
| #14 | MyTasks wider than Projects | Verified both use `.content-container` 1440px — closed per Nick's direction. |
| #15 | grouped view space | Already tuned 320→420px (pre-r7). Closed. |
| #16 | Network not rendering | `minHeight: 100vh` → `height: 100vh` on `Network.tsx` outer flex-col so GraphCanvas sizes to viewport (was 300×150 intrinsic). |
| #17 | Research dropdown dark band | Fully opaque bg (`#ffffff` / `#0f1923`). 98%/95% + `backdrop-filter: blur` was bleeding the page's dark header band through. |
| #18 | Ideas row overlap | `align-items: center` → `start` so research_area sub-text extends row height instead of bleeding into next row. |
| #19 | CLIF Consortium map "horrendous" | Replaced hand-drawn US outline SVG (unrecognizable blob) with clean 4-region grid listing all 13 sites with city + UMN home marker. |
| #20 | Sidebar avatar → Teams page | Now routes to `/portal/my-items` (workspace) not `/portal/team/:slug` (public profile). |
| #21 | all tasks "Waiting On" | Reassigned 602 tasks → `nick-ingraham` via batch API. Previously 38 tasks on legacy `nick` / other team-member slugs. |
| #22 | hover icons overlap Priority | Grid gap `4px → 10px` in `TaskGridView` `colStyle`. |
| #23 | overdue section empty space | Removed `minHeight: calc(100vh - 420px)` reservation on TaskGridView wrapper — short lists no longer leave 100+ px of dead space. Loading skeleton still bounds CLS. **Supersedes CLAUDE.md Rule 16's stability requirement.** |
| #24 | date picker clipped | `InlineDatePicker` preset dropdown uses `createPortal` with fixed position so row overflow doesn't clip it and it doesn't overlap the row below. |
| #25 | 1-click complete | TaskGridView leftmost circle now completes on click (with undo toast). Ctrl/⌘+click toggles selection for bulk. Circle visual: empty / teal-filled+check when done / teal-outline+check when selected. |

**Rewritten components:**
- `src/components/CLIFMap.tsx` — full rewrite from SVG to regional card grid.
- `src/pages/portal/SessionHistory.tsx` — active-preset logic rewrite; previously used undefined `var(--surface)` that defaulted to inheriting page bg, pairing white text on white.

**Data-only action:** bulk reassigned 602 tasks to `nick-ingraham` via `POST /api/tasks/batch` (action=assign). No code change.

**Gate:** B-visual 204/204 PASS / 0 BUGS after final deploy `a519de60`. Trajectory 37→26→12→6→0.

## Post-Phase-37 bug-fix sprint (2026-04-21)

Four commits after launch fixing class bugs surfaced via in-app bug reports + triage.

**`8ae27f9` — emailToSlug class fix (17 files).** `email.split('@')[0]`
produced wrong slug (`ingra107` instead of canonical `nick-ingraham`).
Added `src/lib/emailSlug.ts` util with `EMAIL_PREFIX_TO_SLUG` LUT.
Rewired 17 call sites: Sidebar, MyTasks filter, NotificationBell,
dashboard cards, CreateProjectModal, etc. Closed issues #20 + #21.

**`89c00ad` — post-launch polish (13 files).** Dashboard greeting +
useAuth name fallback + getPersonInfo all route through emailToSlug +
team data. CommandPalette "Show My Tasks" keys on current user's slug.
4 zIndex literals → CSS tokens. Container width standardized on
`.content-container` (1440px) across MyTasks, Tasks, Deadlines,
DecisionsPage, Grants, Ideas. Closed #14; likely closed #19.

**`b0021c1` — visual bugs + JWT cookie fallback (5 files).** Ideas row
had fixed `height: 44px`; research_area label overflowed to next row.
Changed to `minHeight` + `display: block` label. Same fix applied to
DecisionsPage. Network page `height: 100vh` → `minHeight: 100vh`
(allows scroll past canvas). MyTasks CLS-prevention minHeight reduced
from 320px to 420px reservation. **getAuthUser() reads CF_Authorization
cookie as fallback** — critical fix because /api/* bypasses CF Access
scope, so the Cf-Access-Jwt-Assertion header isn't set on API requests
anymore. Unlocks every authed POST from browser (bug reports, project
edits, task mutations). Closed #15, #16, #18.

**`a8537ad` — project stage UI↔API mismatch (4 files).** UI STAGES list
had 'Analysis'/'Review'; API only accepts brain.db canonical
'Data Analysis'/'Submitted'/'Accepted'. Clicking Analysis/Review → 400
→ silent revert. Added `toApiStage()` in src/lib/stageNormalize.ts;
wired to 4 call sites (ProjectDetail strip + inline select, Projects
list 2x inline selects). Widened `Project.stage` type union. Bug
reported via in-app modal on ADHERE-LPV Trial.

**Deploy:** `65b166d7.mn-ccore-lab.pages.dev` on HEAD `a8537ad`.

## Phase 37 — Portal URL Migration (2026-04-21)

Moved all 27 gated Hub routes under a `/portal/*` URL prefix so a single
Cloudflare Access application destination
(`mn-ccore-lab.pages.dev/portal/*`) gates the entire authenticated
surface. Public marketing routes stay at root.

**Why:** CF Access app destinations cap at 5 paths/app. Enumerating ~25
portal paths would have required 3 apps + bypass rules — a permanent
dashboard-maintenance tax. Consolidating under `/portal/*` is a one-time
refactor that leaves CF Access with a single path pattern for the life
of the project.

**Architecture — dual-route migration:**
1. `src/constants/paths.ts` — single source of truth. `PATHS.dashboard`,
   `PATHS.project(slug)`, etc. Mirror at `tests/helpers/paths.ts` (plain
   strings so tests don't import the prod bundle).
2. `src/App.tsx` — added 29 `/portal/*` canonical routes inside the
   `RequireAuth + PortalLayout` block. `NavigateWithParams` helper
   expands `:slug`/`:id` tokens for parametric redirects.
3. Internal nav migrated through `PATHS`: sidebar, mobile tab bar,
   command palette (22 nav calls), keyboard shortcut hooks, ~50 `<Link>`
   and template-literal refs across 30+ components, `window.location`
   hard navs, pathname pattern-matching in `useRecentlyViewed`, and
   backend search API URLs (`api/routes/search.ts`).
4. Legacy root routes converted to `<Navigate>` redirect shims placed
   OUTSIDE `RequireAuth` so bookmark bounces happen pre-auth. Kept
   indefinitely; cost is negligible.
5. 16 test specs + 5 journey specs + 27 audit scripts migrated via
   `tests/helpers/paths.ts` or hardcoded `/portal/` prefix.

**Execution:** 14 tasks, subagent-driven. Each task = implementer
subagent + spec compliance review + code quality review before moving
on. 13 commits on `feat/portal-url-migration` merged to `main` as merge
commit `8600c32`. Initial deploy `cbb9093d.mn-ccore-lab.pages.dev`; final
post-VITE_REQUIRE_AUTH deploy `c5e46630.mn-ccore-lab.pages.dev` (HEAD
`143c1db`).

**CF Access + launch secrets (completed same day):**
- App configured in Cloudflare dashboard → Zero Trust → Access →
  Applications for `mn-ccore-lab.pages.dev/portal/*` with policies:
  `UMN Team` (allow @umn.edu), `Nick Only`
  (nicholas.ingraham@gmail.com), `Audit Service Token` (service auth
  for audit scripts).
- Secrets set via `wrangler pages secret put`:
  `CF_ACCESS_TEAM_DOMAIN=peripheral-brain.cloudflareaccess.com`,
  `CF_ACCESS_AUD=47b7d48e...40139c`, `REQUIRE_AUTH=1`,
  `TEST_MODE_KEY=<32-char hex>`. JWT signature verification now active.
- Client-side `VITE_REQUIRE_AUTH=1` added to `.env.production`
  (triggers branded `RequireAuth` splash for unauthenticated users).
- GitHub Actions secrets set for schema-drift CI:
  `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
- Audit Service Token (`mn-ccore-lab-audit`) active; local env vars
  `HUB_TEST_MODE_KEY`, `CF_ACCESS_CLIENT_ID`,
  `CF_ACCESS_CLIENT_SECRET` set on work + home.

**Hub is LIVE for the team** as of 2026-04-21. Optional follow-up:
`RESEND_API_KEY` (daily digest email cron) still pending — skippable
indefinitely.

**Follow-ups (not in this phase):**
- 30-90 days post-launch: evaluate whether to drop redirect shims if
  analytics show no traffic on legacy paths.
- Consider hoisting `/team/:slug` (public) + `/portal/team/:slug`
  (portal) into a single template that branches chrome via
  `useLocation`. Currently two distinct route registrations.
- Sign up for Resend + set `RESEND_API_KEY` to activate daily
  coordinator digest cron (`api/routes/digest-email.ts`).

## Schema-drift CI reconciliation (2026-04-21)

**Unblocked a guard that had been failing silently since it shipped.** The
`D1 Schema Drift Check` workflow (`.github/workflows/schema-drift.yml`)
started emailing daily failures 2026-04-16. Three stacked issues hid
real drift beneath them:

1. **Missing credentials** — `CLOUDFLARE_API_TOKEN` +
   `CLOUDFLARE_ACCOUNT_ID` GitHub secrets weren't set. Fixed.
2. **Workflow used `.schema` (sqlite3 CLI dot-command)** — D1 HTTP API
   rejects with SQLITE_ERROR 7500. Rewrote to query sqlite_master.
3. **Normalizer compared multi-line CREATE to single-line sqlite_master
   output** → 100% phantom diff. Rewrote to bootstrap a fresh SQLite,
   apply schema.sql + all migrations (tolerate duplicate-column errors),
   dump result, normalize whitespace, alphabetically sort CREATE TABLE
   columns, then diff.

Once working, it surfaced **real drift accumulated over a year+** from
schema changes shipped via `wrangler d1 execute` or `/api/admin/migrate` <!-- wrangler-d1-allowed: historical prose, not an invocation -->
without committing the SQL:

- **v48-index-reconcile** — 27 indexes (24 prod-only, 3 phantom-committed).
  Applied to prod, 121 rows written.
- **v49-missing-tables** — 13 tables + 2 unique indexes that backed
  live features (inbox/iOS Shortcut, nih_grants/RePORTER tab,
  file_attachments/R2, narrative_projects, contributions,
  trainee_milestones, watchlist, open_science_resources,
  project_documents, project_publications, pubmed_sync_log,
  research_narratives, _meta). Applied to prod, 0 rows written
  (all already existed).
- **v49-missing-columns** (bootstrap-only) — 9 columns: tasks.blocked_by,
  tasks.description_json, team_members.expertise_tags, meetings.facilitator,
  projects.stage_notes, grants.status, action_items.created_by +
  category + parent_task_id. ALTER TABLE ADD COLUMN isn't idempotent in
  SQLite; columns already existed on prod; workflow tolerates
  duplicate-column errors during replay.
- **Edit v14** — `project_dependencies` rewritten to match prod's live
  structure (composite PK `(from_slug, to_slug)`, `DEFAULT 'related_to'`).
- **Edit v22** — `tasks.updated_at` DEFAULT dropped to match prod (table
  was rebuilt at some point; write paths set `updated_at` explicitly).
- **Delete v35** — `recurrence + recurrence_parent_id` never applied to
  prod and no code depended on it.

**Result:** workflow 🟢 green as of 2026-04-21 13:40 UTC. Now a useful
guardrail — next time a migration lands on prod without commit (the R10
failure mode from 2026-04-14), the 03 CT cron catches it.

Files touched: `.github/workflows/schema-drift.yml`, `api/schema-v14.sql`,
`api/schema-v22.sql`, `api/schema-v35.sql` (deleted),
`api/schema-v48-index-reconcile.sql` (new), `api/schema-v49-missing-tables.sql`
(new), `api/schema-v49-missing-columns.sql` (new).

## Round-2 design handoff (2026-04-20 → 2026-04-21)

**43 tickets implemented across three deploys.** Claude Design's round-2
review (`review/design_handoff_round2/`) returned 34 new tickets + 4
focus-area asks + 6 motion polish items. Round-2 verification also
exposed 2 pre-existing test failures that were fixed.

Deployed at `ff7b766a` → `36e0ca34` → `cfc00ab0`.

**P1 (7, ship-blockers):**
- `P1-R2-01` My Items sign-in wall: drop early return, default slug
  to `nick-ingraham` pre-launch, small banner for unauthed.
- `P1-R2-02` Ask the Lab fixtures: extend `isProductionVisible()`
  patterns, filter at source.
- `P1-R2-03` Settings emoji → 10-icon Lucide picker.
- `P1-R2-04` Narratives: label every pipeline dot with stage abbrev.
- `P1-R2-05` J/K paints nothing (WCAG fail): 3px inset edge + 6% bg;
  click-selected gets 4px edge + 10% bg + soft border; forced-colors
  fallback.
- `P1-R2-07` Mobile swipe-to-dismiss inert on Pixel 5: ripped swipe
  state, enlarged X to 44×44, sticky Done pill.
- `P1-R2-08` Board drag never fires: added `TouchSensor` +
  `KeyboardSensor` to `@dnd-kit`. Propagated same fix to MeetingDetail,
  MyTasks Focus, PBSector, SubtaskSection, TaskGridView (column + row).

**§ 0 focus-area asks:** segmented Quick Add pills + tooltips; inline ▾
chevrons hidden by default with `alwaysShowChevron` opt-in (Decisions
Outcome uses it).

**P2 (13):** CLIF prefix variants, detail-panel width clamp, Sessions
empty state, filter anonymous trainees on public Lab, Trajectory
`Connect publications` CTA + Y-axis label, rename `Deadline Cascade` →
`Deadlines by Project`, Search idle Jump-to + tips, decision fixtures,
`PageTooltip` auto-dismiss + Settings "Restore product tips", active-
funding stub filter, Ideas lopsided-board banner, `STAGE_ALIASES`
lifted to `lib/stageNormalize` (consumed by ProjectDetail + Projects
stage dots), Meetings `<details>` disclosure, aria-label on hover
icons.

**P3:** activity-feed substring fixture filter.

**Motion (4):**
- `M-03` TaskDetailPanel tab cross-fade: 140ms class-flash pattern so
  keyframe re-plays per activeTab; divs stay mounted so Quick Add
  drafts survive.
- `M-09` CollapsibleSection: 250→180ms ease-out + reduced-motion guard.
- `M-11` HermesMark `pulse` prop: 600ms scale-in + micro-rotate + gold
  halo; Avatar passes `pulse` for `slug==='claude-ai'`.
- `M-12` Pulse kiosk scene cross-fade: was `<div>` inside `AnimatePresence`
  (no motion fired); now `motion.div` with 400ms + 2% scale.

**Test fixes (2 pre-existing, surfaced during verification):**
- Smoke /network: per-route override `domcontentloaded` + 4s dwell
  (three.js never settles networkidle).
- Inspection Journey `Dashboard → click task`: selector race with
  BentoCard `whileHover` transform + scroll clip; scoped to Action
  Board first, `force: true` click.

**Verification (deploy `cfc00ab0`):** Smoke 27/27 · Inspection 213/213 ·
Build + TypeScript clean.

## Phase 36e: Claude Design Handoff Imported (2026-04-20)

**Not a code phase — a backlog import.** Nick ran the Hub through
Anthropic's new Claude Design product (launched 2026-04-17) and it
returned a prioritized implementation backlog against HEAD `ef604db`.
Bundle imported to `docs/design-handoff-2026-04-20/`.

Contents:
- `TICKETS.md` — 33 tickets ordered P1 → P2 → P3, each with file
  paths, problem description, implementation snippets, acceptance.
- `Audit.html` — interactive annotated screenshots of every finding.
- `screenshots/` — 30 captures referenced by tickets.
- `reference/colors_and_type.css` — token source of truth mirror.
- `reference/ui-kit/*.jsx` — simplified mocks of Dashboard / Tasks /
  Projects / Meetings / Hermes for visual direction (NOT production code).

Summary of findings:
- **P1 (8, ship-blockers):** test-fixture titles leaking into
  production surfaces (Personal Recent Activity, Calendar, Mentee
  Milestones); `undefined '23` chart labels on PI Dashboard;
  duplicate meeting action items; Team Engagement attribution bug
  (`anonymous=13,410`); persistent tooltip; unlabeled hero numbers on
  public Home; empty Mentee Milestones; empty Senior Mentors section.
- **P2 (14, polish):** strip `[Carried forward]` prefix to chip
  column; lift `CLIF:` title prefix; sub-bucket OVERDUE by age;
  collapse Research Digest filters; tabbed Settings; soften
  "Silent 32d" → "Needs check-in"; hide PB Sector from nav pre-
  launch; mobile tab-bar safe-area; zero-value delta chips; Ideas
  Board kanban-first; Decision outcome as pill column; Publications
  grouped by year; Network label collision; Post-Award Milestones
  populated.
- **P3 (11, new surfaces):** Lab-TV 5-slide extension; Dashboard
  Project Health heatmap; Published-as-trophy-grid; NIH RePORTER
  search; Project Detail vertical timeline; Team Engagement drill-
  down; Publications-DB ↔ member card linkage; Calendar dense-week;
  Decisions Timeline; PWA + Apple Watch complication; public Home
  iconographic pillar grid.

No code changes in this entry — just the backlog landing. Next
session consumes TICKETS.md directly.

## Phase 36d: Design Sprint (2026-04-20)

**Context:** Anthropic launched Claude Design on 2026-04-17 (conversational
prototype/slide/design-system tool powered by Opus 4.7). Used that as a
prompt to review the Hub's brand surface. 12 improvements shipped in one
sprint — reusable primitives that the rest of the product can pull
from, not one-off tweaks.

### Commits
- `ef604db` — design sprint (31 files, 1600+/-200 lines)

Deployed at preview `dba34ad1` to `https://mn-ccore-lab.pages.dev`.

### New reusable primitives (`src/components/`)

- **`HeartbeatLine.tsx`** — animated ECG trace pulled from the
  favicon's gold heartbeat. Three variants: `live` (1bpm full trace),
  `slow` (30bpm ambient), `static` (fully drawn, no motion). Glow
  filter, baseline ghost, configurable color/BPM/stroke. The lab's
  brand signature from here on.
- **`HeartbeatDivider.tsx`** — quiet wrapper for use as a section
  divider where a plain `<hr>` would feel bare.
- **`HermesMark.tsx`** — Mercury alchemical glyph (crescent + circle
  + caduceus cross) for the AI research assistant. `icon` variant for
  inline badges, `avatar` variant for peer-avatar use. Replaces the
  generic lucide `<Sparkles />` that was Hermes's visual identity
  until now.
- **`CategoryIcon.tsx`** — distinct 14px glyphs per project category:
  lungs (CLIF), flask (Lab), heartbeat (Nate), grad cap (Mentee).
  Replaces the 6px colored dots wherever category indicators appear.
- **`EmptyStateArt.tsx`** — 8 two-color line illustrations
  (clipboard / lightbulb / notebook / clock / papers / folder-stamp /
  magnifier / flask). Drop-in for the `icon` prop on `<EmptyState>`.
- **`PhaseReleaseBanner.tsx`** — "what shipped" banner with gold
  heartbeat thread on the left, expandable highlights list,
  localStorage-persisted dismiss (`mnccore-phase-banner-seen-v1`).
  First entry: Phase 36c. Rendered above WelcomeBanner on Dashboard.
- **`RequireAuth.tsx`** — branded sign-in splash (extracted from an
  inline component in App.tsx). Inline wordmark + tagline + gold CTA
  pill + 3-bullet "What you'll get" + heartbeat ambient trace +
  secondary back-to-public link. CTA targets
  `/cdn-cgi/access/login?redirect_url=<current>` so CF Access returns
  the user to the deep-linked path.
- **`pulse/PulseScene.tsx`** + `PulseMetric.tsx` + `PulseSparkline.tsx`
  — kiosk primitives: Ken Burns scale wrapper + 96-200px Fraunces
  hero numerals + wall-scale year-bucket chart.

### Rewrites / wiring

- **`src/pages/Pulse.tsx`** — full cinematic 6-scene rewrite. Each
  scene fills 16:9 with one big idea. Slow Ken Burns (scale 1.00 →
  1.06 over 9s), 1.6s crossfades, ambient HeartbeatLine at the
  bottom-third (the "monitor"), 4-tick scene markers, real-time clock
  + date in footer. Hex-pinned colors (kiosk renders without `.dark`
  class).
- **`src/components/Avatar.tsx`** — accepts optional `slug` prop.
  When `slug === 'claude-ai'`, renders `<HermesMark />` instead of
  initials. When no `photoUrl`, renders a generated geometric portrait
  (deterministic hash → 1 of 4 token-aligned palette swatches, two
  stacked arcs suggesting a silhouette, initials layered on top).
- **`src/components/ProjectCard.tsx`** — CategoryIcon replaces the
  inline 6px dot.
- **`src/components/ProjectComments.tsx`** — HermesMark avatar
  replaces the `<Sparkles />` icon for Hermes replies.
- **`src/components/PortalLayout.tsx`** — adds 28×28 brand mark to
  the mobile top bar. `lg:hidden` so desktop sidebar still owns the
  wordmark.
- **`src/hooks/useFavicon.ts`** — added an `EMAIL_PREFIX_TO_SLUG`
  lookup mirroring the API-side LUT so the notification-badge emoji
  favicon fires for the correct user post-slug-rename (was silently
  broken for Nick because `ingra107@umn.edu` prefix ≠ canonical slug
  `nick-ingraham`).
- **`src/hooks/usePageMeta.ts`** — options-object signature: accepts
  `ogType` + `ogImage`. Back-compat with old string-ogType callers.
- **`src/pages/ProjectDetail.tsx`** / **`MemberPage.tsx`** /
  **`MeetingDetail.tsx`** — set per-page `ogImage` pointing at
  `/og/<type>/<slug>`.
- **`src/pages/Dashboard.tsx`** — renders `<PhaseReleaseBanner />`
  above `<WelcomeBanner />`.

### New Cloudflare Pages Function

- **`functions/og/[type]/[slug].ts`** — SVG share-card generator. Pulls
  project title + PI + stage + category accent, team name + role +
  credentials, meeting title + date from D1 and renders a branded
  1200×630 card (deep-neutral gradient bg, gold accent bar, heartbeat
  trace, brand mark + wordmark, Fraunces title, DM Sans body, edge-
  cached 1h). Zero deps — pure SVG so the function stays deploy-light.
- **`public/_headers`** — forces `Content-Type: image/svg+xml` on
  `/og/*` (Pages was auto-coercing to `text/html` which broke link-
  preview consumers).

### Capture infrastructure for Claude Design

- **`scripts/claude-design-brief.txt`** — 112-line brand brief
  (tokens, motif SVG path, ethos, voice, repo + asset links).
  Paste into Claude Design to set up a design system the pitch deck /
  poster / one-pager outputs automatically inherit.
- **`tests/capture-for-design.spec.ts`** + **`playwright.config.design-
  capture.ts`** — full-page screenshots of every hero surface on live
  prod, desktop 1440×900 + Pixel 5 mobile. Pre-scrolls every page
  top→bottom in 400px steps to trigger IntersectionObserver / lazy-
  loaded / virtualizer-gated content before the capture.
- **`tests/capture-interactions.spec.ts`** + **`playwright.config.
  interactions-capture.ts`** — 15 signature interactions as WebM
  videos + PNG keyframe triplets. Tier 1: status-change+undo, detail
  panel slide-in, tab switch, mobile swipe-dismiss, hover badges.
  Tier 2: Cmd+K, assignee picker, date picker, subtask expand,
  Kanban drag, Hermes mention. Tier 3: Pulse rotation, dashboard
  drag-reorder, keyboard nav, Ctrl+N quick-add NLP. `afterEach` hook
  copies each Playwright-recorded video next to its keyframes in
  `review/interactions-<ts>/`. Ready to run when Claude Design can
  consume motion.

First screenshot run produced 31 captures (25 desktop + 6 mobile) at
`review/claude-design-20260420/` with an INDEX.md.

### Hotfix (same commit)

- **`api/index.ts`** — `/api/bug-report` no longer returns 401 pre-
  launch. Gate now piggybacks on `REQUIRE_AUTH=1` (the same flag
  that locks all writes), auto-engages at team launch so strangers
  can't spam GitHub Issues. Without this, Nick couldn't submit a bug
  report today because CF Access isn't configured yet so there's no
  JWT, and no API key either.

## Phase 36c: 4-Auditor Deep Audit + 11 P0/P1 Fixes (2026-04-20)

**Context:** After Phase 36b shipped, dispatched 4 specialist auditors
in parallel against live prod (UX/interaction, code efficiency,
accessibility-deeper-than-axe, data integrity). They returned 6 P0
bugs + 8 P1 issues + a long P2/P3 backlog. All 11 P0+P1 fixed in this
sprint.

### Commits
- `4599007` — 11 audit fixes (73 files, 2547+/-713 lines)
- `0ea632c` — gitignore audit outputs

Deployed at preview `3fbafba0` to `https://mn-ccore-lab.pages.dev`.
SQL applied to prod D1: `phase36b-slug-cleanup.sql`,
`test-residue-cleanup.sql`, `schema-v46.sql`.

### Gate (post-deploy)
- `/api/health`: 64ms (was 100ms — index win), 601 tasks / 64 projects / 19 team.
- `/api/version`: `Cache-Control: public, max-age=10, s-maxage=10` ✓.
- `/api/pi/analytics` projectsByStage: 5 rows (was silently 0).
- Mobile smoke 2/2; desktop journey 1/1; build clean; wrangler dry-run clean.

### P0 fixes

**1. Routing — `/portal/team/:slug`.**
`/team/:slug` was inside the public `<Layout>` block in App.tsx, so a
logged-in team member clicking a teammate from sidebar/CommandPalette
would drop out of portal chrome and land on the public marketing site.
Live since 2026-03-24.

Added `/portal/team/:slug` + `/portal/team/:slug/trajectory` under
PortalLayout. Sidebar link, CommandPalette navigate, MemberPage
trajectory link, and TrajectoryPage back-link all use the portal path.
MemberPage + TrajectoryPage detect their context via `useLocation` so
the trajectory ↔ profile back-and-forth preserves the prefix.

**2. Mobile bottom tab bar coverage.**
`PortalLayout` `<main>` had `pb-[calc(1rem+56px+env(safe-area-inset-bottom))]`
which just barely cleared the tab bar — content's last row sat right
under it on calendar + project detail. Bumped `1rem` → `3rem` so the
last row has comfortable breathing room. ProjectDetail switched to
`100dvh` + `safe-area-inset-bottom` in inner pad.

**3. 13 leftover Phase 36b old slugs.**
The original rename-team-slugs.sql missed 13 rows that used variants
not in the canonical RENAMES map: 7 `tasks.assignee='nick'`, 6
`projects.pi='nick'`, 2 `ideas.submitted_by='nathan-mesfin'`, plus
test residue (`mesfin`, `ningraha`) and 4 `commitments.to_whom`
storing display names. SQL: `scripts/phase36b-slug-cleanup.sql`.

**4. ~160 `test_delete_*` rows across 6 tables.**
Tables that lack `deleted_at` (ideas, hub_decisions, meetings,
digest_comments, lab_questions, publications) had hundreds of test rows
visible to any new team member opening /ideas or /decisions. Cleanup
SQL with cascading FK handling for meeting_id and question_id:
`scripts/test-residue-cleanup.sql`.

**5. `pi-dashboard.ts` 'Active' filter (silent zero).**
`SELECT … FROM projects WHERE status = 'Active'` (capital A). R10
standardized to lowercase 'active', so this returned 0 rows for ~6 days.
The PI's Projects-by-Stage card was empty. Trivial 1-line fix.

**6. brain.db sync drift acknowledged.**
Audit caught: 33/62 D1 projects have prefix-mismatch with brain.db
(`clif-pf-v-sf-...` vs `pf-v-sf-...`); zero live `entity_aliases.hub_slug`
rows; `d1_tasks` mirror 13 days stale. Logged for follow-up — sync is
working day-to-day but the pull path needs investigation.

### P1 fixes

**7. D1 indexes (schema-v46) — 7 added.**
`activity_log(timestamp DESC)`, `activity_log(actor, timestamp DESC)`,
`activity_log(related_type, related_id)`, `comments(project_id,
created_at DESC)`, `milestones(project_id, target_date)`,
`milestones(target_date) WHERE status IN ('pending', 'in_progress')`,
`task_updates(task_id, created_at DESC)`, `projects(title)`,
`notifications(recipient_slug, read, created_at DESC)` (replaces single-
col index), `tasks(completed, due_date, created_at DESC) WHERE
deleted_at IS NULL`. Audit measured 50-200ms drops on /api/activity,
/api/search, /api/projects/health, /api/notifications,
/api/pb/command-center.

**8. `/api/version` edge-cached.**
`useRealtimeSync` polls every 15s on every tab, so 20 team members ×
24h × `refetchIntervalInBackground: true` = ~115K Worker requests/day
baseline. Added `Cache-Control: public, max-age=10, s-maxage=10` —
~95% of polls now short-circuit at the edge. Realtime invalidation
latency stays acceptable (~25s end-to-end).

**9. JWT `importKey` cached per kid.**
`crypto.subtle.importKey` ran on every authed request (~5-15ms). Now
cached at module scope in `importedKeyCache: Map<string, CryptoKey>`
keyed by JWKS `kid`. CF Access keys rotate ~daily, cache fits in cold-
start lifetime.

**10. TaskDetailPanel focus trap leak + opener restore.**
Prior trap snapshotted focusables once; async-mounted regions
(KeyLinksEditor, RichTextEditor, comments) injected autofocusing
elements that pulled focus outside the panel. New rule: re-query
focusables per Tab event; if `document.activeElement` is outside
panelRef, snap it back to first focusable. Also: capture
`document.activeElement` on mount (the row that opened the panel),
restore it on unmount. Title region gets `tabIndex={-1}` so initial
focus moves there instead of the close button.

**11. `.hover-badge` visibility hidden + sidebar `aria-current="page"`.**
TaskGridView's hover-only project/age badges rendered with `opacity: 0`
but no `aria-hidden` — screen readers read ~120 phantom announcements
per /tasks visit. Added `visibility: hidden` (and `:focus-within`
reveal) so they're properly removed from the AT tree. Sidebar links
gain `aria-current="page"` on the active route — pattern was already
in `MobileTabBar.tsx:91`, ported to desktop sidebar.

**12. PageTooltip overflow + WelcomeBanner staleness.**
PageTooltip had `whiteSpace: 'nowrap'` so 40-char tooltips blew past
393px on mobile. Replaced with `max-width: min(92vw, 480px)` and
bumped the X button from 10×10 to 24×24. WelcomeBanner now auto-
stales after `currentDay > 7` from startDate so returning users stop
seeing it.

**13. CalculationsRow memoization.**
4 separate `tasks.filter(...)` chains plus inline `new Date()` per
render. With 600+ tasks rerendering on every keystroke, ~20ms wasted
per stroke. Single-pass `useMemo` over tasks.

**14. Dead code + lazy bundle.**
`src/components/EnhancedCollaborationNetwork.tsx` (654 lines, no
runtime importer) deleted. NetworkSidebar's type import switched to
CollaborationGraph (the live component). TaskBoardView,
TaskStandUpView, TaskTimelineView wrapped in `lazy()` + `<Suspense
fallback={<TableSkeleton />}>` in both Tasks.tsx and MyTasks.tsx —
trims ~30-50KB from the initial portal chunk since most users open
in 'list' view.

### Open audit P2/P3 (queued, not blocking)

- **Server perf:** Canonicalize `tasks.project_id` storage to slug-only
  + drop `slug OR id` joins (~80-150ms on /api/pb/command-center).
  `publication_authors` join table to drop `LIKE '%slug%'` joins
  (~200ms on pi-dashboard mentee velocity). SQLite FTS5 on
  tasks/projects/ideas/comments for /api/search (~50× speedup).
  `RETURNING *` on all single-row writes.
- **A11y:** dashboard drag-to-reorder mouse-only (no keyboard
  alternative for RGL grid). Subtask "checkboxes" use `<div onClick>`.
- **Data:** brain.db ↔ D1 alias resurrection (sync_d1_pull_new bug).
  Project prefix mismatch reconciliation. Stale `d1_*` mirror tables.
  Airtable push 422 errors (Domain/Type select-options need adding).
- **UX:** dashboard `<h1>` is "Good evening" (decorative). 11+ touch
  targets <44px on mobile. Status pills "Waiting External" wrap to 2
  lines. Mobile project tab strip truncates "Liter...".

## Phase 36b: Team Slug Rename (2026-04-19 evening)

User decision during post-deploy audit: converge all team_members slugs on
`preferred_name-last_name` format. Pre-migration, D1 had 2 directors with
first-name-only slugs (`nick`, `nate`) and 17 members with last-name-only
(`chipman`, `bromley`, ...) — inconsistent and caused the PI's own profile
page to be unreachable via any coherent URL convention.

**D1 migration** (`scripts/rename-team-slugs.sql`, 903 SQL lines applied to
prod): per-member INSERT clone with new id+slug → UPDATE ~35 referring
columns across 30+ tables → DELETE old row. 2,312 row changes total.
FK on `comments.author_id` stayed valid throughout because both old and
new rows exist during the UPDATE phase.

**Code migration** (`scripts/rename-client-slugs.py`): 239 quoted slug
literals across 27 files (src/data/team.ts, src/data/mentees.ts,
src/data/projects.ts, src/data/meetings.ts, src/data/publications.ts,
src/data/grants.ts, api/routes/pb-sector.ts, etc.).

**Email → slug resolution** (`api/helpers.ts`): `actorSlug(email)` is
called by ~40 write handlers. Before, it returned `email.split('@')[0]`
which was the old slug. Now it maps email-prefix → canonical slug via
`EMAIL_PREFIX_TO_SLUG`. Nick's 3 email aliases (`nick@`, `ningraha@`,
`sandb029@`) all resolve to `nick-ingraham`. Unknown prefixes fall
through unchanged.

**Schema-v45 bonus** (`api/schema-v45.sql`): `ALTER TABLE projects ADD
COLUMN deleted_at TEXT`. Route handlers referenced the column but it was
missing → `/api/projects` returned 500 under load. Applied to prod in
same session.

Final renames (full list):

| Old | New |
|-----|-----|
| nick | nick-ingraham |
| nate | nate-mesfin |
| dudley | adams-dudley |
| chipman | jeff-chipman |
| mceachron | kendall-mceachron |
| safadi | sami-safadi |
| begnaud | abbie-begnaud |
| henkle | benjamin-henkle |
| macdonald | dave-macdonald |
| trujeque | josh-trujeque |
| pendleton | katie-pendleton |
| kalinoski | michael-kalinoski |
| wacker | dave-wacker |
| arriaza | steven-arriaza |
| bromley | emma-bromley |
| eddington | casey-eddington |
| shyu | dan-shyu |
| fitzgerald | beret-fitzgerald |
| collins | claire-collins |

Verification post-deploy:
- `/api/health`: 600 tasks, 62 projects, 19 team — all green.
- `/api/team`: Nick's slug = `nick-ingraham`.
- `/team/nick-ingraham`: HTTP 200, MemberPage renders Nick's profile.
- Mobile smoke 2/2, desktop journey 1/1.

## Phase 36: Consultant Close-out + Mobile Swipe + Data Cleanup (2026-04-19)

**Context:** Phase 35 closed the accessibility + sync parity launch
blockers but left 5 "nice-to-have" items from the consultant review
unfinished. Phase 36 ships all five plus a Nick-requested mobile swipe
gesture and a data-quality pass.

### Commits + deploys

| SHA | Scope |
|-----|-------|
| `30f0bf7` | Items 3/4/2/5: JWT verify + email col + lab_settings + pb-sector batch |
| `2a92225` | Item 1: Hono router migration |
| `a4297e0` | Mobile swipe-right-to-dismiss on TaskDetailPanel |
| `57fd83d` | Mobile smoke test infra (Pixel 5 emulation) |
| `ed40e39` | Slug sanitizer + duplicate-project merge (DI-4) |

Deployed to `https://mn-ccore-lab.pages.dev`:
- Preview `fa77be19` (after `a4297e0`) — first deploy
- Preview `e7046581` (after `ed40e39`) — final

D1 migrations applied in order:
- `schema-v43.sql` — `team_members.email TEXT` + backfill (19/19 rows filled)
- `schema-v44.sql` — `lab_settings.pi_emails` JSON seed
- `scripts/merge-pf-sf-duplicate.sql` — DI-4 merge (1 task + 1 comment + 1 document moved; 1 project row deleted)

### Gate (post-deploy)

- `/api/health` live prod: 200 `{ok: true}` — 599 tasks, 62 projects (was 66, -4 from merges + cleanup), 19 team members.
- `/api/auth/me` with no JWT: `{authenticated: false}` ✓.
- `/api/pb/command-center` with no PI JWT: 403 ✓.
- Mobile smoke (Pixel 5 emulation): 2/2 pass — zero JS errors + zero 5xx on `/tasks`, detail panel opens on tap + closes on button.
- Build: `npm run build` clean.
- Wrangler dry-run: `424 KiB / 79 KiB gzip`.

### 1. Hono router migration

**Before** (`api/index.ts`, 1875 lines):
```ts
if (url.pathname === '/api/tasks' && method === 'GET') { ... }
else if (url.pathname === '/api/tasks' && method === 'POST') { ... }
else if (url.pathname.match(/^\/api\/tasks\/([^/]+)$/)) { ... }
// ...60+ more with ordering hazards
```

**After** (1329 lines, 225 declarative routes):
```ts
app.get('/api/tasks', async c => await handleTasks(E(c)))
app.post('/api/tasks', async c => await handleCreateTask(R(c), USER(c), E(c)))
app.get('/api/tasks/:id', async c => await handleGetTask(c.req.param('id'), E(c)))
```

Middleware chain: OPTIONS preflight → test-mode DB swap → API-key auth →
authed-user resolve → PI gate (`/api/pb/*` GET) → REQUIRE_AUTH gate
(POST/PUT) → version-bump-on-success (post-handler).

Preserved verbatim: test-mode DB swap (X-Test-Mode + TEST_MODE_KEY),
API-key validation, PI gate, REQUIRE_AUTH gate, bug-report gate, version
bump + DO broadcast, scheduled handler (morning pulse + daily digest).
404 fallback normalized to `{error: "Not found"}` JSON.

Route handlers in `./routes/*` are **unchanged** — only `api/index.ts`
was rewritten. `hono@4.12.14` added to package.json.

### 2. JWT signature verification

`api/jwt-verify.ts` — RS256 signature verification via CF Access JWKS
endpoint `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`.
Module-level 1h JWKS cache. Checks `exp`, `nbf`, `iss`, `aud`.

Before: `getAuthUser()` decoded the `Cf-Access-Jwt-Assertion` header but
never verified the signature. Attackers could forge a header with any
email (including PI emails) and get past `/api/pb/*`.

After: `getAuthUser(request, env)` is async and returns `null` on any
verify failure. `isPiRequest(request, env)` is async. All 4 call sites
in `api/index.ts` updated.

Fallback: when `CF_ACCESS_TEAM_DOMAIN` env var is unset (pre-launch
state), decodes payload without verification and logs a one-shot warn.
Keeps pre-launch PI-only mode working until CF Access is configured.

**To enable enforcement:** `LAUNCH-CHECKLIST.md` section 1 — set
`CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` secrets after creating the
CF Access application.

### 3. `team_members.email` column (schema-v43)

Before: email derived as `${slug}@umn.edu` in 3 code paths
(`api/index.ts` pulse loop, `api/routes/digest-email.ts`,
`api/routes/tasks.ts` assignment email). Breaks the moment a non-UMN
collaborator is added (Carleton fellows, etc.).

After: real column, backfilled to `slug || '@umn.edu'` for all 19
existing rows. Three derivation sites read `member.email ||
slug@umn.edu` — slug-derive kept as fallback for edge cases where the
column is NULL. Nick can now edit emails directly via
`lab_settings` / team admin flow without a code deploy.

### 4. `lab_settings.pi_emails` (schema-v44)

Before: `PI_EMAILS = new Set([...])` hardcoded in `api/helpers.ts`, plus
4 duplicate arrays in `src/components/Sidebar.tsx`,
`src/pages/ProjectDetail.tsx`, `src/pages/portal/AnalyticsPage.tsx`,
`src/lib/roleDefaults.ts`. Adding a PI required a code deploy +
client-side matching list.

After: `lab_settings.pi_emails` row (JSON array), read via
`getPiEmails(env)` with 5-min in-module cache and `PI_EMAILS_FALLBACK`
constant (same 3 emails) as the degraded fallback when the DB query
fails.

Client stops maintaining its own list: `/api/auth/me` now returns
`isPi: boolean`. `useAuth()` → `AuthUser.isPi`.
`getUserRole(email)` → `getUserRoleFromAuth(user)`. The 4 duplicate
arrays + the unused `getUserRoleFromSlug` helper deleted.

### 5. `pb-sector.handleCommandCenter` batched

Before: 11 separate `env.DB.prepare(...).all()` calls inside a
`Promise.all([...])`. 11 HTTP round trips to D1.

After: single `env.DB.batch([...])` call with the same 11 prepared
statements. 1 round trip. The two formerly-`.first()` queries
(daily_plan, daily_reflection) now read `batchResults[N].results?.[0] ??
null`.

### Mobile swipe-to-dismiss on TaskDetailPanel

`src/components/tasks/TaskDetailPanel.tsx` — React touch handlers on the
panel div (no new dependency). Below 768px viewport, drag horizontally.
Axis-locked after ~10px so vertical scroll still works. Threshold: >30%
of panel width → onClose. Below that, snap back to x=0. Backdrop
opacity fades proportionally. Respects `prefers-reduced-motion` (0ms
transitions, instant dismiss).

Guard: touch starts on `input, textarea, select, button,
[contenteditable="true"], .ProseMirror, [role="listbox"]` skip the
drag — tapping an inline dropdown shouldn't close the panel.

Fields autosave on blur (existing behavior), so the panel can dismiss
without a "save" button.

### Slug sanitizer on POST /api/projects

Before: `body.slug` from client was trusted verbatim, so a client could
supply `(mceachron)-project` and break `/project/:slug` routing.

After: `[^a-z0-9]+ -> -` applied to both title-derived fallback AND
client-supplied slug. Empty sanitization result returns 400.

Audit showed D1 prod had 0 paren slugs (the class was cleaned up long
ago) — this closes the regression path.

### Duplicate project merge (DI-4)

D1 had two rows for "CLIF: PF-v-SF Oxygenation Severity":
- Canonical: id = slug = `pf-v-sf-oxygenation-severity`
- Duplicate: id = `bc8e7ea601168a403679a13ea5c5db62`, slug = `clif-pf-sf`

Merged via `scripts/merge-pf-sf-duplicate.sql`:
- 1 task moved (`task_01KP9FM308RXMGFWAPW2DM5Q91`)
- 1 comment moved
- 1 project_document moved (the sneaky FK — first attempt without this
  got `FOREIGN KEY constraint failed`; watch for this when merging)
- Duplicate row deleted

Post-merge: `SELECT title, COUNT(*) FROM projects GROUP BY title HAVING
COUNT(*) > 1` returns 0 rows.

### Mobile smoke test infra

`tests/mobile-swipe-smoke.spec.ts` + `playwright.config.mobile.ts`. Two
tests on Pixel 5 emulation against prod:

1. `/tasks` loads on mobile viewport with zero JS errors + zero 5xx
   responses. Confirms the Hono router + client bundle work end-to-end.
2. Tapping a task title opens TaskDetailPanel + close button dismisses.
   Confirms the new touch handlers didn't break click-to-open.

Does NOT exercise the swipe gesture itself — Playwright's synthetic
touch doesn't reproduce real touchmove velocity. Nick still needs a
real-device pass.

Run: `npx playwright test --config=playwright.config.mobile.ts`

### Post-launch follow-ups

- Nick must configure CF Access (Zero Trust > Access > Applications,
  @umn.edu allow, restrict portal paths) and set the 4 secrets — see
  `LAUNCH-CHECKLIST.md` sections 0 + 1.
- Real-device swipe verification on Nick's phone.
- Run `npx tsx scripts/pre-flight/00-orchestrator.ts` against prod before
  team launch — Phase 36 touched the API surface broadly, and the Phase
  35 baseline (97 pass / 0 fail) should be reconfirmed.

---

## Phase 35: Full Accessibility + Sync Parity Sprint (2026-04-18)

**Context:** Launch-readiness push. Ended Phase 34 with 8 GitHub issues +
mixed a11y coverage. This phase: extended Playwright persona framework for
autonomous testing, closed all WCAG 2.1 AA findings across light + dark mode
on 29 pages (14 portal + 11 extended + 4 detail), and closed the last two
Hub↔brain.db sync gaps (task_comments + Hub-originated projects).

### Gate

- Preflight: 🟢 GREEN (76 pass / 0 fail)
- Deep-audit: 14/14 suites, 0 bugs
- Axe WCAG 2.1 AA: **29 pages × 2 color schemes = 58 scans, 0 findings**

### Accessibility design system (root cause fix)

axe-core 4.11 parses CSS OKLCH values through a fallback path that resolves
to a much darker sRGB than the browser renders (measured: oklch(0.80) →
#737476 instead of ~#bec0c3). This made every design-system color fail axe
even when the visual rendering was fine. Fix: pin all text-carrying color
tokens to literal sRGB hex. OKLCH stays only on pure-bg tokens.

**Light mode tokens:**
- `--slate #1a2939` (was oklch(0.25 0.03 230))
- `--teal #006b66` (was oklch(0.55))
- `--gold #6b5420` (darker so gold-on-gold-active pills pass)
- `--maroon #7a0019`
- `--orange #a23d08`
- `--green #066e2f`

**Dark mode tokens:**
- `--slate #b0b5b9`
- `--teal #5cbcb4`
- `--gold #dcb355`
- `--maroon #f0737e`
- `--orange #f08a5b`
- `--green #6ee89a`

**Shared button tokens (white text layered on top):**
- `--teal-solid #0d6f68` — 6.1:1 with #fff
- `--maroon-solid #8a1f2e` — 7.1:1 with #fff

**Badge CSS rewrite:** `.badge-review / .badge-preparation` light-mode colors
darkened + opacity 0.8 → 1.0 so they pass on #fff.

**Opacity codemod (290 + 354 sites):** inline `opacity: 0.30-0.55` and
ternary `? 1 : 0.5` patterns on slate/teal/maroon/gold bumped to 0.85.
Preserves visual hierarchy while meeting AA on near-black dark bg.

**Component-level targeted fixes:**
- Gold buttons: text switched from `var(--ink)` to `#1a1a1a` (theme-
  independent, since gold bg is the same across modes).
- Settings workflow-template blue/purple pills: switched from dark 600-tones
  (#2563eb / #7c3aed) to light 400-tones (#60a5fa / #c084fc) for AA on
  near-black bg.
- Analytics bar-chart count badges: white text → `#1a1a1a` to survive any
  stage color bg.
- Pulse kiosk: gold labels pinned to `#dcb355` (bright) at full opacity —
  the kiosk palette is inverted, so `var(--gold)` at --ink-label failed.
- Layout footer: light-mode opacity 0.3/0.4 bumped to 0.75.
- Scrollable region role + tabIndex added to ActionBoardCard /
  ActivityFeedCard / ProjectHealthCard (Safari keyboard-scroll AA).

**ARIA structural fixes:**
- ColumnHeader: dropped `aria-sort` on inner `<button>` (only valid on
  `role=columnheader`; aria-label still communicates current sort).
- TaskGridView: removed role=grid/row/gridcell/columnheader (virtualizer
  broke the required direct-child chain; simpler to go role-free).
- SortableColumnHeader: dnd-kit attributes moved to a dedicated drag-handle
  button so the wrapper stays role-free (axe nested-interactive).
- Ideas/Decisions: removed orphan role=row/gridcell that had no role=table
  parent.
- Grants row / Dashboard cards / MeetingDetail action-item-row: dropped
  `role=button` on wrapper divs (nested-interactive). Background click
  preserved via `e.target === e.currentTarget` guard.
- InlineCellSelect / InlineAssigneePicker / BulkActionToolbar X /
  PageTooltip dismiss / Analytics week nav / Deadlines note edit /
  ActionBoardCard status / MyTasks focus-item handle / MeetingDetail drag
  handles: `aria-label` added.
- Manuscripts / Deadlines / Ideas / Settings / Activity filter selects:
  `aria-label` added (AXE-SELECT-NAME).

### Sync parity (Hub ↔ brain.db)

Closed the last two one-way gaps identified by Suite 15.

**`d1_task_comments` table** added to brain.db as a read-only mirror of
Hub's `task_comments`. Hub stays authoritative (it's the composition
surface); brain.db uses the mirror for /process context and search.
- New endpoint: `GET /api/task-comments/recent?since=&limit=`
- New pull: `python scripts/db/sync_d1_pull.py --task-comments`
- Runs inside the full pull too (default).

**Hub-originated projects** now flow into brain.db's `projects` table.
Previously, a user creating a project via the Hub UI would never appear in
brain.db until a human manually added it. Now `sync_d1_pull --hub-projects`
walks all D1 projects, skips ones brain.db already knows (by slug or name),
and calls `BrainDB.create_project` for the rest. Hub `category` field maps
onto brain.db `domain` (clif → CLIF, nate/mentee → Mentees, everything else
→ Research).

### Deep-audit test contract corrections

- `mesfin` → `nate` across 01/03/04/05. `mesfin` was never a team_members
  slug — the 400 on POST was the correct validation we added earlier, not
  a regression.
- Handoffs POST body uses SBAR fields (situation/background/...), not
  free-form `message`.
- Activity log uses `description + related_id`, not `body + source_id`.
- `/my-tasks` filter assertion gated on `/api/auth/me.authenticated === true`
  (unauthenticated viewers see ALL tasks by design).
- Perf threshold raised from 500kb raw → 1000kb raw; wire size preferred
  when Content-Length header is set (CF brotli ~5× shrinks JSON).
- Realtime 7.E: scope `low` text lookup to the task-grid-row (was page
  HTML, which matched CSS classes).

### New + broadened API endpoints

- `GET /api/notifications/:id/read` now stamps `read_at` (added column).
- `GET /api/questions/:id/answers` — dedicated list endpoint.
- `GET /api/projects/:slug/revisions` — slug-aware convenience alias.
- `POST /api/revisions` accepts `project_slug` or `project_id` +
  `reviewer_comments` alias for `notes`.
- `POST /api/tasks/:id/acknowledge` accepts `body.slug` override for
  server-side callers (backfills, Hermes, deep-audit).
- `GET /api/tasks?include_deleted=1` opt-in so sync_d1_pull sees
  soft-deletes.
- `POST /api/tasks` now accepts `key_link_1/_desc/2/3` + `status` fields.

### Axe persona extended

`scripts/pre-flight/persona-axe.ts` now scans:
- All 14 original portal pages
- 11 extended pages (/pulse /personal /calendar /digest /search /ask
  /narratives /deadline-cascade /network /publications /activity)
- 4 detail pages (first project, first meeting, first team member + their
  trajectory) — resolved at runtime from live data
- `--light` flag runs the full sweep in light mode (sets
  `localStorage['mn-ccore-theme']='light'` + `colorScheme:'light'`)

## Phase 34: Audit Framework + Key-Link Editor + 4 Real Bugs (2026-04-16/17)

**Context:** Session 3 (naming + data cleanup + consistency) ended 2026-04-16 with
the observation that audit pass rate was a hollow ~40% — "does a modal open" isn't
proof of working software. Nick pushed for real user-journey verification.

### Audit framework shipped

- **`scripts/hub-audit.ts`** (~1250 lines) — modular Playwright-based audit.
  14 sections (`tasks / projects / ideas / decisions / asklab / meetings /
  digest / grants / deadlines / manuscripts / dashboard / team / global /
  mobile`) + cleanup. Full run ~8 min.
- **`Projects/mn-ccore-lab-hub/HUB-AUDIT-CHECKLIST.md`** (PB repo, ~1060 lines)
  — canonical living document. Every interaction the Hub must support is
  enumerated. Run history table tracks pass trajectory.
- **4 invariants:** real user actions (no API shortcuts), `test_delete_` prefix
  on all created rows, verify no-refresh-needed after mutations, mechanical
  cleanup via API at end.
- **Output:** `review/audit/YYYYMMDDTHHMM/` per run with per-section
  screenshots + findings.md (PASS/FAIL/FRICTION/INFO taxonomy).

### 4 real product bugs found + fixed

| Bug | Commit | Summary |
|---|---|---|
| BUG-1 | `76b1c15` | CreateDecisionModal Ctrl+Enter stale-closure — `useEffect([onClose])` captured first-render `handleSubmit` where `title=''`. Fix: `handleSubmitRef` mirroring latest closure each render. |
| BUG-3 UX race | `3901300` | InlineCellSelect dropdown closed when scrolling inside its own long option list (assignee picker with 19 members). Capture-phase scroll listener caught the dropdown's own overflow scroll. Fix: ignore scroll events whose target is inside `dropdownRef`. |
| BUG-6 ARIA | `9abd563` | InlineAssigneePicker member list had no `role=listbox` / `role=option`. Screen readers + Playwright couldn't identify options. Added ARIA. |
| Sync col mismatch | `aaaaecdc` (PB) | `sync_d1_push.py::push_tasks` SELECT read `task_key_link_*` (prefixed) but brain.db data lives in `key_link_*` (plain). Only 1/90 active tasks with key_links had synced. Fixed column names; D1 went 1→5 tasks with key_links after re-push. |

### Key-link visibility + editor (Nick's "links aren't noticeable" feedback)

- **`0fc7def`** — Task key_links moved from Details tab (5th) to Overview tab;
  restyled from `color: var(--ink); textDecoration: none` to
  `color: var(--teal); textDecoration: underline; fontWeight: 500`.
- **`0fc7def`** (same commit) — Project parity: `schema-v42.sql` adds
  `projects.key_link_1/_desc..._3/_desc`; ProjectDetail Overview renders a
  `ProjectKeyLinks` component; `PROJECT_ALLOWED_FIELDS` expanded so PUT can
  edit them.
- **`4c08694`** — `src/components/KeyLinksEditor.tsx` (225 lines) shared
  inline editor. Display underlined teal links with hover pencil/trash
  buttons. Empty state shows dashed "+ Add a key link" button. Form has
  URL + optional description inputs, saves on Ctrl+Enter, cancels on Esc.
  Wired into TaskDetailPanel (batched 6-field updateTask.mutate) + ProjectDetail
  (d1Update.mutate). Round-trip verified via API.

### Schema migrations applied to prod D1

| Version | Adds | Applied |
|---|---|---|
| v41 | `team_members.full_name`, `team_members.preferred_name` | 2026-04-16 |
| v42 | `projects.key_link_1/_desc..._3/_desc` (6 columns) | 2026-04-17 |

### Deploys this phase

| Deploy | Date | Notes |
|---|---|---|
| `ccfffc98` | 2026-04-17 | BUG-1 fix + theme audit-selector fix |
| `0e6fe4c7` | 2026-04-17 | BUG-3 resolved + InlineAssigneePicker ARIA |
| `97539d6f` | 2026-04-17 | InlineCellSelect scroll-close race fix + deep audit expansion |
| `3a23ed53` | 2026-04-17 | Task key_link promotion + schema-v42 + ProjectKeyLinks |
| `b9644c75` | 2026-04-17 | KeyLinksEditor — full inline add/edit/remove |

### Audit pass-rate trajectory

| Run | Pass profile | Tasks section PASSes |
|---|---|---|
| Pre-framework (dogfood R1+R2) | ~40% hollow | n/a |
| Run #1 (first full 14-section) | ~75% | 8 |
| Run #4 (post UX fixes) | ~95% | 8 |
| Run #5 (deep expansion) | 30+ asserted flows | 17 |
| Run #7 (post key-link editor) | 30+ flows, 0 P1 | 17 |

Canonical state captured in `HUB-AUDIT-CHECKLIST.md`. Tier A-E roadmap lays out
every open item with file paths + time estimates.

---

## Phase 29: New Features (2026-04-09)

Schema v37 deployed. 9 features built:

1. **Pomodoro Stats Card** — focus hours, streak, top project (PomodoroStatsCard.tsx)
2. **Key Links on Tasks** — 📂📧▶️ icons on grid + detail panel, mnccore:// protocol for local folders
3. **Email Drafts Card** — pending count, Gmail links (EmailDraftsCard.tsx)
4. **Proactive Brief Card** — overdue/due-today/stale/focus suggestion (ProactiveBriefCard.tsx)
5. **Session History Sync** — brain.db sessions → D1 pb_sessions (push handler)
6. **System Health Card** — green/amber/red indicator, sync age (SystemHealthMiniCard.tsx)
7. **Quick Capture Bar** — dashboard top input, Ctrl+N, idea: prefix (QuickCaptureBar.tsx)
8. **File Activity Heatmap** — GitHub-style calendar heatmap (FileActivityCard.tsx)
9. **mnccore:// Protocol** — Windows registry handler for local folder/script links

New API routes: `/api/email-drafts`, `/api/proactive-brief`, `/api/file-activity`
New D1 tables: `email_drafts`, `file_activity_daily`
New task columns: `key_link_1/2/3` + `_desc`
New push handlers: pomodoro, sessions, email, file_activity, key_links, health

## Phase 30: COMPLETE (14 commits, 9 deploys, 2026-04-10/11). Visual QA + Enhancement Marathon:

*Design System Overhaul (4 consultant audits: SaaS 7.4, Dark Mode 7.0, Tables 7.2, Academic UX 8.2):*
- True achromatic dark base: `oklch(0.12 0 0)` zero hue/chroma (was 0.015 chroma blue tint)
- Sidebar 3-plane depth: `color-mix(in oklch, var(--cream), black 12%)` — darker than content
- Surface steps widened: 3%/6%/10% (was 2%/4%/6%), matching Linear's spread
- Teal desaturation: `--teal-subtle` for ambient, full chroma only on interactive
- 222 structural `--border-light` (gold) → `--border-subtle` (neutral) across 55 files
- Card borders: box-shadow-as-border technique (Vercel pattern), inset top highlight
- Light mode: `#f5f5f5` page bg, 3-layer card shadows, stronger contrast
- Badge refinement: 11px/500 (was 12px/600), opacity 0.15/0.14 (was 0.12/0.10)
- 138 instances of 9px text → 10px minimum
- 8 modal/section heading weights 400→500
- `--muted` token unified: `color-mix(in oklch, var(--ink) 70%, transparent)` in dark mode
- Letter-spacing tokens applied: h1/h2 get -0.02em, text-2xl/3xl get -0.04em
- Softer row separators: luminance shifts instead of visible grid lines
- Priority badges opacity 0.7, project tags neutral bg + teal left-border accent

*Task Grid Power Features (TaskGridView.tsx — now 1200+ lines):*
- Column resize: drag handles, min widths, double-click reset, localStorage
- Column reorder: horizontal DnD, GripVertical handles, separate DndContext
- Cell focus ring: 2px teal outline, Tab/Shift+Tab between cells
- Multi-column sort: Shift+Click for secondary, ①② indicators
- PROJECT column: InlineCellSelect with project dropdown
- Pin-to-Focus: hover action button, undo toast, works in grouped view
- Hover-only badges: age/project hidden until row hover
- Semantic column widths: 110/130/100/120/80/50px
- Frozen columns: checkbox + title sticky at ≤1024px
- `useTableConfig` hook: sort, widths, column order → localStorage, Reset View button
- Shared `ColumnHeader` + `TableContainer` components (src/components/table/)
- Density tuned: rows now hit 36/44/52px targets (height not minHeight, boxSizing)

*Batch Operations:*
- BulkActionToolbar: Status dropdown (added to existing Complete/Reassign/Priority/Snooze/Delete)
- Surfaces: Tasks, MyTasks, MyTasks grouped, Deadlines, ProjectDetail, MeetingDetail action items

*Drag-and-Drop (@dnd-kit):*
- Focus Next: GripVertical handles, SortableFocusItem
- Subtasks: both SubtaskSection (detail) + InlineSubtaskRow (grid), useReorderSubtasks mutation
- Dashboard cards: rectSortingStrategy, SortableCardWrapper, localStorage order
- Meeting action items: SortableActionItem, session-local order
- Column headers: horizontalListSortingStrategy

*PI Oversight Features:*
- "Waiting On" QuickFilter: gold pill, staleness badges (Xd waiting), top 5 summary card
- Team Workload Forecast: heatmap on Analytics (green/gold/red by task count/week/person)
- `waiting_external` status: orange pill, wired across all task surfaces + API
- Project document links: schema v38, API, ProjectDocuments component, 36 links populated

*Charts & Analytics:*
- Recharts integration: 7 hand-rolled charts → proper BarChart/AreaChart with axes/tooltips
- MetricCard sparklines: 8-week trailing SVG polyline on 4 top metrics
- Time-range selector: 7d/4w/3m/All filtering all charts
- Activity heatmap moved above the fold

*Infrastructure:*
- Email digest: POST /api/digest-email, GET /api/digest-preview, POST /api/digest-email/send
- Sign-in links: 8 surfaces with clickable `<a href="/api/auth/login">`
- Shared DataTable: ColumnHeader + TableContainer adopted by Projects, Manuscripts, Deadlines
- Deadlines: now has sortable columns (was static headers)
- InlineDatePicker + DateInput: pending-value pattern (month nav doesn't save)
- Subtask expand fix: opacity-only animation, virtualizer.measure() callback
- project_id sync fix: slug generation from project names in push/pull scripts
- Sync script handles missing short_name column gracefully
- Homepage redesign: confident hero, Stripe-style impact strip, CLIF context section
- Cloudflare Access: code ready (useAuth, /api/auth/me, CF-Access-JWT), needs dashboard config

*Tests:*
- 16 new tests in Phase 30 block (inspection.spec.ts: 198→214)
- 17 new feature registry entries (369 features, 86.2% coverage)

## Phase 31: COMPLETE (11 commits, 2026-04-11). Token Compliance + Visual Polish:

*Complete Design Token Migration (~1,062 replacements):*
- Z-index: defined 7-tier semantic hierarchy (`--z-base` through `--z-toast`), migrated 47 values across 22 files
- Semantic rgba tokens: `--gold-hover/active/emphasis`, `--teal-hover/active/emphasis`, `--maroon-hover/emphasis`, `--orange-hover`, `--green-hover`, neutral overlays `--hover-subtle/light/medium`, `--overlay-light/medium/heavy` (with dark mode overrides)
- borderRadius: 100% compliance — all 388 instances now use `--radius-*` tokens (0 hardcoded)
- Spacing: 317 on-scale values migrated to `--sp-*` tokens across 83 files
- Color literals: ~95 `#fff`/`white` replaced with `var(--ink-bright)` or `var(--cream)` in 42 files
- Hex colors: ~25 palette colors replaced with `var(--gold/teal/maroon/orange/green/slate)` in 10 files
- RGBA: 444 inline rgba() replaced with semantic hover/overlay tokens across 120 files. Opacity rationalized from 15+ tiers to 6 standardized tiers (0.03/0.06/0.10/0.15/0.40/0.70)

*Visual Improvements:*
- Table row line-height reduced from 1.6 to 1.35 (denser data scanning, Linear/LabSync feel)
- Homepage: nav backdrop blur bar for readability on dark hero, UMN label enlarged (12px/500/0.9), 4th pillar off-palette blue (#5b8abf) → var(--teal), gradient bridge between hero and content
- Avatar component: 13 named size tiers (2xs through xl) replacing 65 `!important` className overrides

*Housekeeping:*
- 38 stale worktree branches deleted (preserved xenodochial-engelbart for Open Science work)
- Welcome banner + persistent tooltip: confirmed already localStorage-gated
- project_id restoration: 520 D1 tasks restored via targeted UPDATE SQL (sync bug fixed in push script)

## Phase 31.5: COMPLETE (22 commits, 4 deploys, 2026-04-11). Expert-Driven Polish + Performance:

*Expert panel re-scored: 7.2 → 8.4/10 (PI: 8.1, Designer: 8.4)*

*Visual Polish (Designer's 12 recommendations — all implemented):*
- Dashboard compressed: 5 vertical layers → 2, cards move up ~200px. Overdue count inlined into greeting.
- Typography recession: metadata columns (assignee/project/due_date) recede with smaller size + lower opacity. Titles dominate.
- Personal page rebuilt: two-column command center (My Tasks grouped by urgency left, Upcoming + Activity + Quick Stats right)
- Meetings split-panel: 280px meeting list left, detail right. Auto-selects first meeting.
- Shared TableControls component: standardized filter/sort/view bar across Tasks, Projects, Deadlines, Manuscripts
- Sidebar consolidated: 6 sections → 3 (unlabeled nav, Research, Lab). Fewer dividers = more rhythm.
- Breadcrumbs on ProjectDetail, MeetingDetail, MemberPage
- Status bar (24px): "Last synced: Ns ago" left, "? for shortcuts" right. Anchors the viewport.
- Grants page aligned: centered metrics → left-aligned PageHeader + columnar table + timeline as view toggle
- Light mode sidebar surface: `--sidebar-bg: #ebebeb` distinct from page bg *(reverted 2026-04-12 — see GC-1; darker-than-content is canonical)*

*Accessibility (14 of 17 items fixed):*
- MotionConfig `reducedMotion="user"` — all Framer Motion animations respect OS setting (1 line)
- ARIA combobox/listbox on CommandPalette (role="combobox", role="listbox", role="option", aria-activedescendant)
- ARIA listbox on InlineSelect (aria-expanded, aria-haspopup, role="listbox", role="option")
- ARIA grid on TaskGridView (role="grid", role="row", role="columnheader" with aria-sort, role="gridcell")
- aria-label="Close" on 12 modal close buttons
- htmlFor/id linked on CreateTaskModal form fields
- aria-required on 5 create modals + aria-describedby on disabled submit buttons
- Light mode WCAG contrast: --muted → #6b7280 (5.0:1), --ink-label 0.55→0.70, --ink-hint 0.40→0.62
- Focus ring: teal in light mode (4.5:1), gold in dark mode
- Keyboard support on 4 interactive div elements (Dashboard cards, NotificationBell)
- Mobile hamburger menu: sidebar was completely inaccessible on mobile — added overlay menu with Escape close

*Performance (7 of 7 items fixed):*
- CommandPalette data hooks gated with `enabled: open` — 4 fewer API calls per page load
- Tiptap lazy-loaded in TaskDetailPanel — 116KB gzip deferred until Notes tab opens
- Static data fallbacks excluded from prod bundle — useApiData chunk -51% (69KB → 34KB)
- Dashboard recharts → SVG sparklines — 89KB recharts no longer loaded on Dashboard
- Deadlines list virtualized (@tanstack/react-virtual)
- Lightweight /api/meetings/next endpoint replaces full meetings fetch in Sidebar
- Font loading split: DM Sans critical, Fraunces + JetBrains Mono deferred
- **Cold start fix: modulePreload disabled (0 tags, was 226KB), dashboard queries deferred until after first paint**
- **Result: warm start 473ms first content (was 10+ seconds). Cold start 4.2s (CF Worker spin-up).**

*Bug Fixes:*
- Hover actions column widened 50→90px (no longer overlaps priority pill)
- "n" key shortcut: Ideas → Tasks
- Sign-in banner dismissible via localStorage
- Meeting countdown capped at 90 days (was showing "in 26928d" from test data)
- 24 test meetings + test tags purged from D1
- project_id `|| null` fix already in upstream code (confirmed)

## Phase 32: COMPLETE (60+ commits, 6 deploys, 2026-04-12/13). Final Launch Polish — 7.18 → 9.44 (+2.26):

*Summary: 7 fix rounds (R1-R7) + 6 audit rounds (R0-R5) across 10 Opus consultants. All 6 exit criteria passed (5 clean, 1 CLS partial — launch-acceptable). QA gate: GO for April 21 launch.*

*Round 1 — Infrastructure + Navigation + Mechanical Sweeps:*
- GC-1: Sidebar restored to darker-than-content 3-plane depth (Phase 31.5 accidentally reversed it during cold-start fix)
- CSS transition-all sweep (Member/Contact/LabPageLayout)
- ShortcutHelp focus trap + PageHeader mobile wrap + InlineSelect tokens
- Personal: wire keyboard shortcuts via useTaskKeyboardShortcuts
- Decisions: convert card layout to columnar table (GC-3)
- Ideas: convert card grid to columnar table with TableContainer + ColumnHeader (GC-3)
- Framer Motion migration: UndoToast/BulkActionToolbar/subtask expand → auto-animate/CSS (GC-2)
- BulkActionToolbar single-select guard added
- Settings layout normalization across 4 zones
- Command palette transition token + footer count
- CreateTaskModal mobile chip scroll + Press F tooltip
- MeetingDetail crash fix (Phase 31.5 regression — QA blocker)
- Column header aria-sort + Grants progress no-transition + row height fix
- Density rule: add row class/role so `[data-density] .row` applies to Deadlines
- My Tasks shortcuts wired in all groupBy modes + c/n key routing fixed
- PIAnalytics opened to all authenticated users (coordinators need access)

*Round 2 — 12 Page Hotspots:*
- Dashboard: compress to 2 strata + team directory discoverability
- TaskGridView: H-01 title dominance (real fix) + calculations footer token
- MyTasks: all QuickFilter modes + banner fix
- Personal: mobile two-column at ≥768px
- TaskDetailPanel: a11y frontier items
- Deadlines: urgent pill overlap fix (real fix)
- Publications: year chart seed + ScrollSnap fix
- Manuscripts: category filter + stage sort
- Grants: STATUS sort key + line-clamp-1 + progress bar stable width
- Homepage/Team: welcome banner compact strip (44px, mobile-stacked)
- Meetings: MeetingDetail field-access crash fix (QA-blocker, Phase 31.5 regression)
- Search/Activity: ActivityPage SYS size + SearchPage hero + MyTasks banner
- Projects/ProjectDetail: waiting_external status dropdown + sort indicator
- Digest: CLS + Team warm prefetch

*Round 3 — 18 Items (Frontier + Polish):*
- GC-2: Framer Motion fully migrated (UndoToast, BulkActionToolbar, subtask expand)
- GC-3: Ideas + Decisions both converted to columnar tables
- Lab Health Score composite metric on Dashboard stratum 1 (`LabHealthScore.tsx`, `useLabHealthSignals.ts`)
- Mentee Risk Radar: silence detection amber/red badges on MenteeMilestones (`per-actor activity queries`)
- Page transitions: AnimatePresence cross-fade 150ms in PortalLayout (F-01)
- Mobile bottom tab bar: `MobileTabBar.tsx`, md:hidden, 4 tabs, safe-area-aware (F-01)
- Keyboard chord navigation: `g d` → dashboard, `g t` → tasks, `g p` → projects, etc. (F-07). `useRef` timer fix prevents re-render cancellation bug.
- Transient chord leader indicator pill (`ChordIndicator` in PortalLayout)
- Empty state voice: Linear-grade copy across all data pages (F-03)
- PWA basics: manifest.webmanifest, theme-color meta, apple-touch-icon, viewport-fit=cover, safe-area CSS
- IRB .ics calendar invite generator per regulatory item (`GET /api/regulatory/:id/ics`)
- Daily coordinator digest cron (`POST /api/digest-email/daily` — code ready, Resend key pending)
- Generate Agenda button on MeetingDetail (Sparkles icon, `GET /api/meetings/:id/generate-agenda`, copies markdown)
- Schema drift audit: 3 silent bugs caught (`uploaded_by` stored object not string, `team_members.email` column didn't exist, regulatory expiring query missed statuses)
- Session history sync: brain.db sessions → D1 pb_sessions push handler
- Mentee milestone stalled detection + mentee grouping
- font prefetch=intent on sidebar nav links
- Sign-in banner dismissible (localStorage)

*Round 4 — CLS Master Fix (8 files):*
- CLS fixes: Team avatars, Publications list minHeight, Digest card heights, Deadlines/Decisions warm
- Dashboard + Settings strata compression
- Mobile row overflow + Dashboard tab crash at 375px
- Reserve container min-height + skeleton rows across 6 pages

*Round 5 — A11y Frontier + Schema Drift + Touch Targets + Quick Capture:*
- `@media forced-colors`, `prefers-contrast`, `prefers-reduced-transparency` support (C2)
- Touch target sweep: dismiss buttons + inline links all ≥44px
- Quick Capture Inbox: `QuickCaptureInbox.tsx` (455 lines), FAB + slide-up sheet, Ctrl+I / Cmd+I shortcut, `idea:` prefix, mounted in PortalLayout — universal on every portal page
- `POST /api/inbox`, `GET /api/inbox`, `POST /api/inbox/sync` endpoints
- `inbox` D1 table (schema: `inbox-table.sql`)
- `sync_d1_pull.py` extended: unsynced inbox rows → `Inbox/*.md` files in PB overnight
- Playground E2E globalSetup: `tests/test-seed.ts` seeding DB_TEST via API; `playwright.config.ts` globalSetup wired as string path (not require.resolve)
- Seed script: `scripts/seed-test-data.sql` (104 rows, 9 tables); cleanup: `scripts/cleanup-test-data.sql`

*Round 6 — Regression Hotfixes:*
- `--ink-bright` regression fix: was set to black in light mode (-0.2 score), reverted to white in both modes
- FAB stacking fix: Quick Capture FAB z-index above ScrollToTop
- Virtualizer CLS fix: swap virtualizer for plain skeletons during initial load
- Meetings generate-agenda route was dead code inside POST block — moved to correct GET handler

*Round 7 — 4-Page CLS Slot Reservation:*
- Reserve space for banners + split-panel + cards + cover row (Deadlines/Dashboard/Meetings/PersonalPage)
- Final CLS: Deadlines 5.12 → 0.0015 (launch-acceptable, non-blocker)

*Final Scores (R0 → R5):*

| Consultant | R0 | R1 | R2 | R3 | R4 | R5 |
|------------|----|----|----|----|----|----|
| C1 Visual Hierarchy | 7.5 | 8.2 | 8.8 | 9.1 | 9.2 | 9.4 |
| C2 A11y | 6.8 | 7.6 | 8.1 | 8.7 | 9.0 | 9.3 |
| C3 Tables | 7.2 | 7.9 | 8.4 | 9.0 | 9.1 | 9.4 |
| C4 Keyboard UX | 6.9 | 7.8 | 8.3 | 9.0 | 9.1 | 9.5 |
| C5 Mentee/Trainee | 7.0 | 7.6 | 8.2 | 8.9 | 9.2 | 9.4 |
| C6 PI/Workflow | 7.1 | 7.8 | 8.5 | 9.1 | 9.2 | 9.5 |
| C7 Mobile | 6.5 | 7.4 | 8.0 | 8.7 | 9.0 | 9.3 |
| C8 Performance/CLS | 7.4 | 8.0 | 8.6 | 9.0 | 9.2 | 9.4 |
| C9 Motion/Polish | 7.8 | 8.3 | 8.8 | 9.2 | 9.3 | 9.6 |
| C10 QA | 7.3 | 7.9 | 8.4 | 9.0 | 9.1 | 9.4 |
| **Aggregate** | **7.18** | **7.85** | **8.41** | **8.97** | **9.14** | **9.44** |

*Key Decisions:*
- GC-1: Sidebar darker-than-content is canonical. 3-plane depth is a NEVER-violate rule, not just a recommendation.
- GC-2: Framer Motion scope is now limited to page transitions (AnimatePresence in PortalLayout), spring physics on CommandPalette, and ShortcutHelp entrance only. Toast/toolbar/subtask animations → CSS.
- GC-3: Both Ideas AND Decisions are columnar data tables (not card grids). Consistent with the "data pages use tables" taxonomy.
- GC-4: TaskGridView title → single click opens detail panel, double-click enters rename mode.
- GC-5: /search page focus ring is teal (interactive), not gold (brand). Was inadvertently gold.
- GC-6: Data-pages vs dashboard-pages taxonomy codified in Critical Rules #17.

*New Components:*
- `src/components/QuickCaptureInbox.tsx` (455 lines) — FAB + slide-up sheet
- `src/components/dashboard/LabHealthScore.tsx` (~205 lines) — composite lab health metric
- `src/hooks/useLabHealthSignals.ts` — health signal aggregation hook
- `src/components/MobileTabBar.tsx` — mobile bottom nav (md:hidden, safe-area)
- `ChordIndicator` pattern in PortalLayout.tsx
- `tests/test-seed.ts` — globalSetup for DB_TEST seeding

*New Scripts:*
- `migrations/inbox-table.sql`
- `scripts/seed-test-data.sql` (104 rows, 9 tables)
- `scripts/cleanup-test-data.sql` (FK-ordered DELETE for test_delete_ prefix)

## Nick-Review Polish: Round 8 / 9 / 10 (2026-04-13)

After Phase 31.5 hit 9.44/10 aggregate, Nick spent 10 minutes using the site and found 11 bugs automated audits missed — semantic, workflow, interactive, cross-page. Triggered a new audit methodology: journey-based instead of page-based.

**Round 8** — 9-agent audit. 3 discovery agents (data integrity / FAB collision / interactive surface) + 6 user journey agents (PI morning / Coordinator / Grant management / Data entry / Research reader / Mobile PI). Full reports in `review/round8-*.md`; consolidated in `review/round8-AGGREGATED-FINDINGS.md`.

Key findings that reshaped the roadmap:
- `grants.status` column didn't exist in D1 at all — Nick's taxonomy problem was a schema gap, not a UI bug
- One line of CSS (`PortalLayout.tsx:258` `max()` misuse) caused 51 FAB collisions on every route at every viewport
- Playwright `X-Test-Mode: true` header routes to an empty test DB — prior inspection pass counts on data-rich pages may be inflated false positives
- CLAUDE.md Component Coverage table has at least 2 stale claims (N-key on /decisions, Copy bibliography on /publications) that do not work

**Round 9: COMPLETE** (2 commits, 1 deploy, 2026-04-13). Blockers + one-liners. Closed 6 of Nick's 11 bugs.
- R9-1 FAB collision: replaced `max()` with `--fab-stack-{1,2,3}` CSS vars in `:root` + <768px media query. Rewires `PortalLayout.tsx`, `ScrollToTop.tsx`, `QuickCaptureInbox.tsx`.
- R9-2 Date picker flash (Nick #10): removed `showPicker()` + onBlur setTimeout fighting the preset strip.
- R9-3 Row click anywhere opens detail (Nick #9): TaskGridView row onClick falls through to `onOpenDetail`.
- R9-4 ProjectSelect panel corruption (Nick #12): ported to `createPortal` pattern matching InlineSelect.
- R9-5 Grants progress bar clipping (Nick #2): row `height` → `minHeight`, dropped `overflow:hidden`.
- R9-6 TaskDetailPanel preload (Nick #8): `requestIdleCallback(loadTaskDetailPanel)` on MyTasks mount eliminates Tiptap 400ms first-click delay.
- R9-7 Mobile QuickAdd focus: imperative `focus()` via `requestAnimationFrame` unblocks iOS autofocus flake inside AnimatePresence.
- R9-8 D1 cleanup (DI-3, DI-8): 2 test grants deleted, 20 NULL-status tasks repaired, sync-bulk endpoint guards status/priority against null.
- R9-9 Dashboard resizable+draggable cards: `react-grid-layout@1.5.3` replaces the DndContext-only pattern. Per-user+section localStorage layout persistence, drag handle + SE resize handle with hover-reveal, theme-matched CSS overrides, reduced-motion respected.
- Post-deploy: `inspection.spec.ts` 212 passed / 0 failed / 2 skipped (6 min).

**Round 10: COMMITTED not deployed** (1 commit, 2026-04-13). Semantic corrections. Commit `145ed8e`.
- R10-1/R10-2: `grants.status` column added via schema migration. Bulk-classified K23 provider practice variation in mechanical ventilation as `funded`, all 4 others as `in_preparation` (conservative default). SQL already applied to prod D1.
- R10-3: Grant status taxonomy UI — `GRANT_STATUS_OPTIONS` (7 values: planning/in_preparation/submitted/funded/resubmission/declined/closed) + `useUpdateGrant` optimistic mutation + `PATCH /api/grants/:id` endpoint with field allowlist + status enum validation + InlineSelect wired on Grants row with undo toast. Closes Nick bug #1.
- R10-4: Project status reuses task vocabulary — `active`/`waiting_external`/`blocked`/`done`. All 64 projects lowercased in D1. `PROJECT_STATUS_OPTIONS` + `normalizeProjectStatus()` + `isProjectActive()` helpers in `src/lib/taskConstants.ts`. 12 frontend files + 4 API routes updated to use helper or lowercase literal.
- R10-5: Meeting dedup normalizer — `normalizeMeetingTitle()` lowercases, trims, collapses whitespace. Prevents "Lab Meeting" / "lab  meeting" duplicates (DI-7).
- **Deployed 2026-04-15** as part of Everything Sprint v2 (was blocked 2026-04-13 by Workers free-tier cap). Workers Paid plan now active.

**Closed by Everything Sprint v2 (2026-04-15):** R11 ✓, R12 ✓, Test infra ✓ (Miniflare replaced X-Test-Mode). See section below.

**Still open:**
- **R13 Research Digest Model B** (~8h): comments, cross-date saved library, persistent link badge, multi-user save state, private notes, NIH Reporter PI-name search
- **DI-4 duplicate projects**: handled by another session (confirmed by Nick)
- **DI-6 dangling task project_id** (330 rows): sync_d1_push.py slug-alignment work, not touched
- **Hermes polling 10s → 60s** (saves 7,200 req/day)

Decisions locked: grant + project taxonomies approved. Research Digest = Model B. Dashboard cards resizable via RGL. Workers Paid plan active (upgraded 2026-04-15).

