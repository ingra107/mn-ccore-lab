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

// §9.5.1 — the private-Hermes-answer arm's fixture rows. Shape mirrors the
// real activity_entries columns the arm reads (see api/routes/seen.ts).
interface ActivityEntryRow extends Row {
  id: string
  entity_type: string
  entity_id: string
  parent_id: string | null
  visibility: string
  actor_slug: string
  body: string
  hidden_at: string | null
  created_at: string // ISO
}

interface TaskFixtureRow extends Row {
  id: string
  title: string | null
  short_title: string | null
  deleted_at: string | null
}

/** Minimal stateful D1 stub covering the three GET /api/seen/unseen arms. */
function makeStatefulEnv(opts: {
  meetings?: Meeting[]
  entitySeen?: SeenRow[]
  activityEntries?: ActivityEntryRow[]
  tasks?: TaskFixtureRow[]
} = {}): {
  env: Env
  entitySeen: SeenRow[]
  capturedMeetingArgs: unknown[][]
} {
  const meetings = opts.meetings ?? []
  const entitySeen = opts.entitySeen ?? []
  const activityEntries = opts.activityEntries ?? []
  const tasks = opts.tasks ?? []
  const capturedMeetingArgs: unknown[][] = []

  const prepare = (sql: string) => {
    const upper = sql.toUpperCase()
    return {
      bind: (...args: unknown[]) => ({
        all: async <T = Row>() => {
          // §9.5.1 — the private (@me) Hermes-answer arm. Unique fingerprint:
          // this is the only arm whose FROM clause is activity_entries itself
          // (the plain team arm's FROM is entity_seen; it only JOINs
          // activity_entries as a second table).
          if (upper.includes('FROM ACTIVITY_ENTRIES REPLY')) {
            const [rootActorSlug, esViewerSlug, modifier] = args as [string, string, string]
            const daysMatch = String(modifier).match(/-(\d+)\s*days/)
            if (!daysMatch) throw new Error(`unexpected datetime modifier bind: ${modifier}`)
            const capMs = NOW.getTime() - Number(daysMatch[1]) * DAY_MS
            const byId = new Map(activityEntries.map((a) => [a.id, a]))
            type Grouped = { entity_type: string; entity_id: string; new_count: number; latest_at: string; title: string | null; project_slug: null }
            const groups = new Map<string, Grouped>()
            for (const reply of activityEntries) {
              if (reply.actor_slug !== 'claude-ai') continue
              if (!reply.parent_id) continue
              if (reply.hidden_at != null) continue
              if (reply.body.startsWith('Thinking about this')) continue // placeholder, not yet answered
              const root = byId.get(reply.parent_id)
              if (!root) continue
              if (root.visibility !== 'author') continue
              if (root.actor_slug !== rootActorSlug) continue
              if (root.entity_type !== 'task' && root.entity_type !== 'day') continue
              if (root.hidden_at != null) continue
              const task = root.entity_type === 'task' ? tasks.find((t) => t.id === root.entity_id) : undefined
              if (root.entity_type === 'task' && task && task.deleted_at != null) continue
              const replyMs = new Date(reply.created_at).getTime()
              if (!(replyMs > capMs)) continue
              const seen = entitySeen.find(
                (es) => es.entity_type === root.entity_type && es.entity_id === root.entity_id && es.viewer_slug === esViewerSlug,
              )
              if (seen && !(replyMs > new Date(seen.last_seen_at).getTime())) continue
              const key = `${root.entity_type}:${root.entity_id}`
              const title = root.entity_type === 'task' ? (task?.short_title ?? task?.title ?? null) : null
              const existing = groups.get(key)
              if (existing) {
                existing.new_count += 1
                if (reply.created_at > existing.latest_at) existing.latest_at = reply.created_at
              } else {
                groups.set(key, { entity_type: root.entity_type, entity_id: root.entity_id, new_count: 1, latest_at: reply.created_at, title, project_slug: null })
              }
            }
            return { results: Array.from(groups.values()) as unknown as T[] }
          }
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

  it('accepts entity_type=day (Phase 9 §9.5.1 — day threads can now be marked seen)', async () => {
    const { env } = makeStatefulEnv()
    const res = await handleMarkSeen(
      authedRequest('https://x/api/seen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: 'day', entity_id: '2026-07-15' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
  })
})

// §9.5.1 — the private (@me) Hermes-answer arm. Phase 5 moved typed @hermes
// off ai_requests onto activity_entries; a private ask writes
// visibility='author', which the plain team arm structurally cannot badge
// (it requires visibility='team'). This arm reads activity_entries directly,
// keyed on the reply Hermes itself writes, with an OWNERSHIP guard
// (root.visibility='author' AND root.actor_slug=viewer) that is the whole
// point of the arm — same leak class as the two 2026-07-22 defects.
describe('handleGetUnseenActivity — private Hermes-answer arm (§9.5.1, PRIVACY-CRITICAL)', () => {
  const privateTaskThread: ActivityEntryRow[] = [
    {
      id: 'root-task-a', entity_type: 'task', entity_id: 'task-1', parent_id: null,
      visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes what should I do next?',
      hidden_at: null, created_at: nowIso(-2),
    },
    {
      id: 'reply-task-a', entity_type: 'task', entity_id: 'task-1', parent_id: 'root-task-a',
      visibility: 'author', actor_slug: 'claude-ai', body: 'Here is my answer to your question.',
      hidden_at: null, created_at: nowIso(-1),
    },
  ]
  const taskFixture: TaskFixtureRow[] = [
    { id: 'task-1', title: 'Task One', short_title: null, deleted_at: null },
  ]

  it('LEAK-CLASS REGRESSION (MANDATORY): a different viewer, who authored no thread, gets ZERO rows for another user\'s private answered Hermes thread', async () => {
    const { env } = makeStatefulEnv({ activityEntries: privateTaskThread, tasks: taskFixture })
    // 'user-b' authored nothing — the private root belongs to 'nick-ingraham'.
    const res = await handleGetUnseenActivity(
      authedRequest('https://x/api/seen/unseen', { headers: { 'X-Test-User': 'user-b@umn.edu' } }),
      env,
    )
    const body = await res.json() as { data: Row[]; count: number }
    expect(body.data).toEqual([])
    expect(body.count).toBe(0)
  })

  it('badges the requester\'s OWN unseen Hermes answer on a private task thread', async () => {
    const { env } = makeStatefulEnv({ activityEntries: privateTaskThread, tasks: taskFixture })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_type: 'task', entity_id: 'task-1', new_count: 1, title: 'Task One' })
  })

  it('badges the requester\'s OWN unseen Hermes answer on a private DAY thread (Today nav badge)', async () => {
    const dayThread: ActivityEntryRow[] = [
      {
        id: 'root-day-a', entity_type: 'day', entity_id: '2026-07-15', parent_id: null,
        visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes good morning, what is on today?',
        hidden_at: null, created_at: nowIso(-2),
      },
      {
        id: 'reply-day-a', entity_type: 'day', entity_id: '2026-07-15', parent_id: 'root-day-a',
        visibility: 'author', actor_slug: 'claude-ai', body: 'Good morning — here is your day.',
        hidden_at: null, created_at: nowIso(-1),
      },
    ]
    const { env } = makeStatefulEnv({ activityEntries: dayThread })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_type: 'day', entity_id: '2026-07-15', new_count: 1 })
  })

  it('does NOT badge a private thread Hermes has not answered yet (still the "Thinking..." placeholder)', async () => {
    const pendingThread: ActivityEntryRow[] = [
      {
        id: 'root-task-pending', entity_type: 'task', entity_id: 'task-2', parent_id: null,
        visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes another question',
        hidden_at: null, created_at: nowIso(-1),
      },
      {
        id: 'reply-task-pending', entity_type: 'task', entity_id: 'task-2', parent_id: 'root-task-pending',
        visibility: 'author', actor_slug: 'claude-ai', body: 'Thinking about this... (AI response pending)',
        hidden_at: null, created_at: nowIso(-1),
      },
    ]
    const { env } = makeStatefulEnv({
      activityEntries: pendingThread,
      tasks: [{ id: 'task-2', title: 'Task Two', short_title: null, deleted_at: null }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(0)
  })

  it('does not re-badge once the requester has seen the thread AFTER the answer landed', async () => {
    const { env } = makeStatefulEnv({
      activityEntries: privateTaskThread,
      tasks: taskFixture,
      entitySeen: [{ entity_type: 'task', entity_id: 'task-1', viewer_slug: 'nick-ingraham', last_seen_at: nowIso(0) }],
    })
    const res = await handleGetUnseenActivity(authedRequest('https://x/api/seen/unseen'), env)
    const body = await res.json() as { data: Row[] }
    expect(body.data).toHaveLength(0)
  })
})
