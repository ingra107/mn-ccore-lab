// pulse-aggregates.ts -- the Lab pulse numbers (#156).
//
// Nick, 2026-10-26: the pulse shows LAB-WIDE momentum, the same totals for
// every member. That is a narrow, deliberate exemption to Rule 90 (a viewer
// reads only their projects): these statements read all projects, so the
// caller hands in the UNSCOPED handle, and the function returns counts and
// member slugs only, never a title or an id. Anything that names a row
// (the "recent wins" list) reads through the viewer's handle instead.
//
// Timestamps arrive in two shapes ('YYYY-MM-DD HH:MM:SS' on entity_seen and
// activity_entries, ISO with a Z elsewhere), so every comparison goes
// through datetime() on both sides.

export interface PulseCounts {
  /** Members seen or posting in the last 24h, most recent first. */
  activeSlugs: string[]
  tasksDone: number
  milestonesHit: number
  newPapers: number
}

/** More than this many publications sharing one created_at is a bulk sync, not new work. */
const BULK_SYNC_ROWS = 5

export async function labPulseCounts(
  db: D1Database,
  args: { nowIso: string; weekStartIso: string },
): Promise<PulseCounts> {
  const { nowIso, weekStartIso } = args
  const [active, tasks, papers] = await db.batch([
    // rule-90-aggregate-exempt: #156 (slugs only; which entity is never returned)
    db.prepare(
      `SELECT tm.slug AS slug, MAX(a.at) AS last_at
         FROM (
           SELECT viewer_slug AS slug, datetime(last_seen_at) AS at FROM entity_seen
            WHERE datetime(last_seen_at) > datetime(?1, '-1 day')
           UNION ALL
           SELECT actor_slug AS slug, datetime(created_at) AS at FROM activity_entries
            WHERE datetime(created_at) > datetime(?1, '-1 day')
         ) a
         JOIN team_members tm ON tm.slug = a.slug
        WHERE tm.slug <> 'claude-ai'
        GROUP BY tm.slug
        ORDER BY last_at DESC, tm.slug ASC`,
    ).bind(nowIso),
    // rule-90-aggregate-exempt: #156 (counts only)
    db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'milestone' THEN 0 ELSE 1 END), 0) AS done,
              COALESCE(SUM(CASE WHEN kind = 'milestone' THEN 1 ELSE 0 END), 0) AS milestones
         FROM tasks
        WHERE completed_at IS NOT NULL AND deleted_at IS NULL
          AND datetime(completed_at) >= datetime(?1)
          AND datetime(completed_at) <= datetime(?2)`,
    ).bind(weekStartIso, nowIso),
    // rule-90-aggregate-exempt: #156 (counts only)
    db.prepare(
      `SELECT COALESCE(SUM(n), 0) AS papers FROM (
         SELECT COUNT(*) AS n FROM publications
          WHERE datetime(created_at) > datetime(?1, '-30 days')
          GROUP BY created_at
         HAVING COUNT(*) <= ?2
       )`,
    ).bind(nowIso, BULK_SYNC_ROWS),
  ])
  const t = (tasks.results?.[0] ?? {}) as { done?: number; milestones?: number }
  const p = (papers.results?.[0] ?? {}) as { papers?: number }
  return {
    activeSlugs: (active.results as { slug: string }[]).map((r) => r.slug),
    tasksDone: Number(t.done ?? 0),
    milestonesHit: Number(t.milestones ?? 0),
    newPapers: Number(p.papers ?? 0),
  }
}

/** The one form the route takes the unscoped handle in: a counts function,
 *  never the handle itself (pinned by api/health-unscoped.test.ts). */
export function pulseCountsFrom(db: D1Database): (args: { nowIso: string; weekStartIso: string }) => Promise<PulseCounts> {
  return (args) => labPulseCounts(db, args)
}
