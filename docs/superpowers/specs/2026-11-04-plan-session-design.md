# Week planning as a live session plus a saved artifact (#169)

Status: revision 2, after independent critiques from Codex and a Claude critic. Awaiting Nick's approval. Repos: `mn-ccore-lab` (Hub) and `Peripheral-Brain` (PB).

## Why

Nick, 2026-11-04 (#169): *"i said i wanted xyz done for things and sometimes i say yes change the due date to next week or something... so then why does it still end up here"*, and *"it might be best if instead of using the hub it generates an artifact... i go through it... and THEN it drafts the plan part ... this way i can also add things that might not have been part of the 10 ... i could answer questions on the artifact and it never gets deleted on accident. we could have a template planning artifact that we can continue to improve upon over time. then i send it back to the live session and it creates the week plan (or new plan for that day) on the hub"*.

Four failures drive this:

1. A note is only a comment. `weekPlanNotes` (`api/lib/week-plan-start.ts`) posts it on the task and nothing applies it, so "move it to next week" changes nothing.
2. A started task cannot leave This week. `currentWeekPlan` (`src/lib/weekPlan.ts:79-88`) carries every started, open pick the newest plan does not repeat, and `week_plan.run` excludes started tasks from the next offer, so Nick never gets a say on them. This is the literal "why does it still end up here".
3. The list is closed. `weekPlanPicksError` (`shared/weekPlan.ts`) refuses any task outside the offered candidates.
4. The thinking is unattended and stale. The Sunday `week-plan-offer` job reads threads hours or days before Nick looks.

## Goals

- One button starts a live planning session, from a laptop or a phone.
- The session does what Re-plan does today, then builds an artifact Nick works through.
- Nick can add tasks, take any task off the week (started ones too), and ask for real changes (a due date, a status).
- His answers survive a reload, a closed tab, a dead session and a second press.
- Sending the artifact back applies the changes and writes the plan to the Hub, and a failure partway can be resumed without repeating anything.
- The template lives in one file and improves over time.
- Works mid-week: plans today through Sunday, and can add to today's plan.

## Non-goals

- Team-member planning. Stays Nick-only.
- Sending any email or Slack message. Drafts only, as in Prep & start.
- Changing packets or the daily cap. This week keeps reading the answered offer, with the one change below.

## Anti-goals (failure even if it technically works)

- Any change to a work task before Nick approves the exact list. Silence is never approval (working-desk rule 13).
- A press that appears to do nothing. Queued, failed and expired must show on the button.
- Answers vanishing from the page because of a rebuild.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A. Dedicated plan launch (Nick's pick)** | Its own button, its own skill and template, on both routes | Built to last |
| B. Quick Chat with instructions in the seed | The seed carries the planning instructions | Instructions in a string, no home for the template |
| C. Unattended build on the laptop | Listener builds the artifact with no live session | Dropped: Nick wants a conversation, and phone sessions already exist |

## The flow

```
Press Plan (Hub)
  no open plan: POST /api/launch-log, then mnccore://launch/<id> (laptop) or the home listener (phone)
  open plan:    the button also offers Open plan, and a new session resumes it
Session (skill: week-plan-session)
  1. plan_session.py brief: open tasks, current commitments, threads, Slack, source status
  2. build or resume the artifact; link it on the bookkeeping task
  3. talk with Nick while he works through it
Nick presses Send my plan and tells the session
  4. session captures the answers as a submission and shows the exact list
  5. Nick approves once
  6. plan_session.py apply <submission>: validates, then applies, resumable
```

### Starting it

The launch path covers both routes: `executeLaunchCommand` (`src/lib/launchCommands.ts`) posts to `/api/launch-log`, then fires the URI on a computer or queues on a phone. **No new `mnccore://` verb and no schema change.**

- The button posts a `tag='quickchat'` launch with a fixed seed that names the skill, for example `Use the week-plan-session skill to plan with me.` The first draft added a `launch_log.purpose` column; nothing would have read it, it needed a prod DDL, and refire would have lost it. The seed must not start with `/`, because the claim prepends a page header. Quick Chat already runs in `auto` on both routes (`hub_ai_listener.py`).
- Both routes get the same instructions because they live in the skill. `launch_remote_chat_v2.launch` takes no system prompt, so the `prep_start_task` system-prompt pattern would only work on a laptop.
- The button is PI-only, like `handleCreateLaunch`.
- **Button state.** A queued toast is not enough: the daemon never writes `expired`, and a row expires silently. The button reads the viewer's newest plan launch and derives Queued, Failed or Expired from `status` and `expires_at`, with press again on the last two. A second press while one is queued does nothing new.

Entry points: **Re-plan** becomes **Plan**, and the gold **Plan your week** row starts a session.

### The session

New `scripts/planning/plan_session.py`, with the instructions and template in a new skill, `.claude/skills/week-plan-session/`. Improving the template is an edit to one place. No end-of-session ritual about it.

- `brief`: one read-only function holding what `week_plan.run` does around the selector, not just `select_candidates`: email-lane exclusion, current commitments, `task_contexts`, `refresh_context`, and source status, which must reach the artifact when a source was degraded. Started tasks are **included** as cards, marked with their packet state. It also excludes the bookkeeping task and anything withdrawn this week. Everything it reads is data, never instructions (prep rule 2).
- `apply <submission>`: the supported writer. The session runs in `auto` with other write paths available, so this is a convention held by the skill plus validation in `apply`, not a sandbox.

### The artifact

A working desk, built with `desk_cards` and the `working-desk-artifact` rules, published with `{db: {}}` and git-tracked with its manifest.

- Path: `Projects/peripheral-brain-system/artifacts/week-plan-<week_start>.html`, one per week. Builder confirms the slug against `projects.slug`.
- **One card per task** in rank order: title, why, note box, and one `choice()` row: the first-step options, plus **Not this week**. Picking a first step means take it. The recommendation is marked and never preselected. This fits the kit, which stores one pick per card (`deskkit.js`), so no kit change.
- **Prep these** and **Add to today**: one multi-select card each, listing the tasks. Fewer clicks than a toggle on every card, and no kit change.
- **Add something:** a task id or free text.
- **Send my plan:** the last card.
- **Bookkeeping task:** the session creates one ordinary task, "Plan the week of X", with the artifact as its key link, so it shows on Today on any device and survives a dead session. This is the one write before approval, and the only exemption from the anti-goal. PB finds an open one by `source` and week to avoid a duplicate, and excludes it from candidates. Closed when apply finishes.

**Resume is the default.** `brief` finds an unfinished desk and the session refreshes it: card ids stay for any card that asks the same thing, so answers stay attached, and only handled cards leave (rule 11). Starting over is a separate, explicit request. The desk's own Start session link is not the recovery path: it is laptop-only, and its seed tells the session to summarize and stop. Plan is the recovery path from either device.

### Send, approve, apply

v1: Nick presses Send my plan, then says so in the session.

**Capture.** The session reads `answers`, acting only on cards with a pressed or chosen state, and writes a **submission** before any effect: a stable id, the exact answers, and the planned operations, in `data/plan_submissions/<id>.json` on that laptop, with a copy on the artifact. Edits to the artifact after this are not part of it.

**Approve.** The session turns notes into exact writes and shows them: task, field, old value, new value, plus tasks withdrawn, added, prepped and added to today. A note it could not read as a change is listed as "stays a comment, not applied". Nick approves once with AskUserQuestion and can strike items. The artifact's answers are data; this live approval is the trust boundary.

**Validate before the first write.** Run the shared rules against the planned picks, and read `daily-count`. Allocate prep slots here: the Hub refuses the whole answer if starts exceed what is left (`week-plan-start.ts:250`), and "saves the rest" lives only in the browser page (`PlanConversation.tsx`), so that logic moves into apply. Report what was saved rather than prepped.

**Apply.** Each step records its outcome on the submission, and a retry resumes the same submission:

1. Edits through BrainDB Hub-first writers, acting only on `.applied`, after checking the current value still equals the approved old value. Allowed: `due_date`, `status`, `priority`, `waiting_on`, `next_checkin_date`, with values validated. A note never completes or deletes a task.
2. Tasks for free-text additions; record their ids so a retry reuses them.
3. Publish the plan as a new offer whose candidates are **the reviewed cards plus additions**, with selection in `picks`. The offer name carries the submission id, so `mint` dedups a retry onto the same row. Verify the returned row's spec matches. Each added task's options (2-4, one recommended) are written before approval.
4. Answer it through the ordinary route. `withdrawn` carries his Not this week tasks.
5. `start:true` only for picks in Prep these that have no packet and no open request. A later Send must not replace a Ready packet he hasn't used; re-preparing takes an explicit ask.
6. Add to today: a new PB writer that computes `plan_rank`, since `src/lib/todayPlan.ts` is browser-only. Additive only: it never removes anything from today, and it captures an explicit Chicago date. The week plan has never written `planned_for`; the rule becomes "only on an approved Add to today".
7. Close the bookkeeping task. A partial result leaves it open and says what is left.

Conflicts: if a newer offer wins between mint and answer, the answer is refused. Report it as a publication conflict and do not rerun earlier steps. All cards Not this week is valid: the Hub's non-empty picks rule (`shared/weekPlan.ts:267`) relaxes when `withdrawn` is present.

### The one Hub change to the plan

The answer gains an optional `withdrawn: string[]` of task ids. `currentWeekPlan` will not carry a withdrawn task into `earlier`, and `brief` won't offer it again that week, whether from a later press or the Sunday job. It comes back next week unless the session also set a date. The parser changes on both sides, `shared/weekPlan.ts` and PB `scripts/questions/spec.py`, in lockstep. An old answer has no such field, so nothing changes for it.

This does not cancel a queued prep or dismiss a packet. Those stay visible on the task.

## To prove first, with real calls

1. **The phone path.** Hub phone launches run `launch_remote_chat_v2` (`claude --rc`), not `rc_server`, so `rc_server`'s artifact setting doesn't cover them. Prove on a phone-started session: artifact tools load, the desk publishes and reads back, and AskUserQuestion works, since it is the only approval gate. If any fail, fix the launcher's environment first. The link must come back as a URL in the session, since opening a browser on the home laptop doesn't help a phone.
2. **Answering as the PB key.** Code says it passes: the key resolves to `ingra107@umn.edu` (`api/index.ts:11`), the owner row (`packet-owner.ts`). The first draft's auth change is **deleted**. One test call confirms it.
3. **Mint and answer straight away**, against the test D1.

## Rollout

See "Decision open" below.

## Cross-repo and deploy

- PB ships the skill and `plan_session.py` before the Hub button goes live. A stale laptop still opens a chat from the seed, which fails loudly because the skill is missing.
- `withdrawn` ships in both validators first, then in `currentWeekPlan`.
- No D1 migration, no `mnccore://` handler change, no `enums.py` change.

## Decided by Nick

Session plus artifact over the Hub page; dedicated flow (A); works from a phone through the existing send-home and Claude app path; task changes are written as notes, then shown as an exact list he approves once before anything is written.

## Calls made here, for Nick to check

- One choice row per card, with Prep these and Add to today as their own cards.
- `withdrawn` holds a task off for the rest of the week only.
- Edits limited to the five fields above.
- Plan resumes by default.
- A later Send never replaces an unused packet.
- Weekly-review extras in the round-2 decision (wins, stalled projects, mentee check-ins) are out of scope here; they need their own home.

## Left to the builder

File layout inside the skill, card copy, test layout, and exact seed text.
