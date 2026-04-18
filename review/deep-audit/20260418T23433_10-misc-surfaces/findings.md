# Deep Audit — 20260418T23433_10-misc-surfaces

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 14
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 10-misc-surfaces (run 20260418T23433_10-misc-surfaces) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 10.A  Reactions on a task comment ━━━
- [PASS] 10.A Reaction POST accepted
- [PASS] 10.A Reaction round-trips
- [PASS] 10.A Re-reacting toggles off (count=0)

━━━ 10.B  Search returns freshly-created task ━━━
- [PASS] 10.B Task found via search (type=task)

━━━ 10.C  Idea vote toggle ━━━
- [PASS] 10.C Idea vote incremented 0→1

━━━ 10.D  Activity feed reflects recent mutations ━━━
- [PASS] 10.D Most recent activity entry is <5min old (-18045s)
- [PASS] 10.D /api/activity returns 20 entries

━━━ 10.E  Commitments endpoint ━━━
- [PASS] 10.E /api/commitments returns 4 rows

━━━ 10.F  Calendar events endpoint — /api/calendar/events not /api/calendar ━━━
- [PASS] 10.F /api/calendar/events returns 83 events

━━━ 10.G  Project health endpoint ━━━
- [PASS] 10.G /api/projects/health returns 71 rows (71 scored)

━━━ 10.H  Notification unread count endpoint ━━━
- [PASS] 10.H unread count for nick: 163

━━━ 10.I  Dashboard stats endpoint ━━━
- [PASS] 10.I /api/stats keys: publicationCount, teamSize, grantCount, projectCount, activeProjectCount, featuredPublicationCount

━━━ 10.J  Version bump on mutation ━━━
- [PASS] 10.J version bumped 1776555865021→1776555865753

━━━ 10.K  Task key_link_N update via POST /api/tasks/:id ━━━
- [PASS] 10.K key_link_2 + desc round-trip

──── CLEANUP (4 items) ────