// handleGetRecentTaskComments — shape + cursor + PB-gating contract.
//
// anti-pattern-allowed-file: this CONTRACT TEST asserts BOTH the since-cursor
// ASC ordering AND the no-since DESC ordering of the endpoint, so its assertion
// strings necessarily contain literal "ORDER BY ... DESC" near the word "since".
// That is the test verifying the R1 fix, not a real query exhibiting the R1 bug.
//
// 2026-06-10 (TODAY.md-parity build): this endpoint now feeds the PB /process
// collector (scripts/process_hub_comments.py), so the row shape (task_title
// join), the ASC-cursor ordering under `since`, and the PB category gating are
// load-bearing. These tests capture the prepared SQL + binds to assert all
// three without a live D1.

import { describe, it, expect } from 'vitest'
import type { Env } from '../helpers'
import { handleGetRecentTaskComments } from './tasks'

// Records the last prepared SQL + bound args so we can assert on the query the
// handler built. `all()` returns a canned row set.
function makeEnv(rows: Record<string, unknown>[] = []) {
  const captured: { sql: string; binds: unknown[] }[] = []
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          captured.push({ sql, binds: args })
          return { all: async () => ({ results: rows }) }
        },
      }),
    },
  } as unknown as Env
  return { env, captured }
}

function makeUrl(qs: string): URL {
  return new URL(`https://mn-ccore-lab.pages.dev/api/task-comments/recent${qs}`)
}

describe('handleGetRecentTaskComments', () => {
  // Design C (v77): projection over activity_entries (alias `ae`, kind='comment')
  // preserving the legacy row shape + task_title join + ASC since-cursor.
  it('joins the parent task title as task_title', async () => {
    const { env, captured } = makeEnv()
    await handleGetRecentTaskComments(makeUrl(''), env, true)
    expect(captured[0].sql).toContain('t.title AS task_title')
  })

  it('reads activity_entries with kind=comment', async () => {
    const { env, captured } = makeEnv()
    await handleGetRecentTaskComments(makeUrl(''), env, true)
    expect(captured[0].sql).toContain('FROM activity_entries ae')
    expect(captured[0].sql).toContain("ae.kind = 'comment'")
  })

  it('with `since`: orders created_at ASC with id tiebreak and binds since+limit', async () => {
    const { env, captured } = makeEnv()
    const since = '2026-06-09T00:00:00Z'
    await handleGetRecentTaskComments(makeUrl(`?since=${encodeURIComponent(since)}&limit=50`), env, true)
    expect(captured[0].sql).toContain('ORDER BY ae.created_at ASC, ae.id ASC')
    expect(captured[0].sql).toContain('ae.created_at > ?')
    expect(captured[0].binds).toEqual([since, 50])
  })

  it('with compound `since`+`since_id`: advances past the exact (created_at,id) cursor', async () => {
    const { env, captured } = makeEnv()
    const since = '2026-06-09T00:00:00Z'
    await handleGetRecentTaskComments(makeUrl(`?since=${encodeURIComponent(since)}&since_id=ae9&limit=50`), env, true)
    expect(captured[0].sql).toContain('ae.created_at = ? AND ae.id > ?')
    expect(captured[0].binds).toEqual([since, since, 'ae9', 50])
  })

  it('without `since`: orders DESC (newest-first UI back-compat) and binds limit only', async () => {
    const { env, captured } = makeEnv()
    await handleGetRecentTaskComments(makeUrl('?limit=10'), env, true)
    expect(captured[0].sql).toContain('ORDER BY ae.created_at DESC, ae.id DESC')
    expect(captured[0].binds).toEqual([10])
  })

  it('non-PB caller (canSeePb=false) excludes Peripheral Brain category + author-only rows', async () => {
    const { env, captured } = makeEnv()
    await handleGetRecentTaskComments(makeUrl(''), env, false)
    expect(captured[0].sql).toContain("p.category != 'Peripheral Brain'")
    expect(captured[0].sql).toContain("ae.visibility = 'team'")
  })

  it('PB caller (canSeePb=true) has no category exclusion and sees author-only', async () => {
    const { env, captured } = makeEnv()
    await handleGetRecentTaskComments(makeUrl(''), env, true)
    expect(captured[0].sql).not.toContain('Peripheral Brain')
    expect(captured[0].sql).not.toContain("ae.visibility = 'team'")
  })

  it('clamps limit to 500', async () => {
    const { env, captured } = makeEnv()
    await handleGetRecentTaskComments(makeUrl('?limit=99999'), env, true)
    expect(captured[0].binds).toEqual([500])
  })

  it('returns the rows under data', async () => {
    const rows = [{ id: 'c1', task_id: 't1', author_slug: 'nick-ingraham', content: 'hi', created_at: '2026-06-10T00:00:00Z', task_title: 'Task One' }]
    const { env } = makeEnv(rows)
    const res = await handleGetRecentTaskComments(makeUrl(''), env, true)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toEqual(rows)
  })
})
