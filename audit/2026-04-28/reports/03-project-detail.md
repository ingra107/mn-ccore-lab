# ProjectDetail Audit — `/portal/projects/:slug`

**Date**: 2026-04-28
**Agent ID**: `a2ab1fd7fa0eb0947`
**Files reviewed**: `src/pages/ProjectDetail.tsx` (1813 lines), `src/components/PresenceAvatars.tsx`, `src/hooks/usePresence.ts`, `src/components/KeyLinksEditor.tsx`, `src/components/LinkifiedText.tsx`, `src/lib/urlClassify.ts`, `src/components/FileUpload.tsx`, `src/components/SmartCompose.tsx`, tab components

## 1. Executive read

- **The Overview landing card is structurally correct and the most successful UX rebuild on this page** — Open Tasks left, Key Links + Recent Activity right, compose bottom — but it sits on top of a long-tail of legacy "Project Detail v1" content (Strategic Context, Stage strip, Details card, Key Documents, InsightPanel, ConferencePrep) that nobody pruned when the landing card replaced "Project Timeline" in April 2026. The Overview tab is two products bolted together: a 2026-quality landing card + a 2025-era vertical scroll of cards. **This is the highest-leverage cleanup on the page.**
- **The page violates Rule 35 in one specific place** (`ProjectDetail.tsx:489`): the header inline stage `<InlineSelect>` calls `d1Update.mutate({ stage: toApiStage(val) })` but takes its options from `STAGES` (the 7-element UI array including "Revisions"). The stage strip below at `:341-350` correctly funnels through `handleStageClick` → `confirmStageChange` → `toApiStage`. Two side-by-side stage editors with different friction (one confirms, one doesn't) is a real bug — Nick can change stage from the header pill instantly with no confirmation, but clicking the strip dot demands confirmation. The asymmetry will burn somebody.
- **Mobile compose-sheet layering and tab-system flat index are the two regressions hiding in the new shape.** The BottomSheet (`:884-893` backdrop, `:899-911` sheet) is wired but the sheet's slot lives **inside** the landing-card `motion.div` with `position: fixed` — meaning it works visually, but the sheet's positioning depends on the parent not having `transform`/`will-change`, which Framer Motion's `motion.div` may apply during animation. The 8 tabs are an unindented flex strip with no keyboard nav, no `role="tablist"`, no URL-write-back on change (read-back works via initial param at `:136-141`, but `setActiveTab` never updates the URL, so deep-links break the second a user clicks another tab).

## 2. Surface-by-surface walkthrough

### 2.1 Header / hero (`:373-540`)

**Title row (`:380-454`).** Title is **NOT inline-editable** — `<h1>` at `:382-392` is plain text with no click handler. Short name (`:393-440`) is. This is asymmetric in a bad way: research projects rename frequently in revision phases, and Nick has to leave the page to edit the title. There's no obvious "..." actions menu (archive, delete, duplicate). `Copy link` (`:443-450`) and `WatchButton` (`:451`) are present. `<PresenceAvatars>` (`:452`) renders correctly null when alone (good — Rule 49).

**Short name editor (`:393-440`).** Click-to-edit on the muted span works. Empty state copy reads `'Add short name...'` (italic, `:431`) — fine, but the whole short_name field is undocumented for users. They won't know what it's used for unless they already know it surfaces in TaskDetailPanel + breadcrumbs. A tooltip on the field saying "Short label used in task lists, sidebar, and breadcrumbs" would close the loop.

**Meta row (`:457-509`).** Category, PI, status, stage, agenda — all `<InlineSelect>` / `<InlineAssigneePicker>`. ✓ matches Phase 38 T-18 spec. **BUT:** the header `<InlineSelect value={project.stage}>` at `:486-490` writes via `toApiStage(val)` directly with no confirmation modal — while the stage strip below (`:1232-1289`) routes through `handleStageClick` → `confirmStageChange`. Two stage editors, two different commit flows. Pick one. The rule of thumb is: header pill = quick edit (no confirm); strip = "ceremonial" (confirm). If that's intentional, document it in a tooltip; if it isn't, unify on confirm for a stage move (the strip is right — stage is a heavyweight transition that other team members will interpret signal from).

**No CategoryIcon.** Rule 29 prescribes `<CategoryIcon>` (lungs/flask/heartbeat/cap) for category indicators. The header uses a bare `<InlineSelect>` with text labels. The lab's signature visual primitive is missing on the page that most needs it.

**Quick stats strip (`:512-539`).** 4 inline pills (active / overdue / done / last activity) at 10px size. All within 0.7-1.0 opacity, all using semantic colors (teal / maroon / green / slate) — but stacked horizontally next to the meta row which already shows category + PI + status + stage. **The header is now 3 lines of pills**: title row, meta row, stats row. That is a lot of visual chrome for someone whose primary intent is "open the next task." Consider folding stats into the Open Tasks header label at `:691-695` (e.g., "Open Tasks · 12 · 3 overdue").

**No archive/delete/duplicate menu.** This is a known gap. Project lifecycle actions (archive when shipped, delete when wrong, duplicate-from-template) are in the API (`projects.ts` cascades per Rule 22) but have **zero UI surface on the detail page**. The ellipsis menu next to the copy-link / watch / presence cluster is the natural home.

### 2.2 Overview landing card (`:670-1058`)

**The 2-col grid is correct (Rule 50).** `grid-cols-1 md:grid-cols-3` with `md:col-span-2` left + `md:col-span-1` right is the documented shape. Mobile collapses to single col. ✓

**Left column — Open Tasks (`:684-752`).** Always visible, `+ Add task` always present, "View all →" appears at `>3` tasks (`:705-713`). Empty state shows muted "No open tasks. Add one." with inline link. Sort is by `due_date` ascending with sentinel `'9999-12-31'` (`:732-735`) — fine but the user can't see the sort or change it. Slice at 5 (`:737`) is fine for a landing card. **TaskCard** is reused (good — single component for the row).

**Right column — Key Links (`:758-782`) + Recent Activity (`:784-849`).**
- Key Links calls `KeyLinksEditor` with the 3-slot project schema. Inline edit, click-to-copy for non-http, classifyUrl wired. ✓ matches Rule 47.
- Recent Activity merges `projectUpdates` + `projectComments`, sorts desc, slices 3 (`:224-235`). Click routes to the appropriate tab (`:818`). The dot color (teal=note / gold=comment) works as a glanceable kind indicator. **Tooltip uses `dt.toLocaleString()`** at `:827` — that returns the user's local format, which on a multi-machine team is fine, but a lot of `formatRelativeTime`-style "2h ago" tooltips elsewhere on the page already exist. Use `formatRelativeTime` for the visible label and full timestamp only on hover.

**Bottom — Quick compose (`:853-1057`).**
- Tab toggle (Note / Comment) at `:914-939` uses raw colored backgrounds (teal-solid for note, gold for comment). Tab-bg color is the type encoding — but it's also the same encoding as the rest of the app (teal=note, gold=comment on Recent Activity dots). ✓
- 3 toolbar buttons (Paperclip / @ / smile) at `:957-994`: paperclip works (file picker + drag + paste image), `@` and `:` are literal `appendCharToInput` calls. **They are NOT real mention/emoji pickers** — they just type the character at the cursor. SmartCompose has the right shape (real mention, real emoji palette) and is used in TodayPage drawer. **The Project compose surface is decorative on @ and emoji** — Phase 38 closed Issue 8 by shipping SmartCompose, but ProjectDetail's bottom compose still uses `appendToCompose('@')`. This is a regression vs. SmartCompose-the-component.
- Cmd+Enter to send (`:1019-1024`), drag-drop file → uploadToCompose (`:945-950`), paste image (`:1010-1018`). All work. Send button only visible when text non-empty (`:1038-1051`). ✓
- TypingIndicator below (`:1056`). ✓

**Mobile BottomSheet (`:857-911`).** Trigger button at `:858-882`, fixed-position backdrop at `:884-893`, sheet at `:899-911`. The sheet slot is the **same div** as the desktop inline compose — its style flips between fixed-bottom and inline based on `isMobile && composeSheetOpen`. Cute trick, but **the slot element is inside a `motion.div`** (the landing card at `:670`), and Framer Motion may apply `transform` to its child during enter/exit, which CSS spec says creates a new containing block for `position: fixed`. In practice the landing-card animation only fires once on mount (`:671-673`) so by the time the user opens the sheet there is no active transform. Safe today, fragile if anyone adds re-animation. **Move the sheet portal to `<body>` via createPortal** to make the contract explicit.

### 2.3 Tab system (`:634-664`)

8 tabs in a single horizontal strip. Active state = teal text on `var(--teal-active)` bg pill (`:653-655`).

**Bugs and gaps:**
- **No URL write-back.** `setActiveTab(tab.id)` at `:651` updates state but never `history.replaceState({}, '', '?tab=...')`. Result: deep-link works on first load (`:136-141`) but breaks on tab change. Refresh after switching tabs returns to Overview.
- **No keyboard nav.** No `role="tablist"`, no arrow-key cycling, no Home/End. WCAG 2.1 calls for tab keyboard navigation.
- **No counts on Comments / Files / Activity / Literature.** Tasks (`:641`), Notes (`:642`), Revisions (`:646`) show counts. The other 5 don't, even though `projectComments`, file attachments (via `useQuery`), and `papers` are all queryable. Inconsistent.
- **Tab strip overflow.** Mobile `overflow-x-auto` works (CSS at `:1797-1804` hides scrollbar) but there's **no scroll affordance** — no fade-out at the right edge, no chevron arrows. Users on a narrow phone have no signal that 4 tabs are off-screen.
- **No tab-content lazy loading.** Every tab's data hooks are mounted at the top of `ProjectDetailInner` (`:151 useTasks`, `:148 useRevisions`, `:130 useProjectUpdates`, `:131 useComments`). On first paint, the page fires 4+ network requests even if the user never leaves Overview. Acceptable for 19 users but not free.

### 2.4 Tasks tab (`:1646-1745`)

**Does NOT inherit TaskGridView.** Renders `TaskCard` rows in a flex column with a custom selection checkbox. Rule 17 says Tasks pages use columnar `TableContainer + ColumnHeader`. ProjectDetail's Tasks tab is a card stack — explicitly violates the data-pages-vs-dashboard taxonomy.

**Filter pills (`:1650-1670`).** All / Active / Done / Blocked. Self-hiding when `count === 0` for non-`all` (`:1652`). Good defensive empty-state.

**Multi-select + BulkActionToolbar wired (`:1707-1719`, `:1737-1743`).** ✓ Snooze / complete / assign / priority / delete all flow through `handleBulkAction`.

**Copy task list to clipboard (`:1672-1683`).** Markdown-formatted, `[ ] title (due 2026-04-30)`. Nice. But **no toast confirmation** after copy — silent. Rest of the app uses `showSuccess('Copied')`.

**Empty state (`:1696-1702`).** CheckCircle2 icon + per-filter copy. ✓

**Inline task field editing — none.** TaskCard isn't inline-editable on this page. To change priority/due_date/assignee, click the row → drawer → edit there. That's fine for the 5-row landing-card preview, but on the Tasks **tab** the user is signaling "give me the task management surface." They expect inline editing. The columnar TaskGridView used on `/portal/tasks` does this. Reusing it here (filtered by `project_id`) is the obvious cleanup.

### 2.5 Notes tab (`:1597-1619`)

Embeds `<ProjectUpdateFeed>`. Notes-vs-Comments explainer banner at the top (`:1599-1614`) — non-dismissible despite the comment claiming "dismissible one-time banner" at `:1599`. **The banner has zero dismiss UI; it shows on every tab visit forever.** That's churn.

`ProjectUpdateFeed` (`/components/ProjectUpdateFeed.tsx`):
- 4 type pills (progress / blocker / result / question). No `'session'` type despite CLAUDE.md Phase 27 noting 5 types. Source-of-truth drift.
- Uses `<MentionInput>` ✓
- Reactions wired via `<ReactionBar>` ✓
- **Does NOT use SmartCompose.** SmartCompose is the new shared compose component; ProjectUpdateFeed predates it and was not migrated. Two compose paradigms in the same product.
- `getPersonInfo(update.author)` at line 151 — if the author slug is unknown, returns `{name: 'Unknown'}` literally. Rule 48 says that's intentional drift signal. ✓

### 2.6 Comments tab (`:1622-1626`)

Embeds `<ProjectComments>`. Hermes detection at `comment.author_slug === 'claude-ai'` (`ProjectComments.tsx:159`) → renders `<HermesResponse>` in gold-bg card with `<HermesMark>` avatar. ✓ matches Rule 29 + CLAUDE.md Hermes section.

**Bugs:**
- **Author display falls back to `comment.author_name` raw, not `getPersonInfo`.** Lines 213, 228 use `comment.author_name || 'User'` / `'Team Member'` — but the Notes feed uses `getPersonInfo(update.author).name`. Inconsistent. If a comment came in with `author_slug='nick-ingraham'` but `author_name=null`, the comment shows "Team Member" instead of "Nick Ingraham."
- **Initials computed inline** (line 214): `(comment.author_name || 'U').split(' ').map(n => n[0]).join('')` — `getPersonInfo()` already provides this. DRY violation.
- **No reactions on Hermes comments above the gold card** — `<ReactionBar>` is rendered (line 206) but it sits **outside** the gold card div, so visually it floats. Compare to non-Hermes (line 251) where it's inside the comment block. Looks like an oversight, not a design choice.

### 2.7 Files tab (`:1629-1642`)

Single `<FileUpload entityType="project" entityId={project.slug} />` (`:1637`). ✓ matches Phase 36c entity_type='project'.

**Issues with FileUpload itself:**
- File list (`FileUpload.tsx:170-202`) shows filename / size / Download / Delete. **No uploader name, no timestamp.** Both fields exist in the data (`uploaded_by`, `created_at`) but are never rendered. For a 19-person team where "who uploaded the IRB.pdf?" matters, this is a known omission.
- Delete is destructive with **zero confirmation**. Rule 8 (optimistic + 5s undo) — `deleteMutation` runs on click, no `showUndo`. Cf. file deletion is hard to undo because R2 lifecycle rules may have already started.
- No file preview. Image PNG/JPG and PDF upload but never thumbnail. Compare to Hub Notes which inlines images via markdown.
- Drop zone is the only upload entry and is nested **inside** a `var(--ice)` card with another 8px-margin-top hint paragraph below (`:1639-1641`). The hint says "Attachments are stored on R2 and searchable via the Search page" — true but most users don't need to know R2 exists. Strip the implementation detail.

### 2.8 Activity tab (`:1763-1765`)

Renders `<ProjectActivity>`. **Surprise: ProjectActivity isn't a merged feed.** It's a vertical stack of `<ProjectDecisions>` + `<ProjectDependencies>` + **another `<ProjectUpdateFeed>`** (line 59) + **another `<ProjectComments>`** (line 64) + Action Items. Notes and Comments render in TWO places — the Notes/Comments tabs AND inside the Activity tab. That's a duplicate-feed bug.

Worse: **there is no temporal merge.** The CLAUDE.md spec says Activity is "merged temporal feed (notes + comments + task changes + system events)." The actual implementation is 5 disjoint sections stacked vertically. No sticky day headers (round-5 T-22). No system events at all (no "Nick changed stage to Writing" entries). For a research project, the Activity tab should be the **audit log** — that's its job. Right now it's a kitchen-sink rerender of three other tabs.

Action Items section (`ProjectActivity.tsx:67-192`) is the only thing unique to Activity. The others should move out.

### 2.9 Revisions tab (`:1747-1760`)

Embeds `<SubmissionTimeline>` (Phase 25 schema-v26) + `<RevisionTracker>` (Phase 25 schema-v23). Two card panels stacked. ✓ matches the spec. No 1-card "no submissions yet" zero state — both render their own. Visually OK but feels like 2 mini-apps rather than 1 cohesive revisions story.

### 2.10 Literature tab (`:1768-1770`)

`<ProjectLiterature>` — paper list, link by search OR DOI lookup via Crossref API (`ProjectLiterature.tsx:222-241`). Solid feature: DOI input → Crossref lookup → show preview (title/authors/journal/year) → confirm-create-publication-and-link.

**Issues:**
- Paper rows (line 68-157): no journal cover image despite CLAUDE.md saying "Shows journal cover." Either remove the line from the spec or add cover-fetch from the publication record.
- Unlink (line 142) is single-click, no confirm, no undo.
- "Link Paper" button (`:42-56`) is gated `isPi` — for a 19-person lab where `isPi` is rare, most users see a read-only literature list. That's deliberate per the gate, but the **empty state copy** at line 170 says "Link papers from the Research Digest" without explaining what that means or linking to it.

### 2.11 Key Links (covered in 2.2; KeyLinksEditor.tsx full read)

`KeyLinksEditor` itself is solid:
- 3-slot pad-and-collapse pattern (`:209-214 normalize`).
- Inline LinkRow with hover-revealed Edit/Trash buttons (line 92-109).
- Non-http click → clipboard + toast + fire-and-forget protocol nav (line 47-60). ✓ Rule 47.
- **Issue 1:** delete is single-click, no confirm. A 5-second undo toast on delete is the documented pattern (Rule 8); KeyLinksEditor calls `onSave(normalize(next))` directly with no undo path.
- **Issue 2:** when adding a new link, there's no way to drop a description-only label without a URL — the URL field is required (`canSave = url.trim().length > 0` line 125). Acceptable but limiting (e.g., "Awaiting Box folder permissions" placeholder).
- **Issue 3:** there's no reorder. The 3 slots are positionally fixed. If user added "Box folder" as slot 2 first, then "Drive" as slot 1, they can't swap. Drag-to-reorder OR up/down arrows is missing.

### 2.12 Live presence (covered above + `usePresence.ts`)

`usePresence` is well-designed:
- Single shared bus via `getRealtimeBus()` (Rule 52). ✓
- Self-excluded via `if (msg.slug === mySlug) return` (line 216).
- Explicit `presence-leave` on unmount (line 238-240). ✓ Rule 49 (r7 2026-04-24 fix).
- 15s heartbeat / 45s staleness. ✓
- `<PresenceAvatars>` returns `null` when slugs empty (`PresenceAvatars.tsx:42`). ✓ Rule 49.

**One subtle issue:** the presence "live" badge (PresenceAvatars:54-65) uses `var(--teal-active)` bg + `var(--teal)` text. With 1 viewer the visible text reads "viewing" — that's fine. With 2+ viewers it reads "2 viewing". **No name tooltip on hover for the dot itself**, only on the entire pill (line 56 `title={`${tooltipBase}: ${tooltipNames}`}`). On a phone there's no hover, so phone users see "2 viewing" with no way to know who. A long-press → bottom sheet listing names would close the gap.

### 2.13 State coverage

- **Empty Overview** (no tasks/notes/links/activity): Open Tasks empty card → "No open tasks. Add one." inline CTA ✓. Recent Activity → "No activity yet." ✓. Key Links → KeyLinksEditor's "Add a key link" dashed button ✓. **Strategic Context** card (`:1065-1181`) renders **only if `project.strategic_context || isPi`** — non-PIs on a project with no strategic context never see the section. That's correct (no clutter). PIs on an empty-context project get italic placeholder. ✓
- **Project with 100 tasks**: Open Tasks slices to 5 (`:737`), View all →. ✓ Tasks tab renders with virtualization? **No — TaskCard rows in flex column, no `useVirtualizer`.** 100 rows is fine; 600 (D1's count) on a single project is unlikely but not bounded.
- **Project deleted (cascade)**: `if (!project)` returns "Project not found" page (`:82-111`) — uses `<Link to={PATHS.projects}>` correctly. ✓ matches Rule 22 cascade behavior on the API side.
- **Manuscript-linked**: Revisions + Literature tabs cover it. No header indication that the project has manuscripts beyond a count badge that doesn't exist on those tabs.
- **Archived**: there's no archived state UI at all on this page. `project.status === 'Completed'` shows in the meta-row InlineSelect; that's it. No banner, no archived watermark, no "this project shipped on $date" hero.

### 2.14 Mobile

- BottomSheet compose works (`:884-911`).
- Tab strip horizontal scroll works (`:636 overflow-x-auto`) but no scroll-edge fade.
- Header pills wrap via `flex-wrap` (`:457`). ✓
- PresenceAvatars `limit=4` with `+N` overflow (`PresenceAvatars.tsx:43-44`). ✓
- Stage strip (`:1201-1290`) — flex-1 dots with absolute-positioned line. **Bug:** at narrow widths the connecting line breaks because the dots use `width:14-20px` while the labels are `whiteSpace:nowrap` (line 1282). With 7 stages on a 360px viewport, labels truncate or push the parent wider than viewport → horizontal scroll on the page.
- Strategic Context textarea (`:1107-1135`): `width: 100%` ✓, but the surrounding card has fixed `padding: 16px` and `marginBottom: 1.5rem` — fine, but on a 320px iPhone SE the textarea + buttons stack awkwardly because the action row at `:1136-1154` is a flex with no wrap.

### 2.15 Brand & token discipline

- **CategoryIcon missing.** Rule 29 prescribes CategoryIcon for the category indicator. Header uses bare InlineSelect text. **Fix:** prepend `<CategoryIcon category={project.category} size={14} />` to the InlineSelect (or render as a sibling).
- **Compound opacity violations check.** I scanned for parent opacity + child opacity multiplications. None found — most opacity adjustments are on terminal text spans. ✓ Rule 43.
- **Stage-fill tokens (Rule 41).** Stage strip uses `var(--gold)` for both past + current (`:1259-1265`). Fine — the gold flips correctly between modes. The progress fill at `:1225` also uses `var(--gold)`. ✓ The strip doesn't use `--stage-fill-*` because nothing here is a "white text on stage-color bg" surface.
- **`--gold-on-emphasis` (Rule 42).** Header agenda button at `:496-498` uses `var(--gold)` text on `var(--gold-active)` bg. Per Rule 42 this should be `--gold-on-emphasis` for AA in light mode (`#5a4518`). **Real bug.** Audit will catch it.
- **`#0f1923` literal (`:498`, `:622`, `:934`, `:1140`).** Hex-pinned dark text on gold buttons. Rule "On gold buttons" says use a literal dark color — `#0f1923` is the in-use literal. ✓ acceptable.
- **`#fff` via `var(--ink-bright, #fff)` (`:1045`, `:1687`, `:1718`).** White on teal-solid. ✓ Rule 14 (--ink-bright is white in both modes).
- **`var(--teal-active)`, `var(--gold-active)`, `var(--gold-emphasis)`, `var(--gold-hover)` all present.** Token discipline mostly correct.
- **Inline `style={{...}}` on EVERY element.** This is a feature (CLAUDE.md doesn't forbid it) but it makes diff review hard and prevents `:hover`/`:focus-visible` selectors. The page is 1813 lines, of which roughly 60% is style props. Extracting reusable styled components (LandingCardSection, MetaPill, StatPill) would cut size 30%+ and make hover states declarable.

### 2.16 Edge cases

- **Slug with parens.** `useParams()` handles them; `useProjects().find((p) => p.slug === slug)` matches. POST is sanitized server-side per Rule 21. ✓
- **Multiple PIs.** `<InlineAssigneePicker>` is single-select. The schema only stores one `pi`. Co-PI projects (CLIF + Mesfin's K23) can't represent both. That's a schema gap, not a UI bug — but the UI inherits the limitation silently.
- **Cross-cat (CLIF AND nate).** Same — single-select category. Schema gap.
- **Long title.** `<h1 fontSize: clamp(1.25rem, 3vw, 1.75rem) lineHeight: 1.2>` will wrap. ✓
- **Long key link URL.** KeyLinksEditor LinkRow uses `truncate` on the anchor (`KeyLinksEditor.tsx:82`). ✓
- **A user types `@` in compose.** It just inserts a literal `@` — does NOT open MentionInput's autocomplete because the textarea isn't a MentionInput. The Notes/Comments tabs DO use MentionInput — the landing-card compose does NOT. Inconsistent: same physical surface ("compose to project"), three different mention behaviors depending on the tab.

## 3. Findings

| ID | Severity | Surface | Issue | Proposed fix | Effort |
|----|----------|---------|-------|--------------|--------|
| PD-1 | High | Header | Header `InlineSelect value={project.stage}` (`:486-490`) bypasses confirmation modal that strip uses (`:1248-1272`). Stage moves are heavyweight. | Route header pill through same `setConfirmStage` flow. | S |
| PD-2 | High | Tab system | `setActiveTab` doesn't write `?tab=` to URL — deep-link breaks on switch. | `history.replaceState(null, '', `?tab=${id}`)` in handler. | XS |
| PD-3 | High | Activity tab | Renders `<ProjectUpdateFeed>` AND `<ProjectComments>` in addition to the Notes/Comments tabs — duplicate feeds, no merged temporal log, no system events. | Build a real `useActivityFeed(slug)` that merges notes + comments + task status changes + stage changes + assignment changes, sorted desc, with sticky day headers. Remove the embedded feeds from ProjectActivity. | M |
| PD-4 | High | Notes tab | "Notes vs Comments" banner is non-dismissible despite comment claiming otherwise. Shows on every visit forever. | LocalStorage `mnccore.banner.notes-comments.dismissed` + X button. | XS |
| PD-5 | High | Tasks tab | Rule 17 violation — Tasks tab renders TaskCard stack instead of columnar TableContainer. Inline editing missing. | Reuse `<TaskGridView tasks={projectTasks} />`. Cuts 80 lines. | M |
| PD-6 | High | Overview compose | Bottom compose toolbar `@` and `:` buttons are decorative (`appendCharToInput`), not real pickers. Rule 52 era SmartCompose has the right shape. | Replace bottom compose entirely with `<SmartCompose>` adapted for project entityType. | M |
| PD-7 | Medium | Header | No archive/delete/duplicate ellipsis menu. | Add `<DropdownMenu>` next to copy-link with these 3 actions, all routed through cascade-aware mutations. | S |
| PD-8 | Medium | Header | No CategoryIcon (Rule 29). | Prepend `<CategoryIcon>` to category InlineSelect. | XS |
| PD-9 | Medium | Header | Gold pill uses `var(--gold)` text on `var(--gold-active)` bg — Rule 42 says `--gold-on-emphasis`. | Swap token. | XS |
| PD-10 | Medium | Title | Title h1 not inline-editable; short_name is. Asymmetric. | Make h1 click-to-edit with same Esc/Enter/blur pattern. | S |
| PD-11 | Medium | Tab system | No `role="tablist"`, no keyboard nav. WCAG. | Add roles + arrow-key nav + `aria-selected`. | S |
| PD-12 | Medium | Tab system | No counts on Comments / Files / Activity / Literature. Inconsistent with Tasks/Notes/Revisions. | Add counts (data already loaded). | XS |
| PD-13 | Medium | Files | No uploader name + timestamp on file rows. | Render `getPersonInfo(uploaded_by).name` + `formatRelativeTime(created_at)`. | XS |
| PD-14 | Medium | Files | Delete has zero confirmation/undo. | Wrap in `showUndo` with 5s revival window. | S |
| PD-15 | Medium | Mobile | Stage strip overflows at <400px (7 nowrap labels + dots). | Truncate labels to 4 chars on mobile, full label as tooltip; OR collapse to a single dot+name showing current stage with a `Move →` button that opens a sheet. | S |
| PD-16 | Medium | Mobile | Tab strip has no overflow affordance (no fade gradient, no chevrons). | Add right-edge linear-gradient mask when scroll position > 0. | XS |
| PD-17 | Medium | Comments | `comment.author_name` raw rendering, not `getPersonInfo`. Initials computed inline. | Switch to `getPersonInfo(comment.author_slug)`. | XS |
| PD-18 | Medium | Comments | Hermes ReactionBar floats outside the gold card. | Move inside the gold card div. | XS |
| PD-19 | Low | Header | 3 stacked rows of pills + stats = visual chrome. | Fold stats into Open Tasks header label. | S |
| PD-20 | Low | Overview | Strategic Context, Stage indicator, Details card, Key Documents, InsightPanel, ConferencePrep all stack below the landing card on Overview tab. Two products. | Move everything below landing card into a "Project Settings & Insights" subsection accessible via a "More info" disclosure. Or split into a ProjectMeta sidebar on >1440w. | M |
| PD-21 | Low | KeyLinks | Single-click delete, no undo. | `showUndo` after `onSave`. | XS |
| PD-22 | Low | KeyLinks | No reorder. | Up/down arrow buttons or react-dnd. | M |
| PD-23 | Low | KeyLinks | Description-only entry impossible (URL required). | Allow desc with placeholder URL like `tbd:`. | XS |
| PD-24 | Low | Recent Activity | Tooltip uses `dt.toLocaleString()`; rest of app uses `formatRelativeTime`. | Standardize. | XS |
| PD-25 | Low | Tab system | Tab data hooks all run on first paint regardless of active tab. | Conditional hooks per tab — but React rules forbid. Real fix: split tabs into lazy-imported components. | M |
| PD-26 | Low | Files | Tab hint paragraph mentions R2 implementation. | Remove "stored on R2" — say "uploads up to 100MB; team members with access can download". | XS |
| PD-27 | Low | Mobile compose sheet | Sheet slot is inside `motion.div`; transforms could break `position:fixed`. | Move via `createPortal(sheet, document.body)`. | S |
| PD-28 | Low | Notes feed | `'session'` type missing despite spec. | Add to TYPE_CONFIG with magnifier icon + slate accent. | XS |
| PD-29 | Low | Header | No multi-PI / multi-category support. Schema gap surfaces silently. | Add explicit "+ Co-PI" affordance + a tooltip explaining "primary only" for now. | M |
| PD-30 | Low | Archive state | No archived/shipped UI. | Render banner above title when `status === 'Completed'`: "Shipped $date — read only". Make most fields visually disabled (not editable). | M |

## 4. Top 5 high-leverage enhancements

1. **Activity tab as the canonical audit log (PD-3).** Right now Activity is the most disappointing tab — it's the only place where ProjectDetail could be uniquely valuable for a research lab (when did stage change? who reassigned the task? what was the sequence of revisions?), and instead it's a dump of two other tabs. A real merged feed unlocks "show me the project history" use cases that currently force a database query. **High-impact, M effort.**

2. **Tasks tab inherits TaskGridView (PD-5).** This collapses a custom 100-line render into a 1-line embed and gives users the same column-resize / inline-edit / multi-select / saved-views experience they have on `/portal/tasks`. Reduces surface area and cognitive load. **High-impact, M effort.**

3. **Replace bottom compose with SmartCompose (PD-6).** Three compose surfaces on one page (landing + Notes tab + Comments tab) — three different `@` behaviors. SmartCompose is the documented answer (Rule 52, Phase 38 Issue 8). Killing the appendChar fakery removes a class of trust regressions. **High-impact, M effort.**

4. **Strip the Overview tab below the landing card (PD-20).** Strategic Context (PI-only when authoring), Stage strip, Details card, Key Documents, InsightPanel, ConferencePrep — none of these needed to live on the Overview after the landing card shipped. They're "old Overview." Move Stage strip up into the header pill (it's already there inline-edit), demote Details/Strategic Context/Key Documents to a "Project Info" disclosure or a sidebar on >1440w, move InsightPanel + ConferencePrep into their own tabs (Insights / Conferences). The Overview becomes one screen of decisions, not a vertical scroll. **High-impact, M effort.**

5. **Tab URL state + lazy data hooks (PD-2, PD-25).** Cheap, makes share links work, makes initial paint faster. Add `?tab=` write-back AND wrap each tab's data-fetching in a per-tab module behind `lazy()` so Notes/Comments/Files/Activity/Revisions/Literature data only fetch on first visit. **Cheap fix, S+M effort.**

## 5. Tab cohesion observations

The 8 tabs do **not** feel like one product. They feel like 8 mini-apps stitched together — and the stitching is loose:

- **Compose surfaces are inconsistent.** The Overview landing card has a 3-button pseudo-toolbar (paperclip works, @/: are decorative). The Notes tab has a 4-pill type selector + MentionInput + reactions. The Comments tab has MentionInput + reactions but no type pills. SmartCompose (the modern choice) is in TodayPage's drawer but not here. Users will assume "compose works the same everywhere"; it doesn't.
- **Author rendering is inconsistent.** Notes feed uses `getPersonInfo(update.author).name`. Comments feed uses raw `comment.author_name || 'Team Member'`. Recent Activity (landing card) uses `getPersonInfo(item.author).name.split(' ')[0]` (first name only). Three patterns for "who said this."
- **Counts are inconsistent.** Tab labels show counts on Tasks / Notes / Revisions — not on Comments / Files / Activity / Literature.
- **Empty states are inconsistent.** Open Tasks empty: "No open tasks. Add one." Recent Activity empty: "No activity yet." Notes feed empty: "No notes yet — post the first one to keep the team informed." Comments empty: "No comments yet — be the first to discuss this project". Action Items empty: "No action items linked to this project". Different voice, different tone. Pick one (probably the action-oriented "Add one" pattern).
- **Activity tab duplicates Notes/Comments.** As noted — same data rendered twice.
- **Files and Literature look like museum exhibits, not workflows.** Both are tables of attached records with a "+ Add" affordance. Neither has search, filter, sort, or linked-from-meeting context. This is fine for the launch state but signals "these tabs are afterthoughts."

The fix is **a tab contract**: every tab must (a) own its compose surface or have none, (b) use SmartCompose if it composes, (c) use `getPersonInfo` for any author render, (d) ship a count in its label if data is loaded, (e) ship an action-oriented empty state. Codify this as a `TabPanel` shared component with prop slots.

## 6. Brand & design-system observations

- **Token compliance is good** with the exceptions called out (PD-9 gold-on-emphasis, PD-8 missing CategoryIcon).
- **Inline-style heavy.** 60% of the file is style props. Costs no perf but costs auditability and prevents pseudo-state styling. Phase-style sprint to extract reusable styled atoms (LandingCardSection, MetaPill, EmptyHint, TabPanel, ProjectCard) would cut the file by 30-40%.
- **Animation vocabulary is consistent.** Most enter animations are `motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2-0.25 }}`. ✓ matches design-system 150-300ms range.
- **Stage strip animation is a layout-driven spring** (`motion.div layout` at `:1218`) which respects `prefers-reduced-motion` via Framer's global setting. ✓
- **No HermesMark on Hermes-authored notes.** The Comments tab handles Hermes specially (gold card + HermesMark avatar). The Notes tab does NOT — `getPersonInfo('claude-ai')` returns the generic mapping, but there's no special-cased UI. If Hermes posts a Note, it renders identically to a human note. Inconsistent special-casing.
- **HeartbeatLine / HeartbeatDivider absent.** Rule 29 — the lab's signature ECG motif — has no presence on the most-visited interior page. Could be the Stage strip (replacing the flat connecting line at `:1203-1213`), or a divider between tab strip and content.

## 7. Edge cases / failure modes

- **`useProjects()` hasn't loaded yet** → `projects=[]`, `find(...)` returns undefined, "Project not found" shows. False negative on slow networks. `useProjects` should expose `isLoading`; the page should render skeleton, not error, while loading.
- **`useTasks({ project: project.slug })` returns 600 tasks (D1 scale).** Open Tasks slices to 5; Tasks tab renders 600 rows in a flex column. Could push 100kb of DOM — measurable jank.
- **`d1Update.mutate({ stage })` fails (network or 400 from invalid `toApiStage`).** Optimistic update reverts silently. No error toast. Rule 35 documents this exact failure mode for stage changes; fix would be to surface an error toast on the mutation's `onError`.
- **`addComment.mutate` while offline.** TanStack Query's optimistic update succeeds; backend never receives. No retry, no surfaced error, no "saving..." indicator on the comment row.
- **Compose state not preserved across tab switches.** User types in landing-card compose, switches to Notes tab, switches back — `quickComposeText` is preserved (it's state on the parent), but the BottomSheet on mobile loses position context. Acceptable.
- **Real-time presence + offline + reconnect.** WS bus reconnects; presence broadcasts a fresh ping on `bus.onOpen` (`usePresence:211`). What if the user was offline for 5 minutes — staleness sweep would have already removed them from peers' state. Their first ping after reconnect re-adds them. ✓
- **Rapid tab switching while typing in compose.** State is preserved; broadcastTyping only fires when text non-empty. Switching tabs doesn't trigger a typing-stop broadcast — peers still see a typing indicator until TTL expires (5s). Edge issue but easy to fix: `useEffect` cleanup on `activeTab` change → `broadcastTyping(false)`.
- **Cross-machine tab sync.** Same user has the project open on home + work laptops. Both broadcast presence. PresenceAvatars should de-dup by slug — they don't. So Nick on two machines shows up as "+1 viewing" twice. Easy fix in `usePresence` aggregation: keep latest entry per slug.
- **Project delete from another tab** while user is on detail view. `useProjects` invalidates, `find()` returns undefined, "Project not found" replaces the page mid-edit. Loses unsaved compose draft. Should surface a "Project was deleted" toast and offer to recover the draft.
- **Stage `'Revisions'` change** — the canonical 7th stage. The header InlineSelect lists it (`:488 STAGES.map`), the strip renders it, `toApiStage('Revisions')` returns `'Revisions'` (passthrough). ✓

## 8. Open questions for PI

1. **Should the Overview tab be the project landing surface, or should it be more like a dashboard?** The current shape is "landing card on top, vertical scroll of legacy sections below." Two clean options: (a) Overview = ONLY the landing card + Strategic Context (everything else moves to dedicated tabs); (b) Overview = a 3-column dashboard at >1440w with landing card middle, Project Info sidebar right, Activity rail left.
2. **Notes vs Comments — is the distinction worth the explainer banner?** Notes are private progress logs (per banner); Comments are team discussion. After 6 months of dogfooding, do team members actually use them differently, or are they just two compose buttons? If usage data shows no signal, collapse into one feed with an optional "Mark as private note" toggle.
3. **Is the Tasks tab supposed to be a project-scoped TaskGridView, or intentionally simpler?** The card-stack render is friendlier on a phone but loses bulk inline editing. Survey usage: is Tasks tab a "see them" surface or a "manage them" surface?
4. **Activity tab ambition?** Should it become the audit log (every state change attributed to a person), or stay an aggregator of feeds? An audit log requires logging stage changes / PI changes / status changes — the API doesn't currently emit these to `activity_log` for projects. Decision needed before spec'ing PD-3.
5. **Multi-PI projects** (CLIF + collaborators). The schema is single-PI. Real research has co-PIs. Either expand schema (adds complexity) or document the convention (e.g., "primary PI in `pi`, co-PIs as `team[]`"). The page silently inherits the limit today.
6. **Archive UX.** When a project ships (status='Completed'), should the page change shape? Read-only watermark? "Shipped $date" banner above title? Currently nothing changes — a shipped project looks identical to a stalled one in the meta row.
7. **Files tab future.** Where does this go — light attachment store, or full-featured Box mirror with previews/permissions? The current state is "MVP attachment list" but Box folder convention via Key Links + URL classifier is also a project-files surface. Two paths converging.
8. **CategoryIcon and HeartbeatDivider on the most-visited interior page.** Rule 29 specifies these primitives; the page uses neither. Was that an explicit "keep it neutral" choice, or just an oversight in the GH-sweep era?
