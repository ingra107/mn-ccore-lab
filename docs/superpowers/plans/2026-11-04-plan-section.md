# Plan Section and Daily Re-plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Picks become real task cards in one Plan section on Today, pressing Plan rebuilds a fresh round of the desk, and the desk can be cleared by keyboard or thumb.

**Architecture:** The plan stays an answered `week_plan` row. A pure model in `src/lib/planSection.ts` decides who is in the section; `PlanSection.tsx` renders them through Today's `TaskRow` adapter. In PB, an open bookkeeping task means the round is unfinished; a closed one means the next press starts a new round, with card ids that carry the round.

**Tech Stack:** React 19, TypeScript, Vitest, Hono, D1 (Hub). Python, BrainDB, desk kit (PB).

**Spec:** `docs/superpowers/specs/2026-11-04-plan-section-design.md` (read with `2026-11-04-plan-session-design.md`, which this one overrides where they differ).

## Global Constraints

- No D1 migration. No new `mnccore://` verb. No widening of the PB key.
- `WEEK_PLAN_MIN_OPTIONS` = 1 and `MAX` stays 4, on both sides. Exactly one recommended per candidate still holds.
- `kept` is an optional `string[]` on the answer, each id a pick of that answer. A kept pick makes no `packet_prepare`, uses no cap and posts no week plan note. An old answer has no such field and behaves as before.
- Apart from the bookkeeping task and the Gmail link labels in Task 6, no work-task write before Nick approves the list. Silence is never approval.
- A recommendation is never preselected. A current pick shows as "In your plan: <step>", with no marked button.
- Commits: author ingra107, no attribution lines, path-explicit (`git commit -F <msg> -- <paths>`). Work on branches: Hub `plan-section`, PB `plan-section`, each in a worktree. Never deploy from a worktree. Never push PB to main before Task 9.
- Hub gates before a task is called done: `npx tsc -b --noEmit`, `npm run build`, eslint on changed files, plus `npm run test:api` on an api change. Date logic reads Chicago civil dates through `src/lib/time.ts`.
- A guard or gate refusal is reported to the controller, never overridden with a trailer. `week-plan-session/SKILL.md` sits under a byte budget (7,525 at last count): move detail into a sibling reference file instead of growing it past HEAD.
- `.claude/rules` and global doctrine are not edited by this work.

## Review Focus

Each has its test in the owning task.

1. A second round's desk where the first round's Send press still sits in the db: the new round must not read as sent (Task 3).
2. A daily re-plan with 7 kept started picks: no new prep requests, no cap use, no repeated note comments (Task 1).
3. Pressing Plan with unsent answers on the desk: every answer survives (Task 3).
4. A finished pick reopened from Done, or finished from another surface: it shows exactly once, in the right place (Task 8).
5. Typing digits or the letter n in a note on the desk: nothing is picked, focus stays (Task 5).

---

### Task 1: The answer's `kept`, and one-option candidates, on the Hub

**Files:**
- Modify: `shared/weekPlan.ts`, `api/lib/week-plan-start.ts`, `api/lib/task-question.ts`, `src/lib/weekPlan.ts`
- Test: `api/routes/week-plan.test.ts`, `src/lib/__tests__/weekPlan.withdrawn.test.ts` (or a sibling `weekPlan.kept.test.ts`)

**Interfaces:**
- Produces: `weekPlanKept(answer: unknown): string[]`, `weekPlanKeptError(answer, picks): string | null` in `shared/weekPlan.ts`; `WEEK_PLAN_MIN_OPTIONS = 1`.
- Produces: `weekPlanNewlyStarted` and `weekPlanNotes` both skip kept ids.

- [ ] **Step 1: Write the failing tests** through the real worker, in `week-plan.test.ts`:
  - `kept_started_picks_make_no_request_and_use_no_cap`: first answer with three `start:true` picks, two in `kept`: exactly one `packet_prepare` row; daily count rises by one.
  - `kept_pick_text_posts_no_note`: a kept pick with text adds no `activity_entries` row; an unkept one still does.
  - `kept_naming_a_non_pick_is_refused`: 4xx with the error named.
  - `kept_is_frozen_across_a_start_flip`: flipping a saved pick leaves `kept` unchanged, and changing `kept` in a flip is refused.
  - `one_option_candidate_is_accepted`; `zero_option_candidate_is_refused`.
  - `an_answer_with_no_kept_behaves_as_before`.
- [ ] **Step 2: Run** `npm run test:api -- week-plan`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror how `withdrawn` is parsed, validated and frozen, including `weekPlanFlipError`. Update comments saying "2-4".
- [ ] **Step 4: Run** the same tests, then `npm run test:api` and `npm run test:lib`. Expected: PASS.
- [ ] **Step 5: Commit** on Hub branch `plan-section`.

### Task 2: `kept` and one-option candidates in PB

**Files:**
- Modify: `scripts/questions/state.py` (and `scripts/questions/spec.py` if it holds a parallel rule), `scripts/planning/week_plan.py:69`
- Test: `tests/questions/test_state.py`, `tests/planning/test_week_plan.py`

**Interfaces:**
- Consumes: Task 1's rules, one for one.
- Produces: `week_plan.MIN_OPTIONS = 1`; `state.py` accepts and freezes `kept`.

- [ ] **Step 1: Write the failing tests:** `test_kept_parses_and_must_name_a_pick`, `test_kept_is_frozen_across_a_flip`, `test_one_option_candidate_is_valid`, `test_zero_option_candidate_is_refused`.
- [ ] **Step 2: Run** `python -X utf8 -m pytest tests/questions/test_state.py tests/planning/test_week_plan.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement**, and update `check_options` and `_publishable` docstrings that say 2-4.
- [ ] **Step 4: Run** `tests/planning tests/questions`. Expected: PASS.
- [ ] **Step 5: Commit** on PB branch `plan-section`.

### Task 3: Rounds on the desk

**Files:**
- Modify: `scripts/planning/plan_session.py`, `.claude/skills/week-plan-session/template.py`
- Test: `tests/planning/test_plan_desk.py`, `tests/planning/test_plan_session.py`

**Interfaces:**
- Produces: `Brief.round: int`, `Brief.new_round: bool`; `card_id(task_id: str, round: int) -> str` returning `t-<task id>-r<round>`; `fixed_id(base: str, round: int) -> str` for `prep-these`, `add-today`, `add-something`, `send-plan`; `round_path(desk) -> Path` (`week-plan-<W>.round.json`, holding `{"round": n}`, committed with the desk); `ps build --start-over`.
- Rule: a desk file with this week's bookkeeping task **open** is the current round. A desk file with **none open** starts round n+1 and rebuilds every card. No desk file: round 1. `DESK_ELSEWHERE` is unchanged. `--start-over` moves to n+1 whatever is open.

- [ ] **Step 1: Write the failing tests:**
  - `test_a_closed_bookkeeping_task_starts_a_new_round`, `test_an_open_bookkeeping_task_keeps_the_round`.
  - `test_a_new_round_does_not_read_the_old_send_press`: answers holding `send-plan-r1` approved, capture on round 2 raises `NotSent`.
  - `test_old_round_answers_are_not_on_the_list`: `t-x-r1` answers make no op and no "no longer on the desk" line on round 2.
  - `test_unsent_answers_survive_a_press_of_plan`: same round rebuild keeps ids, keys and saved steps.
  - `test_start_over_moves_the_round_with_answers_unsent`.
  - `test_every_fixed_card_id_carries_the_round`.
  - `test_a_half_applied_round_stays_current`: a partial apply leaves the task open, and the next brief keeps the round.
- [ ] **Step 2: Run** `pytest tests/planning/test_plan_desk.py tests/planning/test_plan_session.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** A new round replaces saved steps: `build_desk` ignores the sidecar when `new_round` is set. `capture` reads only the current round's ids, and its `gone` scan ignores ids of other rounds. The desk's storage key stays one per week. A new round's bookkeeping is a new task from `ensure_bookkeeping`, as a closed one is not found.
- [ ] **Step 4: Run** `tests/planning`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: Keeping current picks

**Files:**
- Modify: `scripts/planning/plan_session.py`, `.claude/skills/week-plan-session/template.py`
- Test: `tests/planning/test_plan_session.py`, `tests/planning/test_plan_desk.py`

**Interfaces:**
- Consumes: Task 1's `kept`, Task 3's rounds.
- Produces: `current_picks(offers: list, week_start: str) -> dict`, `{task_id: {"option": {...} | None, "text": str | None, "start": bool}}`, read from the newest answered offer of the week, open tasks only; `Brief.cards[n]["current_pick"]`; a `keep` op kind or a `pick` op with `new["kept"] = True`; reserved key `keep` in `RESERVED_KEYS`.

- [ ] **Step 1: Write the failing tests:**
  - `test_every_open_pick_has_a_card_even_past_the_candidate_limit`.
  - `test_a_card_left_alone_keeps_its_pick_and_step`, and the list line reads `Stays: <title>: <step>`.
  - `test_a_note_on_a_kept_card_keeps_it_and_adds_the_comment`.
  - `test_not_this_week_withdraws_a_current_pick`; `test_a_fresh_step_replaces_a_current_pick`.
  - `test_kept_published_under_key_keep_with_its_old_step`; `test_free_text_pick_keeps_its_text`.
  - `test_kept_ids_ride_the_answer`: `apply` sends `kept` with started and saved kept picks, and `start` is what it was.
  - `test_all_keep_publishes_nothing_and_says_so`, and closes the bookkeeping task.
  - `test_prep_on_a_kept_saved_pick_starts_it`: Prep these on a kept unstarted pick, no live packet: `start:true`, not in `kept`.
  - `test_the_card_says_in_your_plan_and_marks_no_button`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The `keep` option is prepended to the card's published options only when the current pick has one; it is `recommended` only if no fresh step is. On the desk, the kept step is not a button: the summary and a line read "In your plan: <step>".
- [ ] **Step 4: Run** `tests/planning`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Tap and keyboard on the desk, and the first-step rule

**Files:**
- Modify: `.claude/skills/working-desk-artifact/assets/desk_flow.js`, `desk_cards.py`, `.claude/skills/working-desk-artifact/SKILL.md` (one line), `.claude/skills/week-plan-session/template.py`, `.claude/skills/week-plan-session/SKILL.md`
- Test: `tests/skills/test_desk_choice_cards.py`, `tests/planning/test_plan_desk.py`

**Interfaces:**
- Produces: page attribute `data-flow="tap"`, set by `dc.page(..., tap=True)`, default off. Under it, on the open one-pick card: `1`-`9` picks that option and moves on, `n` picks the option with value `not_this_week`, Enter moves on from a card with a pick. A click or tap on an option does the same. Keys do nothing while focus is in an input, textarea or editor. Multi cards and Send keep their button.

- [ ] **Step 1: Write the failing tests.** Follow how `tests/skills/` drives the kit. Pin: `test_tap_flow_is_off_by_default`, `test_the_plan_desk_sets_tap_flow`. In a real browser check at Step 4, not a stub: digits and `n` typed in a note change nothing.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse `openNext` and the card's `.mark` so a picked card rolls into Done in To do now. Show each option's number as a small hint under `data-flow="tap"`. In the skill: *"Write the one next step. Add others only if the threads show a real fork in what to do."*; Stay within the byte budget.
- [ ] **Step 4: Verify in a browser.** Build a sample desk to a local file and drive it with Claude in Chrome: pick by digit, `n`, Enter, a click, and typing in a note. Save what was seen in the report.
- [ ] **Step 5: Run** `tests/skills tests/planning`. Expected: PASS, and no other desk's fixture changes.
- [ ] **Step 6: Commit.**

### Task 6: Links: same icons on the desk, and fixing labels

**Files:**
- Modify (Hub): `src/components/today/primitives.tsx`, `src/lib/linkIcon.ts`
- Modify (PB): `.claude/skills/working-desk-artifact/assets/desk_cards.py`, `.claude/skills/week-plan-session/template.py`, `scripts/planning/plan_session.py`, `.claude/skills/week-plan-session/SKILL.md`
- Create (PB): `.claude/skills/working-desk-artifact/assets/link_icons.json`
- Test: `src/components/today/primitives.test.tsx` (create if absent), `tests/planning/test_plan_session.py`, `tests/planning/test_plan_desk.py`

**Interfaces:**
- Produces (Hub): `linkTypeFor(url: string, desc?: string | null): string | null` in `linkIcon.ts`: a Gmail URL whose description matches `/gmail draft/i` is `gmail_draft`; otherwise what `normalizeLink` says. `LinkRow` uses it.
- Produces (PB): `Brief.cards[n]["links"]`, the task's key links; `dc.link_row(links)`, using `link_icons.json` (`{type: {"icon": <lucide name>, "svg": ..., "tint": ...}}`), with the same description rule; `ps fix-link <task> <slot>`, `gmail_label(url, lookup) -> "Gmail draft" | "Gmail thread" | None`.
- Writer: `db.update_key_link(task_id, slot, description=...)`, the only door to these fields (`scripts/db/query.py:6277`). Op kind `link_fix`, status `applied`, listed by `describe` as `Fixed: <title>: "<old>" -> "<new>"`.

- [ ] **Step 1: Write the failing tests:**
  - Hub: `a_thread_url_described_as_a_draft_gets_the_draft_icon`; `a_thread_url_with_no_description_stays_a_thread`.
  - PB: `test_the_label_comes_from_the_lookup_never_from_an_argument` (no parameter takes a new label); `test_a_thread_holding_a_draft_label_is_a_draft`; `test_an_unreadable_lookup_changes_nothing`; `test_only_key_link_desc_is_written`; `test_a_non_gmail_link_is_refused`; `test_a_fix_is_listed_as_done_and_apply_skips_it`; `test_the_card_shows_the_tasks_links`.
  - Parity: `test_link_icons_match_the_hub`, in the style of `test_the_hub_names_the_same_lanes`, comparing icon names against Hub `origin/main` `src/lib/linkIcon.ts`, and skipping when the Hub isn't available.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The lookup runs `python -X utf8 -m scripts.utils.gws gmail thread <id>` and reads `labelIds` for `DRAFT`; confirm the output shape first. Fixes made before capture wait in `data/plan_submissions/link-fixes-<W>.json`, and capture folds them into ops. A file link on the desk keeps the kit's `.docx`/`.pdf` rule.
- [ ] **Step 4: Run** the Hub gates, `tests/planning` and `tests/skills`. Expected: PASS.
- [ ] **Step 5: Commit each repo.**

### Task 7: Watching for Send

**Files:**
- Modify: `.claude/skills/week-plan-session/SKILL.md`, and a reference file beside it if the budget needs one
- Test: `tests/planning/test_plan_desk.py`

**Interfaces:**
- Consumes: Task 3's `fixed_id("send-plan", round)`.
- Produces: `ps send-state --answers <file>`, printing `sent` or `waiting`, read-only, with exit 0 for both.

- [ ] **Step 1: Write the failing tests:** `test_send_state_reads_only_this_rounds_press`, `test_send_state_is_waiting_on_empty_answers`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement, and write the skill's step:** after the publish, start a background `sleep 60`; on each wake read `answers` and run `send-state`; repeat up to 30 times; on `sent` go to Capture without being asked. After 30 say "I stopped watching. Tell me when you've sent it." A message from Nick at any point takes priority.
- [ ] **Step 4: Run** `tests/planning`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 8: The Plan section on Today

**Files:**
- Create: `src/lib/planSection.ts`, `src/components/today/PlanSection.tsx`
- Modify: `src/pages/portal/TodayPage.tsx`, `src/components/today/TaskRow.tsx`, `src/lib/weekPlan.ts`, `src/components/today/AgendaListView.tsx`, `src/index.css`
- Delete: `src/components/today/ThisWeekSection.tsx`, `src/components/today/PlannedTodaySection.tsx` (keep their tests' assertions by moving them)
- Test: `src/lib/__tests__/planSection.test.ts`, `src/components/today/PlanSection.test.tsx`, and a real-page Today test

**Interfaces:**
- Produces: `planSectionModel(plan: AcceptedWeekPlan | null, tasks: TaskRow[], planned: Record<string, unknown>, today: string): { today: TaskRow[]; picks: TaskRow[]; done: TaskRow[]; ids: Set<string> }`. `ids` is what leaves the task sections and Completed today. Order: planned for today in rank order; other picks in plan order; done last.
- Produces: `currentWeekPlan` with no `earlier`; `AcceptedWeekPlan.withdrawn` stays.
- Consumes: Today's `TaskRow` adapter, with new optional props for the Today tag, first step line, packet tag and Prep / Prep & start actions; no fork of the row (Rule 68).

- [ ] **Step 1: Write the failing tests:**
  - Model: `a_pick_is_in_the_section_once`; `a_planned_non_pick_is_tagged_today`; `a_done_pick_stays_until_a_newer_plan`; `a_done_pick_stays_over_a_day_with_no_replan`; `a_done_non_pick_leaves_when_its_day_ends`; `a_reopened_done_pick_returns_to_its_place`; `a_new_week_is_empty`; `no_plan_holds_only_todays_planned`; `sunday_evening_with_next_weeks_plan`.
  - Page: `a_pick_does_not_also_show_in_its_section`; `a_done_pick_is_not_in_completed_today_until_replanned`; `a_finished_task_after_a_replan_is_in_completed_today_if_today`; `a_meeting_card_keeps_its_row`; `the_timeline_keeps_a_timed_task`; `a_member_gets_the_section_with_no_plan_button`; `x_clears_today_and_returns_a_non_pick_to_its_section`; `a_drag_onto_the_section_plans_the_task`.
  - In Agenda mode: `the_strip_shows_once`.
- [ ] **Step 2: Run** `npm run test:lib` and `npm run test:src`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the `slot:strip` droppable, Rule 58's three click semantics, `PlanButton` in the header, the packet tag's help text and the empty line. `grouped` filters out `model.ids` as it does `cardRowIds`. `doneTodayDetail` and `localDoneIds` skip `model.ids`, and counts keep reading what they read now. `hideStrip` becomes always on, or goes.
- [ ] **Step 4: Run** the Hub gates, `test:lib`, `test:src`, `test:api`. Expected: PASS.
- [ ] **Step 5: Look at it.** `npm run dev` locally: the section, a Done pick and an empty state, in dark and light, wide and phone width, with Claude in Chrome. Say in the report what was seen. If local data can't show a state, say which.
- [ ] **Step 6: Commit.**

### Task 9: Land, deploy, docs

**Files:**
- Modify: `CLAUDE.md` (Rules 57, 57a, 58, 61, 62, 63b), `CHANGELOG.md`, `SESSION-HANDOFF.md`; PB `Context/Decisions/` (one doc), `Context/Topics/shared-schema-registry.md`

The controller does this step, from main, after the final whole-branch review. `CLAUDE.md` Rule 61 describes the retired Right Now; correct it while there.

- [ ] **Step 1:** Merge Hub `plan-section` to `main`, then `npm run deploy:pages:gated` from main. The Worker must accept `kept` and one-option offers before PB sends them. Check that the probe passes.
- [ ] **Step 2:** Rebase PB `plan-section` on `origin/main`, run `tests/planning tests/questions tests/skills`, push by sha to main, and pull the main checkout. Ask the home laptop through the relay to pull. Restart its listener only if the `hub_ai_listener` code changed.
- [ ] **Step 3:** Write the release blurb to the open draft. Team members get the Plan section too, so this one is theirs: planned tasks are real cards at the top, each shown once.
- [ ] **Step 4:** Update the docs. In the handoff, say what the first real plan must confirm: how long writing steps takes on a full rebuild, the real desk's tap flow on a phone, kept picks making no requests, and the watch finding a Send.
- [ ] **Step 5:** Keep #169 and `bug_mw291o484isxfj` open until a real plan reaches the Hub. Remove worktrees: for the Hub one, delete the `node_modules` junction first with `[System.IO.Directory]::Delete`.
