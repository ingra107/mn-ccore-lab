// pulse-aggregates.ts -- the Lab pulse numbers (#156).
//
// Nick, 2026-10-26: the pulse shows LAB-WIDE momentum, the same totals for
// every member. That is a narrow, deliberate exemption to Rule 90 (a viewer
// reads only their projects): these statements read all projects, so the
// caller hands in the UNSCOPED handle, and the function returns counts and
// member slugs only, never a title or an id. Anything that names a row
// (the "recent wins" list) reads through the viewer's handle instead.
//
// Cheap as the lab grows (#156 review): each statement compares a BARE,
// indexed column (schema-v149), so it searches instead of scanning. On prod
// (measured 2026-10-26) entity_seen, activity_entries and publications store
// 'YYYY-MM-DD HH:MM:SS' only, so a bound value in that shape compares as
// text. tasks.completed_at holds three shapes (ISO, space, date-only): its
// bare range starts a day early (a date prefix sorts before every shape of
// the same day) and the exact datetime() test then decides.
//
// Parameters (pulseParams): active ?1 = now - 24h ('YYYY-MM-DD HH:MM:SS');
// tasks ?1 = week start - 1 day ('YYYY-MM-DD', the prefilter), ?2 = week
// start, ?3 = now (ISO); papers ?1 = now - 30 days (space shape), ?2 = the
// bulk-sync threshold.

export interface PulseCounts {
  /** Members seen or posting in the last 24h, most recent first. */
  activeSlugs: string[]
  tasksDone: number
  milestonesHit: number
  newPapers: number
}

/** More than this many publications sharing one created_at is a bulk sync, not new work. */
export const BULK_SYNC_ROWS = 5

export const PULSE_SQL = {
  // rule-90-aggregate-exempt: #156 (slugs only; which entity is never returned)
  // activity-hidden-exempt: presence only (who posted in the last day); no body, thread or count of a dismissed thread is returned
  active: `SELECT tm.slug AS slug, MAX(a.at) AS last_at
     FROM (
       SELECT viewer_slug AS slug, last_seen_at AS at FROM entity_seen WHERE last_seen_at > ?1
       UNION ALL
       SELECT actor_slug AS slug, created_at AS at FROM activity_entries WHERE created_at > ?1
     ) a
     JOIN team_members tm ON tm.slug = a.slug
    WHERE tm.slug <> 'claude-ai'
    GROUP BY tm.slug
    ORDER BY last_at DESC, tm.slug ASC`,
  // rule-90-aggregate-exempt: #156 (counts only)
  tasks: `SELECT COALESCE(SUM(CASE WHEN kind = 'milestone' THEN 0 ELSE 1 END), 0) AS done,
          COALESCE(SUM(CASE WHEN kind = 'milestone' THEN 1 ELSE 0 END), 0) AS milestones
     FROM tasks
    WHERE completed_at >= ?1
      AND deleted_at IS NULL
      AND datetime(completed_at) >= datetime(?2)
      AND datetime(completed_at) <= datetime(?3)`,
  // rule-90-aggregate-exempt: #156 (counts only)
  papers: `SELECT COALESCE(SUM(n), 0) AS papers FROM (
     SELECT COUNT(*) AS n FROM publications
      WHERE created_at > ?1
      GROUP BY created_at
     HAVING COUNT(*) <= ?2
   )`,
} as const

/** An instant as the 'YYYY-MM-DD HH:MM:SS' UTC text the uniform columns store. */
// eslint-disable-next-line local/time-discipline -- formats a UTC instant in the stored column shape; not a civil day
const spaceStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/** The bound values for each PULSE_SQL statement, in ordinal order. */
export function pulseParams(args: { nowIso: string; weekStartIso: string }): Record<keyof typeof PULSE_SQL, unknown[]> {
  const now = Date.parse(args.nowIso)
  const weekStart = Date.parse(args.weekStartIso)
  return {
    active: [spaceStamp(now - 86_400_000)],
    // eslint-disable-next-line local/time-discipline -- a UTC date PREFIX for a text range, one day early on purpose; the exact test is datetime()
    tasks: [new Date(weekStart - 86_400_000).toISOString().slice(0, 10), args.weekStartIso, args.nowIso],
    papers: [spaceStamp(now - 30 * 86_400_000), BULK_SYNC_ROWS],
  }
}

export async function labPulseCounts(
  db: D1Database,
  args: { nowIso: string; weekStartIso: string },
): Promise<PulseCounts> {
  const p = pulseParams(args)
  const [active, tasks, papers] = await db.batch([
    db.prepare(PULSE_SQL.active).bind(...p.active),
    db.prepare(PULSE_SQL.tasks).bind(...p.tasks),
    db.prepare(PULSE_SQL.papers).bind(...p.papers),
  ])
  const t = (tasks.results?.[0] ?? {}) as { done?: number; milestones?: number }
  const n = (papers.results?.[0] ?? {}) as { papers?: number }
  return {
    activeSlugs: (active.results as { slug: string }[]).map((r) => r.slug),
    tasksDone: Number(t.done ?? 0),
    milestonesHit: Number(t.milestones ?? 0),
    newPapers: Number(n.papers ?? 0),
  }
}

/** The one form the route takes the unscoped handle in: a counts function,
 *  never the handle itself (pinned by api/health-unscoped.test.ts). */
export function pulseCountsFrom(db: D1Database): (args: { nowIso: string; weekStartIso: string }) => Promise<PulseCounts> {
  return (args) => labPulseCounts(db, args)
}
