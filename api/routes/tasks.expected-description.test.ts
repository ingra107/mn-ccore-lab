// tasks.expected-description.test.ts -- POST /api/tasks/:id `expected_description`
// (2026-11-01, one plain-markdown task body; second cold refuter's server gap).
//
// The task panel sends the description its edit started from. When the stored
// one has moved (a PB write the screen never saw), the route writes nothing
// and answers 409 with the current text, which the panel turns into its
// "This description changed while you were editing." notice. The same read is
// handed to applyMutation as its compare-and-swap (base_seq + base_row_hash),
// so a write landing between the route's read and the commit is refused too.
// A caller that omits the key keeps the old, unguarded write.
//
// Runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// Run: npx vitest run --config vitest.config.api.ts api/routes/tasks.expected-description.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleUpdateTask } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

function post(body: unknown): Request {
  return new Request('https://x/api/tasks/test', {
    method: 'POST',
    headers: { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
const envOf = (hooks: Parameters<typeof d1Adapter>[1] = {}) => ({ DB: d1Adapter(db, hooks) } as unknown as import('../helpers').Env)
beforeEach(() => { db = prodSchemaDb() })

const ID = 'task_01hwtest_expdesc_00001'
const seed = (description: string | null) =>
  insertRow(db, 'tasks', { id: ID, title: 'Probe', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', description })
const stored = () => (db.prepare('SELECT description FROM tasks WHERE id = ?').get(ID) as { description: string | null }).description
const receipts = () => (db.prepare('SELECT COUNT(*) AS n FROM processed_mutations').get() as { n: number }).n

describe('handleUpdateTask expected_description', () => {
  it('writes when the stored description is the one the edit started from', async () => {
    seed('From the meeting.')
    const res = await handleUpdateTask(ID, post({ description: 'Mine', expected_description: 'From the meeting.' }), user, envOf())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: { description: string } }).data.description).toBe('Mine')
    expect(stored()).toBe('Mine')
    expect(receipts()).toBe(1)
  })

  it('refuses with 409 and the current text when the stored description moved; nothing is written', async () => {
    seed('PB wrote this after the panel loaded')
    const res = await handleUpdateTask(ID, post({ description: 'Mine', expected_description: 'From the meeting.' }), user, envOf())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'The description changed since this edit started',
      code: 'description_changed',
      description: 'PB wrote this after the panel loaded',
    })
    expect(stored()).toBe('PB wrote this after the panel loaded')
    expect(receipts()).toBe(0)
  })

  it('an empty stored description matches an expected null or empty string', async () => {
    seed(null)
    const res = await handleUpdateTask(ID, post({ description: 'First words', expected_description: '' }), user, envOf())
    expect(res.status).toBe(200)
    expect(stored()).toBe('First words')
  })

  it('a write landing between the route read and the commit is refused by the compare-and-swap', async () => {
    seed('From the meeting.')
    // The first statement after the route's guard read: another writer lands.
    let armed = false
    let fired = false
    const env = envOf({
      onExec: (sql) => {
        if (armed && !fired) { fired = true; db.prepare('UPDATE tasks SET description = ? WHERE id = ?').run('Racing PB write', ID) }
        if (/^SELECT seq, description\b.* FROM tasks WHERE id = \?$/.test(sql)) armed = true
      },
    })
    const res = await handleUpdateTask(ID, post({ description: 'Mine', expected_description: 'From the meeting.' }), user, env)
    expect(fired).toBe(true)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string; description: string })).toMatchObject({ code: 'description_changed', description: 'Racing PB write' })
    expect(stored()).toBe('Racing PB write')
  })

  it('omitting expected_description keeps the unguarded write', async () => {
    seed('PB wrote this')
    const res = await handleUpdateTask(ID, post({ description: 'Overwrite' }), user, envOf())
    expect(res.status).toBe(200)
    expect(stored()).toBe('Overwrite')
  })

  it('expected_description is a guard, never a column, and must be text or null', async () => {
    seed('x')
    const bad = await handleUpdateTask(ID, post({ description: 'y', expected_description: 3 }), user, envOf())
    expect(bad.status).toBe(400)
    expect(stored()).toBe('x')
    // Alone it writes nothing: there is no field to update.
    const alone = await handleUpdateTask(ID, post({ expected_description: 'x' }), user, envOf())
    expect(alone.status).toBe(400)
    expect(receipts()).toBe(0)
  })
})
