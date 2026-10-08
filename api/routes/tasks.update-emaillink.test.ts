// tasks.update-emaillink.test.ts — I40 class-close regression guard (2026-06-11)
//
// The Gmail Apps Script morning run stamps source_thread_id onto matched
// EXISTING tasks through handleUpdateTask. Both CREATE paths derive
// email_link from source_thread_id (PB §2D, 2026-06-10) but the UPDATE path
// did not — caught live by PB invariant I40 on the first real Apps Script
// morning (6 tasks with a thread id and no Gmail link). These tests pin the
// derived-pair rule on UPDATE: writing source_thread_id carries the derived
// email_link with it; clearing it clears the link.
//
// #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts)
// instead of a SET-clause-parsing stub whose receipt INSERT only recorded the
// mutation id. Each landed write now has its receipt read back.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleUpdateTask } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

function apiKeyPost(body: unknown): Request {
  return new Request('https://x/api/tasks/test', {
    method: 'POST',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as import('../helpers').Env
})

function seedTask(id: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'tasks', { id, title: 'Probe', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', ...extra })
}
const rowOf = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>
const receiptsFor = (id: string) =>
  db.prepare("SELECT outcome, original_response_json FROM processed_mutations WHERE table_name = 'tasks' AND record_id = ?").all(id) as
    { outcome: string; original_response_json: string }[]

describe('handleUpdateTask derives email_link with source_thread_id (I40 class-close)', () => {
  it('writing source_thread_id on update derives the paired Gmail link', async () => {
    const id = 'task_01hwtest_emaillink_000001'
    seedTask(id)

    const res = await handleUpdateTask(id, apiKeyPost({ source_thread_id: '19ebTESTthread01' }), user, env)
    expect(res.status).toBe(200)

    const row = rowOf(id)
    expect(row.source_thread_id).toBe('19ebTESTthread01')
    expect(row.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/19ebTESTthread01')
    const receipts = receiptsFor(id)
    expect(receipts).toHaveLength(1)
    expect(JSON.parse(receipts[0].original_response_json).status).toBe(receipts[0].outcome)
  })

  it('clearing source_thread_id clears the derived link (pair moves together)', async () => {
    const id = 'task_01hwtest_emaillink_000002'
    seedTask(id, {
      source_thread_id: 'OLDTHREAD',
      email_link: 'https://mail.google.com/mail/u/1/#inbox/OLDTHREAD',
    })

    const res = await handleUpdateTask(id, apiKeyPost({ source_thread_id: null }), user, env)
    expect(res.status).toBe(200)

    const row = rowOf(id)
    expect(row.source_thread_id).toBe(null)
    expect(row.email_link).toBe(null)
  })

  it('an unrelated update does not touch email_link', async () => {
    const id = 'task_01hwtest_emaillink_000003'
    seedTask(id)

    const res = await handleUpdateTask(id, apiKeyPost({ due_date: '2026-06-12' }), user, env)
    expect(res.status).toBe(200)

    const row = rowOf(id)
    expect(row.email_link).toBe(null)
    expect(row.due_date).toBe('2026-06-12')
  })
})
