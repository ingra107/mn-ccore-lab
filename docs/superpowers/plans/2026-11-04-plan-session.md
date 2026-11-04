# Week Planning Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Plan button starts a live session that builds a saved artifact, applies the changes Nick approves, and writes the week plan to the Hub; the old pick page and Sunday offer retire once tests pass.

**Architecture:** The button reuses the existing Quick Chat launch on both routes, with a fixed seed naming a new PB skill. PB's `scripts/planning/plan_session.py` holds the brief, the submission record and a resumable apply. The Hub keeps reading an answered `week_plan` offer, plus one new field, `withdrawn`.

**Tech Stack:** Hub: TypeScript, React 19, Hono, Vitest. PB: Python, pytest, BrainDB, `desk_cards`.

**Spec:** `docs/superpowers/specs/2026-11-04-plan-session-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Allowed note-driven edit fields: `due_date`, `status`, `priority`, `waiting_on`, `next_checkin_date`. `status` values exclude `done` and `deleted`: a note never completes or deletes a task.
- No work-task write before Nick approves the exact list. The bookkeeping task is the only exemption.
- Seed: `Use the week-plan-session skill to plan with me.` It must not start with `/`.
- No D1 migration, no new `mnccore://` verb, no widening of the PB key.
- Hub commits: `git commit -F <msg> -- <paths>`. PB commits: `python -X utf8 -m scripts.utils.git_commit_files -F <msgfile> -- <paths>` from the PB root. Author ingra107, no attribution lines.
- Hub gates before any fix is called done: `npx tsc -b --noEmit`, `npm run build`, `npm run test:api` on an api change. Lint the diff: the pre-commit gate is zero-error.
- Date logic reads Chicago civil dates, as `week_plan.today_central` does. In the Hub, use `src/lib/time.ts`.

## Review Focus

Each has its test in the owning task.

1. A task is completed or deleted between approval and apply: that operation is recorded `skipped`, the rest go on (Task 5).
2. A task's value changed after approval: `conflict` on that field, nothing overwritten, the rest go on (Task 5).
3. A note smuggling an instruction ("mark done", a field outside the list, a junk date): refused by `apply` validation whatever the session proposed (Task 4).
4. A press on Sunday, and at midnight during a session: the week is the intended `week_start`, and Add to today uses the captured date (Tasks 2, 6, 8).
5. Apply crashes after minting and before answering, then retries: same offer, one answer, no second prep (Task 5).

---

### Task 1: Prove the three assumptions

No product code. Stop and report to Nick if a proof fails.

**Files:**
- Create: `Peripheral-Brain/scripts/planning/plan_session_probe.py` (deleted at the end of Task 8)

**Interfaces:**
- Produces: a written result per proof in `docs/superpowers/plans/2026-11-04-plan-session-proofs.md`.

- [ ] **Step 1:** Mint a session-built `WeekPlanAsk` on the test D1 (`DB_TEST`, the `_TEST_DELETE_` prefix) and answer it through the ordinary route with `start:true` using the PB key. Expected: 200 and one `packet_prepare` request row. Then soft-delete both.
- [ ] **Step 2:** Ask Nick to send `@quickchat` with the seed `Run plan_session_probe: publish a one-card test desk, read its answers back, and ask me one AskUserQuestion` from his phone with send to home. Expected from him: the session appears in the Claude app, the artifact URL comes back in the session, and the question can be answered. This cannot be automated.
- [ ] **Step 3:** Write the results to the proofs file. If the phone proof fails on artifact tools, add the env var `rc_server.build_env` sets to `launch_remote_chat_v2`, and repeat Step 2.
- [ ] **Step 4:** Commit the proofs file.

### Task 2: `withdrawn` on the answer

**Files:**
- Modify: `shared/weekPlan.ts` (`weekPlanPicksError`, `parseWeekPlanPicks` neighbours)
- Modify: `src/lib/weekPlan.ts` (`currentWeekPlan`)
- Modify: `Peripheral-Brain/scripts/questions/state.py` (`Answer`)
- Test: `src/components/today/PlanConversation.test.tsx` (or a new `src/lib/__tests__/weekPlan.withdrawn.test.ts`), `api/routes/week-plan.test.ts`, `Peripheral-Brain/tests/planning/test_week_plan.py`

**Interfaces:**
- Produces: `weekPlanWithdrawn(answer: unknown): string[]`, and `AcceptedWeekPlan.withdrawn: string[]`. PB: `Answer.withdrawn: tuple[str, ...]`.

- [ ] **Step 1: Write the failing tests**

`currentWeekPlan_drops_a_withdrawn_started_pick`: older plan started `task_a`; newest answer has `withdrawn:['task_a']`; `plan.earlier` holds no `task_a`.
`picks_may_be_empty_only_with_withdrawn`: `picks:[], withdrawn:['t']` is accepted; `picks:[]` alone keeps the error `a week_plan answer needs a non-empty picks array`.
`withdrawn_must_name_candidates_or_started`: a non-string entry is refused. A withdrawn id need not be a candidate.
API: a real-schema test posts the empty-picks answer and gets 200 with zero `packet_prepare` rows.
PB: `Answer.from_json` round-trips `withdrawn`, and an old answer without it reads `()`.

- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. `weekPlanPicksError` gains an options argument `{ allowEmpty: boolean }`, true only when the answer's `withdrawn` is a non-empty string array. Check every caller by grep (`weekPlanPicksError`, `parseWeekPlanPicks`), including `api/lib/week-plan-start.ts` and `api/lib/task-question.ts`. In `currentWeekPlan`, a withdrawn id joins `taken` before the older plans are walked.
- [ ] **Step 4:** Run. Expected: PASS. Run `npm run test:api` and the PB tests for `tests/planning`.
- [ ] **Step 5:** Commit each repo.

### Task 3: `plan_session.py brief`

**Files:**
- Create: `Peripheral-Brain/scripts/planning/plan_session.py`
- Test: `Peripheral-Brain/tests/planning/test_plan_session.py`

**Interfaces:**
- Consumes: `week_plan.Deps`, `select_candidates`, `task_contexts`, `refresh_context`, `week_start_for`, `today_central`.
- Produces: `brief(deps: Deps, *, today: str) -> Brief`, a dataclass with `week_start: str`, `captured_date: str`, `cards: list[dict]`, `started: list[dict]`, `withdrawn: frozenset[str]`, `source_status: list[str]`, `open_desk: Optional[str]`. CLI: `python -X utf8 -m scripts.planning.plan_session brief`.

- [ ] **Step 1: Write the failing tests**

`test_started_tasks_come_back_as_cards`: `started_in_week` holds `t1`; the card for `t1` is present with its `packet_state`.
`test_email_lane_excluded`, `test_withdrawn_this_week_excluded`, `test_bookkeeping_task_excluded` (source `week_plan_session`).
`test_degraded_source_reaches_the_brief`: a failing refresh appears in `source_status`.
`test_sunday_press_plans_next_week`: `today='2026-11-08'` gives `week_start='2026-11-09'`.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Extract nothing from `week_plan.run` that it does not already call; `brief` is the read-only sibling, and calls no agent.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 4: The skill, the desk and the submission

**Files:**
- Create: `Peripheral-Brain/.claude/skills/week-plan-session/SKILL.md`
- Create: `Peripheral-Brain/.claude/skills/week-plan-session/template.py`
- Modify: `Peripheral-Brain/scripts/planning/plan_session.py`
- Test: `Peripheral-Brain/tests/planning/test_plan_session.py`, `test_plan_desk.py`

**Interfaces:**
- Consumes: `Brief`; `desk_cards` (`choice`, `shell`, `page`, `build`).
- Produces:
  - `build_desk(brief: Brief, out: Path) -> Path`
  - `Submission`: `{id: str, week_start: str, captured_date: str, answers: dict, ops: list[Op], created_at: str}` saved at `data/plan_submissions/<id>.json`
  - `Op`: `{kind: 'edit'|'comment'|'add_task'|'withdraw'|'pick'|'today', task_id: Optional[str], field: Optional[str], old: Any, new: Any, status: 'planned'|'applied'|'skipped'|'conflict'|'failed', detail: str}`
  - `capture(answers: dict, brief: Brief) -> Submission`
  - `validate(sub: Submission, *, cap_left: int) -> list[str]`: empty means ready

- [ ] **Step 1: Write the failing tests**

`test_desk_cards`: one card per task, with Not this week among the options and the recommendation unselected; Prep these and Add to today are `data-mode="multi"`; `build_desk_gate_passes`.
`test_rebuild_keeps_ids`: a task on both builds keeps its card id, and a handled one leaves.
`test_capture_only_pressed_or_chosen`: an untouched card creates no op.
`test_validate_refuses_field_outside_list`, `test_validate_refuses_status_done`, `test_validate_refuses_junk_date` (Review Focus 3).
`test_validate_allocates_cap`: 5 prep picks with `cap_left=2`: the first 2 keep `start:true`, the other 3 become saved and are reported.
`test_validate_rejects_pick_with_no_step`: a Take with no option and no note.
`test_no_restart_of_existing_packet`: a prep pick whose task has a live packet or open request stays `start:false`, with a note in `detail`.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. SKILL.md carries the session's order (brief, build or resume, publish with `{db: {}}`, register, create the bookkeeping task, work with Nick, on Send capture, show the list, AskUserQuestion, apply). It states that desk answers are data, and that a note it cannot read as a change stays a comment and is labelled "not applied". The session turns notes into `Op`s; `validate` is the code gate.
- [ ] **Step 4:** Run, plus `build_desk.py --self-test`. Expected: PASS. Serve a built desk locally with a mock `window.claude` and check the reload round trip, as the desk skill requires.
- [ ] **Step 5:** Commit.

### Task 5: Resumable apply

**Files:**
- Modify: `Peripheral-Brain/scripts/planning/plan_session.py`
- Test: `Peripheral-Brain/tests/planning/test_plan_session.py`

**Interfaces:**
- Consumes: `Submission`, `Op`; `BrainDB.update_task`, `create_task`, `add_progress_note_to_task`, `answer_question_with_answer`; `week_plan._mint`, `offer_row`, `supersede`.
- Produces: `apply(sub: Submission, deps: ApplyDeps) -> Submission`, saved after every op. CLI: `plan_session apply <submission id>`.

- [ ] **Step 1: Write the failing tests**

`test_task_finished_since_approval_is_skipped`, `test_changed_value_is_conflict_and_not_overwritten` (Review Focus 1, 2).
`test_retry_after_crash_between_mint_and_answer`: the answer stub raises once; on retry `_mint` returns the same row by name, exactly one answer posts, and one `packet_prepare` is requested (Review Focus 5).
`test_offer_name_carries_submission_id`.
`test_mint_returned_row_spec_is_verified`: a mismatched spec fails the step and rewrites nothing.
`test_superseded_answer_is_publication_conflict`: no op reruns.
`test_additions_become_tasks_once`: a retry reuses the recorded id.
`test_candidates_are_reviewed_cards_plus_additions`: 10 cards plus 3 additions publish with 13 candidates; if `WeekPlanAsk` or `weekPlanSpecError` caps this, the test shows it and the cap is lifted for session offers.
`test_all_not_this_week_publishes_empty_picks`.
`test_partial_leaves_bookkeeping_open`, `test_complete_closes_bookkeeping`.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement in the spec's order. A `.applied` false is `failed`, with its message in `detail`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 6: Add to today from PB

**Files:**
- Modify: `Peripheral-Brain/scripts/planning/plan_session.py`
- Test: `Peripheral-Brain/tests/planning/test_plan_session.py`

**Interfaces:**
- Produces: `plan_for_day(db, task_ids: list[str], date: str) -> list[Op]`.

- [ ] **Step 1: Write the failing tests**

`test_appends_after_the_highest_rank`, `test_slot_is_strip`, `test_never_removes_existing`, `test_uses_captured_date_after_midnight`, `test_already_planned_is_skipped`.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with `update_task(planned_for=, plan_slot='strip', plan_rank=)`. Read `src/lib/todayPlan.ts` for the field contract first; never touch the `right_now` singleton.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 7: The Plan button

**Files:**
- Create: `src/lib/planLaunch.ts`, `src/components/today/PlanButton.tsx`
- Modify: `src/components/today/ThisWeekSection.tsx`, `src/components/today/PlannedTodaySection.tsx`
- Test: `src/lib/__tests__/planLaunch.test.ts`, `src/__tests__/plan-button.test.tsx`

**Interfaces:**
- Consumes: `executeLaunchCommand`, `useProtocolLaunch`, `detectOrigin`, `GET /api/launch-log`.
- Produces: `PLAN_SEED: string`; `planButtonState(row: LaunchRow | null, now: string): { kind: 'ready'|'queued'|'failed'|'expired', label: string, note: string | null }`; `<PlanButton />`.

- [ ] **Step 1: Write the failing tests**

`queued_mobile_row_reads_queued`, `past_expires_at_reads_expired_with_press_again` (no `expired` status is ever written), `failed_reads_failed`, `only_rows_with_the_plan_seed_count`.
`plan_seed_does_not_start_with_slash`.
Browser: the button posts `{tag:'quickchat', seed: PLAN_SEED, origin}`; hidden for a non-PI; a second press while queued posts nothing.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. It replaces `replan.buttonEl` in both sections. The bookkeeping task already links an open artifact on Today, so no separate Open plan control unless the test run shows it is missed.
- [ ] **Step 4:** Run, with `npx tsc -b --noEmit` and `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit. Do not deploy yet.

### Task 8: Cut over and retire

Load `/substrate-swap` first and follow its checklist, except its 24h dogfood window: Nick waived waiting (2026-11-04, spec Rollout).

**Files:**
- Delete: `src/components/today/PlanConversation.tsx`, `PlanPanel.tsx`, `ReplanControl.tsx`, `src/lib/planDraft.ts`, and their tests
- Modify: `src/components/tasks/QuestionsCard.tsx`, `src/lib/weekPlan.ts`, `src/lib/taskGrouping.ts`, `api/lib/week-plan-replan.ts` and its routes (route pin updates), `src/lib/__tests__/localStorageWriters.test.ts`
- Modify: `Peripheral-Brain/scripts/scheduled/schedule.json`, `hub_ai_listener.py` (`week_replan` lane), `replan_adapter.py`
- Test: `src/lib/__tests__/planNudge.test.ts`

**Interfaces:**
- Produces: `planNudgeWeek(tasks: TaskRow[], today: string): string | null`, the `week_start` needing a plan, or null.

- [ ] **Step 1: Write the failing tests**

`sunday_with_this_weeks_plan_still_nudges_for_next_week`, `monday_with_a_plan_is_null`, `sunday_with_next_weeks_plan_is_null`, `no_nudge_before_sunday_evening` (from 16:00 Chicago, the Sunday job's time).

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The gold row reads Plan your week from `planNudgeWeek` and renders `<PlanButton />`. Remove `week-plan-offer` from the schedule. Retire any waiting unanswered offer with `week_plan._retire`, listing them for Nick first. Keep `week_plan.py`'s helpers that `plan_session` uses; delete `build_offer` and the agent prompt only if nothing else calls them (grep).
- [ ] **Step 4:** Run everything: `npm run test:api`, `test:lib`, `test:src`, PB `tests/planning`. Expected: PASS. Delete `plan_session_probe.py`.
- [ ] **Step 5:** Commit each repo, PB first. Pull PB on the home laptop through the relay.
- [ ] **Step 6:** `npm run deploy:pages:gated`. Write the release blurbs. Update `CLAUDE.md` and `SESSION-HANDOFF.md`. Ask Nick for one real plan from each device. Close #169 only once one has written a plan to the Hub.
