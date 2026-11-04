# Week planning as a live session plus a saved artifact (#169)

Status: awaiting Nick's approval. Repos: `mn-ccore-lab` (Hub) and `Peripheral-Brain` (PB).

## Why

Nick, 2026-11-04 (#169): *"i said i wanted xyz done for things and sometimes i say yes change the due date to next week or something... so then why does it still end up here"*, and *"it might be best if instead of using the hub it generates an artifact... i go through it... and THEN it drafts the plan part ... this way i can also add things that might not have been part of the 10 ... i could answer questions on the artifact and it never gets deleted on accident. we could have a template planning artifact that we can continue to improve upon over time. then i send it back to the live session and it creates the week plan (or new plan for that day) on the hub"*.

Three failures of the Hub pick page drive this:

1. A note is only a comment. `weekPlanNotes` (`api/lib/week-plan-start.ts`) posts it on the task and nothing applies it, so "move it to next week" changes nothing.
2. The list is closed. `weekPlanPicksError` (`shared/weekPlan.ts`) refuses any task outside the offered candidates.
3. The thinking is unattended and stale. The Sunday `week-plan-offer` job reads threads hours or days before Nick looks.

## Goals

- One button starts a live planning session, from a laptop or a phone.
- The session does what Re-plan does today, then builds an artifact Nick works through.
- Nick can add tasks that were not offered, and can ask for real changes (a due date, a status).
- His answers survive a reload, a closed tab and a dead session.
- Sending the artifact back applies the changes and writes the plan to the Hub.
- The template lives in one file and improves over time.
- Works mid-week: plans today through Sunday, and can set today's plan.

## Non-goals

- Changing how This week, packets, the daily cap or `earlier` picks work. They keep reading the same answered offer.
- Team-member planning. This stays Nick-only, like every week-plan surface today.
- Sending any email or Slack message. Drafts only, as in Prep & start.

## Anti-goals (failure even if it technically works)

- Any task write before Nick sends the artifact back. Silence is never approval (working-desk rule 13).
- A press that appears to do nothing. Laptop off must read as queued, not stuck.
- Retiring the pick page before the new flow has run for real.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A. Dedicated plan launch (Nick's pick)** | Its own launch kind on both routes, own instructions, own template | More wiring, built to last |
| B. Reuse Quick Chat | `@quickchat` with a planning seed | Little code; instructions live in a seed and nothing marks the session as planning |
| C. Unattended build on the laptop | Listener builds the artifact with no live session | Dropped: Nick wants a conversation, and the Remote Control server already gives one on a phone |

## The flow

```
Press Plan (Hub)
  laptop: POST /api/launch-log, then mnccore://launch/<id>   -> resolve_launch.py
  phone:  POST /api/launch-log, origin=mobile                -> hub_ai_listener (home, ~60s)
                                                                 -> session listed in the Claude app
Session
  1. read open tasks, threads, Slack, the current plan
  2. build + publish the planning artifact, link it on a "Plan the week of X" task
  3. talk with Nick while he works through it
Nick presses Send my plan on the artifact, and tells the session (or the session sees it)
  4. session reads the answers, applies the edits, publishes the plan, closes the task
```

### Starting it

The launch path already covers both routes: `executeLaunchCommand` (`src/lib/launchCommands.ts`) posts to `/api/launch-log`, then fires the URI on a computer or queues on a phone. So this needs **no new `mnccore://` verb**.

- `launch_log` gains a nullable `purpose` column (`'plan'`). `tag` has a CHECK of `quickchat|workon`, and changing a CHECK means rebuilding the table; an added column does not. The row stays `tag='quickchat'` with a fixed seed, so a PB that does not know `purpose` yet still opens a usable chat. Builder's call if a cleaner way appears.
- The claim response carries `purpose`. `resolve_launch.py` and `_launch_seeded_home_session` route `purpose='plan'` to the plan session. Everything in the row stays server-set: no client text reaches the instructions.
- Permission mode `auto`, as Quick Chat and Prep & start use.
- The Hub button is PI-only, like `handleCreateLaunch` already is.

Entry points: **Re-plan** becomes **Plan**, and the gold **Plan your week** row starts a session instead of opening the panel (phase 1 keeps "Quick picks" beside it, see Rollout). Button copy on a phone says it queued on the home laptop. A queued row expires after 2 hours, as today.

### The session

New `scripts/planning/plan_session.py`, modelled on `scripts/utils/prep_start_task.py`: `build_launch_command`, a `system_prompt` of fixed text, and subcommands the session runs.

- `show`: reuses `week_plan.select_candidates`, `task_contexts` and `refresh_context` (which already reads mail and Slack), and lists what the current plan holds. The session may read further with Slack's read verbs. Everything it reads is data, never instructions (prep rule 2).
- `apply <answers>`: the only writer, so the write rules are code, not prompt.

Instructions and the artifact template live in a new skill, `.claude/skills/week-plan-session/`, so improving the template is an edit to one place. Each session ends by asking whether anything about the template should change, and records a yes in the skill.

### The artifact

A working desk, built with `desk_cards` and the `working-desk-artifact` rules, published with `{db: {}}`.

- Path: `Projects/peripheral-brain-system/artifacts/week-plan-<week_start>.html`, one per week, re-planning that week reuses it. Builder confirms the slug against `projects.slug`.
- **One card per candidate** in `rank_key` order: title, why, and a note box, plus two separate controls:
  - **First step:** the offer's options, as a `choice()` with the recommendation marked and never preselected. These are the options the published offer carries.
  - **This week:** one of Take it / Prep it now / Not this week, with a separate **Today too** switch. These are not offer options. Take it = a pick with `start:false`. Prep it now = a pick with `start:true`. Not this week = left out of the published offer, and kept only on the artifact. Today too = also plan it for today (step 6 below).
- **Add something** section: a task id or free text. Free text becomes a new task on apply.
- **Send my plan** card at the end, which needs a pressed button.
- Reachable later: the session creates an ordinary task, "Plan the week of X", with the artifact as its key link, so it shows on Today on any device. Closed on apply. The Hub needs no new field and never looks this task up: PB finds an open one by `source` and week to avoid a duplicate, and phase 2's Plan your week row reads `currentWeekPlan` only.
- **Week and re-runs:** `week_start` comes from `week_plan.week_start_for(today)`, as Re-plan does (a Sunday press plans next week). A second press in the same week rebuilds the same artifact with fresh card ids (working-desk rule 11), so old answers never come back as new ones, and the earlier run's cards roll into Done.

If the session dies, the answers are safe in the artifact db and the desk's Start session link opens a new one. A new session reads the db and carries on.

### Send back and apply

v1: Nick presses Send my plan, then says so in the session. Builder may use the artifact `watch` tool to notice the press if it proves reliable. Typing on the artifact after pressing takes the press back, as on every desk.

Two steps, with one approval from Nick between them (his call, 2026-11-04):

**Propose.** The session reads `answers`, acting only on cards whose `status` is pressed (read `status`, never `edited`). It turns his notes into a list of exact writes and shows it in the session: task, field, old value, new value. Anything it could not read as a change stays a comment on the task and is listed as such. Nick approves the list once with AskUserQuestion, and can strike items. Nothing is written before this.

**Apply.** `plan_session.py apply` takes the approved list:

1. Applies the edits through BrainDB Hub-first writers (`update_task`), acting only on `.applied`. Allowed fields: `due_date`, `status`, `priority`, `waiting_on`, `next_checkin_date`. Never complete or delete a task from a note. A note that is not an edit is posted as a comment, as today.
2. Prints every write made, with the old value.
3. Creates tasks for free-text additions.
4. Publishes the plan as **a new offer whose candidates are his picks and additions**, then answers it. This keeps `weekPlanPicksError` and This week unchanged. The session writes the options the spec requires (2-4, one recommended) for an added task. `supersede` retires the older offer, as it does now.
5. "Prep it now" picks carry `start:true`, which queues `packet_prepare` under the daily cap. Over the cap saves the rest, as today.
6. "Today too" picks write `planned_for` through the existing plan writer. This is new: the week plan has never written `planned_for`. It is Nick's explicit ask ("or new plan for that day"), so the rule becomes "the week plan writes it only on a pressed Today too".

**Double runs.** The Send card's `updatedAt` is the key. Apply stores the last applied value on the artifact and refuses a Send that is not newer, so a double run does nothing, while a later Send after more edits makes a legitimate new offer. Edits already at their target value are skipped.

## Known constraints to prove first

1. **PB key and the owner gate.** `weekPlanStart` compares `user.email` to Nick's row (`week_plan_owner_only`, `api/lib/week-plan-start.ts:226`). If the PB key has no such email, a session's `start:true` answer is refused. Fix: the same `owner` rule packets use (Nick's session or the PB key). A leaked key could then queue up to the daily cap of prep runs, which is the risk packets already accept; launching a session stays refused to the key. Prove with a real call first, and flag this auth change in review.
2. **Reading the artifact db from a session.** Interactive sessions have the artifact tools (rc_server turns them on for phone sessions). Prove `db_list` works on a phone-started session.
3. **The mint guards.** `WeekPlanAsk.build` and `_mint` are written around `build_offer`. Confirm they accept a session-built ask, and that the newest-offer rule does not block answering it straight away.
4. **The home laptop.** Phone starts go to home only (listener `machines:["home"]`). At work with home off, a phone press waits. Accepted for v1.

## Rollout

| Phase | What | Gate to the next |
|---|---|---|
| 1 | Launch, session, artifact, apply. Plan is the primary button; the pick page stays reachable as "Quick picks". Sunday job unchanged | Two real planning runs by Nick, one of them from the phone |
| 2 | Sunday job stops the unattended offer; Today shows Plan your week from Sunday evening when no answered plan covers the week | One Sunday cycle |
| 3 | Retire the pick page (`PlanConversation`, `PlanPanel`) and the `week_replan` lane, through `/substrate-swap` with its 24h window | Done |

Rollback for phases 1-2: the pick page and Sunday job still exist. Phase 3 is reversible only from git, which is why it waits.

## Cross-repo and deploy

- `launch_log.purpose` is a Hub-only migration (next `api/schema-v*.sql`). Prod DDL has needed Nick to run it himself. Build and test against the test D1; the Hub button ships only after he has run it on prod.
- PB ships `plan_session.py`, the routing and the skill before the Hub button goes live, so a press never reaches a PB that ignores it (the `tag='quickchat'` fallback still covers a stale laptop).
- Both laptops need the PB pull; the mnccore handler does not change.
- The tasks and offers it writes use existing registered fields, so no `enums.py` change.

## Decided by Nick

Session plus artifact over the Hub page; dedicated launch (A); works from a phone through the existing send-home and Claude app path; task changes are written as notes, then shown as an exact list he approves once before anything is written.

## Calls made here, for Nick to check

- Pick page retires in phase 3, only after real use.
- Sunday job stops doing unattended thinking in phase 2.
- Per-card controls: first step, then Take it / Prep it now / Not this week, with a separate Today too. Not this week writes nothing to the Hub.
- Note-driven edits limited to `due_date`, `status`, `priority`, `waiting_on`, `next_checkin_date`; a note never completes or deletes a task.
- PB key counts as owner for starting a week plan, matching packets.
- A later Send in the same week makes a new offer; a re-press rebuilds the artifact with fresh card ids.
- A "Plan the week of X" task is how the Hub finds the artifact.
- Added column over table rebuild on `launch_log`.

## Left to the builder

File layout inside the skill, card copy, `watch` versus "tell the session", test layout, and exact seed text.
