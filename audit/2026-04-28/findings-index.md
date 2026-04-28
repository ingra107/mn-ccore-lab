# Findings Index — Quick Lookup

> **Format**: ID → Severity | Page | One-line summary | File:line | Report
>
> Use this to find any finding fast when triaging a session, OR to cross-check whether a finding ID has been processed in `progress-log.md`.
>
> All severities: **P0 = ship-blocker** (security, data loss, broken-feature-on-marquee). **P1 / High = significant UX or correctness gap**. **P2 / Med = polish + improvements**. **P3 / Low = nits + edge cases**.

---

## P0 / High severity (work first, ~22 items)

| ID | Page | Issue | Location | Report |
|----|------|-------|----------|--------|
| TP-01 | Today | Decorative morning-thought input — bare `<input>`, no submit | `TodayPage.tsx:237-244` | `01-today-page.md` |
| TP-02 | Today | Right Now chat input decorative | `RightNowCard.tsx:67-71` | `01-today-page.md` |
| TP-03 | Today | TaskDetailDrawer subtask checkbox `defaultChecked` no `onChange` | `TaskDetailDrawer.tsx:114` | `01-today-page.md` |
| TP-04 | Today | Cross-surface state drift: state.done LS doesn't reflect MyTasks/Panel changes | `useTodayState.ts:30-37` | `01-today-page.md` |
| TP-05 | Today | Timeline meeting notes don't persist (refresh = dataloss) | `Timeline.tsx:51` | `01-today-page.md` |
| TP-06 | Today | Optimistic markDone has no rollback on D1 failure | `useTodayState.ts:87` | `01-today-page.md` |
| MT-01 | UnifiedMyTasks | Rule 18 cache-subscribe violation — TaskDrawer + InlineDetail | `TaskDrawer.tsx:34`, `InlineDetail.tsx` | `02-unified-my-tasks.md` |
| MT-02 | UnifiedMyTasks | Single-row Archive ≠ bulk Archive (state transition mismatch) | `InlineDetail.tsx:78` vs `index.tsx:167` | `02-unified-my-tasks.md` |
| MT-03 | UnifiedMyTasks | TaskDrawer subtask checkboxes inert | `TaskDrawer.tsx:150` | `02-unified-my-tasks.md` |
| MT-04 | UnifiedMyTasks | No virtualization across all 3 views | All view files | `02-unified-my-tasks.md` |
| MT-05 | UnifiedMyTasks | Inline editing absent on every field in every view | All views | `02-unified-my-tasks.md` |
| PD-1 | ProjectDetail | Header InlineSelect bypasses confirmation modal | `ProjectDetail.tsx:486-490` vs `:1248-1272` | `03-project-detail.md` |
| PD-2 | ProjectDetail | Tab activeTab not URL-synced — deep-link breaks on switch | `ProjectDetail.tsx:651` | `03-project-detail.md` |
| PD-3 | ProjectDetail | Activity tab duplicates Notes/Comments instead of being audit log | `ProjectActivity.tsx:59,64` | `03-project-detail.md` |
| PD-4 | ProjectDetail | Notes-vs-Comments banner not dismissible despite comment claim | `ProjectDetail.tsx:1599-1614` | `03-project-detail.md` |
| PD-5 | ProjectDetail | Tasks tab renders TaskCard stack — Rule 17 violation | `ProjectDetail.tsx:1646-1745` | `03-project-detail.md` |
| PD-6 | ProjectDetail | Bottom compose @ + emoji buttons decorative | `ProjectDetail.tsx:957-994` | `03-project-detail.md` |
| P-01 | Profile | `['team-raw']` cache has no queryFn — invalidate is no-op | `ProfilePage.tsx` rawRow setup | `04-profile-page.md` |
| P-02 | Profile | Plain `<input>` boxes — no `▾`, no focus ring, no validation | `ProfilePage.tsx:177-205` | `04-profile-page.md` |
| P-03 | Profile | photo_url is text input — avatar doesn't preview | `ProfilePage.tsx:140-175` | `04-profile-page.md` |
| P-04 | Profile | `auto_created` PENDING REVIEW badge doesn't render to self | `ProfilePage.tsx` identity card | `04-profile-page.md` |
| P-05 | Profile | No optimistic update / undo / rollback on save errors | `ProfilePage.tsx:91-109` | `04-profile-page.md` |
| P-06 | Profile | Discoverability — sidebar avatar goes to MyItems, no Cmd+K entry | `Sidebar.tsx:343` | `04-profile-page.md` |
| LO-1 | LabOverview | `totalCitations = 2626` hardcoded constant | `StatsCard.tsx:70` | `05-lab-overview.md` |
| LO-2 | LabOverview | 5 hardcoded fake R01/K23 deadlines | `UpcomingCard.tsx:17-53` | `05-lab-overview.md` |
| LO-3 | LabOverview | grantTimelines hardcoded; `useGrants()` data discarded | `GrantTimelineCard.tsx:7-13` | `05-lab-overview.md` |
| LO-4 | LabOverview | "CLIF Consortium expanding" hardcoded marketing copy as activity | `ActivityFeedCard.tsx:81-87` | `05-lab-overview.md` |
| M-01 | Manuscripts | Status + Stage InlineSelect cells lack stopPropagation — opens drift to nav | `Manuscripts.tsx:501-516` | `06-manuscripts.md` |
| M-02 | Manuscripts | stale-drafts filter joins by title not slug — orphans silently | `Manuscripts.tsx:146-151` | `06-manuscripts.md` |
| M-03 | Manuscripts | daysInStage uses updated_at — any edit resets stalled counter | `Manuscripts.tsx:42-45` | `06-manuscripts.md` |
| M-04 | Manuscripts | Two parallel staleness models (hardcoded vs useLabPrefs) | `Manuscripts.tsx:39` | `06-manuscripts.md` |
| MI-01 | MyItems | "My Items" page identity confused — actually inbox | `MyItems.tsx:700-732` | `07-my-items-personal.md` |
| MI-02 | MyItems | Mark-all-read no undo | `MyItems.tsx:824` | `07-my-items-personal.md` |
| MI-03 | MyItems | No per-notification action affordance (snooze/dismiss/archive) | `MyItems.tsx:302-410` | `07-my-items-personal.md` |
| MI-04 | MyItems | No filter chips by type (mention/assignment/deadline) | `MyItems.tsx:819-875` | `07-my-items-personal.md` |
| MI-05 | Personal | Page identity duplicates Today/MyTasks/Dashboard 70% | Whole `Personal.tsx` | `07-my-items-personal.md` |
| MI-06 | Personal | useExpiringRegulatory returns lab-wide items to non-PI users | `Personal.tsx:637-641` | `07-my-items-personal.md` |
| MI-07 | MyItems | Commitment slug derived via fragile last-name parse | `MyItems.tsx:417-419` | `07-my-items-personal.md` |
| MTG-01 | MeetingNotes | `/api/meetings/process-transcript` endpoint doesn't exist | `MeetingNotesPage.tsx:227` | `08-meetings.md` |
| MTG-02 | MeetingDetail | @ + emoji compose buttons decorative | `MeetingDetail.tsx:1133-1167` | `08-meetings.md` |
| MTG-03 | MeetingDetail | Notes editor plain textarea, no @mention/Hermes/markdown | `MeetingDetail.tsx:752-779` | `08-meetings.md` |
| S-01 | Search | No match highlighting on results | Throughout result list | `09-search-page.md` |
| S-02 | Search | Per-type grouping destroys cross-type score ranking | `SearchPage.tsx:290-332` | `09-search-page.md` |
| S-03 | Search | Subtitle is metadata, matched body invisible (esp. for notes/comments) | Result row component | `09-search-page.md` |
| S-04 | Search | Search input not sticky | `SearchPage.tsx:139-161` | `09-search-page.md` |
| S-05 | Search | Recent searches saves every prefix — pollutes list | `SearchPage.tsx:75-80` | `09-search-page.md` |
| S-06 | Search | Tips advertise @/#// syntax that doesn't exist server-side | `SearchPage.tsx:188-197` | `09-search-page.md` |
| ATL-01 | AskTheLab | Accept-answer button gates on `'ningraha'` — slug doesn't exist | `AskTheLab.tsx:366` | `10-ask-the-lab.md` |
| ATL-02 | AskTheLab | API accept endpoint has zero auth check | `api/routes/questions.ts:209` | `10-ask-the-lab.md` |
| C-01 | Calendar | iCal events not rendered on CalendarPage at all | `CalendarPage.tsx`, missing useUserCalendarEvents | `11-calendar-page.md` |
| C-02 | Calendar | Tasks + milestones non-interactive on Month view | `CalendarPage.tsx:358` | `11-calendar-page.md` |
| C-03 | Calendar | No time component anywhere — date-only calendar | All views | `11-calendar-page.md` |
| INS-01 | Insights | "This week" data is actually last week (SQL weekday 1 -7d range) | `api/routes/insights.ts:342-343` | `12-insights-page.md` |
| INS-02 | Insights | Stalled CTA hardcoded +3d — no InlineDatePicker per brief | `InsightsPage.tsx:410-412` | `12-insights-page.md` |

## P1 (109 items — see individual reports for full list)

P1 items are too numerous to mirror here. Read each report's "Findings table" section for the page you're working on.

**Quick navigation by page:**
- TodayPage → `01-today-page.md` § 3 (TP-07 through TP-19)
- UnifiedMyTasks → `02-unified-my-tasks.md` § 3 (MT-06 through MT-19)
- ProjectDetail → `03-project-detail.md` § 3 (PD-7 through PD-18)
- ProfilePage → `04-profile-page.md` § 3 (P-07 through P-13)
- LabOverview → `05-lab-overview.md` § 3 (LO-5 through LO-10)
- Manuscripts → `06-manuscripts.md` § 3 (M-05 through M-18)
- MyItems/Personal → `07-my-items-personal.md` § 3 (MI-08 through MI-24)
- Meetings → `08-meetings.md` § 3 (MTG-04 through MTG-09)
- Search → `09-search-page.md` § 3 (S-07 through S-16)
- AskTheLab → `10-ask-the-lab.md` § 3 (ATL-03 through ATL-11)
- Calendar → `11-calendar-page.md` § 3 (C-04 through C-07)
- Insights → `12-insights-page.md` § 4 (INS-03 through INS-10)

## Volume by page

| Report | P0 | P1 | P2 | P3 | Total |
|--------|----|----|----|----|----|
| 01-today-page.md | 6 | 13 | 16 | 6 | 41 |
| 02-unified-my-tasks.md | 5 | 14 | 17 | 0 | 36 |
| 03-project-detail.md | 6 | 12 | 12 | 0 | 30 |
| 04-profile-page.md | 6 | 9 | 5 | 0 | 20 |
| 05-lab-overview.md | 4 | 6 | 13 | 7 | 30 |
| 06-manuscripts.md | 4 | 14 | 12 | 0 | 30 |
| 07-my-items-personal.md | 7 | 17 | 13 | 0 | 37 |
| 08-meetings.md | 3 | 6 | 13 | 8 | 30 |
| 09-search-page.md | 6 | 11 | 13 | 0 | 30 |
| 10-ask-the-lab.md | 2 | 9 | 15 | 6 | 32 |
| 11-calendar-page.md | 3 | 5 | 8 | 8 | 24 |
| 12-insights-page.md | 2 | 8 | 6 | 8 | 24 |
| **TOTAL** | **54** | **124** | **143** | **43** | **364** |

## Cross-cutting themes (sweep multiple findings together)

These themes from `synthesis-plan.md` § "20 Cross-Cutting Themes" let you close many findings in one PR:

| Theme | Findings touched |
|-------|------------------|
| T1 (Decorative compose) | TP-01, TP-02, TP-03, MT-03, PD-6, MTG-02, MTG-03, ATL-05, S-06 |
| T2 (SmartCompose adoption) | TP-01, TP-02, PD-6, MTG-02, MTG-03, ATL-05 |
| T3 (Hermes under-utilized) | TP-14, ATL-03, ATL-04, ATL-20, MTG-23, INS-11, M (no entry) |
| T4 (Hardcoded fake data) | LO-1, LO-2, LO-3, LO-4 |
| T5 (iCal half-integrated) | C-01, C-02, C-12, TP-10 |
| T6 (Page identity overlap) | MI-05, MI-06, MI-19, MI-20, MI-21, LO-6 |
| T7 (Auth security) | ATL-01, ATL-02 |
| T8 (Cache subscribe) | TP-04, MT-01, P-01 |
| T9 (Missing undo) | MI-02, P-05, MI-13, M (others) |
| T10 (Inline edit gaps) | MT-05, PD-10, P-02, MTG-11 |
| T11 (Virtualization) | MT-04, TP-08, M-others, PD-25 |
| T12 (Brand primitives) | TP-15, MT-others, PD-8, M-15, INS-07, INS-11, etc. |
| T13 (Token discipline) | TP-13, P-19, others throughout |
| T14 (Filters/saved views) | S-11, MT-12-14, INS-15, ATL-13 |
| T15 (realtimeBus wiring) | ATL-04, MI-37, INS (no entry) |
| T16 (Keyboard nav) | TP-28, ATL-24, S-29, others |
| T17 (Activity tab broken) | PD-3 |
| T18 (Mobile fidelity) | PD-15, P-14, MI-32, MI-36, others |
| T19 (Stale metrics / wrong math) | M-03, LO-17, INS-01, TP-16, TP-17 |
| T20 (Audit log gaps) | PD-3, MTG (no entry) |

When you start a sweep, search by theme to bundle findings under one PR.
