**Verdict**  
The Hub is functionally dense, but UX robustness is uneven: core daily surfaces still collapse query failures into empty/not-found states, create flows often close and reset before the server confirms, and the Today/MyTasks affordance model depends too much on mouse drag/click behavior. Design-system drift is concentrated in MyTasks/Ideas/custom primitives, with several explicit CLAUDE rules bypassed.

**CRITICAL UX Gaps**

- `src/pages/portal/TodayPage.tsx:47` / `src/pages/portal/TodayPage.tsx:252` / `src/components/today/TaskGroup.tsx:22` | Today has no user-facing query error state; failed `tasks/projects/meetings` reads fall through to empty/null groups after loading. | Add `isError` branches with retry for each required query; do not render grouped tasks until the tasks query has resolved successfully.
- `src/pages/ProjectDetail.tsx:82` / `src/pages/ProjectDetail.tsx:84` / `src/pages/ProjectDetail.tsx:95` | ProjectDetail defaults `projects` to `[]`, then renders “Project not found” before the projects query can distinguish loading/error/404. | Pull `isLoading/isError` from `useProjects()` and render skeleton/error before the not-found branch.
- `src/components/tasks/CreateTaskModal.tsx:143` / `src/components/tasks/CreateTaskModal.tsx:152` / `src/components/tasks/CreateTaskModal.tsx:162` | Create Task resets fields and closes immediately after `onCreate`, so API failure loses the draft. | Make `onCreate` return a promise or pass mutation state into the modal; close/reset only on success, keep inline error on failure.
- `src/components/CreateProjectModal.tsx:102` / `src/components/CreateProjectModal.tsx:110` / `src/components/CreateProjectModal.tsx:116` | Create Project has the same close/reset-before-success failure mode. | Same fix: success-gated close/reset plus inline error.
- `src/pages/portal/MyTasks/index.tsx:158` / `src/pages/portal/MyTasks/index.tsx:161` | MyTasks closes the create modal right after `createTask.mutate`, compounding the modal’s own premature reset. | Move close/reset to `onSuccess`; surface `createTask.error`.
- `src/components/today/RightNowCard.tsx:24` / `src/pages/portal/TodayPage.tsx:10` | Empty Right Now says “click a task to promote,” but the coded rule says row body expands and explicit `▶` promotes. | Change copy to “Open a task, then use ▶ Work,” or expose a visible promote button on collapsed rows.
- `src/components/today/TaskRow.tsx:89` / `src/components/today/Timeline.tsx:42` / `src/components/today/Timeline.tsx:45` | Today planning is drag/drop-only for the main affordance, fragile on touch and keyboard. | Add a per-row “Plan” button/menu that calls `state.planAt`, and make drop zones supplemental.
- `src/pages/portal/TodayPage.tsx:281` / `src/components/today/Timeline.tsx:69` / `src/components/today/MeetingRow.tsx:52` | Today tells users to take meeting notes, but notes are only local React state and vanish on refresh/navigation. | Persist to meeting notes or label it explicitly as temporary scratch; autosave is the right default.
- `src/pages/MeetingDetail.tsx:1226` / `src/pages/MeetingDetail.tsx:1230` / `src/pages/MeetingDetail.tsx:1236` | Attendance edit optimistically mutates local state, then silently swallows save failure. | Roll back `localAttendees` and show an inline/toast error.
- `src/pages/ProjectDetail.tsx:367` / `src/pages/ProjectDetail.tsx:403` | Project compose upload failures only hit `console.error`; the user gets no recovery path. | Keep the selected file visible, show retry/remove, and surface the failed filename inline.

**Design-System Drift**

- `CLAUDE.md:105` / `CLAUDE.md:112` / `src/pages/MyTasks/views/ListView.tsx:111` | MyTasks is a data page but hand-rolls a div-grid table instead of shared `TableContainer` + `ColumnHeader`. | Rebuild ListView around the table primitives; keep virtualization inside the row body.
- `CLAUDE.md:112` / `CLAUDE.md:113` / `src/pages/IdeasPage.tsx:52` / `src/pages/IdeasPage.tsx:310` | Ideas is classified as a data page but defaults to kanban card columns. | Default to list/table; keep kanban as a secondary view.
- `CLAUDE.md:107` / `src/pages/IdeasPage.tsx:760` / `src/pages/IdeasPage.tsx:766` | Hover-only idea actions use `opacity: 0`, explicitly forbidden for AT hygiene. | Use `visibility: hidden` plus pointer-events gating.
- `CLAUDE.md:215` / `src/pages/Projects.tsx:51` / `src/pages/Projects.tsx:648` | Projects reinvents category dots instead of using `CategoryIcon`. | Replace `CATEGORY_DOT` spans with `CategoryIcon`.
- `CLAUDE.md:215` / `src/components/EmptyState.tsx:23` / `src/components/EmptyState.tsx:32` | EmptyState accepts arbitrary icons instead of the `EmptyStateArt` primitive. | Change EmptyState to accept a semantic variant and render `EmptyStateArt`.
- `CLAUDE.md:97` / `src/components/today/TaskRow.tsx:60` / `src/pages/MyTasks/views/ListView.tsx:199` | Done rows dim whole parents with opacity, causing compound-opacity failures. | Remove parent opacity; use muted title color, strikethrough, and subtle border/background.
- `CLAUDE.md:91` / `src/components/today/PlannedTaskRow.tsx:51` | Visible unplan button sits at opacity `0.5`, below the dark-mode readable floor. | Use `color: var(--muted)` or `INK_MUTED`; do not dim the control below 0.85.

**Accessibility**

- `src/components/today/TaskRow.tsx:80` / `src/components/today/TaskRow.tsx:82` | Clickable task rows are plain divs, and completion checkbox has no task-specific accessible name. | Use a button for row expansion or add role/tabIndex/keyboard handlers; add `aria-label="Mark <title> done"`.
- `src/components/today/MeetingRow.tsx:16` / `src/components/today/MeetingRow.tsx:52` | Meeting expand row is a clickable div and notes textarea has no label. | Make the header a button with `aria-expanded`; add visible or `aria-label` text for notes.
- `src/components/MobileTabBar.tsx:46` / `src/components/MobileTabBar.tsx:127` | Mobile overflow drawer is a modal dialog with Escape close but no focus trap/initial focus. | Trap focus inside the sheet, focus the close button on open, restore focus on close.
- `src/components/MobileTabBar.tsx:203` / `src/components/MobileTabBar.tsx:205` | Overflow drawer computes active route but does not set `aria-current`. | Add `aria-current={active ? 'page' : undefined}` to overflow links.
- `src/components/tasks/CreateTaskModal.tsx:378` / `src/components/tasks/CreateTaskModal.tsx:389` | Owner field’s `aria-labelledby` points at `task-assignee-label`, but no element has that id. | Put `id="task-assignee-label"` on the label or use `aria-label`.
- `src/components/tasks/CreateTaskModal.tsx:398` / `src/components/tasks/CreateTaskModal.tsx:405` / `src/components/tasks/CreateTaskModal.tsx:423` / `src/components/tasks/CreateTaskModal.tsx:430` | Labels for custom InlineSelect controls are not programmatically associated with the trigger button. | Add `id/aria-labelledby` support to `InlineSelect`.
- `src/pages/IdeasPage.tsx:541` / `src/pages/IdeasPage.tsx:542` | Idea title uses `aria-expanded` on a non-interactive span. | Make it a button or add role/tabIndex/keyboard support.

**OVERLAP With Passes 1-2**

- `src/pages/portal/UnifiedMyTasks.tsx:1` | OVERLAP: already-found shim/dead-path issue; skipped.
- `src/lib/taskGrouping.ts:1` | OVERLAP: task grouping consolidation already found; skipped.
- `src/pages/Projects.tsx:775` / `src/pages/portal/ManuscriptsPage.tsx:765` | OVERLAP: Projects/Manuscripts pipeline-board parity already found; only noted related drift where it affects data-page UX.

**Risk-Ordered Top 10**

1. `src/pages/portal/TodayPage.tsx:47` | Today query failure/empty-state ambiguity.
2. `src/components/tasks/CreateTaskModal.tsx:143` | Task creation loses input on failure.
3. `src/pages/ProjectDetail.tsx:82` | ProjectDetail false “not found” during load/error.
4. `src/components/today/TaskRow.tsx:89` | Today planning is drag-only.
5. `src/components/today/Timeline.tsx:69` | Today meeting notes are not persisted.
6. `src/pages/portal/MyTasks/index.tsx:158` | MyTasks create closes before success.
7. `src/pages/ProjectDetail.tsx:2008` | ProjectDetail New Task closes before success.
8. `src/pages/MeetingDetail.tsx:1226` | Attendance edit silently fails.
9. `src/components/MobileTabBar.tsx:127` | Mobile More drawer lacks focus trap.
10. `src/pages/IdeasPage.tsx:52` | Ideas defaults to a card board despite data-page rules.

**What I Could NOT Verify**

- Runtime visual CLS and actual focus order; this was code-only.
- Whether API hooks expose richer error objects usable for inline recovery.
- Whether `EmptyStateArt` exists under a different path not shown in the read set.
- Whether some custom controls pass axe through generated DOM despite missing label plumbing in code.
