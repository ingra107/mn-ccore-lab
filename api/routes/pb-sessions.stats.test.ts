// G10-07: Session History's tiles and "N of M" count read /api/pb/sessions/stats,
// which ignored the page's range and project filter. The stats now take the
// same project/since filter as the list; per_project stays unfiltered because
// it feeds the project picker.
// Real migrated schema (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handlePBSessionStats } from './pb-sessions'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

let db: InstanceType<typeof Database>
let env: any

const stats = async (qs = '') => {
  const res = await handlePBSessionStats(new Request(`https://x/api/pb/sessions/stats${qs}`), env)
  return (await res.json() as { data: { total_sessions: number; per_project: { project_name: string }[] } }).data
}

beforeEach(() => {
  db = prodSchemaDb()
  const ins = db.prepare('INSERT INTO pb_sessions (id, started_at, project_name, duration_minutes) VALUES (?, ?, ?, 10)')
  ins.run('s1', '2026-01-05T10:00:00', 'alpha')
  ins.run('s2', '2026-10-01T10:00:00', 'alpha')
  ins.run('s3', '2026-10-02T10:00:00', 'beta')
  env = { DB: d1Adapter(db) }
})

describe('GET /api/pb/sessions/stats', () => {
  it('counts every session with no filter', async () => {
    expect((await stats()).total_sessions).toBe(3)
  })

  it('counts only the range and project the list shows', async () => {
    expect((await stats('?since=2026-09-01')).total_sessions).toBe(2)
    expect((await stats('?project=alpha')).total_sessions).toBe(2)
    expect((await stats('?project=alpha&since=2026-09-01')).total_sessions).toBe(1)
  })

  it('keeps per_project unfiltered for the project picker', async () => {
    const names = (await stats('?project=alpha')).per_project.map((p) => p.project_name).sort()
    expect(names).toEqual(['alpha', 'beta'])
  })
})
