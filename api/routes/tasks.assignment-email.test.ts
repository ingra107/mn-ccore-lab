// Task-assignment email goes through the same recipient switch as the digest
// and the pulse (api/lib/email.ts). Real handleCreateTask on the migrated schema.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handleCreateTask } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import type { Env, AuthUser } from '../helpers'

const NICK = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser

let db: ReturnType<typeof prodSchemaDb>
let resendCalls: { to: string }[]

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: 'ingra107@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: 'eddin022@umn.edu' })
  resendCalls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (String(url).includes('api.resend.com')) resendCalls.push({ to: (JSON.parse(String(init.body)) as { to: string }).to })
    return new Response('{}', { status: 200 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function create(env: Record<string, unknown>, waitUntil?: (p: Promise<unknown>) => void) {
  const req = new Request('https://x/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignee: 'casey-eddington', description: 'Review <b>the</b> draft' }),
  })
  return handleCreateTask(req, NICK, { DB: d1Adapter(db), ...env } as unknown as Env, waitUntil)
}

describe('task assignment email', () => {
  it('sends nothing to a member by default (DIGEST_RECIPIENTS unset)', async () => {
    const res = await create({ RESEND_API_KEY: 'k' })
    expect(res.status).toBe(201)
    expect(resendCalls).toEqual([])
  })

  it('sends to the member once DIGEST_RECIPIENTS names them, "ALL" in any case', async () => {
    await create({ RESEND_API_KEY: 'k', DIGEST_RECIPIENTS: 'ALL' })
    expect(resendCalls).toEqual([{ to: 'eddin022@umn.edu' }])
  })

  it('runs the send through waitUntil when the caller supplies it', async () => {
    const jobs: Promise<unknown>[] = []
    await create({ RESEND_API_KEY: 'k', DIGEST_RECIPIENTS: 'eddin022@umn.edu' }, (p) => jobs.push(p))
    expect(jobs).toHaveLength(1)
    await Promise.all(jobs)
    expect(resendCalls).toEqual([{ to: 'eddin022@umn.edu' }])
  })
})
