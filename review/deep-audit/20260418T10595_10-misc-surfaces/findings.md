# Deep Audit — 20260418T10595_10-misc-surfaces

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 11
Bugs: 3 (P0 0, P1 3, P2 0)

## Bugs

- **[REACT-ROUND-TRIP] [P1] 10.A reaction in list**
  - Observed: 1 reactions
  - Expected: includes mesfin/🔥
- **[SEARCH-MISS] [P1] 10.B freshly-created task appears in search**
  - Observed: 0 results, marker missing
  - Expected: includes the task
- **[CALENDAR-GET] [P1] 10.F GET /api/calendar**
  - Observed: null
  - Expected: array

## Full trace


══════ SUITE: 10-misc-surfaces (run 20260418T10595_10-misc-surfaces) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 10.A  Reactions on a task comment ━━━
- [PASS] 10.A Reaction POST accepted
- **[REACT-ROUND-TRIP] [P1] 10.A reaction in list**
  - Observed: 1 reactions
  - Expected: includes mesfin/🔥
- [PASS] 10.A Re-reacting toggles off (count=0)

━━━ 10.B  Search returns freshly-created task ━━━
- **[SEARCH-MISS] [P1] 10.B freshly-created task appears in search**
  - Observed: 0 results, marker missing
  - Expected: includes the task

━━━ 10.C  Idea vote toggle ━━━
- [PASS] 10.C Idea vote incremented 0→1

━━━ 10.D  Activity feed reflects recent mutations ━━━
- [PASS] 10.D Most recent activity entry is <5min old (-18045s)
- [PASS] 10.D /api/activity returns 20 entries

━━━ 10.E  Commitments endpoint ━━━
- [PASS] 10.E /api/commitments returns 4 rows

━━━ 10.F  Calendar events endpoint ━━━
- **[CALENDAR-GET] [P1] 10.F GET /api/calendar**
  - Observed: null
  - Expected: array

━━━ 10.G  Project health endpoint ━━━
- [PASS] 10.G /api/projects/health returns 68 rows (68 scored)

━━━ 10.H  Notification unread count endpoint ━━━
- [PASS] 10.H unread count for nick: 131

━━━ 10.I  Dashboard stats endpoint ━━━
- [PASS] 10.I /api/stats keys: publicationCount, teamSize, grantCount, projectCount, activeProjectCount, featuredPublicationCount

━━━ 10.J  Version bump on mutation ━━━
- [PASS] 10.J version bumped 1776510040315→1776510048527

━━━ 10.K  Task key_link_N update via POST /api/tasks/:id ━━━
- [PASS] 10.K key_link_2 + desc round-trip

──── CLEANUP (4 items) ────