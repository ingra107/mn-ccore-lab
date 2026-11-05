// A watcher can see the task. The read rule (taskRule, api/lib/table-scope.ts)
// reads tasks.watchers with json_each, so the write has to land a JSON array:
// the panel's comma list passed json_valid() for nobody (fable-audit-2 G01).
// The migration-chain database and the viewer-bound handle run the real SQL.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleUpdateTask, handleGetTasks } from './tasks'
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

  it('a comma list is canonicalized, so an old client still grants the read', async () => {
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
