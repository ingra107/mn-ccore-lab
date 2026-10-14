// Lab overview API contracts (overnight audit 2026-10-14, G8-05 / G8-12),
// run on the migration-chain database so the SQL itself is under test.
//
// G8-12: a still-open mentee milestone past its due date counts as overdue,
// never upcoming -- in the overview counts and in the ?status= filter alike.
// G8-05: a project that never had an update reports daysSinceUpdate /
// daysIdle as null (it used to be the 999 sentinel), and sorts after the
// projects with a real day count.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Env } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { prodSchemaDb, d1Adapter, seedProjectHome } from '../test-support/prod-schema-db'
import { ctToday } from '../lib/ct-date'
import { handleGetMenteeMilestones, handleMenteeMilestoneOverview } from './mentee-milestones'
import { handleInsightsDashboard } from './insights'

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
})

const body = async (res: Response) => (await res.json()) as { data: Record<string, unknown>[] | Record<string, unknown> }

function milestone(id: string, status: string, due: string | null) {
  db.prepare(`INSERT INTO mentee_milestones (id, mentee_slug, milestone_type, title, due_date, status)
              VALUES (?, 'jane-mentee', 'paper', ?, ?, ?)`).run(id, `Milestone ${id}`, due, status)
}

describe('mentee milestones: past-due open rows are overdue', () => {
  beforeEach(() => {
    const past = ctToday(-30)
    const future = ctToday(30)
    milestone('up-past', 'upcoming', past)
    milestone('prog-past', 'in_progress', past)
    milestone('stored-overdue', 'overdue', past)
    milestone('up-future', 'upcoming', future)
    milestone('up-today', 'upcoming', ctToday())
    milestone('up-nodate', 'upcoming', null)
    milestone('prog-future', 'in_progress', future)
    milestone('done-past', 'completed', past)
  })

  it('overview counts them as overdue and not as upcoming', async () => {
    const rows = (await body(await handleMenteeMilestoneOverview(env))).data as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      mentee_slug: 'jane-mentee',
      overdue_count: 3,
      upcoming_count: 4,
      completed_count: 1,
      total_count: 8,
    })
  })

  it('?status=overdue and ?status=upcoming split the same way', async () => {
    const ids = async (q: string) =>
      ((await body(await handleGetMenteeMilestones(new URL(`https://hub.test/api/mentee-milestones?${q}`), env))).data as { id: string }[])
        .map((r) => r.id).sort()
    expect(await ids('status=overdue')).toEqual(['prog-past', 'stored-overdue', 'up-past'])
    expect(await ids('status=upcoming')).toEqual(['up-future', 'up-nodate', 'up-today'])
    expect(await ids('status=completed')).toEqual(['done-past'])
  })
})

describe('insights: a never-updated project is null, not 999', () => {
  function project(id: string, slug: string, title: string) {
    seedProjectHome(db, { id })
    db.prepare(`INSERT INTO projects (id, title, slug, status, category, pi)
                VALUES (?, ?, ?, 'active', 'MNCCORE', 'nick-ingraham')`).run(id, title, slug)
  }

  it('reports null days and sorts the never-updated project last', async () => {
    project('proj_idle', 'idle', 'Idle sepsis cohort')
    project('proj_never', 'never', 'Never updated cohort')
    db.prepare(`INSERT INTO activity_entries (id, entity_type, entity_id, project_id, kind, actor_slug, body, created_at)
                VALUES ('ae1', 'project', 'proj_idle', 'proj_idle', 'update', 'nick-ingraham', 'Status', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-40 days'))`).run()

    const data = (await body(await handleInsightsDashboard(env))).data as Record<string, unknown>
    const scatter = data.velocityScatter as { slug: string; daysSinceUpdate: number | null; isOutlier: boolean }[]
    const stalled = data.stalledRegistry as { slug: string; daysIdle: number | null }[]

    const never = scatter.find((r) => r.slug === 'never')!
    expect(never.daysSinceUpdate).toBeNull()
    expect(never.isOutlier).toBe(true)
    expect(scatter.find((r) => r.slug === 'idle')!.daysSinceUpdate).toBe(40)

    expect(stalled.map((r) => [r.slug, r.daysIdle])).toEqual([['idle', 40], ['never', null]])
    expect(JSON.stringify(data)).not.toContain('999')
  })
})
