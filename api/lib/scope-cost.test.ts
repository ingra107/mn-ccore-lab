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
import { packetFreshness, taskWorkToken } from './packet-freshness'

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
    const raw = d1Adapter(d) as unknown as D1Database
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
        // Even rows carry the task's real token and stay ready; odd rows a stale
        // one. A broken task lookup (every row task_missing) fails the even rows.
        manifest_json: JSON.stringify([
          { kind: 'task', ref: task, token: i % 2 === 0 ? await taskWorkToken(raw, task) : 'stale' },
          { kind: 'activity', ref: task, observed_at: '2026-11-01T00:00:00Z' },
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
    expect(twelve.rows.map((r) => r.packet_state)).toEqual(Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 'ready' : 'changed')))
    expect(twelve.rows.every((r) => !('packet_id' in r))).toBe(true)
  })
})

describe('packet freshness keeps its per-reference bound in SQL', () => {
  it('D1 returns at most 50 messages for a thread and 20 comments for a task, and the newest still decide', async () => {
    const d = prodSchemaDb()
    d.pragma('foreign_keys = OFF')
    insertRow(d, 'tasks', { id: 'task_b', title: 'b', assignee: 'nick-ingraham', status: 'todo' })
    for (let i = 0; i < 70; i++) {
      const at = `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T00:00:${String(i).padStart(2, '0')}Z`
      insertRow(d, 'mail_messages', { message_id: `m${i}`, thread_id: 'th', internal_at: at, party: 'other', baseline: 0, first_run_id: 'r', from_display: `S${i}` })
      insertRow(d, 'activity_entries', { id: `a${i}`, entity_type: 'task', entity_id: 'task_b', kind: 'comment', actor_slug: `w${i}`, body: 'x', created_at: at, visibility: 'team' })
    }
    const adapter = d1Adapter(d) as unknown as D1Database
    const returned: Record<string, number> = {}
    const db = {
      prepare: (sql: string) => {
        const stmt = adapter.prepare(sql)
        return {
          bind: (...v: unknown[]) => {
            const bound = stmt.bind(...v)
            return {
              all: async () => {
                const r = await bound.all()
                const m = /FROM (mail_messages|activity_entries)\b/.exec(sql)
                if (m) returned[m[1]] = r.results.length
                return r
              },
            }
          },
        }
      },
    } as unknown as D1Database
    const out = await packetFreshness(db, 'task_b', [
      { kind: 'activity', ref: 'task_b', observed_at: '2026-10-28T00:00:30Z' },
      { kind: 'thread', ref: 'th', observed_at: '2026-10-28T00:00:30Z' },
    ] as never, Date.parse('2026-11-02T12:00:00Z'))
    expect(returned).toEqual({ mail_messages: 50, activity_entries: 20 })
    expect(out.reasons.map((r) => r.code).sort()).toEqual(['activity_added', 'reply_arrived'])
  })
})

describe('a whole-table read pays per row, so a per-row rule stays a cheap probe', () => {
  it('file_activity_daily probes a project by key, with no scan of projects per row', () => {
    const plan = planOf('SELECT project_id, SUM(file_count) FROM file_activity_daily WHERE date >= ? GROUP BY project_id', '2026-01-01')
    const scansProjectsPerRow = plan.some((d, k) => /^CORRELATED/.test(d) && /^SCAN (vp|projects)\b/.test(plan[k + 1] ?? ''))
    expect(scansProjectsPerRow, plan.join('\n')).toBe(false)
  })
})
