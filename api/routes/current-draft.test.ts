/**
 * api/routes/current-draft.test.ts -- schema-v150: a product's current draft.
 *
 * Nick, 2026-10-26: "...you will have filed them away so that when I do go to
 * work on that project I know that I'm working with the most recent version".
 * Rulings: auto-file a newer version as current, one-tick undo, the old pointer
 * archived and never removed. Every case runs the real worker against the
 * migration-chain database (prodSchemaDb), so the v150 index, CHECK, trigger
 * and receipt table are the ones prod gets.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { currentDraftGuard } from '../lib/current-draft'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PI_EMAIL = 'ingra107@umn.edu'
const OUTSIDER_EMAIL = 'eddin022@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const OTHER_PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ'
const MS_A = 'prd_01KXH4E23G0DTFGFBYS2C8RGA1'
const MS_B = 'prd_01KXH4E23G0DTFGFBYS2C8RGB1'
const OTHER_PRODUCT = 'prd_01KXH4E23G0DTFGFBYS2C8RGO1'

let db: InstanceType<typeof Database>
let env: Env
let as = PI_EMAIL
const realFetch = global.fetch
const rows = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]
const one = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined

function url(n: string) {
  return `~/Box/Research/R03/Manuscript/${n}`
}

type ChangeBody = {
  change: { id: string; before_link_id: string | null; after_link_id: string | null; created_link: boolean; replayed: boolean }
  rows: Record<string, unknown>[]
  code?: string
  current_link_id?: string | null
}

async function promote(product: string, file: string, expected: string | null, key = `k-${product}-${file}-${expected}`, extra: Record<string, unknown> = {}) {
  const res = await fetch(`/api/products/${product}/current-draft`, {
    method: 'POST',
    body: JSON.stringify({
      candidate: { canonical_url: url(file), type: 'local_file', short_title: file, ...extra },
      expected_current_link_id: expected,
      idempotency_key: key,
    }),
  })
  return { status: res.status, body: await res.json() as ChangeBody }
}

async function undo(product: string, changeId: string, key = `u-${changeId}`) {
  const res = await fetch(`/api/products/${product}/current-draft/undo`, {
    method: 'POST',
    body: JSON.stringify({ change_id: changeId, idempotency_key: key }),
  })
  return { status: res.status, body: await res.json() as ChangeBody }
}

const current = (product: string) =>
  rows("SELECT id, canonical_url FROM links WHERE product_id = ? AND role = 'current_draft' AND deleted_at IS NULL", product)

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: OUTSIDER_EMAIL })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  as = PI_EMAIL
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'projects', { id: OTHER_PROJECT, slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  insertRow(db, 'project_members', { project_id: OTHER_PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'products', { id: MS_A, project_id: PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0, title: 'Main paper' })
  insertRow(db, 'products', { id: MS_B, project_id: PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0, title: 'Protocol paper' })
  insertRow(db, 'products', { id: OTHER_PRODUCT, project_id: OTHER_PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    worker.fetch(new Request(`https://hub.test${String(input)}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': as },
    }), env, CTX)) as unknown as typeof fetch
})

afterEach(() => { global.fetch = realFetch })

describe('replace: archive the old draft, promote the new one, one batch', () => {
  it('two manuscripts in one project keep separate current drafts and histories', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const b1 = await promote(MS_B, 'protocol_v1.docx', null)
    expect(a1.status).toBe(200)
    expect(b1.status).toBe(200)
    const a2 = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id)
    expect(a2.status).toBe(200)
    expect(current(MS_A)).toEqual([{ id: a2.body.change.after_link_id, canonical_url: url('main_v2.docx') }])
    expect(current(MS_B)).toEqual([{ id: b1.body.change.after_link_id, canonical_url: url('protocol_v1.docx') }])
    // The replaced draft is archived, never removed, and keeps its product.
    const old = one('SELECT role, product_id, owner_table, owner_id, deleted_at FROM links WHERE id = ?', a1.body.change.after_link_id)
    expect(old).toEqual({ role: 'archive', product_id: MS_A, owner_table: 'projects', owner_id: PROJECT, deleted_at: null })
    const hist = await (await fetch(`/api/products/${MS_A}/current-draft`)).json() as { current: { id: string }; history: unknown[]; changes: unknown[] }
    expect(hist.current.id).toBe(a2.body.change.after_link_id)
    expect(hist.history).toHaveLength(2)
    expect(hist.changes).toHaveLength(2)
  })

  it('the archive carries a lower seq than the promotion, and the response rows come in seq order', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const a2 = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id)
    const [first, second] = a2.body.rows
    expect(first.id).toBe(a1.body.change.after_link_id)
    expect(first.role).toBe('archive')
    expect(second.role).toBe('current_draft')
    expect(Number(first.seq)).toBeLessThan(Number(second.seq))
    expect(second.product_id).toBe(MS_A)
    expect(a2.body.change.before_link_id).toBe(a1.body.change.after_link_id)
  })

  it('a stale expected-current is refused and nothing changes', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const stale = await promote(MS_A, 'main_v2.docx', null)
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('current_draft_stale')
    expect(stale.body.current_link_id).toBe(a1.body.change.after_link_id)
    expect(current(MS_A)).toHaveLength(1)
    expect(rows('SELECT id FROM links WHERE canonical_url = ?', url('main_v2.docx'))).toHaveLength(0)
  })

  it('two concurrent promotions from the same view: one lands, one is refused, one current draft', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const prev = a1.body.change.after_link_id
    const [x, y] = await Promise.all([
      promote(MS_A, 'main_v2.docx', prev),
      promote(MS_A, 'main_v3.docx', prev),
    ])
    expect([x.status, y.status].sort()).toEqual([200, 409])
    expect(current(MS_A)).toHaveLength(1)
    expect(rows("SELECT id FROM current_draft_changes WHERE product_id = ? AND op = 'promote'", MS_A)).toHaveLength(2)
  })

  it('a failed batch rolls back every statement: the old draft stays current, no receipt', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const bad = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id, 'k-bad', { kind: 'not_a_kind' })
    expect(bad.status).toBe(400)
    expect(current(MS_A)).toEqual([{ id: a1.body.change.after_link_id, canonical_url: url('main_v1.docx') }])
    expect(rows("SELECT id FROM current_draft_changes WHERE idempotency_key = 'k-bad'")).toHaveLength(0)
  })

  it('re-promoting an archived URL re-uses its history row (no second row)', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const a2 = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id)
    const back = await promote(MS_A, 'main_v1.docx', a2.body.change.after_link_id)
    expect(back.status).toBe(200)
    expect(back.body.change.created_link).toBe(false)
    expect(back.body.change.after_link_id).toBe(a1.body.change.after_link_id)
    expect(rows('SELECT id FROM links WHERE canonical_url = ?', url('main_v1.docx'))).toHaveLength(1)
  })

  it('the same URL can be the draft of two products of one project', async () => {
    const a = await promote(MS_A, 'shared_v1.docx', null)
    const b = await promote(MS_B, 'shared_v1.docx', null)
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.body.change.after_link_id).not.toBe(b.body.change.after_link_id)
    expect(rows('SELECT product_id FROM links WHERE canonical_url = ? ORDER BY product_id', url('shared_v1.docx')))
      .toEqual([{ product_id: MS_A }, { product_id: MS_B }])
  })

  it('the same idempotency key replays the receipt; a different ask under it is refused', async () => {
    const first = await promote(MS_A, 'main_v1.docx', null, 'k-same')
    const again = await promote(MS_A, 'main_v1.docx', null, 'k-same')
    expect(again.status).toBe(200)
    expect(again.body.change.replayed).toBe(true)
    expect(again.body.change.id).toBe(first.body.change.id)
    const other = await promote(MS_A, 'main_v9.docx', first.body.change.after_link_id, 'k-same')
    expect(other.status).toBe(409)
    expect(other.body.code).toBe('idempotency_mismatch')
  })

  it('refuses a product the caller cannot see', async () => {
    as = OUTSIDER_EMAIL
    const res = await promote(MS_A, 'main_v1.docx', null)
    expect(res.status).toBe(404)
    expect(rows('SELECT id FROM links WHERE product_id IS NOT NULL')).toHaveLength(0)
  })
})

describe('undo: the inverse batch, compared against the promotion', () => {
  it('restores the replaced draft and archives the rejected one; both rows stay', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const a2 = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id)
    const u = await undo(MS_A, a2.body.change.id)
    expect(u.status).toBe(200)
    expect(current(MS_A)).toEqual([{ id: a1.body.change.after_link_id, canonical_url: url('main_v1.docx') }])
    expect(one('SELECT role, deleted_at FROM links WHERE id = ?', a2.body.change.after_link_id)).toEqual({ role: 'archive', deleted_at: null })
    expect(one('SELECT undone_by FROM current_draft_changes WHERE id = ?', a2.body.change.id)!.undone_by).toBe(u.body.change.id)
    const twice = await undo(MS_A, a2.body.change.id, 'u-again')
    expect(twice.status).toBe(409)
    expect(twice.body.code).toBe('already_undone')
  })

  it('an old undo cannot overwrite a later change', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const a2 = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id)
    const a3 = await promote(MS_A, 'main_v3.docx', a2.body.change.after_link_id)
    const late = await undo(MS_A, a2.body.change.id)
    expect(late.status).toBe(409)
    expect(late.body.code).toBe('current_draft_moved')
    expect(current(MS_A)[0].id).toBe(a3.body.change.after_link_id)
  })

  it('undoing the first filing leaves the product with no current draft and keeps the row', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const u = await undo(MS_A, a1.body.change.id)
    expect(u.status).toBe(200)
    expect(current(MS_A)).toHaveLength(0)
    expect(one('SELECT role FROM links WHERE id = ?', a1.body.change.after_link_id)!.role).toBe('archive')
  })
})

describe('the arbiter refuses the wrong state on every path', () => {
  it('two live current drafts for one product cannot be stored (raw SQL)', async () => {
    await promote(MS_A, 'main_v1.docx', null)
    expect(() => insertRow(db, 'links', {
      id: 'link_RAW0000000000000000000001', owner_table: 'projects', owner_id: PROJECT, product_id: MS_A,
      role: 'current_draft', type: 'local_file', canonical_url: url('raw.docx'), short_title: 'raw',
    })).toThrow(/UNIQUE constraint failed/)
  })

  it('a product of another project, a current draft with no product, a task-owned scoped link: all refused', () => {
    const base = { owner_table: 'projects', owner_id: PROJECT, type: 'local_file', short_title: 'x' }
    expect(() => insertRow(db, 'links', { ...base, id: 'link_RAW0000000000000000000002', product_id: OTHER_PRODUCT, role: 'archive', canonical_url: url('a') }))
      .toThrow(/link_product_project_mismatch/)
    expect(() => insertRow(db, 'links', { ...base, id: 'link_RAW0000000000000000000003', role: 'current_draft', canonical_url: url('b') }))
      .toThrow(/CHECK constraint failed/)
    // A task-owned scoped row: the trigger (owner is not the product's project)
    // or the CHECK (scoped rows are project-owned) refuses it, whichever runs first.
    expect(() => insertRow(db, 'links', { ...base, id: 'link_RAW0000000000000000000004', owner_table: 'tasks', owner_id: 'task_x', product_id: MS_A, role: 'archive', canonical_url: url('c') }))
      .toThrow(/CHECK constraint failed|link_product_project_mismatch/)
  })

  it('the generic doors refuse to re-role, delete or create a current draft', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const id = a1.body.change.after_link_id!
    const send = async (m: Record<string, unknown>) => {
      const res = await fetch('/api/mutations', {
        method: 'POST',
        body: JSON.stringify({ mutations: [{
          mutation_id: `mut_${Math.random().toString(36).slice(2)}`, origin_machine: 'home',
          base_seq: null, base_row_hash: null, client_ts: '2026-10-26T20:00:00Z', issued_at: '2026-10-26T20:00:00Z', ...m,
        }] }),
      })
      return (await res.json() as { results: { status: string; code?: string; reason?: string }[] }).results[0]
    }
    const reRole = await send({ table: 'links', op: 'update', record_id: id, patch: { role: 'archive' } })
    expect(reRole.status).toBe('error')
    const del = await send({ table: 'links', op: 'delete', record_id: id })
    expect(del.status).toBe('error')
    expect(del.code).toBe('value_invalid')
    const ins = await send({ table: 'links', op: 'insert', record_id: 'link_RAW0000000000000000000005', payload: {
      owner_table: 'projects', owner_id: PROJECT, role: 'current_draft', type: 'local_file', canonical_url: url('z'), short_title: 'z' } })
    expect(ins.status).toBe('error')
    expect(current(MS_A)).toEqual([{ id, canonical_url: url('main_v1.docx') }])
    // Retitling / re-kinding the current draft is still an ordinary edit.
    const kind = await send({ table: 'links', op: 'update', record_id: id, patch: { kind: 'manuscript_draft' } })
    expect(kind.status).toBe('accepted')
    // The project page's role button refuses it too.
    const ui = await fetch(`/api/links/${id}`, { method: 'POST', body: JSON.stringify({ role: 'archive' }) })
    expect(ui.status).toBeGreaterThanOrEqual(400)
    expect(current(MS_A)).toHaveLength(1)
  })

  it('currentDraftGuard: a non-draft row and a draft row\'s other fields pass', () => {
    expect(currentDraftGuard('update', { id: 'l', role: 'key' }, { role: 'archive' })).toBeNull()
    expect(currentDraftGuard('update', { id: 'l', role: 'current_draft' }, { short_title: 'x' })).toBeNull()
    expect(currentDraftGuard('update', { id: 'l', role: 'current_draft' }, { role: 'key' })).toMatch(/current draft/)
    expect(currentDraftGuard('insert', null, { product_id: 'p' })).toMatch(/product_id/)
    // An archived draft is history: re-promote it through the route, delete it if you mean to.
    expect(currentDraftGuard('update', { id: 'l', role: 'archive', product_id: 'p' }, { role: 'key' })).toMatch(/draft history/)
    expect(currentDraftGuard('delete', { id: 'l', role: 'archive', product_id: 'p' }, null)).toBeNull()
  })
})

// Cold review of 8c6b3f9b (codex, 2026-10-26): six defects, each reproduced here first.
describe('cold review fixes', () => {
  async function mutate(m: Record<string, unknown>) {
    const res = await fetch('/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [{
        mutation_id: `mut_${Math.random().toString(36).slice(2)}`, origin_machine: 'home',
        base_seq: null, base_row_hash: null, client_ts: '2026-10-26T20:00:00Z', issued_at: '2026-10-26T20:00:00Z', ...m,
      }] }),
    })
    return (await res.json() as { results: { status: string; code?: string; reason?: string }[] }).results[0]
  }

  it('1: a non-PI member never receives a local draft path, in rows or receipts', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id)
    insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'casey-eddington', added_by: 'nick-ingraham' })
    as = OUTSIDER_EMAIL
    const text = await (await fetch(`/api/products/${MS_A}/current-draft`)).text()
    expect(text).not.toContain('~/Box')
    const body = JSON.parse(text) as { current: unknown; history: unknown[]; changes: { candidate_url: unknown }[] }
    expect(body.current).toBeNull()
    expect(body.history).toEqual([])
    expect(body.changes.length).toBe(2)
    expect(body.changes.every((c) => c.candidate_url === null)).toBe(true)
    // A POST answer is filtered the same way.
    const cur = current(MS_A)[0].id as string
    const res = await promote(MS_A, 'main_v3.docx', cur)
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain('~/Box')
  })

  it('2: a generic edit cannot rewrite a draft row\'s URL (current or archived); title stays editable', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null)
    const a2 = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id)
    for (const id of [a2.body.change.after_link_id, a1.body.change.after_link_id]) {
      const r = await mutate({ table: 'links', op: 'update', record_id: id, patch: { canonical_url: url('evil.docx') } })
      expect(r.status).toBe('error')
    }
    expect(rows('SELECT id FROM links WHERE canonical_url = ?', url('evil.docx'))).toHaveLength(0)
    const t = await mutate({ table: 'links', op: 'update', record_id: a2.body.change.after_link_id, patch: { short_title: 'Main v2' } })
    expect(t.status).toBe('accepted')
  })

  it('3: undoing an old promotion is refused when a later one re-promoted the same row', async () => {
    const a = await promote(MS_A, 'a.docx', null)
    const b = await promote(MS_A, 'b.docx', a.body.change.after_link_id)
    const c = await promote(MS_A, 'c.docx', b.body.change.after_link_id)
    const b2 = await promote(MS_A, 'b.docx', c.body.change.after_link_id)
    expect(b2.body.change.after_link_id).toBe(b.body.change.after_link_id)
    const old = await undo(MS_A, b.body.change.id)
    expect(old.status).toBe(409)
    expect(old.body.code).toBe('current_draft_moved')
    expect(current(MS_A)[0].canonical_url).toBe(url('b.docx'))
    // The latest promotion undoes normally, back to c.
    const latest = await undo(MS_A, b2.body.change.id)
    expect(latest.status).toBe(200)
    expect(current(MS_A)[0].canonical_url).toBe(url('c.docx'))
  })

  it('4: one key raced across two products never answers with the other product\'s receipt', async () => {
    const [x, y] = await Promise.all([
      promote(MS_A, 'a.docx', null, 'k-shared'),
      promote(MS_B, 'b.docx', null, 'k-shared'),
    ])
    for (const [res, product] of [[x, MS_A], [y, MS_B]] as const) {
      if (res.status === 200) {
        const row = one('SELECT product_id FROM current_draft_changes WHERE id = ?', res.body.change.id)
        expect(row!.product_id).toBe(product)
      } else {
        expect(res.status).toBe(409)
        expect(res.body.code).toBe('idempotency_mismatch')
      }
    }
    expect([x.status, y.status].sort()).toEqual([200, 409])
  })

  it('5: the same request twice at once is one promotion and two 200s (the second a replay)', async () => {
    const [x, y] = await Promise.all([
      promote(MS_A, 'a.docx', null, 'k-twice'),
      promote(MS_A, 'a.docx', null, 'k-twice'),
    ])
    expect([x.status, y.status]).toEqual([200, 200])
    expect(x.body.change.id).toBe(y.body.change.id)
    const a = x.body.change
    const [u1, u2] = await Promise.all([undo(MS_A, a.id, 'u-twice'), undo(MS_A, a.id, 'u-twice')])
    expect([u1.status, u2.status]).toEqual([200, 200])
    expect(u1.body.change.id).toBe(u2.body.change.id)
  })

  it('6: pinning a product draft\'s URL into a project slot files a project-wide row', async () => {
    const DOC = 'https://docs.google.com/document/d/1DRAFTDOC/edit'
    const res = await fetch(`/api/products/${MS_A}/current-draft`, {
      method: 'POST',
      body: JSON.stringify({ candidate: { canonical_url: DOC, type: 'google_doc', short_title: 'Draft' },
        expected_current_link_id: null, idempotency_key: 'k-doc' }),
    })
    expect(res.status).toBe(200)
    const r = await mutate({ table: 'projects', op: 'update', record_id: PROJECT, patch: { key_link_1: DOC } })
    expect(r.status).toBe('accepted')
    expect(rows("SELECT role, product_id FROM links WHERE canonical_url = ? AND deleted_at IS NULL ORDER BY product_id", DOC))
      .toEqual([{ role: 'key', product_id: null }, { role: 'current_draft', product_id: MS_A }])
  })
})

// Second cold review (codex, 2026-10-26): knowing a private draft's id must
// never reveal its URL, on ANY route that serializes a links row.
describe('a member who holds a private draft id learns nothing', () => {
  it('walks every links-returning route as a non-PI member', async () => {
    const a1 = await promote(MS_A, 'main_v1.docx', null, 'k-p1', {})
    const a2 = await promote(MS_A, 'main_v2.docx', a1.body.change.after_link_id, 'k-p2')
    const privateIds = [a1.body.change.after_link_id!, a2.body.change.after_link_id!]
    db.prepare("UPDATE current_draft_changes SET note = 'process catch-up: ~/Box/Research/R03/Manuscript/main_v2.docx'").run()
    insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'casey-eddington', added_by: 'nick-ingraham' })
    insertRow(db, 'tasks', { id: 'task_01KXH4E23G0DTFGFBYS2C8RTA9', title: 'Revise', project_id: PROJECT, product_id: MS_A, status: 'todo', assignee: 'casey-eddington' })
    as = OUTSIDER_EMAIL
    const calls: [string, RequestInit?][] = [
      [`/api/products/${MS_A}/current-draft`],
      ['/api/projects/r03/links'],
      ['/api/projects/links'],
      ['/api/tasks/task_01KXH4E23G0DTFGFBYS2C8RTA9/links'],
      ['/api/links?include_deleted=1'],
      ['/api/projects/r03/products'],
      [`/api/projects/r03/links`, { method: 'POST', body: JSON.stringify({ url: url('main_v2.docx') }) }],
      [`/api/products/${MS_A}/current-draft`, { method: 'POST', body: JSON.stringify({
        candidate: { canonical_url: 'https://docs.google.com/document/d/1MEMBERDOC/edit', type: 'google_doc', short_title: 'm' },
        expected_current_link_id: null, idempotency_key: 'k-member' }) }],
      [`/api/products/${MS_A}/current-draft/undo`, { method: 'POST', body: JSON.stringify({ change_id: a2.body.change.id, idempotency_key: 'u-member' }) }],
    ]
    for (const id of privateIds) {
      calls.push([`/api/links/${id}`, { method: 'POST', body: JSON.stringify({ kind: null }) }])
      calls.push([`/api/links/${id}/role`, { method: 'POST', body: JSON.stringify({ role: 'archive' }) }])
      calls.push([`/api/links/${id}`, { method: 'POST', body: JSON.stringify({ kind: 'manuscript_draft' }) }])
      calls.push([`/api/links/${id}/promote`, { method: 'POST' }])
    }
    for (const [path, init] of calls) {
      const text = await (await fetch(path, init)).text()
      expect(text, path).not.toContain('~/Box')
      for (const id of privateIds) expect(text, `${path} leaks ${id}`).not.toContain(id)
    }
    // The member's writes changed nothing on the private rows.
    expect(rows("SELECT kind FROM links WHERE id IN (?, ?)", ...privateIds)).toEqual([{ kind: null }, { kind: null }])
  })
})

// Third cold review: D1 refuses a statement with more than 100 bound
// parameters, and the member's receipt view must stay under it however long
// the product's history is.
describe('a long draft history stays inside D1 limits', () => {
  it('a member reads 120 receipts with no statement binding more than 100 values', async () => {
    let maxBound = 0
    env = { DB: d1Adapter(db, { onExec: (_sql, vals) => { maxBound = Math.max(maxBound, vals.length) } }),
            TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
    for (let i = 0; i < 120; i++) {
      const id = `link_HIST${String(i).padStart(22, '0')}`
      insertRow(db, 'links', { id, owner_table: 'projects', owner_id: PROJECT, product_id: MS_A, role: 'archive',
        type: i % 2 ? 'google_doc' : 'local_file', canonical_url: `https://docs.google.com/document/d/H${i}/edit`, short_title: `h${i}` })
      insertRow(db, 'current_draft_changes', { id: `cdc_H${i}`, product_id: MS_A, seq: i + 1, op: 'promote',
        idempotency_key: `k-h${i}`, candidate_url: `https://docs.google.com/document/d/H${i}/edit`,
        before_link_id: i ? `link_HIST${String(i - 1).padStart(22, '0')}` : null, after_link_id: id })
    }
    insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'casey-eddington', added_by: 'nick-ingraham' })
    as = OUTSIDER_EMAIL
    const res = await fetch(`/api/products/${MS_A}/current-draft`)
    expect(res.status).toBe(200)
    const body = await res.json() as { changes: { after_link_id: string | null }[] }
    expect(body.changes).toHaveLength(120)
    // shared (google_doc) drafts keep their id; local ones are withheld
    expect(body.changes.filter((c) => c.after_link_id !== null)).toHaveLength(60)
    expect(maxBound).toBeLessThanOrEqual(100)
  })
})

describe('readers', () => {
  it("a task inherits its own product's current draft, never another product's", async () => {
    await promote(MS_A, 'main_v1.docx', null)
    await promote(MS_B, 'protocol_v1.docx', null)
    insertRow(db, 'tasks', { id: 'task_01KXH4E23G0DTFGFBYS2C8RTA1', title: 'Revise main paper', project_id: PROJECT, product_id: MS_A, status: 'todo', assignee: 'nick-ingraham' })
    const res = await (await fetch('/api/tasks/task_01KXH4E23G0DTFGFBYS2C8RTA1/links')).json() as { projectLinks: { canonical_url: string; role: string }[] }
    const drafts = res.projectLinks.filter((l) => l.role === 'current_draft').map((l) => l.canonical_url)
    expect(drafts).toEqual([url('main_v1.docx')])
  })

  it('the PB pull lane sends product_id', async () => {
    await promote(MS_A, 'main_v1.docx', null)
    const res = await (await fetch('/api/links?include_deleted=1')).json() as { data: { product_id: string | null; role: string }[] }
    expect(res.data.find((r) => r.role === 'current_draft')!.product_id).toBe(MS_A)
  })
})
