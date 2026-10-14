// G10-07: Session History's tiles and "N of M" count read /api/pb/sessions/stats,
// which ignored the page's range and project filter. The stats now take the
// same project/since filter as the list; per_project stays unfiltered because
// it feeds the project picker.
// Real migrated schema (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handlePBSessionStats, handlePBSessions, handleBulkCreatePBSessions, sessionProjectName } from './pb-sessions'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

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

// G10 (2026-10-14): PB pushed `projects_touched` (a JSON array) cut at its
// first comma, and the Project column printed '[]' or '["Peripheral Brain
// System"]'. Writes now store the plain name; reads clean the stored rows.
describe('session project names', () => {
  beforeEach(() => {
    const ins = db.prepare('INSERT INTO pb_sessions (id, started_at, project_name, duration_minutes) VALUES (?, ?, ?, 10)')
    ins.run('j1', '2026-10-03T10:00:00', '[]')
    ins.run('j2', '2026-10-03T11:00:00', '["Peripheral Brain System"]')
    ins.run('j3', '2026-10-03T12:00:00', '["Peripheral Brain System"')
    insertRow(db, 'projects', { id: 'p1', slug: 'peripheral-brain-system', title: 'Peripheral Brain System', short_name: 'PB System' })
  })

  it('sessionProjectName reads every shape PB sent', () => {
    expect(sessionProjectName('[]')).toBeNull()
    expect(sessionProjectName('["A B"]')).toBe('A B')
    expect(sessionProjectName('["A B", "C"]')).toBe('A B')
    expect(sessionProjectName('["CQODE Backbone / UMN CLIF"')).toBe('CQODE Backbone / UMN CLIF')
    expect(sessionProjectName('Telegram')).toBe('Telegram')
    expect(sessionProjectName('')).toBeNull()
    expect(sessionProjectName(undefined)).toBeNull()
  })

  it('the list returns the plain name and the short name for stored rows', async () => {
    const res = await handlePBSessions(new Request('https://x/api/pb/sessions?since=2026-10-03'), env)
    const rows = (await res.json() as { data: { id: string; project_name: string | null; project_short_name: string | null }[] }).data
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.j1.project_name).toBeNull()
    expect(byId.j2.project_name).toBe('Peripheral Brain System')
    expect(byId.j3.project_name).toBe('Peripheral Brain System')
    expect(byId.j2.project_short_name).toBe('PB System')
  })

  it('the filter and the picker group the cut and whole arrays as one project', async () => {
    const res = await handlePBSessions(new Request('https://x/api/pb/sessions?project=Peripheral%20Brain%20System'), env)
    expect((await res.json() as { count: number }).count).toBe(2)
    const picker = (await stats()).per_project.find((p) => p.project_name === 'Peripheral Brain System') as { count: number; project_short_name: string }
    expect(picker.count).toBe(2)
    expect(picker.project_short_name).toBe('PB System')
    expect((await stats()).per_project.map((p) => p.project_name)).not.toContain('[]')
  })

  it('a bulk write stores the plain name', async () => {
    const req = new Request('https://x/api/pb/sessions/bulk', { method: 'POST', body: JSON.stringify({ sessions: [{ id: 'b1', started_at: '2026-10-04T10:00:00', project_name: '["MN-CCORE Lab Hub"' }] }) })
    await handleBulkCreatePBSessions(req, { email: 'nick@umn.edu', slug: 'nick-ingraham' } as never, env)
    expect((db.prepare("SELECT project_name FROM pb_sessions WHERE id = 'b1'").get() as { project_name: string }).project_name).toBe('MN-CCORE Lab Hub')
  })
})
