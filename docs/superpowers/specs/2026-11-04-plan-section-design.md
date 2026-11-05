# The plan as one section of real task cards, re-planned daily (#169, round 2)

Status: draft for Nick's approval. Follows `2026-11-04-plan-session-design.md`, which is live and has not yet run a real plan. Where they differ, this one wins. Repos: `mn-ccore-lab` (Hub) and `Peripheral-Brain` (PB).

## Why

Nick's feedback on the walkthrough, 2026-11-04:

- *"once something gets elevated to being part of the weekly / today plan should it essentially look similar to the task below like a true task card and it just gets elevated up"*
- *"at the beginning of the week there will be nothing in there I hit the plan button and I choose a few things to do ... things that are not chosen will be nicely organized below in the review, write, admin etc sections"*
- *"once I check a task off and again it goes to a done section ... at the bottom but whenever I replan that section all the done things go to where they would normally go if I would have checked them off in the normal sections below"*
- He plans about daily: answered plans on Nov 2, 3 and 4, with 4, 7 and 10 picks.
- *"I'm not sure if the right thing is to ask you to write down two to four for every single task"*
- *"Make sure I can quickly tap through these things and use the keyboard"*
- *"this will be a really really good time to clean up stuff"*, naming email drafts with the email icon, and *"use the exact same icons as if it was the task"*
- On Send: *"Watch the desk every 15s for 30 min or something"*

What the code does today: picks are thinner rows in `ThisWeekSection` and also stay in their sections (`TodayPage.tsx:335` removes only card rows), so a pick shows twice. Planned today is a second list. A finished pick has no place of its own in the plan.

## Goals

- One Plan section on Today, of real task cards, each task shown once among the lists.
- Pressing Plan is cheap enough to do every morning, on fresh information.
- A normal desk can be cleared by keyboard or thumb without opening every card.
- The session sees Send on its own while it is waiting.
- Links on the desk look exactly as they do on the task, and link mistakes get fixed as they are noticed.

## Non-goals

- Team-member planning. Still Nick-only.
- Weekly-review extras (wins, stalled projects, mentee check-ins). Nick: *"Leave them out"*.
- Any change to My Tasks' lists: they keep showing every task in its section.
- Sending any email or Slack.
- Making notes private by default. Nick looked at this and left it as it is.

## Anti-goals

- A rebuild that loses answers he has not sent.
- A task change, other than the link fixes below, before he approves the exact list.
- A task visible in two lists on Today, or in none.
- A section that looks like a separate kind of row from the task sections below it.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A. One section, Today tag (Nick's pick)** | This week and Planned today merge into one list | Simplest to scan; the biggest Today change, and dragging to the timeline has to keep working |
| B. Two lists, Today then Week | True cards in both | Clearer for a long week; more to scan, and a task moves between lists |
| C. Today list only | Each plan covers a day | Fits recent use; loses look-ahead |

## The Plan section

Replaces `ThisWeekSection` and `PlannedTodaySection` on Today, in timeline and agenda modes. Keeps the Plan button in its header.

- **What's in it:** the current plan's picks and anything planned for today. Rendered through the shared `TaskRow` (Rule 68), with the first step and packet state in new props, so it reads as the task cards below it. A pick planned for today carries a Today tag.
- **Each task once:** tasks in this section leave the task sections below on Today. Two surfaces aren't lists and keep their copy (my call): the timeline, which is a schedule, and a meeting card's rows, which show the meeting's tasks. The rail's counts don't change. Right Now was already retired (`todayPlan.ts:13`), so it plays no part.
- **Removing:** the x on a card clears its Today tag and, if it isn't a pick, sends it back to its section. Today the in-section copy is the reliable place to unplan (`TodayPage.tsx:769`); the x on the card replaces it. Taking a pick off the plan happens at the next Plan.
- **Order:** Today-tagged cards first in plan rank, then the other picks in plan order, Done last. No fold: he chose these.
- **Done:** a checked task sinks to a Done area at the bottom of the section. A pick stays there until the next plan is answered, even over a day with no re-plan, as Nick described it. A planned-today task that isn't a pick stays until its planned day ends. Either stays out of Completed today while it's there, so it shows once. After that it behaves as any finished task: Completed today if finished today, otherwise gone from Today and findable in My Tasks.
- **No plan, or not Nick:** with no answered plan covering today, the section holds what's planned for today. Team members get the same section for their own planned tasks, with no Plan button.
- **Empty:** a new week starts empty, with the Plan button and one line saying so. Last week's unfinished picks go back to their sections.
- **Controls:** a dragged task still lands here (`slot:strip`). Three-click semantics (Rule 58), Prep, and Prep & start all stay.
- The gold row stays as built, for Nick only, not foldable (his call). My Tasks gets no Plan section.

The plan stays an answered `week_plan` row. No D1 migration.

## Re-planning

Nick chose a full rebuild on every press over refreshing only what changed: *"Rebuild every card each time"*. A brief took 87 seconds on 2026-11-04 and gave 17 cards. Writing first steps on top of that is untimed; the first real run measures it.

- **When a new round starts:** when the last round's submission was captured and has nothing left to apply. If `apply` left something, Plan finishes that submission first and says so. The round number is stored with the desk's `.steps.json`.
- **New round:** once the last desk was sent, Plan builds a new round of the same week's desk: same link, fresh brief, fresh steps on every card.
- **Unsent answers win:** if the desk holds answers not yet sent, Plan keeps those cards' ids and keys and updates what's around them, as resume does today. He presses Start over to discard them. This is what keeps the anti-goal.
- **Fresh card ids per round:** a card id carries the round (`t-<task id>-r<n>`), so an old answer can't come back on a new card (desk card rule 11). This replaces "steps saved stand" in the skill.
- **Unfinished picks stay unless removed:** each open pick's card says "In your plan: <current step>", beside any fresh steps and Not this week. A card he leaves alone stays in the plan with that step. This needs no kit change: `capture` reads a current pick's card with no answer as Keep. It is the one exception to the desk's "cards you left alone change nothing", and the list he approves shows it as "Stays: ...". Silence still approves nothing: the approval is the live question on that list.
- **How a kept pick publishes:** the new offer carries the current step as that candidate's option under its old key, or the old free text when it had no key. A pick already started keeps `start:true`, and no new prep request goes out for it.
- **Recommendations are still never preselected.**
- A pick that's neither kept nor withdrawn can't happen: every open pick has a card.
- **`earlier` goes away:** with every open pick carried on a card, `currentWeekPlan`'s `earlier` list has no job. Withdrawn stays, so a Not this week task isn't offered again that week.

## First steps

- One step when the next step is clear; 2 to 4 only when the threads show a real choice. Never pad a card to reach a count. Skill wording: *"Write the one next step. Add others only if the threads show a real fork in what to do."*
- `WEEK_PLAN_MIN_OPTIONS` goes from 2 to 1, in `shared/weekPlan.ts` and PB's validator, in lockstep.
- A task with no sensible step still gets a card: a note, or Not this week.

## The desk

- **Keyboard:** on an open card, `1`-`9` picks that option and moves to the next open card, `N` picks Not this week, and Enter keeps a marked pick and moves on. Typing in a note disables these keys. A note goes in before the pick, or on a return to the card.
- **Touch:** tapping an option picks and moves on the same way, with no separate Done button.
- This behavior is opt-in per desk, so other desks keep their Done button and Tab flow.
- **Same icons:** each task card shows the task's key links with the Hub's link icons. Whatever he needs to review or work from is linked there. The desk kit gets the Hub's icon choices so the two can't drift; how is left to the builder.
- **The link's description counts:** today a draft saved with a `#all/...` URL reads as a thread, because `gmailKind` looks only at the URL (`urlClassify.ts:24`) and `LinkRow` has no stored type for key links. A key link described as a Gmail draft gets the draft icon, on the Hub and the desk. "Decide Oct A0 NOFO" is the live example.

## Link fixes without approval

Nick chose this over adding them to the approved list. It is the one named exception to "no change before approval", besides the bookkeeping task.

- **Allowed:** `key_link_1..3_desc` on a task on the desk, when a Gmail lookup through `gws` shows the label is wrong: the link is labeled a draft and no draft exists, or the reverse. Nothing else. A label it can't check is left alone. URLs, dates, statuses and priorities still wait for approval.
- **Which wins:** the checked description. After the check, the icon follows the description, so a true draft with a `#all/...` URL keeps its URL and gets the draft icon.
- **Reported:** the session lists each fix in the session as it makes it, old label and new, and adds them to the list he approves as already done, for the record.
- Goes through a BrainDB Hub-first writer. `validate` refuses any other field in this path.

## Watching for Send

- After publishing, the session checks `answers` once a minute for 30 minutes. When `send-plan` is pressed it captures and shows the list. After 30 minutes it stops and says typing in the session still works.
- Why not every 15 seconds: the desk has no route to a laptop session. A page can't call other hosts, artifact wake-ups reach only cloud sessions, and nothing in PB reads the artifact db outside a session, so each check is a full model turn: 30 turns at a minute, 120 at 15 seconds. Nick said *"or something"*; this is my call for him to check.
- Approval is unchanged: a live AskUserQuestion.

## Tests that must exist

- A pick shows once on Today; a Done pick shows once; both before and after a new plan answer.
- Monday with last week's plan: empty section, tasks back in their sections.
- Sunday evening with next week's plan answered: the section shows the plan for the week the existing window picks, and the nudge reads as it does now.
- A new round: old answers don't reappear; unsent answers survive a press of Plan.
- A card left alone keeps its pick and step, a started one keeps `start:true` with no new prep request; an all-Keep Send publishes nothing new and says so.
- A finished pick stays in Done over a day with no re-plan; a finished non-pick leaves when its day ends.
- A half-applied round: Plan finishes it before starting a new one.
- A one-option candidate passes both validators; a zero-option one is refused.
- Link-fix path refuses every field but the three descriptions, and an unchecked label changes nothing.
- A key link described as a draft with a thread URL gets the draft icon.
- Keyboard: digits typed in a note don't pick anything.

## Rollout

Ship when tests pass, no waiting schedule. PB ships the validator and skill first, then the Hub. Lowering the option minimum only loosens the rule, so existing rows and desks stay valid. Nick's real plan on the current version can happen any time; its timings and rough edges feed this build. Rollback is reverting the commits.

## Calls made here, for Nick to check

- A planned task with a time stays on the timeline as well as in the section, and a meeting card keeps its rows.
- Cards order: Today first, then picks; the section never folds.
- A kept pick reads "In your plan" instead of a marked button.
- A week's Done area stays out of Completed today until the next plan.
- An all-Keep Send publishes no new plan.
- Once a minute, not every 15 seconds.
- Link fixes cover labels only, because that's the example given.
- The fix is listed as done on the approval list too.
- My Tasks is unchanged.

## Left to the builder

Section copy, props on the shared row, how the kit gets the Hub's icon set, and test layout.
