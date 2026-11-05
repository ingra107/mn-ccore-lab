# Who Does What Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A planning desk that says who does each step and opens on what needs Nick, one approved list that can close tasks, and a live session that runs Claude's picks through agents and checks the results.

**Architecture:** `owner` joins the offer's options and picks in both repos, and a plan without it renders as today. The desk changes are PB template and `desk_flow.js`, opt-in so other desks don't move. Results are ordinary packets, and unfinished work is derived: no D1 migration.

**Tech Stack:** Hub: TypeScript, React 19, Vitest. PB: Python, pytest, deskkit JS.

**Spec:** `docs/superpowers/specs/2026-11-05-plan-who-does-what-design.md` (Hub repo). Read it first. It wins over the two 2026-11-04 specs.

## Global Constraints

- Two repos: `C:/Users/ingra107/mn-ccore-lab` and `C:/Users/ingra107/Peripheral-Brain`. Work in a worktree per repo. Never touch either main checkout, and never deploy from a worktree.
- PB commits: `python -X utf8 -m scripts.utils.git_commit_files -F <msgfile> --no-push -- <paths>`. Confirm the sha isn't on origin/main. Hub commits: `git commit -F <msgfile> -- <paths>`. Author from config, no attribution lines.
- A worktree's `node_modules` junction: never delete or edit it. Give each checkout its own Vite cache.
- Nick's in-progress plan is on the old code. No migration of `Projects/peripheral-brain-system/artifacts/week-plan-2026-11-02.*` or its answers, and don't commit those files.
- `shared/weekPlan.ts` and `scripts/planning/week_plan.py` change in lockstep; the Hub deploys first.
- Other working desks must render byte-for-byte as before. New layout is opt-in.
- Plain words in anything Nick reads. Zero em dashes in desk copy.
- Exact labels: `Your next step`, `Claude can`, `Needs you`, `Answered`, `From earlier rounds`, `Picked: <step>`, `Note saved`, `Not this week`, `Decided`, `With Claude`, `Yours`, `New`. List headings: `Claude works on:`, `Yours:`, `Close:`, `Stays:`.
- Build from desk kit and Hub components; don't hard-code colours beside them. The mock (`.superpowers/sweep/lanes-mock.html`) settles structure, order and labels, not polish.
- Before every commit run lint on changed files. Hub: `npx tsc -b --noEmit`, then `npm run test:lib` and `npm run test:src`. PB: `python -X utf8 -m pytest tests/planning -q`.

## Review Focus

- A card answered and then cleared (pick untapped, note emptied) returns to Needs you and the count goes up. Test in Task 4.
- Eight Claude picks where two land packets: the other six are unfinished on the next brief, and none is lost or doubled. Tests in Tasks 6 and 7.
- A task closed by Nick in the Hub while its close line waits on the list: apply skips it and reports it, with no error. Test in Task 5.
- A desk with zero cards needing him still opens sensibly: "Nothing needs you", with Send reachable at the top. Test in Task 4.
- An old plan and a new plan in the same week: a task's tag comes from the newest plan only, and the old one keeps its Prep button. Test in Task 1.

---

### Task 1: Hub: owner on options and picks, and the Plan card tags

**Files:**
- Modify: `shared/weekPlan.ts`, `src/lib/weekPlan.ts`, `src/components/today/PlanSection.tsx`
- Test: `api/routes/week-plan.test.ts`, `src/lib/__tests__/weekPlan.owner.test.ts` (create), `src/__tests__/today-plan-section.test.tsx`

**Interfaces:**
- Produces: `type StepOwner = 'claude' | 'nick'`; `WeekPlanOption.owner?: StepOwner`; `WeekPlanPick.owner?: StepOwner`; `pickOwner(pick: WeekPlanPick, spec: WeekPlanSpec): StepOwner | null` in `shared/weekPlan.ts`, where the option's owner wins, then the pick's, else `null` (an old plan).

- [ ] **Step 1: Write failing tests** in `weekPlan.owner.test.ts`: `pickOwner` returns the option's owner over the pick's; the pick's for a typed pick; `null` when neither has one. `weekPlanSpecError` refuses `owner:'bob'` and accepts it absent. `weekPlanPicksError` refuses a bad pick owner. `parseWeekPlanSpec` and `parseWeekPlanPicks` keep `owner`. `weekPlanFlipError` refuses a flip that changes a pick's owner. In `today-plan-section.test.tsx`: owner `nick` shows `Yours` and no Prep or Prep & start; owner `claude` with no packet shows `With Claude` and keeps both; owner `claude` with `packet_state:'ready'` shows Ready; no owner shows Saved as today; a task on both an old and a newer plan follows the newest.
- [ ] **Step 2:** Run `npx vitest run src/lib/__tests__/weekPlan.owner.test.ts`. Expected: FAIL, `pickOwner` not defined.
- [ ] **Step 3: Implement** the types and `pickOwner`; extend the three validators and parsers. Extend `pickTag(task, started, carried, owner)` in `src/lib/weekPlan.ts`: after Done and the packet tags, `owner==='nick'` gives `{label:'Yours', cls:'tk-ac'}` and `owner==='claude'` gives `{label:'With Claude', cls:'tk-n'}`. Hide Prep on `Yours`. Add a TAG tooltip for each in the existing map at `PlanSection.tsx:47`.
- [ ] **Step 4:** Run the Hub checks in Global Constraints. Expected: pass.
- [ ] **Step 5: Commit.** Also run `npm run test:api` if `api/` tests touched.

### Task 2: PB: the same contract, a decided entry, and a rebuild that doesn't refuse

**Files:**
- Modify: `scripts/planning/week_plan.py`, `scripts/planning/plan_session.py` (`check_options`, `load_steps`, `build_desk:462`)
- Test: `tests/planning/test_week_plan.py`, `tests/planning/test_plan_session.py`

**Interfaces:**
- Produces: `Option.owner: Optional[str] = None`; `Pick.owner`; `pick_owner(pick, candidate) -> Optional[str]`. A steps sidecar value is a list of options, or `{"decided": "<his call>"}`. `split_steps(steps) -> (options_by_task, decided_by_task)`. `build_desk` returns the desk path as today and records dropped task ids in `brief.status`.

- [ ] **Step 1: Write failing tests:** `Option(owner='bob')` refuses; absent passes. Parity with the Hub's shape for spec and answer, using the existing parity test's style. `check_options` passes a card with only `nick` steps and only `claude` steps. `split_steps` separates the two forms. `build_desk` with steps for a departed task doesn't raise, leaves them out of the sidecar, and says which in `source_status`. A `decided` card isn't in `_publishable`, and capture makes no pick op for it unless he typed a note (then a comment op).
- [ ] **Step 2:** Run `python -X utf8 -m pytest tests/planning/test_week_plan.py tests/planning/test_plan_session.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace the raise at `plan_session.py:462` with the drop and the status line. `capture` writes `owner` into the pick op's `new` from the option; `_build_spec` publishes it.
- [ ] **Step 4:** Run the PB check. Expected: pass.
- [ ] **Step 5: Commit** with `--no-push`.

### Task 3: PB: the card, with lanes and a Today toggle, and no Prep or Today cards

**Files:**
- Modify: `.claude/skills/week-plan-session/template.py`, `scripts/planning/plan_session.py` (`capture`), `.claude/skills/working-desk-artifact/assets/desk_google.css`
- Test: `tests/planning/test_plan_desk.py`, `tests/planning/test_plan_session.py`

**Interfaces:**
- Consumes: `split_steps` from Task 2.
- Produces: `data-owner` on `.opt` buttons; a `[data-today]` checkbox per picked card, stored in the card's record as `today: true`; `decided_card(card, text, round) -> str`.

- [ ] **Step 1: Write failing tests:** a card renders only the lanes with steps, in the order `Claude can`, `Your next step`, and all still sit in one `data-mode="one"` row, so one pick per card holds. Keys 1-9 and `n` still run in that order. A decided card shows `Your call:` with his words and no options. A kept card with no moved threads renders no fresh step and no "No first steps written yet". `fragment` has no prep or today card. Capture: `today:true` on a card's record makes a `today` op, and `today` ops still only add. A step that asks him to look at something with no link gets the wording "no link found", from a `needs_link` flag on the step.
- [ ] **Step 2:** Run `python -X utf8 -m pytest tests/planning/test_plan_desk.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `prep_card`, `today_card`, their `fixed_id` readers in capture and `PREP_ID`, `TODAY_ID`, and the rule that `prep` starts a pick: new picks are `start:false`. Keep reading an old desk's fixed cards only if an existing test requires it, and say so in your report. Style lanes with the kit's existing tokens in `desk_google.css`, keeping the look in the mock.
- [ ] **Step 4:** Run the PB check, then build a desk from the test fixture and screenshot it at 1280px and 390px. Attach both to your report. Expected: lanes as in the mock; no sideways scroll at 390px.
- [ ] **Step 5: Commit** with `--no-push`.

### Task 4: PB: the page opens on what needs him

**Files:**
- Modify: `.claude/skills/working-desk-artifact/assets/desk_flow.js`, `desk_google.css`, `.claude/skills/week-plan-session/template.py`
- Test: `tests/planning/test_plan_desk.py`, using the browser harness this file already uses for desk behaviour; if none exists, a Playwright spec beside it

**Interfaces:**
- Produces: opt-in attribute `data-needs-you` on the desk root, set only by `template.fragment`. Card attribute `data-new` from `card.get("is_new")`, which `brief` sets for a task not in the sidecar's previous build.

- [ ] **Step 1: Write failing tests:** on load the count line reads `3 cards need you`, and the first focusable is in the first unanswered card. A pick or a note on blur moves the card to `Answered`, with its label in words, and opens the next. Clearing both moves it back and the count goes up. `data-new` cards come first. Earlier rounds' answers sit under `From earlier rounds`, folded. Zero unanswered reads `Nothing needs you`, with Send reachable. No `status` is written to the record by any of this. A desk without `data-needs-you` has the same DOM as before, byte for byte. At 390px the first card needing him is the first thing under the header.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement** in `desk_flow.js` behind `data-needs-you`: answered means a pick or a note; rebuild `paintTodo` for these sections. Remove the `.hasnote` stripe and the dim under `[data-needs-you]` only.
- [ ] **Step 4:** Run the PB check; capture's output on one answers fixture must match with the layout on and off.
- [ ] **Step 5: Commit** with `--no-push`.

### Task 5: PB: the close line

**Files:**
- Modify: `scripts/planning/plan_session.py` (`OP_KINDS`, `NEEDS_TASK`, `capture`, `_rule_errors`, `_describe_op`, `describe`, `apply`, CLI)
- Test: `tests/planning/test_plan_session.py`

**Interfaces:**
- Produces: `add_close(sub, task_id, words: str, *, live: bool = False) -> Op`, kind `close`, `new={"words":..., "live":...}`, `old={"updated_at":...}`. CLI verb `close <sub_id> <task_id> --words "<his words>" [--live]`.

- [ ] **Step 1: Write failing tests:** `add_close` refuses empty words and a task not on the desk. `add_close` also refuses when `words` aren't in that card's note unless `live`. `describe` groups under `Claude works on:`, `Yours:`, `Close:`, `Stays:`, and a close line prints his words. Apply: closes through `db.complete_task`; already done is `skipped`; `updated_at` changed since capture is `conflict` and the task stays open; a second apply doesn't call the writer again; a struck close doesn't close. A task both closed and picked refuses in `_rule_errors`. No op kind can delete.
- [ ] **Step 2:** Run the PB check. Expected: FAIL, `add_close` not defined.
- [ ] **Step 3: Implement.** Capture stores `updated_at` from the brief's card, so `brief` must carry it.
- [ ] **Step 4:** Run the PB check. Expected: pass.
- [ ] **Step 5: Commit** with `--no-push`.

### Task 6: PB: saving a checked result, and what's unfinished

**Files:**
- Modify: `scripts/planning/plan_session.py` (`brief`, CLI)
- Test: `tests/planning/test_plan_session.py`

**Interfaces:**
- Consumes: `post_packet(task_id, spec)` from `scripts/packets/publish.py`; `pick_owner` from Task 2.
- Produces: `post_result(deps, week_start, task_id, option_key, *, instruction, body, deliverable) -> PublishResult`, with `producer_key = f"week-plan:{week_start}:{task_id}:{option_key}"`. CLI verb `post-result`. `Brief.unfinished: list` of `{task_id, title, step}`.

- [ ] **Step 1: Write failing tests:** the same result posted twice uses one producer key. A 409 comes back as `refused` and the caller is told his version stands. A task closed or withdrawn before posting isn't posted, and the result says why. `Brief.unfinished` holds a Claude pick on the current plan with no live packet, and not one with a packet, a `nick` pick, an old no-owner pick, or a done task. With eight picks and two packets it lists six, in plan order. The kept-card test: `moved` is true only when a card's evidence `observed_at` is later than the plan's `answered_at`.
- [ ] **Step 2:** Run the PB check. Expected: FAIL.
- [ ] **Step 3: Implement.** Unfinished cards come first in the brief with the `New` mark off.
- [ ] **Step 4:** Run the PB check. Expected: pass.
- [ ] **Step 5: Commit** with `--no-push`.

### Task 7: PB: the session runs the work, and the Review comments fix

**Files:**
- Modify: `.claude/skills/week-plan-session/SKILL.md` (keep under its byte ceiling), `apply-outcomes.md`, `watching.md`, `new-round.md`; create `.claude/skills/week-plan-session/running-the-work.md`
- Modify: `scripts/scheduled/drive_comment_monitor.py` (`_has_open_task:471`)
- Test: `tests/` for the monitor, beside its existing test

- [ ] **Step 1: Write the failing monitor test:** a document with a completed review task and no comment newer than its completion makes no new task; a comment newer than the completion does.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** the check against the last completed task for that document, by comparing the newest comment time with `completed_at`.
- [ ] **Step 4: Write `running-the-work.md`** from the spec's "After approval" section, as instructions: send every Claude pick at once, one agent per pick, the specialist that fits, tier by step, and tell Nick first past 10 Opus-tier agents. The brief template forbids task writes, comments, sends and closes. Check each result; tell the agent what's wrong; after two tries that don't fix it, tell Nick live, or leave a task note if he's away. Save with `post-result`. Report done, waiting on you, stuck and why. Update SKILL.md: writing rule for steps, lanes, decided entries, `close`, no status writes, unfinished first. Update `Doctrine-Budget-OK` in the commit message if the gate asks for it.
- [ ] **Step 5:** Run the PB check and `grep -c "Prep these\|Add to today" .claude/skills/week-plan-session/*.md`. Expected: pass and 0.
- [ ] **Step 6: Commit** with `--no-push`.

### Task 8: Docs and landing

**Files:**
- Modify (Hub): `CLAUDE.md` Rule 57a, `CHANGELOG.md`, `SESSION-HANDOFF.md`
- Create (PB): `Context/Decisions/2026-11-05-plan-who-does-what.md`, covering this and the retired subtask routes and `cleared` paperwork already owed

- [ ] **Step 1: Write the docs:** Rule 57a gains owner, close, and that the session runs the work; the first-run watch list goes in the handoff: time from approval to the last Ready, whether agents respect the brief, whether "With Claude" reads right, whether eight picks at once strain the laptop.
- [ ] **Step 2:** Run `python scripts/check-schema-versions.py` and the Hub checks. Expected: pass; no new migration.
- [ ] **Step 3: Commit** in each repo. Landing, by the controller, once Nick's current plan session has finished: merge Hub, `npm run deploy:pages:gated`, then PB, then write the What's new draft.
