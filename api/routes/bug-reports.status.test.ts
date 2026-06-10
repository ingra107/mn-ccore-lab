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
// A small stateful in-memory `bug_reports` table backs env.DB so INSERT →
// SELECT-back and UPDATE → SELECT-back behave like real D1. No live binding.

import { describe, it, expect, beforeEach } from 'vitest'
import { handleListBugReports, handleUpdateBugReportStatus } from './bug-report'
import type { Env } from '../helpers'

type Row = Record<string, unknown>

const API_KEY = 'test-pb-key'

function makeStatefulEnv(seed: Row[] = []): { env: Env; bugs: Row[] } {
  const bugs: Row[] = seed.map((r) => ({ ...r }))

  const prepare = (sql: string) => {
    const s = sql.trim()
    const upper = s.toUpperCase()
    return {
      bind: (...args: unknown[]) => ({
        all: async <T = Row>() => {
          if (upper.startsWith('SELECT') && upper.includes('FROM BUG_REPORTS') && upper.includes('WHERE STATUS =')) {
            const status = args[0]
            return { results: bugs.filter((b) => b.status === status) as T[] }
          }
          return { results: bugs as T[] }
        },
        first: async <T = Row>() => {
          const id = args[args.length - 1]
          return (bugs.find((b) => b.id === id) as T) ?? null
        },
        run: async () => {
          if (upper.startsWith('UPDATE BUG_REPORTS')) {
            const [status, resolvedAt, id] = args
            const row = bugs.find((b) => b.id === id)
            if (row) { row.status = status; row.resolved_at = resolvedAt }
            return { meta: { changes: row ? 1 : 0 } }
          }
          return { meta: { changes: 1 } }
        },
      }),
      // unbound SELECT (status=all path): return everything
      all: async <T = Row>() => ({ results: bugs as T[] }),
      first: async () => null,
      run: async () => ({ meta: { changes: 0 } }),
    }
  }

  const env = { DB: { prepare }, PB_API_KEY: API_KEY } as unknown as Env
  return { env, bugs }
}

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

describe('GET /api/bug-reports — list + PI gate', () => {
  let bundle: { env: Env; bugs: Row[] }
  beforeEach(() => { bundle = makeStatefulEnv(seedBugs()) })

  it('403s without a valid API key', async () => {
    const res = await handleListBugReports(req('https://x/api/bug-reports?status=open'), bundle.env)
    expect(res.status).toBe(403)
  })

  it('returns only open rows with the API key', async () => {
    const res = await handleListBugReports(req('https://x/api/bug-reports?status=open', { key: true }), bundle.env)
    const body = await res.json() as { data: Row[]; count: number }
    expect(res.status).toBe(200)
    expect(body.count).toBe(2)
    expect(body.data.every((b) => b.status === 'open')).toBe(true)
  })

  it('rejects an unknown status filter with 400', async () => {
    const res = await handleListBugReports(req('https://x/api/bug-reports?status=bogus', { key: true }), bundle.env)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/bug-reports/:id/status — resolve round-trip', () => {
  let bundle: { env: Env; bugs: Row[] }
  beforeEach(() => { bundle = makeStatefulEnv(seedBugs()) })

  it('403s without a valid API key', async () => {
    const res = await handleUpdateBugReportStatus('bug_a', req('https://x', { method: 'POST', body: { status: 'resolved' } }), bundle.env)
    expect(res.status).toBe(403)
  })

  it('resolves an open bug and stamps resolved_at', async () => {
    const res = await handleUpdateBugReportStatus('bug_a', req('https://x', { key: true, method: 'POST', body: { status: 'resolved' } }), bundle.env)
    const body = await res.json() as { data: Row }
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('resolved')
    expect(body.data.resolved_at).toBeTruthy()
    expect(bundle.bugs.find((b) => b.id === 'bug_a')!.status).toBe('resolved')
  })

  it('returning a bug to open clears resolved_at', async () => {
    const res = await handleUpdateBugReportStatus('bug_b', req('https://x', { key: true, method: 'POST', body: { status: 'open' } }), bundle.env)
    const body = await res.json() as { data: Row }
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('open')
    expect(body.data.resolved_at).toBeNull()
  })

  it('404s on an unknown id', async () => {
    const res = await handleUpdateBugReportStatus('bug_nope', req('https://x', { key: true, method: 'POST', body: { status: 'resolved' } }), bundle.env)
    expect(res.status).toBe(404)
  })

  it('400s on an invalid status', async () => {
    const res = await handleUpdateBugReportStatus('bug_a', req('https://x', { key: true, method: 'POST', body: { status: 'wat' } }), bundle.env)
    expect(res.status).toBe(400)
  })
})
