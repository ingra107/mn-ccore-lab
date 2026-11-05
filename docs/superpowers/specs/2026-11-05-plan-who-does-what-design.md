# Planning that does the work: who does what (#169, round 3)

Status: approved by Nick 2026-11-05, with his changes to the limits. Follows `2026-11-04-plan-session-design.md` and `2026-11-04-plan-section-design.md`; where they differ, this one wins. Repos: `mn-ccore-lab` (Hub) and `Peripheral-Brain` (PB).

## Why

The first real plan ran on 2026-11-05 and Nick found the desk made the wrong promise. Reported by his plan session, in his words:

- *"everything that I decided to do... I kind of expected you to do, but it never happened. So we need to clarify who's doing what."*
- *"I thought you would have closed this yesterday when I made this decision."*
- *"Why aren't the two new cards the first thing that opens? If things have been decided, they should be collapsed and gone"*
- *"look at this... how do i know what you need from me"*
- *"There should totally be a follow-up section or something and then everything from the old round is collapsed or something. Still findable if needed but whatever you absolutely need an answer on should be the only thing that I see on the page or at the very least be at the top."*

And directly to me:

- On who works: *"the main, the parent live session is the one that sends off background agents ... when the background agent comes back, obviously the main session will be able to triage things first and let the background agent know if it did things correctly or not. So a lot of issues will be found before it even gets to my eyes. And then if you need me, I'll be right here. But then it also protects the context window of the main session."*
- On steps: *"there's things for Claude to do, and then there's things for Nick to do ... you should have those as options, as like a Nick next step and as a Claude next step. And sometimes there's only going to be a Claude next step or only a Nick next step. And sometimes there will be two or three for each ... I would hate to pigeonhole us to only one step. I also don't want to force us to come up with two to three for every single one."*

What the code does today: a pick with `start:true` makes a `packet_prepare` request, a background job prepares a first step, and it waits as Ready. Nothing finishes or closes a task. A pick the session doesn't start reads Saved.

## Goals

- A card says who does each step.
- Picking a Claude step means Claude does it, in this session's care, and Nick hears what's done and what's left.
- Picking a Nick step puts it on the plan as his.
- A close Nick asks for happens, on the one list he approves.
- A decided card asks nothing and gets out of the way.
- The desk is short.

## Non-goals

- Sending email or Slack. Drafts only, as in Prep & start.
- Deleting a task from the list. Close only.
- Retiring packets, Ready, Prep or Prep & start. They stay for what's already prepared. Whether they go is a later call.
- Team-member planning.

## Anti-goals

- A background agent changing a task, sending anything, or closing anything by itself.
- A result reaching Nick that the session hasn't checked.
- A step invented to fill a slot.
- Closing a task on anything but a line he approved.
- Work lost because a session died.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A. Live session dispatches agents (Nick's pick)** | The planning session sends each Claude step to a background agent, checks the result, reports | He can steer; its context stays clean; ends if the session ends, so results save as they land |
| B. Background lane only | The listener does the work after the plan lands | No session needed; nobody checks it before Nick sees it |
| C. Session does it all itself | No agents | Its context fills up, and one long task blocks the rest |

## The card

Steps are split by who does them. Either lane may be empty. There is no minimum and no fixed count.

```
Review satisfaction survey
  Your next step
    ● Review the draft  [link]

ADHERE-LPV Intro+Methods
  Claude can
    ● Tighten Methods from the protocol   rec
    ○ Outline the Intro
  Your next step
    ○ Decide the primary outcome wording
```

- **Writing rule, for the skill:** add a step only if it leads to a different result or a different person does it. Otherwise leave it out.
- **Each step** has an owner, `claude` or `nick`; a label; what it produces; and links to what it needs. A step that asks Nick to look at something must link to it. If the task has no link to give, the session finds one or says so.
- **One pick per card**, as the kit stores it. A step that's really a pair reads as one: "Claude drafts, then you review". Not this week stays.
- **Option shape:** `WeekPlanOption` gains an optional `owner`, in `shared/weekPlan.ts` and PB in lockstep. A plan with no `owner` on it is an old plan and renders exactly as today (Preparing, Saved), so this week's plan isn't relabelled. A card with steps still has one recommended.
- **A typed pick:** `WeekPlanPick` gains an optional `owner`, for a pick with free text and no option. The session sets it when it reads the note, and the list shows which he's getting. An option's owner wins when there is one.

**A decided card** holds what he already decided: "Your call: wait until next week." It offers no steps and asks nothing. It replaces the "No first steps written yet" text, and a kept pick with a fresh recommendation no longer re-asks: fresh steps appear on a kept card only if the threads moved since he chose. "Moved" means the brief's own evidence, mail, Slack or a teammate's comment, has an `observed_at` later than the plan's `answered_at`. A decided card has a `decided` entry in the steps sidecar instead of options, and no pick means it's not a candidate on the offer.

## The desk

- **It has to look good.** Build from the desk kit's and the Hub's own design components. The mock settles structure, order and labels, not polish. Nick: *"make sure that design components are leveraged to make it look pretty"*.
- **Drop Prep these and Add to today.** A pick is the go-ahead. Each picked card shows a small Today toggle, stored on the card's answer, and the list shows it as today.
- **The page opens on what needs him.** In this order: a line saying "2 cards need you", then a **Needs you** section holding only unanswered cards, new ones first and marked New. Below it, folded: **Answered** and **From earlier rounds**. All still findable, and all still editable when opened.
- **One label per folded row, in words:** Picked: <step>, Note saved, Not this week, or Decided. This desk loses the gold note stripe and the dimming, which read backwards: the stripe looked like the one needing attention.
- **What counts as answered:** a pick or a note, worked out by the desk on load and when the note box loses focus. Nothing writes `status`, so a session never does it by hand, and capture is untouched: it already reads picks and notes, never status. Opening an answered card lets him change it. This amends desk rule 13 for this desk's layout only: nothing is approved until the live question on the list.
- **On a phone:** same order, so the first thing under the header is the first card needing him, with its steps stacked full width and folded sections one row each. The count line stays under the header, not fixed to the screen.
- **A task closed after the build** drops off on the next read of `answers`, and the session says so, without needing a rebuild.
- **A rebuild drops steps for tasks no longer on the desk**, says which, and carries on, instead of refusing and forcing a hand edit of the sidecar.

## The approved list

Reads by owner, then closes:

```
Claude works on:
1. ADHERE-LPV: Tighten Methods from the protocol
Yours:
2. Satisfaction survey: Review the draft (today)
Close:
3. Backbone Git phase 2
Stays: 4. CLIF 3.0 vs 2.1
```

**Close** is a new op. Capture still doesn't read notes. The session adds a close with a new `plan_session.py` verb, naming the task and his words: his note, or what he said in the session, marked live. The list prints those words beside the line. Capture records the task's `updated_at`; apply re-reads it: already done is skipped, a task someone changed since capture is a conflict that stays open and is listed, and a retry can't double up. It calls `BrainDB.complete_task`, the same Hub-first writer the bookkeeping close uses. A note the session can't read clearly stays a comment, as today. This replaces "a note never completes a task", and the list can't complete a task any other way. Delete stays refused. Checking a task off anywhere else in the Hub is unaffected.

## After approval: the work

After `apply` lands, the session runs Claude's picks:

1. **Dispatch.** Every Claude pick goes out at once, one background agent each, using the specialist that fits the step (mechanic, researcher, operator and so on) and a brief the session writes: the task, the step, the links, and what done looks like.
2. **What an agent may do:** read, draft, analyze, write to working files, make Gmail drafts, and a specialist's normal work under its own rules, such as a code commit. It may not change a task, post a comment, send anything or close anything. The brief says so, and the session holds the task writers.
3. **Check.** The session reads each result against the brief, and tells the agent what's wrong if it falls short. If two tries haven't fixed it, the session tells Nick live what's going on and asks. If he's away, the same note goes on the task and waits for him.
4. **Save as it lands.** Each checked result is posted as a packet on the task, through `post_packet` with the existing spec, so it reads Ready on the Plan card with Use and Dismiss, on any device. `answer`, `doc_text` and `gmail_draft` already cover the three shapes: prose goes in the body, a file goes in a working folder with a `doc_text` link, and it never overwrites his file or edits a Google Doc (those stay read-only: suggested text goes in the packet). A task with a live packet follows the route's rule: a new producer key replaces it, and one he's edited refuses with 409, so the session reports that and leaves his version alone. The producer key includes the plan's week and the option, so a retry doesn't post twice. Before posting, the session re-reads the task: closed or withdrawn during the run means no post, and it says so. A dead session loses only what's still running.
5. **Report.** A short list: done, waiting on you, stuck and why. It asks him only when it needs him.

**Plan card:** a Claude pick reads "With Claude" until its packet lands, then Ready; a Nick pick reads "Yours". "With Claude" says whose it is, not that something is running, because the Hub can't tell whether a session is alive. Picks stay `start:false` so no background job runs on them. A step that fails gets a note on the task saying why. If the session dies, Prep & start and Prep are still on the card.

**Unfinished work** is worked out, not stored: a Claude pick on the current plan with no live packet. The next Replan's brief lists these first and offers to run them. No new table or field.

**Limits.** No cap on how many run. Nick, on a limit of three: *"what if I give you eight next steps"*. One rule stands from his standing instruction: more than 10 Opus-tier agents in one round, tell him first. Pick the tier by the step. These don't count against the background daily limit, which meters the lane this doesn't use.

## Other findings from the run

- The tier label fix and the NOFO recommendation fix already landed (`7f72da4b9`).
- `drive_comment_monitor` makes Review comments tasks for abstracts already submitted, because its check sees open tasks only. Separate PB fix, in this work's first task, since it fills the desk with noise.

## Tests that must exist

- A card with only a Nick step, only a Claude step, both, and none (decided) all build and publish; a card with only Not this week passes validate.
- A plan with no `owner` renders as today, on both sides. A typed pick with an owner round-trips.
- A kept card with no moved threads shows no fresh step.
- The page opens on Needs you with the right count; an answered card folds with its label on load and on the note losing focus; opening one lets him change it; capture's output is the same with the layout on or off.
- A new-round or added card is first in Needs you. Earlier rounds' cards are folded and findable.
- On 390px the first card needing him is the first thing under the header, with no sideways scroll.
- A rebuild with steps for a departed task drops them and says so.
- Close: approved closes; a task already done is skipped; one changed since capture is a conflict; a retry doesn't double up; a struck line doesn't close; a delete can't be expressed.
- A Claude pick makes no `packet_prepare` row. A Nick pick shows Yours, with no Prep button.
- A checked result posts one packet; a retry doesn't post a second; a 409 leaves his version; a task closed during the run gets no packet.
- A Claude pick with no live packet is listed as unfinished on the next brief, and one with a packet is not.
- Dropping both cards: Today toggle round-trips, and `today` ops still only add.

The dispatch and check loop lives in skill prose, so no test can hold it: the first real run is its test, and the plan names what to watch.

## Rollout

Ship when tests pass. Hub first, for `owner`; PB straight after. Nick's in-progress plan finishes on the current code. No D1 migration.

## Calls made here, for Nick to check

- After two tries that don't fix a result, the session tells him rather than trying again.
- A note folds a card on losing focus, not on a press.
- "With Claude" rather than "Claude working".
- Results reuse packets rather than a new store.
- These runs don't count against the daily limit.
- One pick per card, including across the two lanes.
- Close is the only completion the list can make.

## Left to the builder

Skill wording and the split into reference files, card copy, brief format, how New is marked, and test layout.

## As built

Where the build settled a call differently from the text above, this section wins.

- **A close leaves a keep alone, and lands after publish.** The list does not carry a close as part of a withdraw. The plan publishes first, then the task closes, and a finished pick sits in Done until the next plan. A close is read only from the newest list of its Send, so an older list's close can't fire. A teammate's comment on the task since the brief holds the close and lists it as a conflict, because `updated_at` doesn't move on a comment and "don't close this" is the likeliest reason to hold. A comment by Nick or Claude doesn't count.
- **Answered stays open by default,** as in the mock Nick approved. From earlier rounds stays folded. The text above says both fold; flipping Answered is one line.
- **A carried pick with unmoved threads starts under Answered.** A decided or kept card asks nothing, so it doesn't start under Needs you.
- **The `moved` sidecar form.** Evidence timestamps cover mail only, but the session also reads Slack and comments. A kept card shows fresh steps when its sidecar entry has `moved: true` as well as when `observed_at` is later than `answered_at`. A session that over-marks only re-asks.
- **No agent cap.** The session sends every Claude pick at once. The standing rule stays: more than 10 Opus-tier agents in one round, tell Nick first.
- **A note that is his own step: `ps pick <sub> <task> --text "<his words>" --owner nick|claude`.** The card still folds as Note saved, and capture still reads the note as a comment. This verb swaps that comment for a typed pick, so it reads under `Claude works on:` or `Yours:` and he approves it on the list. His words must be in this round's note unless `--live`. It refuses a task that has a pick or was taken off this week, and a card with no steps. It carries to a later capture while his note is unchanged. `set-pick-owner` stays for a typed pick an older desk made.
- **Every fresh step names its owner,** additions' steps too; the build and `add-options` refuse one that doesn't. Only an option from an offer already published may lack one, so an old plan still reads as before.
- **Nothing joins a list once `apply` has started.** `edit`, `close`, `pick`, `set-pick-owner` and `add-options` refuse: "this list has run; a new change is a new Send". `strike` still works.
- **An open prep request is not unfinished.** Prep on a Claude pick hands it to the listener, so the brief leaves it out of `unfinished`, and the Plan card reads Preparing rather than With Claude until the packet lands. If the requests can't be read, no pick is called unfinished and `source_status` names them. A carried start queued nothing, so it keeps its owner's tag.
- **A Today tick counts as an answer.** It joins the submission id only when on, so a re-Send that adds one captures, and a list with none keeps its id.
- **A close's words from a note are his whole note, even one word like "Done", or at least two words from inside it;** said live, at least three characters.
