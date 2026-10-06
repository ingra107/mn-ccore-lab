// Bug Squasher (2026-06-10) — bug_reports D1 queue endpoints.
//
// Covers the PI/API-key gate + the list/status round-trip that the squasher
// (scripts/bug-squasher.bat, ⌘K "Bug Squasher") drives:
//   1. GET /api/bug-reports?status=open is 403 without a valid API key.
//   2. With the API key it returns only open rows.
//   3. POST /api/bug-reports/:id/status resolves a bug + stamps resolved_at.
//   4. Returning a bug to 'open' clears resolved_at.
//   5. An unknown id is 404; a bad status is 400.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's in-memory table parsed the UPDATE's bind ORDER itself
// (`const [status, resolvedAt, id] = args`), so a reordered or wrong UPDATE in
// the route could pass. Here the route's SQL runs on the real bug_reports
// table, and every refused request is checked to have changed nothing.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleListBugReports, handleUpdateBugReportStatus } from './bug-report'
import type { Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

type Row = Record<string, unknown>

const API_KEY = 'test-pb-key'

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db), PB_API_KEY: API_KEY } as unknown as Env
  for (const r of seedBugs()) insertRow(db, 'bug_reports', r)
})

function req(url: string, opts: { key?: boolean; body?: Row; method?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.key) headers['Authorization'] = `Bearer ${API_KEY}`
  return new Request(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

function seedBugs(): Row[] {
  return [
    { id: 'bug_a', description: 'open one', status: 'open', created_at: '2026-06-10T01:00:00.000Z', resolved_at: null, page_url: '/portal/my-tasks', viewport: '1440x900', theme: 'dark', issue_number: 11, issue_url: 'u', reporter: 'ingra107@umn.edu' },
    { id: 'bug_b', description: 'resolved one', status: 'resolved', created_at: '2026-06-09T01:00:00.000Z', resolved_at: '2026-06-09T02:00:00.000Z', page_url: null, viewport: null, theme: null, issue_number: null, issue_url: null, reporter: null },
    { id: 'bug_c', description: 'open two', status: 'open', created_at: '2026-06-10T03:00:00.000Z', resolved_at: null, page_url: null, viewport: null, theme: null, issue_number: 12, issue_url: 'u2', reporter: null },
  ]
}
const stored = (id: string) => db.prepare('SELECT status, resolved_at FROM bug_reports WHERE id = ?').get(id) as { status: string; resolved_at: string | null }

describe('GET /api/bug-reports — list + PI gate', () => {
  it('403s without a valid API key', async () => {
    const res = await handleListBugReports(req('https://x/api/bug-reports?status=open'), env)
    expect(res.status).toBe(403)
  })

  it('returns only open rows with the API key', async () => {
    const res = await handleListBugReports(req('https://x/api/bug-reports?status=open', { key: true }), env)
    const body = await res.json() as { data: Row[]; count: number }
    expect(res.status).toBe(200)
    expect(body.count).toBe(2)
    expect(body.data.map((b) => b.id).sort()).toEqual(['bug_a', 'bug_c'])
  })

  it('rejects an unknown status filter with 400', async () => {
    const res = await handleListBugReports(req('https://x/api/bug-reports?status=bogus', { key: true }), env)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/bug-reports/:id/status — resolve round-trip', () => {
  it('403s without a valid API key, and changes nothing', async () => {
    const res = await handleUpdateBugReportStatus('bug_a', req('https://x', { method: 'POST', body: { status: 'resolved' } }), env)
    expect(res.status).toBe(403)
    expect(stored('bug_a')).toEqual({ status: 'open', resolved_at: null })
  })

  it('resolves an open bug and stamps resolved_at', async () => {
    const res = await handleUpdateBugReportStatus('bug_a', req('https://x', { key: true, method: 'POST', body: { status: 'resolved' } }), env)
    const body = await res.json() as { data: Row }
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('resolved')
    expect(body.data.resolved_at).toBeTruthy()
    const row = stored('bug_a')
    expect(row.status).toBe('resolved')
    expect(row.resolved_at).toBe(body.data.resolved_at)
    // Only the named bug moved.
    expect(stored('bug_c')).toEqual({ status: 'open', resolved_at: null })
  })

  it('returning a bug to open clears resolved_at', async () => {
    const res = await handleUpdateBugReportStatus('bug_b', req('https://x', { key: true, method: 'POST', body: { status: 'open' } }), env)
    const body = await res.json() as { data: Row }
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('open')
    expect(body.data.resolved_at).toBeNull()
    expect(stored('bug_b')).toEqual({ status: 'open', resolved_at: null })
  })

  it('404s on an unknown id', async () => {
    const res = await handleUpdateBugReportStatus('bug_nope', req('https://x', { key: true, method: 'POST', body: { status: 'resolved' } }), env)
    expect(res.status).toBe(404)
  })

  it('400s on an invalid status, and changes nothing', async () => {
    const res = await handleUpdateBugReportStatus('bug_a', req('https://x', { key: true, method: 'POST', body: { status: 'wat' } }), env)
    expect(res.status).toBe(400)
    expect(stored('bug_a')).toEqual({ status: 'open', resolved_at: null })
  })
})
