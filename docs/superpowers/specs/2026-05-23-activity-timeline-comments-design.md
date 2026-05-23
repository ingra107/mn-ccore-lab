# Activity Timeline + Comments — Design Spec

> **Status:** DESIGN APPROVED by Nick 2026-05-23 (brainstorming session). NOT yet planned/implemented. This supersedes the OPEN decision in `~/Peripheral-Brain/Context/Decisions/2026-05-23-notes-description-privacy-boundary.md` — the answer is **Model A**.
> **Next step:** next-session protocol at the bottom (review → Codex review of THIS spec → implementation as part of P2). **Do not start building from this doc without the Codex step.**
> **Scope:** Hub tasks + projects. Cross-repo (Hub `mn-ccore-lab` + PB `Peripheral-Brain` sync layer).

**Goal:** Collapse the four overlapping per-item text surfaces (`description` / `notes` / `comments` / `updates`) into a clean two-part model — a stable **Description** (the "what is this") plus a unified **Activity timeline** whose primary input is a frictionless one-line **comment composer** with `@`-tag-to-notify. Private `notes` stay brain.db-local, off the Hub entirely.

**Why now:** This is mission-priority **P2 (Today/MyTasks completeness)**. It also resolves a live privacy/correctness defect (below) and matches where world-class team tools (Linear, GitHub, Asana, Height) have converged: Description pinned on top, one append-only timeline of system-events + human-comments below, comment composer as the input, `@`-mention → notification.

---

## ⚠️ THE CORE PROBLEM — read this first (Nick's #1 concern)

**Hub `tasks.description` is currently behaving as an APPEND TARGET, not a clean body — this is completely wrong and is the thing the migration must fix carefully without breaking anything.**

Mechanism (verified this session):
- brain.db `tasks.notes` is a field that **accumulates appended content**: `BrainDB.complete_task` appends `[date] ✓ <name>`, `uncomplete_task` appends `[date] reopened: <reason>`, `retire_local_duplicate` appends `retired_local_duplicate: …`, plus mechanic plan-file links, plus Nick's running annotations from TODAY.md chats.
- The sync then maps `notes` → Hub `description` **unconditionally** (`outbox.py:271-275` `_LOCAL_TO_HUB_FIELD_MAP["tasks"]={"notes":"description"}`, applied in `translate_patch_for_hub` `outbox.py:470-507`), and since 2026-05-12 (`hub.py:1331-1334`, commit `a94f6cb5`) it pulls back too.
- **Net effect:** Hub `description` is not "what is this task" — it's a growing pile of appended notes + markers. That pile is then shown to the team in the description pane, surfaced in search, used as the "why" callout, and pulled into meeting agendas.

**The right model:** `description` is a *stable, editable body*. The running/appended/event content belongs in the **Activity timeline** as discrete entries — never appended into the body. Untangling the existing conflated `description` data without losing content or breaking the live team surface is the **hardest part of this work** and the focus of the next-session Codex migration plan.

---

## Current-state field landscape (the mess being fixed)

| Field | Store | Today's role | Visibility | Fate under this design |
|---|---|---|---|---|
| `tasks.description` | Hub | team body **+ wrongly an append target** | Team | Becomes a CLEAN, stable, editable body |
| `tasks.notes` | brain.db | Nick's scratch + auto-appended markers; **syncs to Hub `description`** | meant private; leaks | **Local-only**, sync map REMOVED; markers move to Activity |
| `tasks.notes` | Hub | separate column, read-redacted in `TASK_SELECT_COLS` this session | not shown | Stays unused / removed; not the team surface |
| `task_comments` | Hub | per-task discussion + @hermes | Team | Becomes `comment`-type Activity entries (unify) |
| `task_updates` | Hub | typed progress notes (progress/blocker/result) | Team | Fold into Activity timeline (system or comment) |
| `comments` (project) / `project_updates` | Hub | project discussion / status | Team | Fold into project Activity timeline |
| `activity_log` | Hub | auto system events | Team (PB-filtered) | Becomes the `system`-type Activity entries |
| `projects.notes` | brain.db | project scratch; pushes to Hub `description` | leaks on push | **Local-only**, sync map REMOVED |
| `projects.next_action`/`journal`/paths/citations | brain.db | private project context — never synced ✓ | local | Unchanged (already correct) |

---

## Target design — every aspect

### A. Description (the clean body)
- **What:** team-visible, editable, *stable* rich-text body. "What is this task / project." Answers the reader's "what am I looking at."
- **Never appended to.** No code path appends events/markers/annotations into it. Edited only by an explicit human edit of the description field.
- **Write path:** inline-edit-on-blur on TaskDetailPanel / ProjectDetail (existing affordance) → `description` mutation. That is the ONLY writer.
- **Read paths (must keep working, now reading a clean body):** TaskDetailPanel description pane (`TaskDetailPanel.tsx:466-478`), MyTasks `InlineDetail` first line (`InlineDetail.tsx:101-103`), ProjectDetail body (`ProjectDetail.tsx:1696-1724`), global search (`search.ts:150-157`), the "why is this in front of me" drawer callout (`tasks.ts:542-543`), meeting agenda carried-forward items (`meetings.ts:170`).

### B. Activity timeline (the unified feed — keep the name "Activity")
- **What:** ONE append-only store per entity. Conceptual row shape:
  `{ id, entity_type: 'task'|'project', entity_id, type: 'system'|'comment', actor_slug, body, mentions: string[], created_at }`
  (Exact table strategy — extend `activity_log`, unify `comments`/`task_comments`/`task_updates`, or a new `timeline` table — is a migration-design question for the Codex step; the conceptual contract is what matters here.)
- **`system` entries** — auto-generated on events: created, status change, stage change, completed, reopened, assigned, (and the markers that today get appended into `notes`: ✓done / reopened / retired). These replace the note-append behavior.
- **`comment` entries** — human-typed via the composer (Section C), including Nick's TODAY.md-style annotations ("waiting on Bob to email back"). @hermes comments continue to trigger the AI listener, now as a `comment` entry in the same feed.
- **Render:** unified reverse-chronological feed. Runs of similar `system` events collapse (Linear pattern) to fight timeline pollution. A **filter toggle: All / Activity (system) / Discussion (comments)** so you can get the "auto-log only" view OR the "discussion only" view from one substrate.
- **Read/render sites:** TaskDetailPanel Activity tab (unified), ProjectDetail Activity tab, the global `/portal/activity` page, **TODAY.md** (renders the entity's recent comment/system entries so Nick keeps seeing his annotations exactly as today), global search (searches `comment` bodies), digest email (optional — currently titles only).

### C. The INPUT — frictionless one-line comment composer (the heart of the refinement)
This is the load-bearing UX. The timeline is only as valuable as how easily things get into it. **Comments are the natural input** — "write an update" and "write *at* someone" are the same gesture, exactly like Nick's TODAY.md one-liner.
- **A one-line input that expands as you type** (not a modal, no separate "save"), pinned to the timeline. Enter posts; Shift+Enter newline.
- **Present everywhere you view/edit a task or project:** TaskDetailPanel, ProjectDetail, and (stretch) an inline quick-comment on Today/MyTasks rows so a comment is one click away from the list.
- **Built on `MentionInput`** (CLAUDE.md Critical Rule #7 — never a raw `<textarea>`) + **`useMentionAutocomplete`** (`/api/team/slugs`).
- **On submit → appends a `comment`-type Activity entry**, optimistic (appears instantly in the feed, undo per the design system's optimistic+undo rule).
- **Mirrors the TODAY.md feel:** type a line, it's recorded. No ceremony.

### D. `@`-mention + tagging + NotificationBell (must be STREAMLINED)
- Typing `@` → inline autocomplete of team slugs (`useMentionAutocomplete`). Selecting inserts the mention token.
- **On post, each `@person` → an in-app notification** delivered through the existing notifications system surfaced in **`NotificationBell`** (`src/components/NotificationBell.tsx`). (The @hermes path already exists; extend the same wiring to @people.)
- **"Streamlined" means, concretely:**
  - The `@` → autocomplete → select → keep typing → post chain is one fluid motion, zero modal hops.
  - The notification copy is explicit and deep-links: "*<actor> mentioned you on <task/project title>*" → clicking opens that entity's Activity at the entry.
  - The `NotificationBell` shows mention notifications distinctly (so a mention isn't lost among system noise), with unread state + mark-read.
  - Email notification on mention is **optional / later** — in-app bell first.

### E. Notes (private, local-only) — off the Hub
- brain.db `tasks.notes` / `projects.notes` = Nick's **private scratch**, **never synced to the Hub**. The `notes`→`description` sync map (`_LOCAL_TO_HUB_FIELD_MAP`) is **removed**, and the 2026-05-12 pull-back (`hub.py:1331-1334`) is **removed**.
- The auto-appended markers that used to land in `notes` now emit as **`system` Activity entries** instead (right place, synced, visible).
- No per-item private-notes field on the Hub (world-class tools don't ship one; "if only you can see it, it lives in your personal system" = brain.db).

---

## Inputs / writes / reads — the exhaustive map (be cognizant EVERYWHERE)

Per Nick: we must know every place each field is **written** and **read** before touching anything. This is the checklist the implementation + Codex migration must honor.

**`description` (Hub) — target: clean body, only explicit edits write it**
- WRITE (keep): inline-edit on TaskDetailPanel / ProjectDetail → description mutation (`tasks.ts` / `projects.ts` update handlers + `mutations.ts` patch).
- WRITE (REMOVE): the brain.db `notes`→`description` sync rename (`outbox.py:271-275`, `:470-507`) on push; the `hub.py:1331-1334` pull-back; project push rename (`outbox.py:274-277`, vestigial `hub_payload.py:563-566`).
- READ (keep, now clean): `TASK_SELECT_COLS` GETs, `TaskDetailPanel.tsx:466-478`, `InlineDetail.tsx:101-103`, `ProjectDetail.tsx:1696-1724`, `search.ts:150-157`, `tasks.ts:542-543` (why-callout), `meetings.ts:170` (agenda).

**`notes` (brain.db) — target: local-only**
- WRITE (keep, local): `BrainDB.complete_task`/`uncomplete_task`/`retire_local_duplicate`/`add_note_to_entity`/`update_task` — BUT the auto-marker appends should be re-pointed to emit Activity `system` entries instead of (or in addition to, TBD by Codex) the local notes append.
- SYNC (REMOVE): all `notes`↔`description` mapping, both directions.
- READ (local only): TODAY.md generation / brain.db consumers. Confirm none expect notes to reach the Hub.

**Activity timeline — target: the unified store**
- WRITE: the comment composer (`comment` entries) on TaskDetailPanel / ProjectDetail / (stretch) row quick-comment; auto-emitters for events (`system` entries) replacing `logActivity`'s current usage + the note-append markers; @hermes listener.
- READ: TaskDetailPanel Activity tab, ProjectDetail Activity tab, `/portal/activity`, TODAY.md render, `search.ts` (comment bodies — currently `task_comments`/`comments`/`project_updates`/`task_updates`/`activity_log` are searched separately at `search.ts:164-186`; unify), digest (optional).
- NOTIFY: `@person` mentions → notifications → `NotificationBell`.

**Existing tables to reconcile in the migration:** `activity_log`, `comments`, `task_comments`, `task_updates`, `project_updates` (Hub) + the PB mirrors `d1_task_updates` / `d1_project_updates` (`d1_task_comments` is inert). Decide which collapse into the unified timeline vs stay.

---

## The migration — the hard part (think long and hard; don't break things)

This is what next-session **Codex must produce explicit step-by-step instructions for.** Known hard questions:
1. **Untangle existing `description`:** today's `description` values are conflated body-plus-appended-notes. How to separate the "real" body from accumulated appends/markers? Options to evaluate: keep existing description as-is and only fix *forward* (new tasks get clean bodies; old ones stay messy); OR a one-time parse/split; OR manual cleanup of the active set. **Must not lose data.**
2. **Backfill the Activity timeline** from existing sources (`activity_log` + `task_comments` + `task_updates` + `comments` + `project_updates` + the historical note-append markers) into the unified store, de-duplicated, with correct `type`/`actor`/`created_at`.
3. **Remove the `notes`↔`description` sync** (PB outbox map + hub.py pull-back) in **cross-repo lockstep** (CLAUDE.md cross-repo coordination rule: decision doc + enums/registry + ship both repos together; never migrate data ahead of dependent code).
4. **Order of operations** so the live team surface never regresses mid-migration (description reads must keep working throughout; no window where the team sees broken/empty bodies).
5. **Re-point the brain.db auto-markers** (complete/reopen/retire) to emit Activity `system` entries instead of polluting `notes`/`description`.
6. **Preserve Nick's existing local `notes` content** (it stays local; don't delete).

---

## Explicitly OUT OF SCOPE (per Nick, 2026-05-23)
- **A comment automatically changing a structured field** (e.g., parsing "waiting on Bob" → setting the `waiting_on` field). Deliberately excluded — it's overengineering and gets complicated. Comments are just comments / timeline entries. Do not design or build this coupling.

---

## Next-session protocol (Nick's explicit instructions, 2026-05-23)
1. **Review the whole `WORKPLAN.md`** + this spec.
2. **Get a Codex review of JUST this notes/comments-timeline part** (not the whole workplan). Use the `/codex-cli` skill.
3. **Codex must output EXPLICIT step-by-step instructions for:**
   - **(1) how it would ALTER this plan/spec** (gaps, risks, better sequencing), and
   - **(2) step-by-step instructions to actually CARRY OUT the notes + comments migration** (the untangle-description + backfill-timeline + remove-sync-map + safe-ordering work above).
4. Then proceed to implementation (writing-plans → build) as part of **P2 — Today/MyTasks completeness**.

## Self-review notes
- No placeholders. The table-strategy ("extend activity_log vs new timeline table") is intentionally left as a Codex/implementation decision, not a gap — the conceptual contract is fixed.
- Internal consistency: `notes` local-only (E) ⇄ sync-map removal (map + migration #3) ⇄ markers re-pointed to Activity (B, E, migration #5) — consistent.
- Scope: single coherent feature; the migration is the risky sub-part, correctly gated behind the Codex step.
