// POST /api/tasks with `talk` (2026-10-19): a talk invitation is its own
// product. Nick, 2026-10-19: "the EBP talk at University of Chicago Feb 2026
// needs to be separate from another EBP talk that I might do". Before this,
// the gmail lane sent only a project, and the v125 home rule put the task on
// "Invited talks"' untitled home: the Hub showed "Invited talks ~ talk".
//
// Runs on the migration-chain database with the REAL applyMutation, so the
// v124 task/product trigger, the v125 home rule and the v141 kind are the ones
// D1 runs.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { AuthUser, Env } from '../helpers'
import { handleCreateTask, parseEventSpec } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const HOME = 'prd_01KXH4E23G0DTFGFBYS2C8RGTH'

let db: InstanceType<typeof Database>
let env: Env
const row = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined
const all = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]

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
  return { status: res.status, body: await res.json() as { data?: { id: string }; error?: string } }
}

describe('a talk on a task create mints its own product', () => {
  it('the task sits on a new titled talk product, never the home', async () => {
    const r = await create({
      description: 'Prepare AID-H Workshop talk',
      talk: { title: 'AID-H Workshop: digital health and real world data', venue: 'UMN AID-H Workshop', event_date: '2026-12-07' },
    })
    expect(r.status).toBe(201)
    const t = row('SELECT project_id, product_id FROM tasks WHERE id = ?', r.body.data!.id)!
    expect(t.project_id).toBe(PROJECT)
    expect(t.product_id).not.toBe(HOME)
    expect(row('SELECT kind, stage, title, venue, event_date, nick_event_role, is_home FROM products WHERE id = ?', t.product_id))
      .toEqual({ kind: 'talk', stage: 'invited', title: 'AID-H Workshop: digital health and real world data',
        venue: 'UMN AID-H Workshop', event_date: '2026-12-07', nick_event_role: 'presenter', is_home: 0 })
  })

  it('the same title at another venue and date is a second product, not a merge', async () => {
    const a = await create({ description: 'Prep EBP talk (Chicago)', talk: { title: 'EBP in a landscape of uncertainty', venue: 'UofC', event_date: '2026-02-11' } })
    const b = await create({ description: 'Prep EBP talk (DOM)', talk: { title: 'EBP in a landscape of uncertainty', venue: 'UMN DOM', event_date: '2026-04-06' } })
    const pa = row('SELECT product_id FROM tasks WHERE id = ?', a.body.data!.id)!.product_id
    const pb = row('SELECT product_id FROM tasks WHERE id = ?', b.body.data!.id)!.product_id
    expect(pa).not.toBe(pb)
    expect(all("SELECT id FROM products WHERE title = 'EBP in a landscape of uncertainty' AND deleted_at IS NULL")).toHaveLength(2)
  })

  it('a moderated session mints the v141 kind with the moderator role', async () => {
    const r = await create({ description: 'Moderate ATS session', talk: { kind: 'session_moderator', title: 'Surviving and Thriving in the ICU', event_date: '2027-05' } })
    const p = row('SELECT p.kind, p.stage, p.nick_event_role FROM tasks t JOIN products p ON p.id = t.product_id WHERE t.id = ?', r.body.data!.id)
    expect(p).toEqual({ kind: 'session_moderator', stage: 'invited', nick_event_role: 'moderator' })
  })

  it('a refused spec writes nothing: no product, no task', async () => {
    const before = all('SELECT id FROM products').length
    for (const talk of [{}, { title: '  ' }, { title: 'x', event_date: '2026-13' }, { title: 'x', kind: 'abstract' }, 'x']) {
      const r = await create({ description: `bad ${JSON.stringify(talk)}`, talk })
      expect(r.status).toBe(400)
    }
    expect(all('SELECT id FROM products')).toHaveLength(before)
    expect(all("SELECT id FROM tasks WHERE title LIKE 'bad %'")).toHaveLength(0)
  })

  it('a talk needs a project, and cannot ride with product_id', async () => {
    expect((await create({ description: 'no project', project_id: undefined, talk: { title: 'x' } })).status).toBe(400)
    expect((await create({ description: 'both', product_id: HOME, talk: { title: 'x' } })).status).toBe(400)
  })

  it('a title dedup that adopts an existing task leaves no orphan product behind', async () => {
    const first = await create({ description: 'Prepare grand rounds', talk: { title: 'Grand rounds A' } })
    const again = await create({ description: 'Prepare grand rounds', talk: { title: 'Grand rounds B' } })
    expect(again.body.data!.id).toBe(first.body.data!.id)
    expect(row("SELECT deleted_at FROM products WHERE title = 'Grand rounds B'")!.deleted_at).not.toBeNull()
    expect(row("SELECT deleted_at FROM products WHERE title = 'Grand rounds A'")!.deleted_at).toBeNull()
  })

  it('without talk, nothing changes: the v125 home rule still places the task', async () => {
    const r = await create({ description: 'Plain task' })
    expect(row('SELECT product_id FROM tasks WHERE id = ?', r.body.data!.id)!.product_id).toBe(HOME)
  })
})

describe('parseEventSpec', () => {
  it('defaults the kind and the role, and trims', () => {
    expect(parseEventSpec({ title: '  Grand   rounds ' })).toEqual({ kind: 'talk', title: 'Grand rounds', venue: null, event_date: null, nick_event_role: 'presenter' })
  })
  it('refuses a role outside the vocabulary', () => {
    expect(typeof parseEventSpec({ title: 'x', nick_event_role: 'first' })).toBe('string')
  })
})
