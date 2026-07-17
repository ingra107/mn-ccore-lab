// seen.test.ts — per-viewer seen tracking (api/routes/seen.ts).
//
// #740 (2026-07-16, backend half of #548): #548 added a CLIENT-side recency
// cap (src/lib/seen.ts, 14 days) that filters the cold-start never_seen-
// meeting flood in the browser, but the backend payload itself was
// unbounded — every never-opened meeting since the dawn of the meetings
// table shipped over the wire on every poll. This file guards the SQL-layer
// fix (MEETING_NEVER_SEEN_PAYLOAD_CAP_DAYS in seen.ts):
//   1. a never_seen meeting inside the window is returned, never_seen=1.
//   2. a never_seen meeting well past the server cap is dropped entirely.
//   3. a never_seen meeting PAST the client's 14-day cap but still inside
//      the server's wider cap is still SHIPPED — the server bound is a
//      superset of the client's, never narrower (the client decides what
//      actually badges).
//   4. a PREVIOUSLY-SEEN meeting with activity older than any recency
//      window is still returned (never_seen=0) — the cap must apply ONLY to
//      the never_seen=1 arm, not to genuine "new activity since last look".
//   5. a previously-seen meeting with no activity since last_seen_at is
//      excluded (baseline behavior, unaffected by the #740 change).
//   6. a meeting with null notes is excluded regardless of recency
//      (pre-existing `m.notes IS NOT NULL` gate, unaffected by #740).
//
// A small stateful in-memory D1 stub mimics the two-arm query (task/project
// + meetings) by parsing the SQL fingerprint + bound args, matching the
// pattern established in meetings.create-notes.test.ts. No live binding, no
// network, no prod Hub.

import { describe, it, expect } from 'vitest'
import { handleGetUnseenActivity, handleMarkSeen } from './seen'
import type { Env } from '../helpers'

type Row = Record<string, unknown>

const DAY_MS = 86400000
const NOW = new Date('2026-07-16T12:00:00Z')
const nowIso = (deltaDays: number) => new Date(NOW.getTime() + deltaDays * DAY_MS).toISOString()

interface Meeting extends Row {
  id: string
  title: string
  notes: string | null
  updated_at: string // ISO
}

interface SeenRow extends Row {
  entity_type: string
  entity_id: string
  viewer_slug: string
  last_seen_at: string // ISO
}

/** Minimal stateful D1 stub covering the two GET /api/seen/unseen arms. */
function makeStatefulEnv(opts: { meetings?: Meeting[]; entitySeen?: SeenRow[] } = {}): {
  env: Env
  entitySeen: SeenRow[]
  capturedMeetingArgs: unknown[][]
} {
  const meetings = opts.meetings ?? []
  const entitySeen = opts.entitySeen ?? []
  const capturedMeetingArgs: unknown[][] = []

  const prepare = (sql: string) => {
    const upper = sql.toUpperCase()
    return {
      bind: (...args: unknown[]) => ({
        all: async <T = Row>() => {
          if (upper.includes('FROM MEETINGS')) {
            capturedMeetingArgs.push(args)
            const [viewerSlug, modifier] = args as [string, string]
            const daysMatch = String(modifier).match(/-(\d+)\s*days/)
            if (!daysMatch) throw new Error(`unexpected datetime modifier bind: ${modifier}`)
            const capMs = NOW.getTime() - Number(daysMatch[1]) * DAY_MS
            const rows = meetings
              .filter((m) => m.notes !== null)
              .map((m) => {
                const seen = entitySeen.find(
                  (es) => es.entity_type === 'meeting' && es.entity_id === m.id && es.viewer_slug === viewerSlug,
                )
                const updatedMs = new Date(m.updated_at).getTime()
                if (!seen) {
                  return updatedMs > capMs ? { m, neverSeen: 1 } : null
                }
                const lastSeenMs = new Date(seen.last_seen_at).getTime()
                return updatedMs > lastSeenMs ? { m, neverSeen: 0 } : null
              })
              .filter((r): r is { m: Meeting; neverSeen: number } => r !== null)
              .map(({ m, neverSeen }) => ({
                entity_type: 'meeting',
                entity_id: m.id,
                never_seen: neverSeen,
                latest_at: m.updated_at,
                title: m.title,
                project_slug: null,
              }))
            return { results: rows as unknown as T[] }
          }
          // task/project arm — not under test here (no entity_seen task/project
          // rows seeded), always empty.
          return { results: [] as T[] }
        },
        first: async () => null,
        run: async () => {
          if (upper.startsWith('INSERT INTO ENTITY_SEEN')) {
            const [entityType, entityId, viewerSlug] = args as [string, string, string]
            const existing = entitySeen.find(
              (es) => es.entity_type === entityType && es.entity_id === entityId && es.viewer_slug === viewerSlug,
            )
            if (existing) existing.last_seen_at = NOW.toISOString()
            else entitySeen.push({ entity_type: entityType, entity_id: entityId, viewer_slug: viewerSlug, last_seen_at: NOW.toISOString() })
            return { meta: { changes: 1 } }
          }
          return { meta: { changes: 0 } }
        },
      }),
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 0 } }),
    }
  }

  const env = { DB: { prepare }, TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod' } as unknown as Env
  return { env, entitySeen, capturedMeetingArgs }
}

function authedRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'X-Test-User': 'ingra107@umn.edu',
      ...(init.headers ?? {}),
    },
  })
}

function unauthedRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, init)
}

describe('handleGetUnseenActivity — meeting server-side recency bound (#740)', () => {
  it('returns empty for an unauthenticated caller (no leak of unbounded query either)', async () => {
    const { env } = makeStatefulEnv({
      meetings: [{ id: 'm1', title: 'Old', notes: 'n', updated_at: nowIso(-1000) }],
    })
    const res = await handleGetUnseenActivity(unauthedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[]; count: number }
    expect(res.status).toBe(200)
    expect(body.data).toEqual([])
    expect(body.count).toBe(0)
  })

  it('includes a never_seen meeting inside the recency window (never_seen=1)', async () => {
    const { env } = makeStatefulEnv({
      meetings: [{ id: 'm-recent', title: 'Recent, never opened', notes: 'n', updated_at: nowIso(-5) }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_type: 'meeting', entity_id: 'm-recent', never_seen: 1 })
  })

  it('drops a never_seen meeting well past the server cap (the #740 payload-flood case)', async () => {
    const { env } = makeStatefulEnv({
      meetings: [{ id: 'm-ancient', title: 'Ancient, never opened', notes: 'n', updated_at: nowIso(-1000) }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(0)
  })

  it('still SHIPS a never_seen meeting past the CLIENT 14-day cap but inside the wider SERVER cap (superset, not exact-match)', async () => {
    // #548's client cap is 14 days. seen.ts's server cap is deliberately
    // wider (30) — a row at 20 days must still be shipped by the server;
    // it's the client's own filter that decides whether it badges.
    const { env } = makeStatefulEnv({
      meetings: [{ id: 'm-20d', title: '20 days old, never opened', notes: 'n', updated_at: nowIso(-20) }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_id: 'm-20d', never_seen: 1 })
  })

  it('a previously-seen meeting with activity older than any recency window is still returned (cap does NOT apply to the seen arm)', async () => {
    const { env } = makeStatefulEnv({
      meetings: [{ id: 'm-seen-stale', title: 'Seen long ago, updated since', notes: 'n', updated_at: nowIso(-60) }],
      entitySeen: [{ entity_type: 'meeting', entity_id: 'm-seen-stale', viewer_slug: 'nick-ingraham', last_seen_at: nowIso(-90) }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_id: 'm-seen-stale', never_seen: 0 })
  })

  it('a previously-seen meeting with no activity since last_seen_at is excluded (baseline, unaffected by #740)', async () => {
    const { env } = makeStatefulEnv({
      meetings: [{ id: 'm-seen-quiet', title: 'Seen, nothing new', notes: 'n', updated_at: nowIso(-90) }],
      entitySeen: [{ entity_type: 'meeting', entity_id: 'm-seen-quiet', viewer_slug: 'nick-ingraham', last_seen_at: nowIso(-10) }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(0)
  })

  it('excludes a meeting with null notes regardless of recency (pre-existing gate, unaffected by #740)', async () => {
    const { env } = makeStatefulEnv({
      meetings: [{ id: 'm-no-notes', title: 'No notes yet', notes: null, updated_at: nowIso(-1) }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(0)
  })

  it('binds the recency modifier as "-N days" positionally after the viewer slug', async () => {
    const { env, capturedMeetingArgs } = makeStatefulEnv({
      meetings: [{ id: 'm1', title: 'x', notes: 'n', updated_at: nowIso(-1) }],
    })
    await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    expect(capturedMeetingArgs).toHaveLength(1)
    const [viewerSlug, modifier] = capturedMeetingArgs[0]
    expect(typeof viewerSlug).toBe('string')
    expect(modifier).toMatch(/^-\d+ days$/)
  })
})

describe('handleMarkSeen — auth gate', () => {
  it('401s for an unauthenticated caller', async () => {
    const { env } = makeStatefulEnv()
    const res = await handleMarkSeen(
      unauthedRequest('https://x/api/seen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: 'meeting', entity_id: 'm1' }),
      }),
      env,
    )
    expect(res.status).toBe(401)
  })
})
