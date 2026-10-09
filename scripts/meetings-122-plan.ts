// meetings-122-plan.ts -- the pure half of the schema-v122 audience backfill.
//
// One write on prod `meetings`: every existing row whose title is one of the
// three lab series (shared/meetingAudience.ts, the SAME classifier the Worker's
// INSERT uses) goes from 'private' to 'lab'. Generated from a pre-image the
// operator exports, so the apply and its rollback name exact ids; each UPDATE
// is guarded on the old value, so a row flipped by hand since the export is
// left alone, and the rollback is guarded on the new value the same way.
//
// No grants are generated: Nick ruled "none by default", and nothing
// automated writes meeting_project_grants.
//
// COLLISIONS. idx_meetings_lab_date_title allows one lab row per
// (date, lower(trim(title))). Since schema-v119 a member's Prep row can sit
// beside Nick's row of the same series meeting, so two lab-classified rows can
// share that key. The planner REFUSES to plan while any such group exists
// (the apply would fail mid-file on the index) and prints every group. The
// operator names the rows that stay private with `keepPrivate` (recommended:
// the member's own row; Nick's PB-owned row, the one with source_id, goes lab).
//
// WINDOW. Between the DDL and the deploy the old Worker inserts every row as
// 'private'. The post-deploy sweep runs this planner again with `windowStart`
// (the DDL time): only rows CREATED at or after it are candidates, so a row
// Nick flipped to private by hand after the deploy is not flipped back.
//
// CLI: scripts/backfill-122-meetings-audience.ts. Tests: api/lib/meetings-122-plan.test.ts.

import { isLabSeriesTitle, labSeriesKey } from '../shared/meetingAudience'

export interface MeetingAudiencePreImage {
  id: string
  date: string
  title: string
  owner_slug?: string | null
  source_id?: string | null
  created_at?: string | null
  /** Absent in a pre-DDL export: read as 'private' (the column's default). */
  audience?: string | null
}

export interface AudiencePlan {
  apply: string
  rollback: string
  count: number
  /** "<id>  <date>  <series>  <title>" per row that changes. */
  detail: string[]
  /** Groups of lab-classified rows sharing the index key; non-empty = refuse. */
  collisions: string[][]
  /** Lab-titled rows left private on the operator's word (keepPrivate). */
  keptPrivate: string[]
}

function lit(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

/** SQLite's lower(trim(x)): trim strips spaces only, lower folds ASCII only. */
export function sqliteLowerTrim(title: string): string {
  return title.replace(/^ +| +$/g, '').replace(/[A-Z]/g, (c) => c.toLowerCase())
}

export function planAudienceBackfill(
  meetings: readonly MeetingAudiencePreImage[],
  opts: { windowStart?: string; keepPrivate?: readonly string[] } = {},
): AudiencePlan {
  const keep = new Set(opts.keepPrivate ?? [])
  const audienceOf = (m: MeetingAudiencePreImage) => m.audience ?? 'private'
  const inWindow = (m: MeetingAudiencePreImage) => !opts.windowStart || (!!m.created_at && m.created_at >= opts.windowStart)

  // Every row that would be lab after the apply (already lab, or about to be).
  const willBeLab = meetings.filter((m) =>
    audienceOf(m) === 'lab' || (isLabSeriesTitle(m.title) && audienceOf(m) === 'private' && inWindow(m) && !keep.has(m.id)))
  const groups = new Map<string, MeetingAudiencePreImage[]>()
  for (const m of willBeLab) {
    const key = `${m.date}\u0000${sqliteLowerTrim(m.title)}`
    groups.set(key, [...(groups.get(key) ?? []), m])
  }
  const collisions = [...groups.values()].filter((g) => g.length > 1)
    .map((g) => g.map((m) => `${m.id}  ${m.date}  owner=${m.owner_slug ?? 'NULL'}  source_id=${m.source_id ?? 'NULL'}  audience=${audienceOf(m)}  ${m.title}`))
  const keptPrivate = meetings.filter((m) => keep.has(m.id) && isLabSeriesTitle(m.title)).map((m) => m.id).sort()
  if (collisions.length > 0) {
    return { apply: '', rollback: '', count: 0, detail: [], collisions, keptPrivate }
  }
  const changing = willBeLab.filter((m) => audienceOf(m) === 'private').sort((a, b) => a.id.localeCompare(b.id))
  return {
    apply: changing.map((m) => `UPDATE meetings SET audience = 'lab' WHERE id = ${lit(m.id)} AND audience = 'private';`).join('\n'),
    rollback: changing.map((m) => `UPDATE meetings SET audience = 'private' WHERE id = ${lit(m.id)} AND audience = 'lab';`).join('\n'),
    count: changing.length,
    detail: changing.map((m) => `${m.id}  ${m.date}  ${labSeriesKey(m.title)}  ${m.title}`),
    collisions: [],
    keptPrivate,
  }
}
