// #523 (2026-07-07): when applyMutation's I18 (title, project_id) dedup adopts
// an EXISTING row instead of inserting, the caller must reflect that EXISTING
// row's id in its response — not the locally-generated id that was never
// written. Before this fix, handleCreateTask silently returned {data: null}
// on a dedup hit (its own `SELECT ... WHERE id = ?` found nothing), and
// handleMobileTasksToHub mapped the PWA's temp id to a phantom Hub id.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts)
// with the REAL applyMutation. The first cut mocked applyMutation and echoed a
// row back for any id, so it proved the caller read canonical_payload.id but
// not that the dedup arbiter really adopted the winner, nor that no second row
// landed. Here the winner is a stored row, and each case counts the rows that
// carry the title afterwards.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { AuthUser, Env } from '../helpers'
import { handleCreateTask, handleMobileTasksToHub } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
})

const WINNER = 'task_01hwtest_dedupresp_winner0'
function seedWinner(title: string) {
  insertRow(db, 'tasks', { id: WINNER, title, status: 'todo', priority: 'medium', assignee: 'nick-ingraham' })
}
const idsTitled = (title: string) =>
  (db.prepare('SELECT id FROM tasks WHERE title = ? ORDER BY id').all(title) as { id: string }[]).map((r) => r.id)

function createReq(body: unknown) {
  return new Request('https://example.com/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function mobileReq(tasks: unknown[]) {
  return new Request('https://example.com/api/sync/mobile-tasks-to-hub', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks }),
  })
}

describe('handleCreateTask — response reflects the dedup-adopted row (#523)', () => {
  it('a dedup hit returns the EXISTING row, not {data: null}, and writes no second row', async () => {
    seedWinner('Follow up')

    const res = await handleCreateTask(createReq({ assignee: 'claude-ai', description: 'Follow up' }), user, env)
    const body = await res.json() as { data: { id: string; title: string } | null }

    expect(res.status).toBe(201)
    expect(body.data).not.toBeNull()
    expect(body.data!.id).toBe(WINNER)
    expect(idsTitled('Follow up')).toEqual([WINNER])
  })

  it('a normal (non-dedup) insert returns the freshly-created row, stored with its receipt', async () => {
    const res = await handleCreateTask(createReq({ assignee: 'claude-ai', description: 'Brand new task' }), user, env)
    const body = await res.json() as { data: { id: string } }

    expect(res.status).toBe(201)
    expect(idsTitled('Brand new task')).toEqual([body.data.id])
    const receipt = db.prepare('SELECT outcome FROM processed_mutations WHERE record_id = ?').get(body.data.id) as { outcome: string } | undefined
    expect(receipt?.outcome).toBe('accepted')
  })
})

describe('handleMobileTasksToHub — id_map/counters reflect the dedup-adopted row (#523)', () => {
  it('the pre-check finds an open same-title row: maps to it, counts as deduped', async () => {
    seedWinner('Follow up')

    const res = await handleMobileTasksToHub(mobileReq([{ id: 'mobile_pre', title: '  follow UP ', assignee: 'nick-ingraham' }]), user, env)
    const body = await res.json() as { data: { id_map: Record<string, string>; created: number; deduped: number } }

    expect(body.data).toMatchObject({ created: 0, deduped: 1 })
    expect(body.data.id_map['mobile_pre']).toBe(WINNER)
    expect(idsTitled('Follow up')).toEqual([WINNER])
  })

  it('a peer insert landing after the pre-check: the arbiter adopts it, id_map points at it, counts as deduped', async () => {
    // The real race: the pre-check SELECT misses, then a concurrent writer
    // inserts the same (title, project_id) before applyInsert runs. The row
    // goes in just before the first statement the engine executes after the
    // pre-check.
    let precheckRan = false
    let raced = false
    env = {
      DB: d1Adapter(db, {
        onExec: (sql) => {
          if (precheckRan && !raced) { raced = true; seedWinner('Follow up') }
          if (/completed = 0 AND deleted_at IS NULL LIMIT 1/.test(sql)) precheckRan = true
        },
      }),
    } as unknown as Env

    const res = await handleMobileTasksToHub(mobileReq([{ id: 'mobile_abc', title: 'Follow up', assignee: 'nick-ingraham' }]), user, env)
    const body = await res.json() as { data: { id_map: Record<string, string>; created: number; deduped: number } }

    expect(raced).toBe(true)
    expect(body.data).toMatchObject({ created: 0, deduped: 1 })
    expect(body.data.id_map['mobile_abc']).toBe(WINNER)
    expect(idsTitled('Follow up')).toEqual([WINNER])
  })

  it('a normal (non-dedup) insert maps to the freshly-created id, counts as created', async () => {
    const res = await handleMobileTasksToHub(mobileReq([{ id: 'mobile_xyz', title: 'Brand new', assignee: 'nick-ingraham' }]), user, env)
    const body = await res.json() as { data: { id_map: Record<string, string>; created: number; deduped: number } }

    expect(body.data).toMatchObject({ created: 1, deduped: 0 })
    expect(idsTitled('Brand new')).toEqual([body.data.id_map['mobile_xyz']])
    const row = db.prepare('SELECT source, status, completed FROM tasks WHERE id = ?').get(body.data.id_map['mobile_xyz'])
    expect(row).toEqual({ source: 'mobile', status: 'todo', completed: 0 })
  })
})
