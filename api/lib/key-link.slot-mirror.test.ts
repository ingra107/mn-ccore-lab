// #8842 R7: a key_link slot write carries its `links` rows in the same D1 batch.
//
// Runs on the migration-chain database (api/test-support/prod-schema-db.ts), so
// the partial UNIQUE on the live natural key, the seq triggers and the batch's
// single transaction are the real ones. Each case reads the STORED rows.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyMutation, applyInsert, applyUpdate } from '../routes/mutations'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'
import { normalizeLink } from '../../shared/pbLinks.generated'

type Env = import('../helpers').Env
type AuthUser = import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: Env
const user = { email: 'test@example.com', slug: 'test' } as AuthUser

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
})

const GMAIL = 'https://mail.google.com/mail/u/1/#inbox/1a0e5f718220a235'
const DOC = 'https://docs.google.com/document/d/1ABCdef/edit?usp=sharing'
const DOC_SAME = 'https://docs.google.com/document/d/1ABCdef/edit#heading=h.x'
const SHEET = 'https://docs.google.com/spreadsheets/d/1SHEET99/edit#gid=0'
const EXTRA = 'https://github.com/clif/mCIDE'

const canon = (raw: string) => normalizeLink(raw)!.canonical_url

function liveLinks(ownerId: string) {
  return db.prepare(
    `SELECT * FROM links WHERE owner_id = ? AND deleted_at IS NULL ORDER BY sort_order, id`,
  ).all(ownerId) as Record<string, unknown>[]
}
function allLinks(ownerId: string) {
  return db.prepare(`SELECT * FROM links WHERE owner_id = ? ORDER BY id`).all(ownerId) as Record<string, unknown>[]
}

function seedTask(id: string, extra: Record<string, unknown> = {}) {
  return insertRow(db, 'tasks', {
    id, title: `task ${id}`, status: 'todo', completed: 0, assignee: 'nick-ingraham', priority: 'medium', ...extra,
  })
}

function pbUpdate(id: string, patch: Record<string, unknown>, mutationId: string) {
  const seq = (db.prepare('SELECT seq FROM tasks WHERE id = ?').get(id) as { seq: number }).seq
  return applyUpdate(env, {
    mutation_id: mutationId, origin_machine: 'work', table: 'tasks', op: 'update',
    record_id: id, base_seq: seq, base_row_hash: null, patch,
    client_ts: '2026-10-05T00:00:00Z', issued_at: '2026-10-05T00:00:00Z',
  }, user)
}

describe('create path (the Gmail Apps Script / handleCreateTask lane)', () => {
  it('a task born with slots gets one live role=key links row per slot, in the same write', async () => {
    const id = 'task_01SLOTMIRROR0000000000001'
    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'insert', route: 'handleCreateTask', user,
      payload: {
        title: 'Reply to the CCRG invite', status: 'todo', assignee: 'nick-ingraham', priority: 'medium',
        completed: 0, source: 'gmail',
        key_link_1: GMAIL, key_link_1_desc: 'Gmail thread',
        key_link_2: DOC, key_link_2_desc: 'Draft',
        key_link_3: null, key_link_3_desc: null,
      },
    })
    expect(r.status).toBe('accepted')
    const rows = liveLinks(id)
    expect(rows.map((l) => l.canonical_url)).toEqual([canon(GMAIL), canon(DOC)])
    expect(rows.map((l) => l.sort_order)).toEqual([0, 1])
    expect(rows.every((l) => l.role === 'key' && l.owner_table === 'tasks')).toBe(true)
    expect(rows.every((l) => l.last_mutation_id === r.mutation_id)).toBe(true)
    expect(rows.every((l) => (l.seq as number) > 0)).toBe(true)
    expect(rows[0].type).toBe(normalizeLink(GMAIL)!.type)
  })

  it('returns the rows it wrote as dependents.links, and keeps them in the replay receipt', async () => {
    const id = 'task_01SLOTMIRROR0000000000002'
    const r = await applyInsert(env, {
      mutation_id: 'mut_slotmirror_create_2', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: id, base_seq: null, base_row_hash: null,
      payload: { title: 'x2', status: 'todo', assignee: 'nick-ingraham', priority: 'medium', completed: 0, key_link_1: SHEET },
      client_ts: '2026-10-05T00:00:00Z', issued_at: '2026-10-05T00:00:00Z',
    }, user)
    expect(r.status).toBe('accepted')
    expect(r.dependents?.links.map((l) => l.canonical_url)).toEqual([canon(SHEET)])
    expect(r.dependents?.links[0].id).toBe(liveLinks(id)[0].id)
  })

  it('an adopted create (title dedup) mirrors nothing', async () => {
    const winner = 'task_01SLOTMIRROR0000000000003'
    seedTask(winner, { title: 'Same title' })
    const r = await applyInsert(env, {
      mutation_id: 'mut_slotmirror_adopt', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: 'task_01SLOTMIRROR0000000000004', base_seq: null, base_row_hash: null,
      payload: { title: 'Same title', status: 'todo', assignee: 'nick-ingraham', priority: 'medium', completed: 0, key_link_1: DOC },
      client_ts: '2026-10-05T00:00:00Z', issued_at: '2026-10-05T00:00:00Z',
    }, user)
    expect(r.status).toBe('accepted')
    expect(r.reason ?? '').toMatch(/deduped/)
    expect(db.prepare('SELECT COUNT(*) AS n FROM links').get()).toEqual({ n: 0 })
    expect(r.dependents).toBeUndefined()
  })

  it('a slot-less insert is the original single .run(): no batch, one INSERT (the hot path)', async () => {
    let batches = 0
    const inserts: string[] = []
    const counted = {
      DB: d1Adapter(db, {
        beforeBatch: () => { batches++ },
        onExec: (sql) => { if (/^\s*INSERT INTO tasks\b/i.test(sql)) inserts.push(sql) },
      }),
    } as unknown as Env
    const id = 'task_01SLOTMIRROR0000000000012'
    const r = await applyInsert(counted, {
      mutation_id: 'mut_slotmirror_noslot_insert', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: id, base_seq: null, base_row_hash: null,
      payload: { title: 'x12', status: 'todo', assignee: 'nick-ingraham', priority: 'medium', completed: 0 },
      client_ts: '2026-10-05T00:00:00Z', issued_at: '2026-10-05T00:00:00Z',
    }, user)
    expect(r.status).toBe('accepted')
    expect(batches).toBe(0)
    expect(inserts).toHaveLength(1)
    expect(allLinks(id)).toEqual([])
    expect(r.dependents).toBeUndefined()
  })

  it('an unrecognizable slot value stays slot-only and the create still lands', async () => {
    const id = 'task_01SLOTMIRROR0000000000005'
    const r = await applyInsert(env, {
      mutation_id: 'mut_slotmirror_junk', origin_machine: 'work', table: 'tasks', op: 'insert',
      record_id: id, base_seq: null, base_row_hash: null,
      payload: { title: 'x5', status: 'todo', assignee: 'nick-ingraham', priority: 'medium', completed: 0, key_link_1: 'not a link at all' },
      client_ts: '2026-10-05T00:00:00Z', issued_at: '2026-10-05T00:00:00Z',
    }, user)
    expect(r.status).toBe('accepted')
    expect((db.prepare('SELECT key_link_1 FROM tasks WHERE id = ?').get(id) as { key_link_1: string }).key_link_1).toBe('not a link at all')
    expect(allLinks(id)).toEqual([])
  })
})

describe('update path (PB key-link writers, KeyLinksEditor)', () => {
  it('two slots that normalize to one canonical make ONE row, and the batch does not abort', async () => {
    const id = 'task_01SLOTMIRROR0000000000006'
    seedTask(id)
    expect(canon(DOC)).toBe(canon(DOC_SAME))
    const r = await pbUpdate(id, { key_link_1: DOC, key_link_2: DOC_SAME }, 'mut_slotmirror_samecanon')
    expect(r.status).toBe('accepted')
    expect(liveLinks(id).map((l) => l.canonical_url)).toEqual([canon(DOC)])
  })

  it('a live row PB already wrote for the canonical is kept; no duplicate, slot write still lands', async () => {
    const id = 'task_01SLOTMIRROR0000000000007'
    seedTask(id)
    insertRow(db, 'links', {
      id: 'link_pbmade', owner_table: 'tasks', owner_id: id, role: 'key', type: 'google_doc',
      canonical_url: canon(DOC), short_title: 'Doc', sort_order: 0,
    })
    const r = await pbUpdate(id, { key_link_1: DOC }, 'mut_slotmirror_existing')
    expect(r.status).toBe('accepted')
    expect(liveLinks(id).map((l) => l.id)).toEqual(['link_pbmade'])
    expect((db.prepare('SELECT key_link_1 FROM tasks WHERE id = ?').get(id) as { key_link_1: string }).key_link_1).toBe(DOC)
  })

  it('replacing a slot tombstones only the canonical it held; a "More links" row survives', async () => {
    const id = 'task_01SLOTMIRROR0000000000008'
    seedTask(id)
    await pbUpdate(id, { key_link_1: DOC, key_link_2: SHEET }, 'mut_slotmirror_seed')
    insertRow(db, 'links', {
      id: 'link_morelinks', owner_table: 'tasks', owner_id: id, role: 'key', type: 'github_repo',
      canonical_url: canon(EXTRA), short_title: 'Repo', sort_order: 5,
    })
    const r = await pbUpdate(id, { key_link_1: GMAIL }, 'mut_slotmirror_replace')
    expect(r.status).toBe('accepted')
    const live = liveLinks(id).map((l) => l.canonical_url).sort()
    expect(live).toEqual([canon(GMAIL), canon(SHEET), canon(EXTRA)].sort())
    const gone = allLinks(id).find((l) => l.canonical_url === canon(DOC))!
    expect(gone.deleted_at).toBeTruthy()
    expect(gone.last_mutation_id).toBe('mut_slotmirror_replace')
    // the response carries both the new row and the tombstone, so PB's cache can apply both
    expect(r.dependents?.links.map((l) => l.canonical_url).sort()).toEqual([canon(DOC), canon(GMAIL)].sort())
  })

  it('clearing a slot whose canonical another slot still holds tombstones nothing', async () => {
    const id = 'task_01SLOTMIRROR0000000000009'
    seedTask(id)
    await pbUpdate(id, { key_link_1: DOC, key_link_2: DOC_SAME }, 'mut_slotmirror_dup')
    const r = await pbUpdate(id, { key_link_1: null, key_link_1_desc: null }, 'mut_slotmirror_clear')
    expect(r.status).toBe('accepted')
    expect(liveLinks(id).map((l) => l.canonical_url)).toEqual([canon(DOC)])
  })

  it('PINNED BEHAVIOUR (Phase B changes it): pinning a "More links" URL then clearing the slot tombstones that same row', async () => {
    // The live natural key admits ONE role=key row per canonical, so the slot's
    // row and the user's "More links" row are the same row. Clearing the slot is
    // therefore a soft delete of it. Kept for Phase A by the orchestrator's
    // ruling (demote would make removal impossible: overflow chips are
    // read-only). Phase B (pin = sort_order, unpin = demote, delete = explicit)
    // is the real fix; when it lands, this test flips.
    const id = 'task_01SLOTMIRROR0000000000013'
    seedTask(id)
    insertRow(db, 'links', {
      id: 'link_user_more', owner_table: 'tasks', owner_id: id, role: 'key', type: 'github_repo',
      canonical_url: canon(EXTRA), short_title: 'Repo', sort_order: 5,
    })
    await pbUpdate(id, { key_link_1: EXTRA }, 'mut_slotmirror_pin')
    expect(liveLinks(id).map((l) => l.id)).toEqual(['link_user_more'])
    await pbUpdate(id, { key_link_1: null, key_link_1_desc: null }, 'mut_slotmirror_unpin')
    const row = allLinks(id).find((l) => l.id === 'link_user_more')!
    expect(row.deleted_at).toBeTruthy()
  })

  it('compaction (the editor removes slot 1 and shifts 2,3 up) re-orders the surviving rows', async () => {
    const id = 'task_01SLOTMIRROR0000000000014'
    seedTask(id)
    await pbUpdate(id, { key_link_1: DOC, key_link_2: SHEET, key_link_3: GMAIL }, 'mut_slotmirror_three')
    const r = await pbUpdate(id, { key_link_1: SHEET, key_link_2: GMAIL, key_link_3: null }, 'mut_slotmirror_compact')
    expect(r.status).toBe('accepted')
    const order = Object.fromEntries(liveLinks(id).map((l) => [l.canonical_url, l.sort_order]))
    expect(order).toEqual({ [canon(SHEET)]: 0, [canon(GMAIL)]: 1 })
    // the re-ordered rows are in the ack, so PB's cache gets the new order
    const touched = (r.dependents?.links ?? []).map((l) => l.canonical_url).sort()
    expect(touched).toEqual([canon(DOC), canon(SHEET), canon(GMAIL)].sort())
  })

  it('a description edit reaches short_title; a slot with no description leaves the title alone', async () => {
    const id = 'task_01SLOTMIRROR0000000000015'
    seedTask(id)
    await pbUpdate(id, { key_link_1: DOC, key_link_1_desc: 'Draft' }, 'mut_slotmirror_desc1')
    expect(liveLinks(id)[0].short_title).toBe('Draft')
    await pbUpdate(id, { key_link_1_desc: 'Final draft' }, 'mut_slotmirror_desc2')
    expect(liveLinks(id)[0].short_title).toBe('Final draft')
    const r = await pbUpdate(id, { key_link_1_desc: null }, 'mut_slotmirror_desc3')
    expect(liveLinks(id)[0].short_title).toBe('Final draft')
    expect(r.dependents).toBeUndefined()  // nothing changed, no seq bump
  })

  it('a patch with no slot columns runs no links statement', async () => {
    const id = 'task_01SLOTMIRROR0000000000010'
    seedTask(id, { key_link_1: DOC })
    const r = await pbUpdate(id, { priority: 'high' }, 'mut_slotmirror_noslot')
    expect(r.status).toBe('accepted')
    expect(allLinks(id)).toEqual([])
    expect(r.dependents).toBeUndefined()
  })

  it('a project slot write inserts but never tombstones', async () => {
    const pid = 'proj_01SLOTMIRROR000000000001'
    insertRow(db, 'projects', { id: pid, title: 'P', slug: 'p-slotmirror', status: 'active' })
    const seq = () => (db.prepare('SELECT seq FROM projects WHERE id = ?').get(pid) as { seq: number }).seq
    const up = (patch: Record<string, unknown>, m: string) => applyUpdate(env, {
      mutation_id: m, origin_machine: 'work', table: 'projects', op: 'update', record_id: pid,
      base_seq: seq(), base_row_hash: null, patch,
      client_ts: '2026-10-05T00:00:00Z', issued_at: '2026-10-05T00:00:00Z',
    }, user)
    expect((await up({ key_link_1: DOC }, 'mut_slotmirror_p1')).status).toBe('accepted')
    expect((await up({ key_link_1: SHEET }, 'mut_slotmirror_p2')).status).toBe('accepted')
    expect(liveLinks(pid).map((l) => l.canonical_url).sort()).toEqual([canon(DOC), canon(SHEET)].sort())
  })

  it('the stored replay body carries the dependents', async () => {
    const id = 'task_01SLOTMIRROR0000000000011'
    seedTask(id)
    const r = await applyMutation(env, {
      table: 'tasks', record_id: id, op: 'update', route: 'handleUpdateTask', user,
      patch: { key_link_1: SHEET, key_link_1_desc: 'Sheet' },
    })
    expect(r.status).toMatch(/^(accepted|merged_clean)$/)
    const stored = JSON.parse(receiptOf(db, r.mutation_id)!.original_response_json)
    expect(stored.dependents.links.map((l: Record<string, unknown>) => l.canonical_url)).toEqual([canon(SHEET)])
  })
})
