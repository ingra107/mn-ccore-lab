# Deep Audit — 20260418T21105_12-data-integrity

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 19
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 12-data-integrity (run 20260418T21105_12-data-integrity) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 12.A  Tasks with project_id pointing to nonexistent projects ━━━
- [PASS] 12.A No tasks with dangling project_id

━━━ 12.B  Tasks with assignee slug not in team_members (allowing claude-ai) ━━━
- [PASS] 12.B All task assignees valid

━━━ 12.C  Tasks with invalid status enum ━━━
- [PASS] 12.C All task status values in canonical enum

━━━ 12.D  Tasks with invalid priority enum ━━━
- [PASS] 12.D All task priority values in canonical enum

━━━ 12.E  Projects with duplicate slugs ━━━
- [PASS] 12.E All project slugs unique

━━━ 12.F  Projects with invalid status enum ━━━
- [PASS] 12.F All project status values canonical

━━━ 12.G  Projects with invalid stage enum ━━━
- [PASS] 12.G All project stage values canonical

━━━ 12.H  Projects with invalid category enum ━━━
- [PASS] 12.H All project category values canonical

━━━ 12.I  task_comments with task_id pointing to missing task ━━━
- [PASS] 12.I All task_comments point to existing tasks

━━━ 12.J  comments with project_id pointing to missing project ━━━
- [PASS] 12.J All project comments point to existing projects

━━━ 12.K  subtasks with parent task_id missing ━━━
- [PASS] 12.K All subtasks have existing parent tasks

━━━ 12.L  Notifications with source_id pointing at missing task (for task-scoped notifications) ━━━
- [PASS] 12.L All task-scoped notifications reference existing tasks

━━━ 12.M  Tasks missing required title AND description (can neither be listed) ━━━
- [PASS] 12.M All non-deleted tasks have title or description

━━━ 12.N  completed flag vs status coherence ━━━
- [PASS] 12.N status=done matches completed=1 invariant

━━━ 12.O  Ideas with invalid status ━━━
- [PASS] 12.O All idea statuses canonical

━━━ 12.P  Decision outcome_status values ━━━
- [PASS] 12.P All decision outcome_status values canonical

━━━ 12.Q  Team members with no name (display broken) ━━━
- [PASS] 12.Q All team_members have name

━━━ 12.R  Meetings with duplicate (date, title) after normalize ━━━
- [PASS] 12.R No duplicate meetings after case/whitespace normalize

━━━ 12.S  Tasks marked completed but with NULL completed_at ━━━
- [PASS] 12.S All completed tasks have completed_at timestamp

──── CLEANUP (0 items) ────