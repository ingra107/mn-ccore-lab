// task-steps.ts -- the read side of steps (schema-v152, 2026-10-30).
//
// A parent is any task with at least one live step (tasks.parent_id). There is
// no kind='parent' and nothing about a parent is stored: its "1 of 4" is
// counted here on every read, so it cannot drift. The write-side rules (one
// level, no questions, a parent closes only when its steps are closed) are
// D1 triggers in api/schema-v152-task-steps-and-checkins.sql.
//
// Plan: PB Scratch/plans/2026-10-30-steps-checkins-RECONCILED.md.

/** A step is live while it is not soft-deleted. */
const LIVE_STEP = 'c.parent_id = t.id AND c.deleted_at IS NULL'

/**
 * The two progress columns for a task read aliased `t`: step_total (live
 * steps) and step_done (live steps with status 'done'). 0 / 0 on a task with
 * no steps. Added to UI reads only, never to the PB sync read (seq_after /
 * wire=typed), which mirrors stored columns.
 */
export const TASK_STEP_COUNT_COLS =
  `(SELECT COUNT(*) FROM tasks c WHERE ${LIVE_STEP}) AS step_total, ` +
  `(SELECT COUNT(*) FROM tasks c WHERE ${LIVE_STEP} AND c.status = 'done') AS step_done`

/** A task's live steps, for the detail drawer. Bind: the parent's id. */
export const TASK_STEPS_SQL =
  `SELECT id, title, short_title, status, due_date, assignee, kind
     FROM tasks
    WHERE parent_id = ? AND deleted_at IS NULL
    ORDER BY due_date IS NULL, due_date, created_at`

/**
 * Active projects with no next step (reconciled plan, divergence 3, A + codex).
 *
 * A next step is a live, open (status not done/deleted) kind='task' row in the
 * project that is not itself a parent. Steps count; waiting_external and
 * blocked count. Check-ins, milestones, questions and parents do not: a
 * check-in exists so a project is looked at, and must not stand in for real
 * work (Nick, accepting the check-in option: "so check-ins don't pile up as a
 * substitute for real tasks").
 *
 * Nothing is stored or minted: the list is computed on each read, so a gap
 * closes the moment a task is added. Ordered by tier (Weekly first), then the
 * oldest movement. tasks.project_id may hold the project's slug on a legacy
 * row, so both forms match.
 */
export const NEXT_STEP_GAPS_SQL =
  `SELECT p.id, p.slug, p.title, p.tier,
          COALESCE(p.last_meaningful_movement, p.updated_at) AS last_movement
     FROM projects p
    WHERE p.deleted_at IS NULL AND p.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM tasks t
         WHERE (t.project_id = p.id OR t.project_id = p.slug)
           AND t.deleted_at IS NULL
           AND COALESCE(t.kind, 'task') = 'task'
           AND COALESCE(t.status, 'todo') NOT IN ('done', 'deleted')
           AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL)
      )
    ORDER BY p.tier IS NULL, p.tier, last_movement`
