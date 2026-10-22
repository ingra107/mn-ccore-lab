// Three linked behaviors (Nick 2026-10-22, after an invited talk he deleted
// would not go away and could come back):
//   1. POST /api/projects/:slug/products {action:'drop'} soft-deletes a product
//      of any kind, re-homes its live tasks, and says why in words when the
//      schema refuses (home product, a project's last product).
//   2. Deleting the last live task on an event product (a talk or moderated
//      session minted by the talk spec) declines the product in the same batch,
//      by either delete path (op delete, and an update to status='deleted').
//   3. POST /api/tasks answers with the existing row when its related_message_ids
//      already appear on ANY task, deleted included. A reply (a new message id)
//      on the same thread still creates.
//
// Real migration-chain database (triggers and FKs on), real applyMutation.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { AuthUser, Env } from '../helpers'
import { handleCreateTask, handleDeleteTask, messageIdTokens } from './tasks'
import { handleProjectProductWrite } from './products'
import { applyMutation } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const HOME = 'prd_01KXH4E23G0DTFGFBYS2C8RGTH'

let db: InstanceType<typeof Database>
let env: Env
const row = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined
const count = (sql: string, ...v: unknown[]) => (db.prepare(sql).get(...v) as { n: number }).n

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: 'ingra107@umn.edu' })
  insertRow(db, 'projects', { id: PROJECT, slug: 'invited-talks', title: 'Invited talks', category: 'MNCCORE', status: 'active' },
    { kind: 'talk', stage: 'invited' })
})

const create = async (body: Record<string, unknown>) => {
  const res = await handleCreateTask(new Request('https://hub.test/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignee: 'nick-ingraham', source: 'gmail', project_id: 'invited-talks', ...body }),
  }), user, env)
  return { status: res.status, body: await res.json() as { data?: { id: string }; deduped?: string; error?: string } }
}
const productWrite = async (body: Record<string, unknown>) => {
  const res = await handleProjectProductWrite('invited-talks', new Request('https://hub.test/x', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), user, env)
  return { status: res.status, body: await res.json() as { product?: Record<string, unknown>; error?: string } }
}
const deleteTask = (id: string) => handleDeleteTask(id, new Request('https://hub.test/x', { method: 'POST' }), user, env)
const productOf = (taskId: string) => row('SELECT product_id FROM tasks WHERE id = ?', taskId)!.product_id as string
const talkTask = (extra: Record<string, unknown> = {}) =>
  create({ description: 'Consider presenting AI project', talk: { title: 'AI project at Meeting of the Minds' }, ...extra })

describe('drop: a product of any kind, by its own action', () => {
  it('soft-deletes a non-home product and re-homes its live task to the home product', async () => {
    insertRow(db, 'products', { id: 'prd_ms', project_id: PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0, title: 'Paper' })
    insertRow(db, 'tasks', { id: 'task_on_ms', title: 'Write', project_id: PROJECT, product_id: 'prd_ms', assignee: 'nick-ingraham', status: 'todo' })
    const r = await productWrite({ action: 'drop', product_id: 'prd_ms' })
    expect(r.status).toBe(200)
    expect(row('SELECT deleted_at FROM products WHERE id = ?', 'prd_ms')!.deleted_at).toBeTruthy()
    // The live task is not left on the tombstone: v125's repoint sends it home.
    expect(productOf('task_on_ms')).toBe(HOME)
    expect(count("SELECT COUNT(*) n FROM tasks t JOIN products p ON p.id = t.product_id WHERE t.deleted_at IS NULL AND p.deleted_at IS NOT NULL")).toBe(0)
  })

  it('refuses the home product in words and keeps it', async () => {
    insertRow(db, 'products', { id: 'prd_ms', project_id: PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
    const r = await productWrite({ action: 'drop', product_id: HOME })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/home/i)
    expect(row('SELECT deleted_at FROM products WHERE id = ?', HOME)!.deleted_at).toBeNull()
  })

  it("refuses a live project's last product in words", async () => {
    const r = await productWrite({ action: 'drop', product_id: HOME })
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/at least one/i)
    expect(row('SELECT deleted_at FROM products WHERE id = ?', HOME)!.deleted_at).toBeNull()
  })

  it('404s a product that is not in this project', async () => {
    expect((await productWrite({ action: 'drop', product_id: 'prd_nope' })).status).toBe(404)
  })
})

describe('deleting the last task on a talk declines the talk', () => {
  it('op delete (the Hub UI path): the product is declined in the same write', async () => {
    const t = await talkTask()
    expect(t.status).toBe(201)
    const pid = productOf(t.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('invited')
    expect((await deleteTask(t.body.data!.id)).status).toBe(200)
    expect(row('SELECT stage, deleted_at FROM products WHERE id = ?', pid)).toEqual({ stage: 'declined', deleted_at: null })
  })

  it('status=deleted by update (PB outbox path): the same decline', async () => {
    const t = await talkTask()
    const pid = productOf(t.body.data!.id)
    const r = await applyMutation(env, { table: 'tasks', record_id: t.body.data!.id, op: 'update', patch: { status: 'deleted' }, route: 'test', user })
    expect(r.status).toBe('accepted')
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('declined')
  })

  it('another live task on the talk keeps it invited', async () => {
    const t = await talkTask()
    const pid = productOf(t.body.data!.id)
    insertRow(db, 'tasks', { id: 'task_second', title: 'Make slides', project_id: PROJECT, product_id: pid, assignee: 'nick-ingraham', status: 'todo' })
    await deleteTask(t.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('invited')
  })

  it('a delivered talk, and the home product, are left alone', async () => {
    const t = await talkTask()
    const pid = productOf(t.body.data!.id)
    db.prepare("UPDATE products SET stage = 'delivered' WHERE id = ?").run(pid)
    await deleteTask(t.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('delivered')

    insertRow(db, 'tasks', { id: 'task_home', title: 'Umbrella', project_id: PROJECT, product_id: HOME, assignee: 'nick-ingraham', status: 'todo' })
    await deleteTask('task_home')
    expect(row('SELECT stage FROM products WHERE id = ?', HOME)!.stage).toBe('invited')
  })

  it('a task on a manuscript product does not decline or drop it', async () => {
    insertRow(db, 'products', { id: 'prd_ms', project_id: PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
    insertRow(db, 'tasks', { id: 'task_ms', title: 'Write', project_id: PROJECT, product_id: 'prd_ms', assignee: 'nick-ingraham', status: 'todo' })
    await deleteTask('task_ms')
    expect(row('SELECT stage, deleted_at FROM products WHERE id = ?', 'prd_ms')).toEqual({ stage: 'idea', deleted_at: null })
  })
})

describe('restoring the task undoes the decline its delete caused', () => {
  const restore = (id: string) =>
    applyMutation(env, { table: 'tasks', record_id: id, op: 'update', patch: { status: 'todo' }, route: 'test', user })

  it('delete then restore: the talk is Invited again, with an activity line each way', async () => {
    const t = await talkTask()
    const pid = productOf(t.body.data!.id)
    await deleteTask(t.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('declined')
    expect(count("SELECT COUNT(*) n FROM activity_log WHERE related_id = ? AND description LIKE 'Declined talk%'", pid)).toBe(1)

    expect((await restore(t.body.data!.id)).status).toBe('accepted')
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('invited')
    expect(row('SELECT deleted_at FROM tasks WHERE id = ?', t.body.data!.id)!.deleted_at).toBeNull()
    expect(count("SELECT COUNT(*) n FROM activity_log WHERE related_id = ? AND description LIKE 'Restored talk%'", pid)).toBe(1)
  })

  it('H: declined by hand AFTER the delete (another task still live) stays declined on restore', async () => {
    const a = await talkTask()
    const pid = productOf(a.body.data!.id)
    insertRow(db, 'tasks', { id: 'task_b', title: 'Make slides', project_id: PROJECT, product_id: pid, assignee: 'nick-ingraham', status: 'todo' })
    await deleteTask(a.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('invited')
    expect((await productWrite({ action: 'stage', product_id: pid, stage: 'declined' })).status).toBe(200)
    await restore(a.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('declined')
  })

  it('E: re-declined by hand long after the auto-decline stays declined on restore', async () => {
    const a = await talkTask()
    const pid = productOf(a.body.data!.id)
    await deleteTask(a.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('declined')
    // Nick revives it, then declines it again by hand, months on
    expect((await productWrite({ action: 'stage', product_id: pid, stage: 'invited' })).status).toBe(200)
    expect((await productWrite({ action: 'stage', product_id: pid, stage: 'declined' })).status).toBe(200)
    db.prepare("UPDATE products SET stage_entered_at = '2027-03-01 00:00:00' WHERE id = ?").run(pid)
    await restore(a.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('declined')
  })

  it('a talk Nick declined by hand before the delete stays declined on restore', async () => {
    const t = await talkTask()
    const pid = productOf(t.body.data!.id)
    db.prepare("UPDATE products SET stage = 'declined', stage_entered_at = '2020-01-01 00:00:00' WHERE id = ?").run(pid)
    await deleteTask(t.body.data!.id)
    await restore(t.body.data!.id)
    expect(row('SELECT stage FROM products WHERE id = ?', pid)!.stage).toBe('declined')
  })
})

describe('the same email message does not mint twice', () => {
  it('reads newline, comma and padded ids', () => {
    expect(messageIdTokens(' a1 \nb2\r\nc3,d4,, ')).toEqual(['a1', 'b2', 'c3', 'd4'])
    expect(messageIdTokens(null)).toEqual([])
  })

  it('one message can yield two live tasks: both create (the script posts one per action)', async () => {
    const a = await create({ description: 'Reply to Dr. X', related_message_ids: 'msgX' })
    const b = await create({ description: 'Send Dr. X the slides', related_message_ids: 'msgX' })
    expect([a.status, b.status]).toEqual([201, 201])
    expect(a.body.data!.id).not.toBe(b.body.data!.id)
  })

  it('a DELETED task holding the message id answers with its id only, minting no task or product', async () => {
    const first = await talkTask({ related_message_ids: '1a159d5a0e6495f0', source_thread_id: '1a159d5a0e6495f0' })
    await deleteTask(first.body.data!.id)
    const tasks = count('SELECT COUNT(*) n FROM tasks')
    const products = count('SELECT COUNT(*) n FROM products')

    const again = await talkTask({ related_message_ids: '1a159d5a0e6495f0', source_thread_id: '1a159d5a0e6495f0' })
    expect(again.status).toBe(200)
    expect(again.body.deduped).toBe('same_message')
    expect(again.body.data).toEqual({ id: first.body.data!.id })
    expect(count('SELECT COUNT(*) n FROM tasks')).toBe(tasks)
    expect(count('SELECT COUNT(*) n FROM products')).toBe(products)
  })

  it('answers with the oldest deleted match, matches one id inside a merged list, never a substring', async () => {
    const first = await create({ description: 'First', related_message_ids: 'aaa111\nbbb222' })
    const second = await create({ description: 'Second', related_message_ids: 'bbb222' })
    await deleteTask(second.body.data!.id)
    await deleteTask(first.body.data!.id)
    db.prepare("UPDATE tasks SET created_at = '2020-01-01 00:00:00' WHERE id = ?").run(first.body.data!.id)
    expect((await create({ description: 'Again', related_message_ids: 'bbb222' })).body.data).toEqual({ id: first.body.data!.id })
    // 'bbb' is a prefix of a stored id, not the id
    expect((await create({ description: 'Different mail', related_message_ids: 'bbb' })).status).toBe(201)
  })

  it('a reply on the same thread (a new message id) still creates', async () => {
    const first = await talkTask({ related_message_ids: 'msgA', source_thread_id: 'thread1' })
    await deleteTask(first.body.data!.id)
    const reply = await talkTask({ related_message_ids: 'msgB', source_thread_id: 'thread1', description: 'Consider presenting AI project (reply)' })
    expect(reply.status).toBe(201)
    expect(reply.body.data!.id).not.toBe(first.body.data!.id)
  })

  it('a create with no message id is never deduped', async () => {
    const a = await create({ description: 'One' })
    const b = await create({ description: 'Two' })
    expect([a.status, b.status]).toEqual([201, 201])
  })
})
