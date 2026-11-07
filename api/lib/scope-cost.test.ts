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
    insertRow(d, 'project_members', { project_id: 'proj_mine', member_slug: 'casey', added_by: 'test' })
    for (const [id, project_id] of [['t_typed', 'proj_mine'], ['t_legacy', 'mine'], ['t_hidden', 'proj_hidden'], ['t_none', null]] as const) {
      insertRow(d, 'tasks', { id, title: id, project_id, assignee: 'casey', status: 'todo' })
    }
    return viewerDb(d1Adapter(d), viewer)
  }

  it('resolves a typed id and a legacy slug, and never hands out a hidden project or a raw value', async () => {
    const db = seed()
    const rows = (await db.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t`).all<{ id: string; project_id: string | null }>()).results
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.project_id]))
    expect(byId).toEqual({ t_typed: 'mine', t_legacy: 'mine', t_hidden: null, t_none: null })
  })
})
