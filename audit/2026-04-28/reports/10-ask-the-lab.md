# AskTheLab / Hermes Q&A — Deep Design + Engineering Audit

**Date**: 2026-04-28
**Agent ID**: `a30f082566ec3d9a3`
**Files reviewed**: `src/pages/portal/AskTheLab.tsx` (572 lines), `HermesMark.tsx`, `HermesResponse.tsx`, `SmartCompose.tsx`, `api/routes/questions.ts`, `api/routes/ai-requests.ts`, `src/lib/emailSlug.ts`

## 1. Executive read

- **The accept-answer feature is dead code.** `AskTheLab.tsx:366` gates the button on `userSlug === 'ningraha'`, but `ningraha` was scrubbed from D1 in the Phase 36b slug rename. Nick's actual canonical slug is `nick-ingraham` (per `emailToSlug` LUT). **Nobody can accept answers — the page can't transition `status: open → resolved` through the UI at all.** Compounding that, the server endpoint `POST /api/answers/:id/accept` (`questions.ts:209`) has zero authorization check, so anyone could call it via curl. Both halves of the rule are wrong: the UI gates on a value that's impossible, the server gates on nothing.
- **Hermes integration on this page is a primitive: not a coach, not @-mention assist, no live progress.** The `@hermes` invocation is a string-regex on the question body (`questions.ts:13`), the response inserts a literal placeholder string `"Thinking about this... (AI response pending)"` into the answers table, and the frontend has zero loading state acknowledging that's pending — it just renders that string verbatim as a Hermes answer. The 20–40s wait is invisible to the asker. The "AskHermes coach" referenced in CLAUDE.md (Round-5 T-35) doesn't exist anywhere in the codebase except the reference itself.
- **The whole page is decoupled from the post-Phase-38 design system.** It uses the old `--cream` cards, `var(--gold)` raw (not `--gold-on-emphasis` per Rule 42), no `HermesMark` brand polish on the placeholder, no `realtimeBus` subscription (Rule 52) so Hermes responses only appear after the next 60s `useQuestions` poll, and the answer textarea is a bare `<textarea>` instead of `SmartCompose` — meaning the CLAUDE.md doc claiming "@hermes works in Ask the Lab" is technically true at the regex level, but with no @-mention picker, no markdown, no file attach, and no Cmd+Enter affordance (despite the modal having Cmd+Enter — inconsistent within the same page).

## 2. Surface-by-surface walkthrough

### Page header (`AskTheLab.tsx:67–109`)
- Standard `PageHeader` with `<HelpCircle>` icon, "Ask the Lab" title, `${openCount} open question` subtitle, and a teal "+ New Question" button. Filter chips (All / Open / Resolved) plus a search input embedded in the header children slot.
- Header is solid. Two minor issues: (1) the icon is `HelpCircle` from lucide rather than `HermesMark` — strange given the page is now substantially "ask Hermes too"; the brand primitive that explicitly exists for AI surfaces is unused on the AI surface. (2) The button background is `var(--teal-solid)` even though Rule 59 says **gold = AI / user-driven action** for any Hermes-adjacent surface. Composing a question that often calls Hermes should plausibly be gold-accented; teal here weakens the rule.
- The search input has `style.color = var(--ink)` but no explicit `aria-label`, only the `placeholder`. axe will flag.
- `subtitle="${openCount} open question${openCount !== 1 ? 's' : ''}"` is computed from un-filtered `questions`, not `filteredQuestions`, so the count is correct but the subtitle won't update when the user filters by Resolved (the count still says "open"). That's actually fine per spec but reads as a bug to a user who flipped to Resolved and still sees "0 open."

### Question composer (modal, `AskTheLab.tsx:422–571`)
- **Modal is well-built mechanically:** focus trap, Escape, Cmd+Enter, autofocus, `aria-required`, label/htmlFor pairing on both selects (Rule 38 compliant). The submit-disabled hint with `aria-describedby` is genuinely a thoughtful detail.
- **But it's a textarea, not SmartCompose.** Three composer surfaces in the Hub are now SmartCompose (per Rule 55: ProjectDetail, TaskDetailPanel, MeetingDetail when desktop). The "Ask the Lab" composer — the *single page in the entire Hub where Hermes is the headline feature* — has no @-mention dropdown, no emoji, no file attach, no `MentionInput`. So when a user types "@hermes" the regex fires server-side but the UI doesn't validate or assist. Compare with `task-comments` and `project-comments`, both of which use `MentionInput` with @hermes appearing in the suggestion list.
- **No "Ask Hermes" toggle / explicit invocation.** The only way to invoke Hermes is to manually type `@hermes` in the question body (per CLAUDE.md). There's no checkbox "Also ask Hermes," no template, no preview of what Hermes will see as the prompt.
- **No tags / categories.** The question has only `project_slug` as a categorical hook — no tags (statistics / methods / data / writing / clinical), no question-type (how-to / discussion / decision-needed). This is the most-cited Stack Overflow primitive and it's absent.
- **No file attachment.** A research question often comes with a PDF, screenshot of an error, or a CSV. Inline file drop via R2 presigned URL is already implemented and shipped (Phase 38 SmartCompose) — it just isn't wired here.
- **Modal is 448px wide (`max-w-md`).** This feels cramped for a research question with 3-line context. Compare `CreateProjectModal` which uses `max-w-2xl`.
- **No draft persistence.** Close the modal mid-typing → input is gone. `localStorage.askTheLabDraft.v1` would take five lines.

### Question feed (`AskTheLab.tsx:111–132`, `QuestionCard:142–253`)
- Cards (not table). Per Rule 17 ("Data-pages vs dashboard-pages taxonomy"), this page is borderline. The list IS the primary content, so by GC-6 logic this should be a columnar table. Counter-argument: questions are narrative blobs with no other meaningful columns (you don't really need an Assignee column on a question). Calling this dashboard-style is defensible — but then the cards should be denser, and "click to expand" should be one of three depth levels (Pattern 3).
- **Card click expands inline** (no drawer, no detail page). One depth level. No keyboard accessibility — the chevron toggle is in a `<button>` so Enter/Space work, but there's no J/K navigation, no Space to peek. Inconsistent with Tasks/MyTasks/Projects which all support J/K (per Component Coverage matrix in CLAUDE.md).
- **Sort:** hard-coded to `created_at DESC` server-side (`questions.ts:83`). No "unanswered first," "most active," "by Hermes vs human." This is the canonical Stack Overflow set, and zero of them are exposed.
- **`expandedId` is a single-id state.** Open question A, click question B → A collapses. That's fine for one mode but no way to open multiple, no anchor-link support (`?question=<id>` would map nicely). Search results from Rule 51 unified search return question hits but the page can't scroll-and-open a specific one.
- **The expand boxShadow `0 0 0 1px var(--teal)` plus the same color border doubles the visual weight.** Either the shadow OR the border, not both. Looks chunky.
- **Project-slug pill** (line 207) uses `var(--gold-hover)` background + `var(--gold)` text. Rule 42 explicitly prescribes `--gold-on-emphasis` for gold-on-gold. This is one of the AA failures r7 was supposed to close.
- **Meta row** uses `opacity: 'var(--ink-label)'` (line 200) — `--ink-label` is a *value*, not a CSS custom property meant to drive `opacity`. This is a bug: `opacity: var(--ink-label)` resolves to `opacity: 0.55` only because `--ink-label` happens to be defined as a numeric token. If anyone changes `--ink-label` to anything string-y (`#some-hex`) it breaks. Also semantically wrong — the intent is "muted label color," not "55% opacity."
- **`formatRelativeTime`** is correctly imported, but there's no full timestamp on hover (HoverCard from Phase 20 not used). Fix: `<time dateTime={...} title={fullStamp}>`.

### Question detail / answers thread (`QuestionExpanded:257–417`)
- **Context panel** (line 289) renders in a gold-tinted block. Confusing — this is the asker's context, not Hermes's. Gold conflates with AI per Rule 59. Should be a quiet neutral or teal-subtle panel.
- **Answers loop** (line 306) branches on `author_slug === 'claude-ai'`. Good. Hermes branch uses `HermesMark` avatar + gold container — correct application of Rule 29.
- **Human answers** use `getPersonInfo()` correctly, plus `Avatar variant="gold"` (line 344) — wait, all human answer avatars are gold-variant. That fights Rule 59 (gold = AI) and shouldn't be a per-answer property at all. Should be the team-member's branded color or a neutral.
- **`is_accepted` check** is `=== 1` (line 354) on the human branch but `!answer.is_accepted` (line 366) on the accept-button branch. SQLite returns 0/1 ints, and the answer rendering elsewhere uses truthy checks — inconsistent typing handling that will bite if someone returns a boolean from a refactored endpoint.
- **Accept button** — the bug. `userSlug === 'ningraha'` is dead code. Even ignoring that, the gate should at minimum allow the asker (most Stack Overflow systems) plus an admin. Right now, with the bug, `status` can only become `resolved` via direct API call.
- **Answer submission form** (line 391) — bare `<textarea>` + Send button. No SmartCompose, no Cmd+Enter (inconsistent with the modal which DOES have Cmd+Enter), no @-mention. So a user posting an answer can't tag `@hermes` to follow-up — well, they can type it as a string and the regex (`questions.ts:13`) fires on submit, but again no assistance.
- **No reactions** on either question or answer. CLAUDE.md Rule 6 mentions ReactionBar (T-06 fix). Not used here. Inconsistent with task notes/comments.
- **Long-question case is ungoverned.** A 2000-character question with code blocks renders flat. No markdown, no code-block highlighting in the question body or answer body. `HermesResponse` does at least preserve `whiteSpace: 'pre-wrap'`; the human answer (`text-sm leading-relaxed`) does not, so a multi-paragraph answer gets line-collapsed by HTML.
- **No threading.** Answers are flat. No reply-to-answer, no quote-and-reply, no follow-up clarifications. For a "ask the lab" Stack Overflow analogue, this is the missing primitive.

### Hermes responses
- **Placeholder text is a literal string**: `'Thinking about this... (AI response pending)'` (`questions.ts:41, 156`). This is the answer row that gets rendered as Hermes's response until the listener replaces it. Three problems:
  1. **There's no visual distinction between "Hermes is working on it" and "Hermes finished."** Both render through the same `HermesResponse` block with the same gold background. The "pending" state should have a pulsing avatar (HermesMark already supports `pulse={true}`!), a typing-dot animation, or at minimum dim opacity + italic.
  2. **No timeout / failure state.** If `hub_ai_listener.py` is down (it runs on Nick's home laptop — see CLAUDE.md), the placeholder stays forever. There's no "Hermes hasn't responded in 5 minutes" warning, no retry button, no fallback to a human.
  3. **No real-time update.** When Hermes does reply (via `POST /api/ai-requests/:id/response`, which updates `lab_answers` content), the asker only sees it after the next 60s `useQuestions` poll **plus** they have to re-expand the question (which calls `useQuestionDetail`, 30s staleTime). Worst case: 90s before the user sees Hermes's actual response. `realtimeBus.subscribe(...)` would push it instantly. The bus exists (Rule 52) and isn't wired here.
- **`HermesResponse.tsx` is genuinely well-built** — `parseHermesContent` strips the trailing ` ```hermes` JSON fence and renders `findings` (operational metric pills) and `citations` (typed source pills). Good progressive enhancement: if Hermes returns plain prose, it renders as a paragraph; if Hermes returns the structured fence, the asker gets metric cards + source links. **But this whole capability is hidden** — there's no docs in the question composer hinting that "if you ask Hermes for a metric, it'll come back with structured findings." A `(?)` tooltip on the @hermes mention would expose it.

### Coach (T-35)
- **Doesn't exist.** Greps across `src/`, `api/`, and components for `AskHermes`, `coach`, `T-35` return nothing except the CLAUDE.md reference itself. Either the ticket got named-shipped without code (i.e. the feature was absorbed into something else and not documented), or it's still pending. Given CLAUDE.md says "shipped ~28 across 2 deploys" with the rest deferred or false-alarm, it's plausibly never built. Either way, the CLAUDE.md entry is misleading.

## 3. Findings table

| ID | Severity | Surface | Issue | Fix | Effort |
|----|----------|---------|-------|-----|--------|
| ATL-01 | **P0** | Accept button | `userSlug === 'ningraha'` — slug doesn't exist post-Phase-36b. UI dead. | Replace with `useAuth().isPi` flag (or check `userSlug === 'nick-ingraham'` as bare-min). Add server-side gate in `handleAcceptAnswer` that mirrors `isPiRequest`. | S |
| ATL-02 | **P0** | API | `POST /api/answers/:id/accept` has zero authorization check. Any authed user can resolve any question. | Add `if (!await isPiRequest(request, env)) return error('PI only', 403)` at top of `handleAcceptAnswer`. | S |
| ATL-03 | P1 | Hermes pending | `'Thinking about this... (AI response pending)'` literal string, no animation, no timeout, no retry. | Use `status` column on `ai_requests` to drive UI. Render `<HermesPending />` with `HermesMark pulse` + typing-dot when `lab_answers.content === 'Thinking…'` (or add `is_pending` flag). 5min stale → "Hermes is offline" with retry. | M |
| ATL-04 | P1 | Hermes delivery | No realtimeBus subscription. Hermes responses lag 60–90s after backend completes. | Subscribe to `realtimeBus` for `{type: 'ai-request-completed', source_id}` and invalidate `['question', id]`. | S |
| ATL-05 | P1 | Composer | Bare textarea — no @-mention picker, no `SmartCompose`, no `MentionInput`. Inconsistent with task/project comments where @hermes IS assisted. | Replace question + answer textareas with `MentionInput` + lighter SmartCompose variant (no taskId hookup needed; route to question/answer post). | M |
| ATL-06 | P1 | Composer | No tags / categories on questions. Filter is binary (Open/Resolved). | Add `tags TEXT` column (CSV) to `lab_questions`, render as multi-select chip input + filter pills. | M |
| ATL-07 | P1 | A11y | Project pill `var(--gold)` text on `var(--gold-hover)` bg violates Rule 42 (`--gold-on-emphasis` required). | Swap to `--gold-on-emphasis`. | XS |
| ATL-08 | P1 | A11y | Search input lacks `aria-label`. axe `select-name`-class flag. | Add `aria-label="Search questions"`. | XS |
| ATL-09 | P1 | Detail | Avatar on human answers uses `variant="gold"` — repurposes the AI accent. Conflates per Rule 59. | Use `variant="ice"` (already used in card meta row). | XS |
| ATL-10 | P1 | Detail | Answer body has no `whiteSpace: 'pre-wrap'`, so multi-paragraph human answers collapse. | Match `HermesResponse` styling on `<p>`. | XS |
| ATL-11 | P1 | Detail | Context panel (asker's context) uses gold tint — conflates with Hermes color. | Switch to neutral panel (`var(--surface-1)` + neutral border). | XS |
| ATL-12 | P2 | Realtime | `useQuestions` polls 60s. No version-bump invalidation hook. | Wire `useRealtimeSync(['questions'])` — already standard pattern. | XS |
| ATL-13 | P2 | Sort/filter | No "Unanswered" or "Awaiting Hermes" filter. Cannot find work-needed questions. | Add filter pill set: All / Open / Unanswered / Awaiting Hermes / Resolved. | S |
| ATL-14 | P2 | Composer | No draft persistence. Close mid-write → lost. | `localStorage.askTheLabDraft.v1`. | XS |
| ATL-15 | P2 | Composer | Modal `max-w-md` (448px) too narrow for a research question with context + project. | Bump to `max-w-2xl`. | XS |
| ATL-16 | P2 | Composer | Question textarea has no markdown / code-block support. | Tiptap `RichTextEditor` (already in Hub) or accept fenced ` ``` ` and syntax-highlight on render. | M |
| ATL-17 | P2 | Detail | No reactions on Q or A. ReactionBar exists in `task-updates`. | Embed ReactionBar in answer rows. | S |
| ATL-18 | P2 | Detail | No threading on answers (reply-to-answer). | Add `parent_answer_id` column + 1-level nesting. | M |
| ATL-19 | P2 | Detail | Answer form lacks Cmd+Enter (modal HAS it — inconsistent within same file). | Mirror modal's keydown handler. | XS |
| ATL-20 | P2 | UX | "Ask Hermes coach" referenced in CLAUDE.md doesn't exist in code. | Either ship a guided "improve my prompt" flow or remove the CLAUDE.md claim. | M (build) / XS (docs) |
| ATL-21 | P2 | UX | No HoverCard / full timestamp tooltip on `formatRelativeTime`. Standard Hub pattern. | Wrap meta with `<time dateTime title>`. | XS |
| ATL-22 | P2 | UX | No deep-link to single question (`?q=<id>` or `/portal/ask/:id`). Search results from unified search can't focus a specific question. | Read `?q=` from URL params on mount, set `expandedId`. | XS |
| ATL-23 | P2 | UX | Page is unreachable from sidebar AI accent; HelpCircle icon is generic. | Use `HermesMark` icon variant in `PageHeader`. | XS |
| ATL-24 | P2 | UX | Cards expand-only; no peek (Space) or full page (Enter). Pattern 3 prescribes 3 levels. | Add Space → peek, Enter → drawer. Optional. | S |
| ATL-25 | P2 | UX | `filterStatus` change re-fetches via React Query but doesn't reset `expandedId`. Stale expansion possible. | `setExpandedId(null)` in filter handler. | XS |
| ATL-26 | P2 | UX | "Resolved" filter still labels subtitle "0 open questions" — confusing read. | Subtitle should reflect filter state. | XS |
| ATL-27 | P3 | Style | `expanded` card uses border + boxShadow same color — visually doubled. | Pick one. | XS |
| ATL-28 | P3 | Style | `subtitle: ${openCount} open question${openCount !== 1 ? 's' : ''}` doesn't pluralize "0 open question*s*." JS truthy on 0 = false ≠ 1 ✓ — actually correct, ignore. | — | — |
| ATL-29 | P3 | Style | Status pill bg uses `--gold-active` / `--teal-active` (from `statusConfig`). These are *interaction-state* tokens, not bg-fill tokens. Use `--gold-emphasis` / `--teal-emphasis`. | Swap. | XS |
| ATL-30 | P3 | Code | `opacity: 'var(--ink-label)'` (line 200) abuses `--ink-label` as an opacity value. Brittle if token redefined. | Use `color: var(--muted)` (it's a hex bumped for AA per Rule on `--muted`). | XS |
| ATL-31 | P3 | Code | The `lab_answers` `content` field carrying placeholder string is conflated with real responses. Should be a discrete state. | Add `is_pending` or query `ai_requests.status` for matching `source_id`. | M |
| ATL-32 | P3 | Code | `useQuestions` has `staleTime: 60_000`, but `useQuestionDetail` is `30_000`. Detail polled twice as often. Fine, but undocumented. | Add comment or align. | XS |

## 4. Top 5 high-leverage enhancements

1. **Fix accept-answer + add server-side PI gate (ATL-01, ATL-02).** Two-line client fix, three-line server fix, restores the only state-transition path on the page. Ship in a minor PR today.

2. **Wire Hermes pending state + realtimeBus delivery (ATL-03, ATL-04).** This is the single biggest UX failure of the page. The asker types `@hermes`, sees a static "Thinking about this..." string, and has to refresh in 60s to find out if Hermes responded. Replace the placeholder string with a `<HermesPending />` component that pulses, shows elapsed time ("Hermes is thinking — 14s"), and listens on the realtime bus for completion. When the response lands, swap in `HermesResponse` with a 200ms cross-fade. This is what makes the page feel alive instead of forum-archived.

3. **Replace bare textareas with `MentionInput` (ATL-05).** Wire the same suggestion list that `task-comments` uses — `@hermes` becomes a tap-to-tag, type-ahead suggestion includes all 19 team members + Hermes. Removes the "Hermes is invoked by string regex" smell; aligns with Hub-wide compose pattern.

4. **Add tags + filters (ATL-06, ATL-13).** A 7-tag taxonomy (statistics / methods / data-access / writing / clinical / process / general) plus three new filter pills (Unanswered, Awaiting Hermes, Resolved-by-Hermes) turns this from a chronological log into a queryable knowledge base. Without tags, search (Rule 51) is the only way to retrieve a past question — and search returns questions *intermixed* with 13 other entity types, drowning the lab-Q surface.

5. **Build the Coach OR delete the claim (ATL-20).** A real "Coach" mode would: (a) ask the user one clarifying question before they post (e.g. "What have you tried? What was the outcome?"), (b) preview the prompt that will go to Hermes, (c) suggest tags. This is a 200-line modal at most, and it materially improves Hermes response quality (giving the listener better context). Alternative: remove from CLAUDE.md so it stops misleading future sessions.

## 5. Hermes integration observations (Hub-wide)

- **Hermes is invoked by `/@(hermes|claude)\b/i` regex in three surfaces:** `questions.ts:13`, `questions.ts:145` (question body), and `projects.ts` (per CLAUDE.md). Task comments also use the same regex. **The regex is duplicated, not centralized.** A single `parseHermesMention(text)` util in `src/lib/hermes.ts` (or `api/lib/hermes.ts`) would protect against drift. Right now if someone changes the trigger to also accept `@brain`, they'd need to grep four files.
- **Placeholder string is also duplicated** (`'Thinking about this... (AI response pending)'` appears verbatim at `questions.ts:41` and `:156`). Same centralization problem.
- **Hermes is a peer (`claude-ai` author_slug, listed in `src/data/team.ts`)**, and `Avatar slug='claude-ai'` correctly auto-swaps to `HermesMark` per Rule 29. This is good architecture — but the page-by-page surfaces don't all consume it. AskTheLab does the right thing on the answer branch. Other surfaces should be audited for whether `Avatar` vs raw `<HermesMark>` is consistent.
- **There is no Hermes home page.** Despite Hermes shipping 2026-04-09 and AskTheLab being the closest thing to a "talk to Hermes" surface, there's no `/portal/hermes` showing recent Hermes activity, popular Hermes responses, "Hermes's pinned answers," or Hermes settings (timeout, follow-up frequency, model choice). The only management surface for Hermes is `hub_ai_listener.py` config on Nick's laptop. For a 19-person lab where most people don't have laptop access, that's a black box.
- **Search covers `lab_questions` per Rule 51 (Search 14 entity types).** Good. But Hermes's *answers* — which are stored as rows in `lab_answers` with `author_slug='claude-ai'` — aren't a separate searchable type. So if Hermes wrote a great explanation 3 weeks ago, the only way to find it is to find the question. Adding `hermes_answers` as the 15th type (or filtering existing `task-comments` / `project-updates` for `author_slug='claude-ai'`) would make Hermes's accumulated knowledge actually searchable.
- **`ai_requests` table has `status` ('pending'/'completed'/'failed') but nothing in the UI ever surfaces it.** The placeholder answer is the only proxy. A "Hermes Activity" widget on the dashboard or sidebar could show pending count + recent failures.

## 6. Brand & design-system observations

- **Rule 59 (gold = AI / user-driven) is violated three places on this page**: teal "New Question" button (should be gold per AI-adjacent convention, or at least neutral), gold "context" panel for the *asker's* context (should be neutral), gold-variant Avatar on human answers (should be ice/teal).
- **Rule 42 (`--gold-on-emphasis` for gold-on-gold)** violated on project-slug pill (line 207) — uses `var(--gold)` text on `var(--gold-hover)` bg. AA fail.
- **Rule 29 (HermesMark for AI surfaces)** is honored in `QuestionExpanded` but ignored in `PageHeader` (uses `<HelpCircle>`).
- **Rule 47 (URL classification)** isn't relevant on this page yet — but if we add markdown support to question/answer bodies, we should route through `LinkifiedText` not roll our own.
- **Rule 38 (select labeling)** is honored on the Project select (line 529 `htmlFor`).
- **Rule 1 (content visible by default) + Rule 44 (transform-only mount animations)** — the AnimatePresence around `QuestionExpanded` (line 238) animates `height` and `opacity` together. `opacity: 0 → 1` on a colored panel mid-axe-run can trip false positives per Rule 44. Switch to `height` + `y` (slide-in feel), keep `opacity: 1` constant.
- **No `usePresence` / `useTyping` (Rules 49, 52)** on this page. For a research question, knowing "3 teammates are reading this right now" or "Nick is typing an answer" would be a meaningful collaboration signal, especially since most questions have 0 answers and the asker is wondering if anyone's looking.
- **No `usePageMeta` for OG share card** (Rule 31). Sharing a question link in Slack just gets the default OG. `/og/question/<id>` would render the question text + Hermes/answer count.

## 7. Edge cases / failure modes

- **0 questions:** Empty state is good (`'Ask the lab — or @hermes'`). CTA wired. Pass.
- **0 answers, status=open:** Italic "No answers yet. Be the first to help." — fine, but if the user typed `@hermes` and a placeholder answer exists, this branch never fires. So the empty state actually only shows when a question has no Hermes invocation and no human answer — a small slice.
- **1 question with @hermes pending:** Renders the placeholder string as a Hermes answer. No spinner, no elapsed time. If Hermes never responds (listener dead), the question shows "Hermes — 17 minutes ago — Thinking about this... (AI response pending)" forever. Critical UX failure.
- **Hermes returns the structured fence (`\`\`\`hermes`):** `HermesResponse` parses correctly, renders findings + citations. Good.
- **Hermes returns malformed JSON in fence:** `parseHermesContent` catches and falls back to plain prose. Good.
- **Hermes returns 5000 characters:** No truncation, no expand/collapse. Page becomes a wall.
- **50+ questions:** No virtualization. Page renders all of them as cards. Server returns all (no pagination, line 83). Will degrade ~200+ questions.
- **Long single question (1000 chars):** Renders flat in card header (`leading-snug` no max-height). Card becomes huge.
- **Code block in question:** No fenced-code parsing. ```` ```python\n... ```` shows as literal text.
- **User without `@hermes` who wants AI follow-up:** No way to invoke Hermes after the fact except editing the answer to add `@hermes`. There's no "Ask Hermes about this" button on existing questions or answers.
- **PI wants to mark question resolved without an accepted answer:** Impossible — the only way to set `status='resolved'` is via accept-answer endpoint which requires an answer. Need a separate "Close" action.
- **Asker withdraws question:** No delete affordance. `lab_questions` has no `deleted_at` column either. Permanent.
- **Asker edits typo:** No edit affordance.
- **Hermes response is wrong:** No "thumbs down" / "regenerate" / "Hermes was wrong, here's the correct answer." Single-shot generation, immutable.
- **Answer mentions a project that doesn't exist:** `LinkifiedText` not used; raw text. No 404 protection on hand-typed wikilinks.
- **`searchQuery` has special regex chars:** `.toLowerCase().includes(q)` is safe (substring, not regex). Pass.
- **Modal opened via `?create=true` URL but user is unauthenticated:** Modal opens, but on submit `useCreateQuestion → POST /api/questions` 401s. No toast wired for failure (`showSuccess` only on success).
- **Two users open the same question mid-typing answers:** No presence, no typing indicator, no conflict detection. Both submit, both appear, no merge.

## 8. Open questions for PI

1. **Authorization model for accepting answers** — should asker accept (Stack Overflow), PI accept (current intent), or both? Right now neither works.
2. **Should every question auto-invoke Hermes** even without `@hermes`? An "Also ask Hermes" checkbox defaulting on for some question types might be nice, but doubles AI cost.
3. **Tag taxonomy** — should tags be free-form (folksonomy) or curated (statistics / methods / data-access / writing / clinical / process / general)? Curated keeps the corpus searchable but adds friction.
4. **Resolution semantics** — does "resolved" mean "I got my answer" (asker-driven) or "PI signed off" (PI-driven)? They're different states. Stack Overflow conflates them; this matters for academic Q&A audit trails.
5. **Should Hermes be able to be the *only* answer required to mark resolved?** Right now `accept` works on any answer regardless of author. PI accepting Hermes's response as canonical is semantically loaded.
6. **Coach (T-35) — is it shipped, deferred, or canceled?** CLAUDE.md says Round-5 batch 1 shipped it; codebase says no. Need a definitive read for the CLAUDE.md update.
7. **Should AskTheLab be re-themed gold-first like Today's Right Now slot?** This is the page where Hermes IS the interaction. Currently it's teal-first with gold accents on AI rows; flipping to gold-primary would visually signal "this surface is the AI surface" the moment a user lands.
8. **Searchability of Hermes answers** — promote `hermes_answers` to a 15th search type? Or filter `lab_answers WHERE author_slug='claude-ai'` and surface them as "Hermes Knowledge"?
9. **Realtime answers** — should `realtimeBus` push every new answer to all subscribers (notification), or only for the question's asker (less noise)? Inform the broadcast scope.
10. **Editability** — Stack Overflow allows asker edits with audit trail. Lab Q&A in academic context: should the asker be able to revise their question after answers exist? After Hermes answers? The "edit context to clarify after Hermes misunderstood" workflow is real.
