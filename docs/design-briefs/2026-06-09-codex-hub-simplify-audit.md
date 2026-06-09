# Hub Simplification + Loose-Ends Audit — Verdict

The biggest Level-1 simplification is a **single durable operating-day plan primitive**. Today stores `rightNow/planned/done` in browser `localStorage` (`src/hooks/useTodayState.ts:28-43`), My Tasks mutates that same localStorage snapshot directly (`src/pages/MyTasks/index.tsx:165-173`), while PB Sector has a separate D1-backed `dailyPlan` model (`src/pages/portal/PBSector.tsx:53-61`, `src/pages/portal/PBSector.tsx:102-121`). That is not a workflow; it is three day-planners pretending to be one.

The worst loose end is **meeting capture dishonesty**. Today says “click meetings to take notes,” but those notes live only in component state (`src/components/today/Timeline.tsx:69-70`, `src/components/today/MeetingRow.tsx:52-56`). The MeetingDetail page has the real persistent notes mutation (`src/hooks/mutations/useMeetingMutations.ts:27-38`), and Meeting Transcripts exposes upload/process controls whose handler only shows “coming soon” (`src/pages/portal/MeetingNotesPage.tsx:258-262`, `src/pages/portal/MeetingNotesPage.tsx:341-354`). For Nick’s meeting-heavy workflow, this is the highest-friction “looks real but is not real” surface.

The top workflow win: make `/portal/dashboard` the one true **morning triage + meeting-flow cockpit**, backed by the same persisted plan PB uses. Do not add more cards. Collapse Today, PB Sector planning, and My Tasks “planned today” into one plan state, then make meeting notes/actions save into the real meeting/project/task streams.

## A. Level-1 Simplifying Primitives

1. **Durable Operating-Day Plan** | kills localStorage/D1 split-brain for Right Now, planned slots, done-today | collapse `useTodayState` localStorage (`src/hooks/useTodayState.ts:28-43`), MyTasks direct writes (`src/pages/MyTasks/index.tsx:165-173`), PB dailyPlan plumbing (`src/pages/portal/PBSector.tsx:102-121`) into one D1-backed plan API | **ENG + DESIGN** | **L**

2. **DataPage Shell** | kills bespoke page state for filters/sort/view/density/loading/empty/table widths | Projects has its own category/view/sort/pin state (`src/pages/Projects.tsx:129-138`), Manuscripts its own view/filter/sort state (`src/pages/portal/ManuscriptsPage.tsx:102-119`), Grants repeats the same pattern (`src/pages/portal/GrantsPage.tsx:382-392`), Decisions repeats it again (`src/pages/portal/DecisionsPage.tsx:751-760`); `TableControls` already exists but leaves “each page provides its own” filters (`src/components/table/TableControls.tsx:107-112`) | **ENG + DESIGN** | **M/L**

3. **Query Resource Primitive** | kills silent empty-data failure and ad-hoc fetch/error handling | `fetchApi` throws typed errors (`src/lib/api.ts:218-232`), but many hooks bypass it and return `[]`/`null` on failure (`src/hooks/useApiData.ts:271-281`, `src/hooks/useApiData.ts:301-314`, `src/hooks/useApiData.ts:515-529`, `src/hooks/useApiData.ts:1729-1736`); `QueryState` exists but is opt-in (`src/components/QueryState.tsx:1-18`) | **ENG** | **M**

4. **Universal Task/Operational Row** | kills remaining row forks after the shared TaskRow win | shared contract exists (`src/components/tasks/TaskRow.tsx:1-18`), but MyTasks ListView still renders its own grid row with truncation/select checkbox (`src/pages/MyTasks/views/ListView.tsx:190-213`), Personal has bespoke TodayHero rows (`src/pages/portal/PersonalPage.tsx:837-852`, `src/pages/portal/PersonalPage.tsx:872-889`), Deadlines has its own mobile/desktop task rows (`src/pages/portal/DeadlinesPage.tsx:500-621`) | **DESIGN + ENG** | **M**

5. **Task Field Editor Primitive** | kills duplicated status/priority/due/project handlers and chips | `TaskQuickEditChips` centralizes Status/Priority/Due/Project (`src/components/tasks/TaskQuickEditChips.tsx:147-271`), while ListView reimplements the same mutation handlers and inline controls (`src/pages/MyTasks/views/ListView.tsx:66-97`, `src/pages/MyTasks/views/ListView.tsx:220-249`) and Deadlines reimplements due/status controls (`src/pages/portal/DeadlinesPage.tsx:568-607`) | **ENG + DESIGN** | **M**

6. **One Modal/Sheet Shell** | kills modal focus-trap/backdrop/header/footer reimplementation | shared `ui/Modal` has portal, Escape, focus trap, shell, footer (`src/components/ui/Modal.tsx:20-31`, `src/components/ui/Modal.tsx:78-185`), but Meeting Transcript modal hand-rolls the same behavior (`src/pages/portal/MeetingNotesPage.tsx:242-266`) and CreateProject still owns a separate modal shell (`src/components/CreateProjectModal.tsx:67-125`) | **DESIGN + ENG** | **M**

7. **Canonical Research Stage Model** | kills stage-label/color/API vocabulary drift | ProjectDetail defines local stages/labels (`src/pages/ProjectDetail.tsx:69-80`), Narratives API emits lowercase/internal stage names including `data_analysis`/`submitted` (`api/routes/narratives.ts:37`), while Narratives UI color maps Title Case labels (`src/pages/portal/NarrativesPage.tsx:16-32`) | **ENG** | **S/M**

8. **Unified Project Activity Timeline** | kills Notes/Comments/Activity tab overlap | ProjectDetail has separate `notes`, `comments`, and `activity` tabs (`src/pages/ProjectDetail.tsx:67`); overview separately merges recent notes/comments (`src/pages/ProjectDetail.tsx:389-400`); Activity tab embeds decisions, dependencies, updates, comments, and action items as sections (`src/pages/project/ProjectActivity.tsx:51-68`) | **ENG + DESIGN** | **L**

## B. Loose Ends

| What | file:line | tag | Finish/Delete | Shape |
|---|---:|---|---|---|
| Today meeting notes are local-only scratch state, not persisted | `src/components/today/Timeline.tsx:69-70`, `src/components/today/MeetingRow.tsx:52-56` | **PENDING-DATA** | Finish by saving to `/api/meetings/:id/notes`, or delete textarea | ENG |
| Meeting transcript/audio UI is not wired | `src/pages/portal/MeetingNotesPage.tsx:126-133`, `src/pages/portal/MeetingNotesPage.tsx:258-262`, `src/pages/portal/MeetingNotesPage.tsx:341-354` | **DEFERRED-UI** | Hide or finish; current button is fake affordance | ENG + DESIGN |
| Dead exported `handleUpsertTodayMd`; POST retired and not registered | `api/routes/pb-today.ts:13-22`, `api/index.ts:62`, `api/index.ts:494-498`, `api/index.ts:2407` | **DEAD** | Delete export/function | ENG |
| Narratives related publications expect `pub_date`, API returns `year` | `api/routes/narratives.ts:107-108`, `src/pages/portal/NarrativesPage.tsx:184-185` | **PENDING-DATA** | Fix contract or hide related pub date | ENG |
| Narratives stage colors cannot match current API stage strings | `api/routes/narratives.ts:37`, `src/pages/portal/NarrativesPage.tsx:16-32`, `src/pages/portal/NarrativesPage.tsx:148-149` | **PENDING-DATA** | Normalize via stage primitive | ENG |
| Mentee fallback list is stale vs comment and derived API path | `src/pages/portal/MenteeMilestonesPage.tsx:41-43`, `src/pages/portal/MenteeMilestonesPage.tsx:78-85`, `src/pages/portal/MenteeMilestonesPage.tsx:152-163` | **TEAM-UNAWARE** | Delete fallback once team API is reliable | ENG |
| Mentee milestone status editable on desktop only | `src/pages/portal/MenteeMilestonesPage.tsx:697-704`, `src/pages/portal/MenteeMilestonesPage.tsx:708-749` | **DEFERRED-UI** | Finish mobile status control | DESIGN |
| Deadlines status editable on desktop only | `src/pages/portal/DeadlinesPage.tsx:599-607`, `src/pages/portal/DeadlinesPage.tsx:623-681` | **DEFERRED-UI** | Finish mobile status/action row | DESIGN |
| Completed task rows dim entire row, violating compound-opacity rule | `src/components/tasks/TaskRow.tsx:281`, `CLAUDE.md:97-99` | **TEAM-UNAWARE** | Use muted title/border, not parent opacity | DESIGN |
| Personal quick actions use root gated paths instead of `PATHS` | `src/pages/portal/PersonalPage.tsx:974-985`, `src/constants/paths.ts:6-9`, `src/constants/paths.ts:24-35` | **TEAM-UNAWARE** | Replace with `PATHS.*` | ENG |
| Legacy MyTasks surface likely still parked behind legacy path | `Scratch/codex-hub-simplify-2026-06-09/inventory.md:59`, `src/pages/portal/UnifiedMyTasks.tsx:1-8`, `src/constants/paths.ts:24-25` | **UNCERTAIN** | Verify route usage; delete if no external caller | ENG |
| Commitment hook comment says backend pending, but API has `to_slug` support | `src/hooks/useCommitments.ts:7`, `api/routes/notifications.ts:96-100`, `api/routes/notifications.ts:121-128` | **TEAM-UNAWARE** | Update/remove stale comment | ENG |

## C. Works-Better-For-Nick

1. **Morning triage is not one state.** Job blocked: start day, choose Right Now, plan around meetings, keep PB/TODAY.md aligned. Today uses localStorage (`src/hooks/useTodayState.ts:28-43`), MyTasks writes localStorage directly (`src/pages/MyTasks/index.tsx:165-173`), PB Sector saves a separate D1 plan (`src/pages/portal/PBSector.tsx:182-184`). **ENG + DESIGN**

2. **Meeting flow loses notes at the exact moment Nick needs capture.** Job blocked: mid-meeting note/action capture. Today’s meeting textarea mutates local component state (`src/components/today/Timeline.tsx:245-246`), while MeetingDetail has the real notes mutation (`src/hooks/mutations/useMeetingMutations.ts:27-38`). **ENG**

3. **There are too many “where do I work?” surfaces.** Today is dashboard (`src/pages/portal/TodayPage.tsx:5-11`), PB Sector has Planner/Today modes (`src/pages/portal/PBSector.tsx:66`, `src/pages/portal/PBSector.tsx:371-396`), Personal duplicates overdue/due-today task strips (`src/pages/portal/PersonalPage.tsx:821-895`). **DESIGN**

4. **Mentee oversight is good in concept but weak in mobile action.** Job blocked: quick check-in/status change between meetings. Desktop rows have status select (`src/pages/portal/MenteeMilestonesPage.tsx:697-704`); mobile rows do not (`src/pages/portal/MenteeMilestonesPage.tsx:708-749`). **DESIGN**

5. **ProjectDetail hides the research story in tabs and duplicate streams.** Job blocked: rapid context reload on a manuscript/grant/project. Tabs split notes/comments/activity (`src/pages/ProjectDetail.tsx:67`), Activity then repeats updates/comments/action items as sections (`src/pages/project/ProjectActivity.tsx:57-68`). **DESIGN + ENG**

## D. What the Claude Design audit should focus on

1. Decide the **single daily cockpit IA**: Today vs My Hub vs PB Sector, and what belongs on first viewport.
2. Design the durable **Right Now / Planned / Done Today** model as one visual system across Today and MyTasks.
3. Redesign meeting rows so “take notes” clearly saves to the real meeting record.
4. Audit task rows at 360/390/768px, especially ListView, Deadlines, MenteeMilestones, and Today timeline.
5. Produce a DataPage shell spec: header, filters, table, empty/error/loading, density, mobile fallback.
6. Collapse ProjectDetail notes/comments/activity into a chronological research activity model.
7. Audit accent color semantics and opacity; parent-row dimming should disappear.
8. Define modal vs bottom-sheet behavior once, including transcript/create/edit flows.
9. Treat Narratives as suspect until data contract is fixed; design should not polish broken semantics.
10. Validate PI/mentee oversight as an actual check-in workflow, not just milestone inventory.

## E. Risk-ordered top 10

1. Build the durable operating-day plan primitive.
2. Persist or remove Today meeting notes.
3. Hide or ship transcript/audio processing.
4. Add the DataPage shell and migrate Projects/Manuscripts/Grants/Decisions/Deadlines.
5. Finish mobile status/actions for MenteeMilestones and Deadlines.
6. Extend shared task row/editor primitives into remaining task-like rows.
7. Replace raw-fetch silent-empty hooks with typed query resources.
8. Collapse ProjectDetail activity/notes/comments.
9. Fix Narratives API/UI contract or remove the page until real.
10. Delete dead `handleUpsertTodayMd` and verify/delete legacy MyTasks.

## F. What I could NOT assess

I did not run the app, inspect screenshots, query production D1 row counts, or inspect routes outside the provided inventory. Anything tagged **UNCERTAIN** needs a route/import/runtime check before deletion. Visual quality, overlap, mobile clipping, and whether Nick’s live data makes a page useful are blind spots for a follow-on visual/UX audit.