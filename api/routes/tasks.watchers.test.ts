// A watcher can see the task. The read rule (taskRule, api/lib/table-scope.ts)
// reads tasks.watchers with json_each, so the write has to land a JSON array:
// the panel's comma list passed json_valid() for nobody (fable-audit-2 G01).
// The migration-chain database and the viewer-bound handle run the real SQL.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleUpdateTask, handleGetTasks, handleGetTask, handleUpdateTaskStatus, handleBatchUpdateTasks } from './tasks'
import { postActivityEntry } from '../lib/activity-entry'
import { taskLinkFor } from '../../shared/taskLink'
import { applyMutation } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { viewerDb, personViewer } from '../lib/viewer-db'
import { parseWatchers, serializeWatchers } from '../../shared/watchers'
import type { AuthUser, Env } from '../helpers'

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser
const post = (body: unknown) => new Request('https://x/api/tasks/t', {
  method: 'POST',
  headers: { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

let db: InstanceType<typeof Database>
let env: Env
const stored = () => (db.prepare("SELECT watchers FROM tasks WHERE id = 't_w'").get() as { watchers: string | null }).watchers

async function caseySeesIt(): Promise<boolean> {
  const casey = { DB: viewerDb(d1Adapter(db), personViewer({ slug: 'casey-eddington', email: 'eddin022@umn.edu', pi: false })) } as unknown as Env
  const body = await (await handleGetTasks(new URL('https://x/api/tasks'), casey, false)).json() as { data: Array<{ id: string }> }
  return body.data.some((t) => t.id === 't_w')
}

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  insertRow(db, 'projects', { id: 'proj_other', slug: 'other', title: 'Other', category: 'MNCCORE' })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', email: 'eddin022@umn.edu' })
  insertRow(db, 'tasks', { id: 't_w', title: 'Watched', project_id: 'proj_other', status: 'todo', priority: 'medium', assignee: 'nick-ingraham' })
})

describe('handleUpdateTask stores watchers as a JSON array', () => {
  it('a JSON array write grants the read: the watcher, not on the project, sees the task', async () => {
    expect(await caseySeesIt()).toBe(false)
    const res = await handleUpdateTask('t_w', post({ watchers: '["casey-eddington"]' }), user, env)
    expect(res.status).toBe(200)
    expect(stored()).toBe('["casey-eddington"]')
    expect(await caseySeesIt()).toBe(true)
  })

  it('a slug on no team member is refused, as an assignee is (Rule 20), and nothing is stored', async () => {
    const res = await handleUpdateTask('t_w', post({ watchers: '["casey-eddington","nobody-here"]' }), user, env)
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('nobody-here')
    expect(stored()).toBeNull()
  })

  it('a watcher already on the task may stay, so one stale name cannot block every later edit', async () => {
    db.prepare("UPDATE tasks SET watchers = '[\"left-the-lab\"]' WHERE id = 't_w'").run()
    const res = await handleUpdateTask('t_w', post({ watchers: '["left-the-lab","casey-eddington"]' }), user, env)
    expect(res.status).toBe(200)
    expect(stored()).toBe('["left-the-lab","casey-eddington"]')
  })

  it('clearing the list needs no check', async () => {
    db.prepare("UPDATE tasks SET watchers = '[\"left-the-lab\"]' WHERE id = 't_w'").run()
    expect((await handleUpdateTask('t_w', post({ watchers: null }), user, env)).status).toBe(200)
    expect(stored()).toBeNull()
  })

  it('a comma list is canonicalized, so an old client still grants the read', async () => {
    insertRow(db, 'team_members', { id: 'tm-dan', name: 'Dan', slug: 'dan-shyu', email: 'shyu@umn.edu' })
    await handleUpdateTask('t_w', post({ watchers: 'casey-eddington, dan-shyu,casey-eddington' }), user, env)
    expect(stored()).toBe('["casey-eddington","dan-shyu"]')
    expect(await caseySeesIt()).toBe(true)
  })

  it('an array body is canonicalized too', async () => {
    await handleUpdateTask('t_w', post({ watchers: ['casey-eddington'] }), user, env)
    expect(stored()).toBe('["casey-eddington"]')
  })

  it('an empty value clears the column', async () => {
    await handleUpdateTask('t_w', post({ watchers: 'casey-eddington' }), user, env)
    for (const empty of ['', '[]', null, []]) {
      await handleUpdateTask('t_w', post({ watchers: 'casey-eddington' }), user, env)
      await handleUpdateTask('t_w', post({ watchers: empty }), user, env)
      expect(stored()).toBeNull()
    }
    expect(await caseySeesIt()).toBe(false)
  })

  it('a member on the project can add a watcher, through their own handle', async () => {
    insertRow(db, 'team_members', { id: 'tm-dan', name: 'Dan', slug: 'dan-shyu', email: 'shyu@umn.edu' })
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES ('proj_other', 'dan-shyu', 'test')").run()
    const dan = { DB: viewerDb(d1Adapter(db), personViewer({ slug: 'dan-shyu', email: 'shyu@umn.edu', pi: false })) } as unknown as Env
    const res = await handleUpdateTask('t_w', post({ watchers: '["casey-eddington"]' }), { ...user, slug: 'dan-shyu', email: 'shyu@umn.edu' }, dan)
    expect(res.status).toBe(200)
    expect(await caseySeesIt()).toBe(true)
  })

  it('a member who cannot read the task cannot grant it, and it answers as absent', async () => {
    const res = await handleUpdateTask('t_w', post({ watchers: '["casey-eddington"]' }), { ...user, slug: 'casey-eddington', email: 'eddin022@umn.edu' },
      { DB: viewerDb(d1Adapter(db), personViewer({ slug: 'casey-eddington', email: 'eddin022@umn.edu', pi: false })) } as unknown as Env)
    expect(res.status).toBe(404)
    expect(stored()).toBeNull()
  })

  it('watchers land alongside a patched field, and a refused patch writes neither', async () => {
    const ok = await handleUpdateTask('t_w', post({ watchers: '["casey-eddington"]', priority: 'high' }), user, env)
    expect(ok.status).toBe(200)
    expect(stored()).toBe('["casey-eddington"]')
    const row = db.prepare("SELECT priority FROM tasks WHERE id = 't_w'").get() as { priority: string }
    expect(row.priority).toBe('high')
    const refused = await handleUpdateTask('t_w', post({ watchers: null, priority: null }), user, env)
    expect(refused.status).toBe(400)
    expect(stored()).toBe('["casey-eddington"]')
  })

  it('goes through the one mutation path: a receipt lands and the row version moves', async () => {
    const seq = () => (db.prepare("SELECT seq FROM tasks WHERE id = 't_w'").get() as { seq: number }).seq
    const receipts = () => (db.prepare('SELECT COUNT(*) AS n FROM processed_mutations').get() as { n: number }).n
    const before = { seq: seq(), receipts: receipts() }
    await handleUpdateTask('t_w', post({ watchers: 'casey-eddington' }), user, env)
    expect(receipts()).toBe(before.receipts + 1)
    expect(seq()).toBeGreaterThan(before.seq)
  })

  it('in a patch the column is still refused: PB has no write path to it', async () => {
    const r = await applyMutation(env, { table: 'tasks', record_id: 't_w', op: 'update', patch: { watchers: '["casey-eddington"]' }, route: 'test', user })
    expect(r.code).toBe('unknown_field')
    expect(stored()).toBeNull()
  })

  it('a value that is neither text nor a list is a 400 and writes nothing', async () => {
    const res = await handleUpdateTask('t_w', post({ watchers: 7 }), user, env)
    expect(res.status).toBe(400)
    expect(stored()).toBeNull()
  })
})

describe('parseWatchers reads either stored form', () => {
  it.each([
    [null, []],
    ['', []],
    ['a,b', ['a', 'b']],
    [' a , b ,a', ['a', 'b']],
    ['["a","b"]', ['a', 'b']],
    [['a', 'a', ' b '], ['a', 'b']],
    ['[]', []],
  ])('%j', (raw, want) => {
    expect(parseWatchers(raw)).toEqual(want)
  })

  it('serializes to a JSON array, or null when empty', () => {
    expect(serializeWatchers(['a', 'b'])).toBe('["a","b"]')
    expect(serializeWatchers([])).toBeNull()
  })
})

describe("from a watcher's seat: full access, and told when it changes", () => {
  const casey = { ...user, name: 'Casey', slug: 'casey-eddington', email: 'eddin022@umn.edu' } as AuthUser
  const dan = { ...user, name: 'Dan', slug: 'dan-shyu', email: 'shyu@umn.edu' } as AuthUser
  const seat = (u: AuthUser) => ({ DB: viewerDb(d1Adapter(db), personViewer({ slug: u.slug!, email: u.email, pi: false })) }) as unknown as Env
  const notes = (slug: string) => db.prepare('SELECT type, source_type, source_id, title, link, read FROM notifications WHERE recipient_slug = ? ORDER BY created_at, id').all(slug) as Array<Record<string, unknown>>
  const setStored = (v: string | null) => db.prepare("UPDATE tasks SET watchers = ? WHERE id = 't_w'").run(v)
  const edit = (u: AuthUser, body: unknown) => handleUpdateTask('t_w', post(body), u, seat(u))
  const hdrs = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'Content-Type': 'application/json' }

  beforeEach(() => {
    insertRow(db, 'team_members', { id: 'tm-dan', name: 'Dan', slug: 'dan-shyu', email: 'shyu@umn.edu' })
    insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' })
  })

  it('a watcher not on the project can read the task and edit it', async () => {
    expect((await handleGetTask('t_w', seat(casey))).status).toBe(404)
    expect((await edit(casey, { priority: 'high' })).status).toBe(404)
    await handleUpdateTask('t_w', post({ watchers: ['casey-eddington'] }), user, env)
    expect((await handleGetTask('t_w', seat(casey))).status).toBe(200)
    expect((await edit(casey, { priority: 'high' })).status).toBe(200)
    expect((db.prepare("SELECT priority FROM tasks WHERE id = 't_w'").get() as { priority: string }).priority).toBe('high')
  })

  it('removed, the watcher loses the read and the edit, and hears nothing more', async () => {
    await handleUpdateTask('t_w', post({ watchers: ['casey-eddington'] }), user, env)
    db.prepare('UPDATE notifications SET read = 1').run()
    await handleUpdateTask('t_w', post({ watchers: null }), user, env)
    expect((await handleGetTask('t_w', seat(casey))).status).toBe(404)
    expect((await edit(casey, { priority: 'low' })).status).toBe(404)
    await handleUpdateTask('t_w', post({ priority: 'urgent' }), user, env)
    expect(notes('casey-eddington').filter((n) => !n.read)).toEqual([])
  })

  it.each([['a bare slug', 'casey-eddington'], ['a comma list', 'dan-shyu, casey-eddington']])(
    'a stored comma value still grants the read and the edit: %s', async (_label, value) => {
      setStored(value)
      expect(await caseySeesIt()).toBe(true)
      expect((await handleGetTask('t_w', seat(casey))).status).toBe(200)
      expect((await edit(casey, { priority: 'high' })).status).toBe(200)
    },
  )

  it('a stored comma value does not match on part of a name', async () => {
    setStored('casey-eddington-2, xcasey-eddington')
    expect(await caseySeesIt()).toBe(false)
  })

  it('a stored comma value is notified of a change', async () => {
    setStored('casey-eddington')
    await handleUpdateTask('t_w', post({ priority: 'high' }), user, env)
    expect(notes('casey-eddington')).toHaveLength(1)
  })

  it('being added notifies you once, with the task link', async () => {
    await handleUpdateTask('t_w', post({ watchers: ['casey-eddington'], priority: 'high' }), user, env)
    const got = notes('casey-eddington')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ type: 'update', source_type: 'task', source_id: 't_w', link: taskLinkFor('t_w') })
    expect(String(got[0].title)).toMatch(/added you/i)
  })

  it('only the person just added hears it: the one already watching does not', async () => {
    await handleUpdateTask('t_w', post({ watchers: ['casey-eddington'] }), user, env)
    db.prepare('UPDATE notifications SET read = 1').run()
    await handleUpdateTask('t_w', post({ watchers: ['casey-eddington', 'dan-shyu'] }), user, env)
    expect(notes('dan-shyu')).toHaveLength(1)
    expect(notes('casey-eddington').filter((n) => !n.read)).toEqual([])
  })

  it('adding yourself notifies no one', async () => {
    insertRow(db, 'project_members', { project_id: 'proj_other', member_slug: 'casey-eddington', added_by: 'test' })
    await edit(casey, { watchers: ['casey-eddington'] })
    expect(notes('casey-eddington')).toEqual([])
  })

  it('a change notifies the other watchers with the task link, and not the person who made it', async () => {
    setStored('["casey-eddington","dan-shyu"]')
    await edit(casey, { priority: 'high' })
    expect(notes('casey-eddington')).toEqual([])
    const got = notes('dan-shyu')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ type: 'update', source_type: 'task', source_id: 't_w', link: taskLinkFor('t_w') })
  })

  it('a save that changes nothing, or only a planning field, is silent', async () => {
    setStored('["casey-eddington"]')
    await handleUpdateTask('t_w', post({ priority: 'medium' }), user, env)
    await handleUpdateTask('t_w', post({ planned_for: '2026-11-05' }), user, env)
    expect(notes('casey-eddington')).toEqual([])
  })

  it('does not flood: one unread note per task, however many edits; reading it opens the next', async () => {
    setStored('["casey-eddington"]')
    await handleUpdateTask('t_w', post({ priority: 'high' }), user, env)
    await handleUpdateTask('t_w', post({ priority: 'low' }), user, env)
    await handleUpdateTask('t_w', post({ due_date: '2026-12-01' }), user, env)
    expect(notes('casey-eddington')).toHaveLength(1)
    db.prepare('UPDATE notifications SET read = 1').run()
    await handleUpdateTask('t_w', post({ priority: 'urgent' }), user, env)
    expect(notes('casey-eddington')).toHaveLength(2)
  })

  it('the status route and the bulk route notify too', async () => {
    setStored('["casey-eddington"]')
    const statusReq = new Request('https://x/api/tasks/t_w/status', { method: 'POST', headers: hdrs, body: JSON.stringify({ status: 'in_progress' }) })
    expect((await handleUpdateTaskStatus('t_w', statusReq, user, env)).status).toBe(200)
    expect(notes('casey-eddington')).toHaveLength(1)
    db.prepare('UPDATE notifications SET read = 1').run()
    const bulk = new Request('https://x/api/tasks/batch', { method: 'POST', headers: hdrs, body: JSON.stringify({ ids: ['t_w'], action: 'priority', value: 'high' }) })
    expect((await handleBatchUpdateTasks(bulk, user, env)).status).toBe(200)
    expect(notes('casey-eddington').filter((n) => !n.read)).toHaveLength(1)
  })

  it('a comment notifies a watcher as it does the assignee: every comment, never the author, never an @me', async () => {
    setStored('["casey-eddington","dan-shyu"]')
    const first = await postActivityEntry({ env: seat(dan), user: dan, entityType: 'task', entityId: 't_w', kind: 'comment', body: 'first', actorSlug: 'dan-shyu' })
    expect(first.ok).toBe(true)
    await postActivityEntry({ env: seat(dan), user: dan, entityType: 'task', entityId: 't_w', kind: 'comment', body: 'second', actorSlug: 'dan-shyu' })
    await postActivityEntry({ env: seat(dan), user: dan, entityType: 'task', entityId: 't_w', kind: 'comment', body: '@me a note to self', actorSlug: 'dan-shyu' })
    const got = notes('casey-eddington')
    expect(got).toHaveLength(2)
    expect(got[0]).toMatchObject({ type: 'update', source_type: 'task_comment', source_id: 't_w', link: taskLinkFor('t_w') })
    expect(notes('dan-shyu')).toEqual([])
  })

  it('a watcher who is also the assignee gets one note for a comment', async () => {
    setStored('["nick-ingraham","dan-shyu"]')
    await postActivityEntry({ env: seat(dan), user: dan, entityType: 'task', entityId: 't_w', kind: 'comment', body: 'hello', actorSlug: 'dan-shyu' })
    expect(notes('nick-ingraham')).toHaveLength(1)
  })
})
