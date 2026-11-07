// What a read costs under the viewer's copy of a table (PB #9033). D1 answered
// "too many resources consumed within a 10 second window" once a scoped point read
// re-read the viewer's whole visible set: every statement that named `tasks` read
// every project membership and every meeting, once per reference. The rules now
// probe by key. rows_read is the engine's number and better-sqlite3 has no such
// counter, so these pin the shape that produces it: a query plan, and the statement
// count of a page. Prod numbers are in the #9033 status.
import { describe, it, expect } from 'vitest'
import { d1Adapter, insertRow, prodSchemaDb } from '../test-support/prod-schema-db'
import { activeScopes, personViewer, scopeSql, viewerDb } from './viewer-db'
import { TASK_SELECT_COLS } from './task-cols'
import { attachPacketStates } from '../routes/packets'

const viewer = personViewer({ slug: 'casey', email: 'casey@umn.edu', pi: false })

function planOf(raw: string, ...binds: unknown[]): string[] {
  const d = prodSchemaDb()
  const sql = scopeSql(raw, activeScopes(viewer))
  return (d.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds) as { detail: string }[]).map((r) => r.detail)
}

// In a statement that names one row: a scan of a table the rules probe by key, or
// a read of the viewer's every membership. The rules' remaining lists (legacy
// slugs, Peripheral Brain refs) are built lazily, past the arms that admit a typed
// reference, so a plan cannot show whether they run; prod's rows_read did (3 rows).
const WHOLE_TABLE = /^SCAN (tasks|vt|meetings|vm|activity_entries)\b|\(member_slug=\?\)/

describe('a point read does not read the visible set', () => {
  const point: [string, string, unknown[]][] = [
    ['a task by id', 'SELECT title FROM tasks WHERE id = ?', ['t1']],
    ['a task\'s comments', "SELECT actor_slug FROM activity_entries WHERE entity_type = 'task' AND entity_id = ? AND hidden_at IS NULL ORDER BY created_at DESC LIMIT 20", ['t1']],
    ['a scoped UPDATE, whose write guard reads the CTE', "UPDATE tasks SET status = 'done' WHERE id = ?", ['t1']],
  ]
  for (const [name, sql, binds] of point) {
    it(name, () => {
      const bad = planOf(sql, ...binds).filter((d) => WHOLE_TABLE.test(d))
      expect(bad, planOf(sql, ...binds).join('\n')).toEqual([])
    })
  }
})

describe('the task list column project_id', () => {
  function seed() {
    const d = prodSchemaDb()
    insertRow(d, 'projects', { id: 'proj_mine', slug: 'mine', title: 'M', category: 'MNCCORE', status: 'active' })
    insertRow(d, 'projects', { id: 'proj_hidden', slug: 'hidden', title: 'H', category: 'MNCCORE', status: 'active' })
    // A legacy slug-stored reference breaks today's foreign key; the rule still answers for it.
    d.pragma('foreign_keys = OFF')
    insertRow(d, 'project_members', { project_id: 'proj_mine', member_slug: 'casey', added_by: 'test' })
    for (const [id, project_id] of [['t_typed', 'proj_mine'], ['t_legacy', 'mine'], ['t_hidden', 'proj_hidden'], ['t_none', null]] as const) {
      insertRow(d, 'tasks', { id, title: id, project_id, assignee: 'casey', status: 'todo' })
    }
    d.pragma('foreign_keys = ON')
    return viewerDb(d1Adapter(d), viewer)
  }

  it('resolves a typed id and a legacy slug, and never hands out a hidden project or a raw value', async () => {
    const db = seed()
    const rows = (await db.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t`).all<{ id: string; project_id: string | null }>()).results
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.project_id]))
    expect(byId).toEqual({ t_typed: 'mine', t_legacy: 'mine', t_hidden: null, t_none: null })
  })
})

describe('packet states on a task page', () => {
  async function pageWith(packets: number) {
    const d = prodSchemaDb()
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < packets; i++) {
      const task = `task_${i}`
      insertRow(d, 'tasks', { id: task, title: task, assignee: 'nick-ingraham', status: 'todo' })
      const pkt = `pkt_${i}`
      insertRow(d, 'task_packets', { id: pkt, task_id: task, producer_key: `k${i}`, created_at: '2026-11-01T00:00:00Z' })
      insertRow(d, 'task_packet_versions', {
        packet_id: pkt, version: 1, author: 'claude', instruction: 'i', deliverable_kind: 'answer',
        deliverable_json: '{"kind":"answer"}', body: 'b', calls_json: '[]', manifest_hash: 'x'.repeat(64),
        created_at: '2026-11-01T00:00:00Z',
        manifest_json: JSON.stringify([
          { kind: 'task', ref: task, token: 'stale' },
          { kind: 'activity', ref: task, observed_at: '2026-11-01T00:00:00Z' },
          { kind: 'thread', ref: `th${i}`, observed_at: '2026-11-01T00:00:00Z' },
        ]),
      })
      rows.push({ id: task, packet_id: pkt })
    }
    let statements = 0
    const db = d1Adapter(d, { onExec: () => { statements++ } }) as unknown as D1Database
    await attachPacketStates(db, rows, Date.parse('2026-11-02T12:00:00Z'))
    return { statements, rows }
  }

  it('costs the same statements for 12 packets as for 2, and judges every row', async () => {
    const two = await pageWith(2)
    const twelve = await pageWith(12)
    expect(twelve.statements).toBe(two.statements)
    expect(twelve.statements).toBeLessThanOrEqual(6)
    expect(twelve.rows.map((r) => r.packet_state)).toEqual(Array(12).fill('changed'))
    expect(twelve.rows.every((r) => !('packet_id' in r))).toBe(true)
  })
})
