// Three edges of the watcher arm, from a member's seat through the real worker:
// a bulk action too big for one IN list, a write that takes away the writer's own
// read, and @hermes from someone who can read the task but not its project.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { AuthUser, Env } from '../helpers'
import { handleBatchUpdateTasks, handleUpdateTask, handleUpdateTaskStatus, ownWatchRemover } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NATE = 'mesfin@umn.edu'
const CASEY = 'eddin022@umn.edu'
const PROJ = 'proj_hidden'
const TASK = 'task_watched'

let db: InstanceType<typeof Database>
let env: Env

async function call(method: string, path: string, who: string, body?: unknown) {
  const headers: Record<string, string> = { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, CTX)
  return { status: res.status, body: await res.json().catch(() => null) as { data?: unknown } | null }
}

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate', slug: 'nate-mesfin', member_type: 'director', email: NATE })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  insertRow(db, 'projects', { id: PROJ, slug: 'hidden', title: 'Hidden', description: 'Hidden', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  insertRow(db, 'project_members', { project_id: PROJ, member_slug: 'nate-mesfin', added_by: 'test' })
  insertRow(db, 'tasks', { id: TASK, title: 'Watched', project_id: PROJ, status: 'todo', priority: 'medium', assignee: 'nate-mesfin', watchers: '["casey-eddington"]' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('a bulk action past the bind limit', () => {
  const nate = { email: NATE, name: 'Nate', slug: 'nate-mesfin' } as AuthUser
  // D1 refuses a statement with more than 100 bound parameters; better-sqlite3 does not.
  const capped = (inner: Env['DB'], failWatcherRead = false) => new Proxy(inner, {
    get(t, k) {
      if (k !== 'prepare') return Reflect.get(t, k)
      return (sql: string) => {
        if (failWatcherRead && sql.includes('watchers IS NOT NULL')) throw new Error('read failed')
        const stmt = t.prepare(sql)
        return new Proxy(stmt, {
          get(s, m) {
            if (m !== 'bind') { const v = Reflect.get(s, m); return typeof v === 'function' ? v.bind(s) : v }
            return (...args: unknown[]) => {
              if (args.length > 100) throw new Error(`too many SQL variables: ${args.length}`)
              return s.bind(...args)
            }
          },
        })
      }
    },
  }) as Env['DB']
  const seed120 = () => {
    const ids: string[] = []
    for (let i = 0; i < 120; i++) {
      const id = `task_bulk_${i}`
      ids.push(id)
      insertRow(db, 'tasks', { id, title: `Bulk ${i}`, project_id: PROJ, status: 'todo', priority: 'medium', assignee: 'nate-mesfin', watchers: i === 119 ? '["casey-eddington"]' : null })
    }
    return ids
  }
  const batch = (ids: string[]) => new Request('https://x/api/tasks/batch', {
    method: 'POST',
    headers: { 'X-Test-Mode-Key': TEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action: 'priority', value: 'high' }),
  })

  it('120 ids: answers 200 with all applied, and the watcher in the last chunk is told', async () => {
    const ids = seed120()
    const res = await handleBatchUpdateTasks(batch(ids), nate, { ...env, DB: capped(env.DB) } as Env)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { ok: boolean; applied: string[] } }
    expect(body.data.ok).toBe(true)
    expect(body.data.applied).toHaveLength(120)
    const told = db.prepare("SELECT source_id FROM notifications WHERE recipient_slug = 'casey-eddington'").all() as { source_id: string }[]
    expect(told.map((n) => n.source_id)).toContain('task_bulk_119')
  })

  it('a failed watcher read does not fail a batch that landed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ids = seed120().slice(0, 3)
    const res = await handleBatchUpdateTasks(batch(ids), nate, { ...env, DB: capped(env.DB, true) } as Env)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: { applied: string[] } }).data.applied).toHaveLength(3)
    expect((db.prepare("SELECT priority FROM tasks WHERE id = 'task_bulk_0'").get() as { priority: string }).priority).toBe('high')
  })
})

describe('a write that takes away the writer\'s own read', () => {
  it('a watcher who removes themselves: 200, data null, and the write stands', async () => {
    const res = await call('POST', `/api/tasks/${TASK}`, CASEY, { watchers: null })
    expect(res.status).toBe(200)
    expect(res.body?.data).toBeNull()
    expect((db.prepare('SELECT watchers FROM tasks WHERE id = ?').get(TASK) as { watchers: string | null }).watchers).toBeNull()
    expect((await call('GET', `/api/tasks/${TASK}`, CASEY)).status).toBe(404)
  })

  it('the self-removal is a whole write: it has its ledger row', async () => {
    await call('POST', `/api/tasks/${TASK}`, CASEY, { watchers: null })
    const row = db.prepare('SELECT last_mutation_id FROM tasks WHERE id = ?').get(TASK) as { last_mutation_id: string }
    expect(db.prepare('SELECT outcome FROM processed_mutations WHERE mutation_id = ?').get(row.last_mutation_id)).toMatchObject({ outcome: 'accepted' })
  })

  const row = () => db.prepare('SELECT watchers, priority FROM tasks WHERE id = ?').get(TASK) as { watchers: string | null; priority: string }

  it('dropping your own watch and changing another field is refused whole: a 400 and nothing written', async () => {
    const res = await call('POST', `/api/tasks/${TASK}`, CASEY, { watchers: null, priority: 'high' })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/on its own/)
    expect(row()).toEqual({ watchers: '["casey-eddington"]', priority: 'medium' })
  })

  it('dropping your own watch and adding someone in the same save is refused whole too', async () => {
    const res = await call('POST', `/api/tasks/${TASK}`, CASEY, { watchers: '["nate-mesfin"]' })
    expect(res.status).toBe(400)
    expect(row().watchers).toBe('["casey-eddington"]')
  })

  it('dropping your own watch keeps the others on the list', async () => {
    db.prepare(`UPDATE tasks SET watchers = '["casey-eddington","nate-mesfin"]' WHERE id = ?`).run(TASK)
    const res = await call('POST', `/api/tasks/${TASK}`, CASEY, { watchers: '["nate-mesfin"]' })
    expect(res.status).toBe(200)
    expect(res.body?.data).toBeNull()
    expect(row().watchers).toBe('["nate-mesfin"]')
  })

  it('removing someone else keeps the read of the writer and echoes the row', async () => {
    db.prepare(`UPDATE tasks SET watchers = '["casey-eddington","nate-mesfin"]' WHERE id = ?`).run(TASK)
    const res = await call('POST', `/api/tasks/${TASK}`, CASEY, { watchers: '["casey-eddington"]' })
    expect(res.status).toBe(200)
    expect(res.body?.data).toMatchObject({ id: TASK })
  })

  it('a project member who also watched and removes themselves still reads it', async () => {
    db.prepare(`UPDATE tasks SET watchers = '["nate-mesfin"]' WHERE id = ?`).run(TASK)
    const res = await call('POST', `/api/tasks/${TASK}`, NATE, { watchers: null })
    expect(res.status).toBe(200)
    expect(res.body?.data).toMatchObject({ id: TASK })
  })

  it('an ordinary edit still echoes the row', async () => {
    const res = await call('POST', `/api/tasks/${TASK}`, CASEY, { priority: 'high' })
    expect(res.status).toBe(200)
    expect(res.body?.data).toMatchObject({ id: TASK, priority: 'high' })
  })

  it('a task the caller cannot read is still a 404, and nothing is written', async () => {
    db.prepare('UPDATE tasks SET watchers = NULL WHERE id = ?').run(TASK)
    expect((await call('POST', `/api/tasks/${TASK}`, CASEY, { priority: 'high' })).status).toBe(404)
    expect((db.prepare('SELECT priority FROM tasks WHERE id = ?').get(TASK) as { priority: string }).priority).toBe('medium')
  })
})

describe('the own-watch operation names nothing but the base list', () => {
  const casey = { email: CASEY, name: 'Casey', slug: 'casey-eddington' } as AuthUser
  const watchersNow = () => (db.prepare('SELECT watchers FROM tasks WHERE id = ?').get(TASK) as { watchers: string | null }).watchers

  it('takes only its own person off the list, on its own task', async () => {
    db.prepare(`UPDATE tasks SET watchers = '["casey-eddington","nate-mesfin"]' WHERE id = ?`).run(TASK)
    const r = await ownWatchRemover(env, env.DB, TASK, casey)('["casey-eddington","nate-mesfin"]')
    expect(r.status).toBe('accepted')
    expect(watchersNow()).toBe('["nate-mesfin"]')
  })

  it('a watcher already removed cannot write: nothing lands, whatever the caller read', async () => {
    db.prepare(`UPDATE tasks SET watchers = '["nate-mesfin","dan-shyu"]' WHERE id = ?`).run(TASK)
    const r = await ownWatchRemover(env, env.DB, TASK, casey)('["casey-eddington"]')
    expect(r).toMatchObject({ status: 'conflict', reason: 'watchers_changed' })
    expect(watchersNow()).toBe('["nate-mesfin","dan-shyu"]')
  })

  it('a base list that does not hold the caller is refused, even if it is the stored one', async () => {
    db.prepare(`UPDATE tasks SET watchers = '["nate-mesfin"]' WHERE id = ?`).run(TASK)
    const r = await ownWatchRemover(env, env.DB, TASK, casey)('["nate-mesfin"]')
    expect(r).toMatchObject({ status: 'conflict', reason: 'watchers_changed' })
    expect(watchersNow()).toBe('["nate-mesfin"]')
  })

  it('removed between the read and the commit: the retry sees it and nothing lands', async () => {
    let raced = false
    const racing = new Proxy(env.DB, {
      get(t, k) {
        if (k !== 'batch') { const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v }
        return async (stmts: unknown[]) => {
          if (!raced) { raced = true; db.prepare(`UPDATE tasks SET watchers = '["nate-mesfin"]' WHERE id = ?`).run(TASK) }
          return t.batch(stmts as never)
        }
      },
    }) as Env['DB']
    const r = await ownWatchRemover({ ...env, DB: racing } as Env, racing, TASK, casey)('["casey-eddington"]')
    expect(raced).toBe(true)
    expect(r).toMatchObject({ status: 'conflict', reason: 'watchers_changed' })
    expect(watchersNow()).toBe('["nate-mesfin"]')
  })

  it('the row write itself carries the base list', async () => {
    const seen: string[] = []
    const spying = new Proxy(env.DB, {
      get(t, k) {
        if (k !== 'prepare') { const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v }
        return (sql: string) => { seen.push(sql); return t.prepare(sql) }
      },
    }) as Env['DB']
    await ownWatchRemover({ ...env, DB: spying } as Env, spying, TASK, casey)('["casey-eddington"]')
    expect(seen.find((s) => s.startsWith('UPDATE tasks SET watchers'))).toContain('watchers IS ?')
  })
})

describe('a stale watcher save', () => {
  const watchersNow = () => (db.prepare('SELECT watchers FROM tasks WHERE id = ?').get(TASK) as { watchers: string | null }).watchers
  beforeEach(() => {
    insertRow(db, 'team_members', { id: 'tm-dan', name: 'Dan', slug: 'dan-shyu', email: 'shyu@umn.edu' })
    insertRow(db, 'team_members', { id: 'tm-lia', name: 'Lia', slug: 'lia-siegel', email: 'siegel@umn.edu' })
  })

  it('two editors from one list: the later save answers the conflict with the current list, and drops no one', async () => {
    const base = '["casey-eddington"]'
    const first = await call('POST', `/api/tasks/${TASK}`, NATE, { watchers: '["casey-eddington","dan-shyu"]', expected_watchers: base })
    expect(first.status).toBe(200)
    const second = await call('POST', `/api/tasks/${TASK}`, NATE, { watchers: '["casey-eddington","lia-siegel"]', expected_watchers: base })
    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ code: 'watchers_changed', watchers: '["casey-eddington","dan-shyu"]' })
    expect(watchersNow()).toBe('["casey-eddington","dan-shyu"]')
  })

  it('the comparison is of the people, not the spelling', async () => {
    db.prepare("UPDATE tasks SET watchers = 'casey-eddington, nate-mesfin' WHERE id = ?").run(TASK)
    const res = await call('POST', `/api/tasks/${TASK}`, NATE, { watchers: '["casey-eddington","nate-mesfin","dan-shyu"]', expected_watchers: '["casey-eddington","nate-mesfin"]' })
    expect(res.status).toBe(200)
  })

  it('no list at all reads the same as an empty one', async () => {
    db.prepare('UPDATE tasks SET watchers = NULL WHERE id = ?').run(TASK)
    const res = await call('POST', `/api/tasks/${TASK}`, NATE, { watchers: '["dan-shyu"]', expected_watchers: null })
    expect(res.status).toBe(200)
  })

  it('a stale self-removal is refused too', async () => {
    db.prepare(`UPDATE tasks SET watchers = '["casey-eddington","dan-shyu"]' WHERE id = ?`).run(TASK)
    const res = await call('POST', `/api/tasks/${TASK}`, CASEY, { watchers: null, expected_watchers: '["casey-eddington"]' })
    expect(res.status).toBe(409)
    expect(watchersNow()).toBe('["casey-eddington","dan-shyu"]')
  })

  it('a change landing between the read and the commit answers the conflict too', async () => {
    const realBatch = env.DB.batch.bind(env.DB)
    let raced = false
    const racing = new Proxy(env.DB, {
      get(t, k) {
        if (k !== 'batch') { const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v }
        return async (stmts: unknown[]) => {
          if (!raced) { raced = true; db.prepare(`UPDATE tasks SET watchers = '["casey-eddington","dan-shyu"]' WHERE id = ?`).run(TASK) }
          return realBatch(stmts as never)
        }
      },
    }) as Env['DB']
    const nate = { email: NATE, name: 'Nate', slug: 'nate-mesfin' } as AuthUser
    const req = new Request(`https://x/api/tasks/${TASK}`, { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ watchers: '["casey-eddington","lia-siegel"]' }) })
    const res = await handleUpdateTask(TASK, req, nate, { ...env, DB: racing } as Env)
    expect(raced).toBe(true)
    expect(res.status).toBe(409)
    expect(watchersNow()).toBe('["casey-eddington","dan-shyu"]')
  })
})

describe('a notification failure after the write landed', () => {
  const nate = { email: NATE, name: 'Nate', slug: 'nate-mesfin' } as AuthUser
  const noNotes = () => new Proxy(env.DB, {
    get(t, k) {
      if (k !== 'prepare') { const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v }
      return (sql: string) => {
        if (sql.startsWith('INSERT INTO notifications')) throw new Error('notifications are down')
        return t.prepare(sql)
      }
    },
  }) as Env['DB']
  const post = (body: unknown) => new Request(`https://x/api/tasks/${TASK}`, { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('a changed field: 200, the write stands', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleUpdateTask(TASK, post({ priority: 'high' }), nate, { ...env, DB: noNotes() } as Env)
    expect(res.status).toBe(200)
    expect((db.prepare('SELECT priority FROM tasks WHERE id = ?').get(TASK) as { priority: string }).priority).toBe('high')
  })

  it('an added watcher: 200, the write stands', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleUpdateTask(TASK, post({ watchers: '["casey-eddington","nate-mesfin"]' }), { ...nate, slug: 'someone-else' }, { ...env, DB: noNotes() } as Env)
    expect(res.status).toBe(200)
  })

  it('the status route: 200, the write stands', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const req = new Request(`https://x/api/tasks/${TASK}/status`, { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) })
    expect((await handleUpdateTaskStatus(TASK, req, nate, { ...env, DB: noNotes() } as Env)).status).toBe(200)
  })
})

describe('@hermes and a project the asker cannot see', () => {
  const asked = () => db.prepare('SELECT project_slug, requested_by FROM ai_requests').get() as { project_slug: string | null; requested_by: string }
  const entries = () => db.prepare('SELECT actor_slug, project_id FROM activity_entries ORDER BY actor_slug').all() as { actor_slug: string; project_id: string | null }[]

  it('a watcher not on the project: the request names no project', async () => {
    const res = await call('POST', `/api/tasks/${TASK}/comments`, CASEY, { content: '@hermes what is this project about' })
    expect(res.status).toBe(201)
    expect(asked()).toMatchObject({ project_slug: null, requested_by: CASEY })
  })

  it('the thread rows keep the real project, so project members still read them', async () => {
    await call('POST', `/api/tasks/${TASK}/comments`, CASEY, { content: '@hermes what is this project about' })
    expect(entries().map((e) => e.project_id)).toEqual([PROJ, PROJ])
  })

  it('a member of the project: the request names it', async () => {
    await call('POST', `/api/tasks/${TASK}/comments`, NATE, { content: '@hermes what is this project about' })
    expect(asked()).toMatchObject({ project_slug: PROJ, requested_by: NATE })
  })
})
