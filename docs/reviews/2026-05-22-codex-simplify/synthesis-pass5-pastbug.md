**Verdict**

Live current instances remain in **Class 1 identity bypass**, **Class 3 delete/cascade gaps**, **Class 4 CT/UTC date drift**, **Class 8 sync asymmetry**, and **Class 10 protected-field nulls**. I found no new current instances for **Classes 2, 5, 6, 7, or 9** in the checked surfaces.

**Findings by class**

**Class 1 — Identity Canonicalization Bypass**

- `api/routes/handoffs.ts:45-47`, `api/routes/handoffs.ts:50-58`, `api/routes/handoffs.ts:69-81`, `api/routes/handoffs.ts:87-96` | Raw `body.to_slug.trim()` is stored as `task_handoffs.to_slug`, patched into `tasks.assignee`, and used as notification recipient | Legacy/raw slugs can reassign tasks to identities no one resolves, and notify the wrong/nonexistent recipient | Canonicalize and validate `to_slug` through the same actor/team-member canonicalizer before insert, task patch, and notification.
- `api/routes/questions.ts:128-139`, `api/routes/questions.ts:216-225` | `asked_by` accepts raw client override, but accept authorization compares against `actorSlug(user.email)` | A question stored with `asked_by='nick'` cannot be accepted by canonical `nick-ingraham` unless PI bypass applies | Drop client override or canonicalize/validate `asked_by` before insert.
- `api/routes/questions.ts:180-185` | Answer `author_slug` accepts raw client override | Answer attribution can persist legacy/noncanonical actors, breaking person lookup/activity attribution | Canonicalize/validate `author_slug`, or derive it only from authenticated user.
- `api/routes/tasks.ts:939-947`, `api/routes/tasks.ts:953-966` | Task update note `author_slug` accepts raw body value and self-mention filtering compares against that raw value | Bad attribution plus self-mention dedupe misses the real actor, creating wrong/self notifications | Canonicalize `author_slug` or ignore body override.
- `api/routes/ideas.ts:27-36`, `src/pages/portal/IdeasPage.tsx:95-98`, `src/pages/portal/IdeasPage.tsx:326-340` | `submitted_by` accepts raw body value, then UI resolves people from that slug | Legacy/raw submitters render as fallback or wrong person and filtering/grouping drift | Canonicalize/validate submitter; normal clients should not override authenticated actor.
- `api/routes/project-documents.ts:37-44` | `created_by` accepts raw body value | Document attribution can store unresolved actors | Canonicalize/validate or derive from authenticated actor.
- `api/routes/dependencies.ts:63-76` | Dependency `created_by` defaults to raw `user.email`, unlike the slug identity model | Creator audit/filtering by slug misses dependency creates | Store `actorSlug(user.email)` and canonicalize overrides.

**Class 3 — Delete / Cascade Gaps**

- `api/routes/tasks.ts:344-356`, `api/routes/projects.ts:619-634`, `api/routes/mutations.ts:634-640` | Task creation stores project slug, Hub project delete clears both id and slug, but PB-origin `/api/mutations` project delete clears only `mut.record_id` | A PB-origin delete by id leaves slug-linked tasks attached to a soft-deleted project; delete by slug leaves id-linked legacy rows | Resolve both project id and slug before mutation cascade and apply the same id+slug cleanup as `handleDeleteProject`.
- `api/routes/projects.ts:619-634`, `api/routes/project-documents.ts:7-13`, `api/routes/dependencies.ts:27-31`, `api/routes/submissions.ts:16-24`, `api/routes/conferences.ts:10-24` | Project delete only removes comments/project_updates and nulls tasks, but newer project child tables remain | Documents, dependency edges, submission events, and conference prep rows remain visible/queryable for deleted projects | Extend project delete cascade, and mutation delete cascade, to clean or tombstone these child tables using id+slug matching.

**Class 4 — CT / UTC Date Boundary**

- `api/routes/projects.ts:308-318` | Project health uses `now.toISOString().split('T')[0]` against `tasks.due_date` | After evening CT, tasks due today count as overdue | Use `ctToday()` for date-key comparisons.
- `api/index.ts:1032-1039`, `api/index.ts:1053-1060` | Morning pulse uses SQLite `date('now')` / `date('now','+3 days')`, and overdue checks use UTC ISO today | Digest windows and overdue labels shift at UTC midnight, not CT midnight | Bind `ctToday()` / `ctToday(3)` and use CT-aware labels.
- `src/pages/portal/PBSector.tsx:52-54`, `src/pages/portal/PBSector.tsx:179-180`, `api/routes/pb-sector.ts:7-13` | PB Sector frontend initializes/falls back with UTC ISO today while backend normalizes to CT | After evening CT, page opens tomorrow’s command center | Use shared CT/local date helper for initial selected date and fallback.
- `src/components/pb-sector/TodayView.tsx:160-164` | TODAY.md due styling compares extracted due dates to UTC ISO today | Tasks due today stop rendering as today after evening CT | Use `todayKey()` or CT helper.
- `api/routes/pb-sector.ts:40-46` | PB milestones window uses SQLite `date('now')` while handler otherwise uses CT date | Milestone range shifts one day relative to task/meeting buckets | Bind CT start/end dates.
- `api/routes/pb-sector.ts:493-507` | Plan history uses SQLite `date('now', ? || ' days')` against CT plan dates | History window drops/includes the wrong day after evening CT | Compute range with CT helper before SQL.
- `api/routes/regulatory.ts:35-42`, `api/routes/regulatory.ts:54-58` | Regulatory expiration cutoff uses UTC ISO date and runtime date math | Expiring items enter/leave window a CT day early/late | Use `ctToday(days)` and CT-aware day delta.
- `api/routes/submissions.ts:142-166` | Active submissions use `event_date >= date('now')` and `julianday('now')` | Revision due “today” can be excluded or decremented early after evening CT | Bind CT today and compute deltas from CT date.
- `api/routes/conferences.ts:35-51` | Upcoming conference/deadline query uses SQLite UTC `date('now')` windows | Abstract/conference planning windows shift at UTC midnight | Bind `ctToday()` and `ctToday(90)`.
- `src/components/ConferencePrep.tsx:60-68` | Status transitions stamp submitted/accepted dates with UTC ISO date | Evening CT submissions are recorded as tomorrow | Use CT/local date helper.
- `src/components/SubmissionTimeline.tsx:111-114` | Add-event form defaults event date from UTC ISO date | Evening CT event creation defaults to tomorrow | Use CT/local date helper.
- `src/hooks/useApiData.ts:388-401` | Static meeting fallback marks status with UTC ISO today | Dev/static fallback completes today’s meetings early after evening CT | Use `todayKey()` or CT helper.

**Class 8 — Sync Read / Write Asymmetry**

- `api/routes/tasks.ts:344-356`, `api/routes/projects.ts:619-634`, `api/routes/mutations.ts:634-640` | Hub delete understands id+slug project references; PB-origin mutation delete only uses `mut.record_id` | Same project delete has different cleanup depending on origin, leaving dangling synced state | Route PB mutation delete through the same resolved id+slug cascade used by Hub delete.

**Class 10 — Protected-Field Nulls**

- `CLAUDE.md:297-299`, `api/routes/mutations.ts:116-137`, `api/routes/mutations.ts:332-344`, `api/routes/mutations.ts:785-792`, `api/routes/mutations.ts:869-871` | `/api/mutations` allowlists protected task/project fields, rejects unknown keys only, then writes patch values directly | PB/API mutation can set protected fields such as `tasks.status`, `tasks.priority`, `tasks.assignee`, `projects.status`, `projects.stage`, or `projects.category` to `null`, bypassing route-level null protection | Reject null/empty values for protected fields on mutation insert/update, or coerce to canonical defaults before `applyPatch`.

**OVERLAP with passes 1-4**

- `api/routes/projects.ts:181-185` and `api/routes/uploads.ts:88-97` are the already-found raw `email.split('@')[0]` identity bypasses; not re-reported.
- CalendarPage UTC date-key drift was already found; not re-reported.
- `api/routes/mutations.ts:720-725` covers the already-known `stale_active_since` pull-back asymmetry; not re-reported.
- Previously reported `tasks.notes`, `ProjectRow`/`rowToProject`, task operational fields, and protected nullable frontend types were not re-reported.

**Risk-ordered top 10**

1. `api/routes/mutations.ts:116-137`, `api/routes/mutations.ts:785-792`, `api/routes/mutations.ts:869-871` — Class 10 protected-field null writes through sync mutation.
2. `api/routes/tasks.ts:344-356`, `api/routes/projects.ts:619-634`, `api/routes/mutations.ts:634-640` — Class 3/Class 8 PB project delete leaves id/slug-linked tasks.
3. `api/routes/projects.ts:619-634`, `api/routes/project-documents.ts:7-13`, `api/routes/dependencies.ts:27-31`, `api/routes/submissions.ts:16-24`, `api/routes/conferences.ts:10-24` — Class 3 project delete leaves newer child tables.
4. `api/routes/handoffs.ts:45-81` — Class 1 raw handoff recipient can directly corrupt `tasks.assignee`.
5. `api/index.ts:1032-1039`, `api/index.ts:1053-1060` — Class 4 digest date window/overdue labeling uses UTC.
6. `src/pages/portal/PBSector.tsx:52-54`, `src/pages/portal/PBSector.tsx:179-180` — Class 4 PB Sector opens wrong day after evening CT.
7. `api/routes/projects.ts:308-318` — Class 4 project health overdue count flips early.
8. `api/routes/questions.ts:128-139`, `api/routes/questions.ts:216-225` — Class 1 raw `asked_by` breaks accept authorization.
9. `api/routes/tasks.ts:939-947`, `api/routes/tasks.ts:953-966` — Class 1 raw task-update author breaks attribution and mention dedupe.
10. `api/routes/submissions.ts:142-166` — Class 4 active submission/revision windows use UTC SQLite dates.

**Classes with NO new instances found**

- Class 2 local-state staleness: checked realtime/query-cache surfaces at `src/hooks/useRealtimeSync.ts:46-58`, `src/components/tasks/TaskDetailPanel.tsx:66-89`, and `src/hooks/useTodayState.ts:64-80`; no new stale local mirror instance found.
- Class 5 enum drift: checked conference API/UI values at `api/routes/conferences.ts:4-7`, `src/components/ConferencePrep.tsx:12-34`, and submission API/UI values at `api/routes/submissions.ts:4-12`, `src/components/SubmissionTimeline.tsx:84-92`; no new rejecting allowlist mismatch found.
- Class 6 PK hardcode: mutation PK routing uses explicit PK/composite handling at `api/routes/mutations.ts:42-56`, `api/routes/mutations.ts:422-430`, `api/routes/mutations.ts:601-613`, `api/routes/mutations.ts:855-867`, and `api/routes/mutations.ts:877-892`; no new hardcoded `id` delete/upsert found.
- Class 7 Pages Functions runtime gaps: checked Worker-facing code at `api/routes/mutations.ts:69-75`, `api/jwt-verify.ts:63-70`, and `functions/api/[[route]].ts:16-20`; no new Node-only runtime dependency found.
- Class 9 cron guard drift: configured cron strings at `wrangler.toml:16-23` match scheduler branches at `api/index.ts:969-984` and `api/index.ts:1137-1146`; no new guard drift found.

**What I could NOT verify**

- I did not run tests or smoke flows; this was a read-only pattern-match pass.
- I did not inspect external PB/mobile sync clients, so Class 8 failure paths are based on the Hub mutation and route code only.
- `src/components/RegulatoryTracker.tsx` was not present at the referenced path, so regulatory frontend enum/date handling outside the files above was not verified.
