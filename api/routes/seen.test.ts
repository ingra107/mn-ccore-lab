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
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut re-implemented all three arms of the unseen query in
// JavaScript (including the PRIVACY-CRITICAL ownership guard on the private
// Hermes-answer arm), so a change to the real SQL could pass every case here.
// Now the route's own SQL runs against real meetings / entity_seen /
// activity_entries / tasks rows. Timestamps are written in the
// 'YYYY-MM-DD HH:MM:SS' form datetime('now') produces, relative to the real
// clock, because the route compares them against datetime('now', '-N days').

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleGetUnseenActivity, handleMarkSeen } from './seen'
import type { Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

type Row = Record<string, unknown>

const DAY_MS = 86400000
/** A timestamp `deltaDays` from now, in SQLite's datetime('now') format. */
// eslint-disable-next-line local/time-discipline -- a UTC INSTANT formatted like SQLite's datetime('now') (also UTC), not a civil day; the comparison it feeds is instant-vs-instant
const sqlTs = (deltaDays: number) => new Date(Date.now() + deltaDays * DAY_MS).toISOString().slice(0, 19).replace('T', ' ')

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  // #8945: the caller's slug is read from team_members.email.
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod' } as unknown as Env
})

function meeting(id: string, title: string, notes: string | null, updatedDays: number) {
  insertRow(db, 'meetings', { id, title, date: sqlTs(updatedDays).slice(0, 10), notes, updated_at: sqlTs(updatedDays) })
}
function seen(entityType: string, entityId: string, viewer: string, lastSeenDays: number) {
  insertRow(db, 'entity_seen', { entity_type: entityType, entity_id: entityId, viewer_slug: viewer, last_seen_at: sqlTs(lastSeenDays) })
}
function entry(row: Record<string, unknown>) {
  insertRow(db, 'activity_entries', { kind: 'comment', hidden_at: null, ...row })
}
function task(id: string, title: string) {
  insertRow(db, 'tasks', { id, title, status: 'todo', priority: 'medium', assignee: 'nick-ingraham' })
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

async function unseen(req = authedRequest('https://x/api/seen/unseen')) {
  const res = await handleGetUnseenActivity(req, env)
  expect(res.status).toBe(200)
  return await res.json() as { data: Row[]; count: number }
}

describe('handleGetUnseenActivity — meeting server-side recency bound (#740)', () => {
  it('returns empty for an unauthenticated caller (no leak of unbounded query either)', async () => {
    meeting('m1', 'Recent', 'n', -1)
    const body = await unseen(unauthedRequest('https://x/api/seen/unseen'))
    expect(body.data).toEqual([])
    expect(body.count).toBe(0)
  })

  it('includes a never_seen meeting inside the recency window (never_seen=1)', async () => {
    meeting('m-recent', 'Recent, never opened', 'n', -5)
    const body = await unseen()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_type: 'meeting', entity_id: 'm-recent', never_seen: 1 })
  })

  it('drops a never_seen meeting well past the server cap (the #740 payload-flood case)', async () => {
    meeting('m-ancient', 'Ancient, never opened', 'n', -1000)
    expect((await unseen()).data).toHaveLength(0)
  })

  it('still SHIPS a never_seen meeting past the CLIENT 14-day cap but inside the wider SERVER cap (superset, not exact-match)', async () => {
    // #548's client cap is 14 days. seen.ts's server cap is deliberately
    // wider (30) — a row at 20 days must still be shipped by the server.
    meeting('m-20d', '20 days old, never opened', 'n', -20)
    const body = await unseen()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_id: 'm-20d', never_seen: 1 })
  })

  it('a previously-seen meeting with activity older than any recency window is still returned (cap does NOT apply to the seen arm)', async () => {
    meeting('m-seen-stale', 'Seen long ago, updated since', 'n', -60)
    seen('meeting', 'm-seen-stale', 'nick-ingraham', -90)
    const body = await unseen()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_id: 'm-seen-stale', never_seen: 0 })
  })

  it('a previously-seen meeting with no activity since last_seen_at is excluded (baseline, unaffected by #740)', async () => {
    meeting('m-seen-quiet', 'Seen, nothing new', 'n', -90)
    seen('meeting', 'm-seen-quiet', 'nick-ingraham', -10)
    expect((await unseen()).data).toHaveLength(0)
  })

  it('excludes a meeting with null notes regardless of recency (pre-existing gate, unaffected by #740)', async () => {
    meeting('m-no-notes', 'No notes yet', null, -1)
    expect((await unseen()).data).toHaveLength(0)
  })

  it('another viewer having seen a meeting does not hide it from this viewer', async () => {
    meeting('m-other', 'Seen by someone else', 'n', -2)
    seen('meeting', 'm-other', 'user-b', 0)
    const body = await unseen()
    expect(body.data).toMatchObject([{ entity_id: 'm-other', never_seen: 1 }])
  })
})

describe('handleMarkSeen', () => {
  it('401s for an unauthenticated caller, and writes nothing', async () => {
    const res = await handleMarkSeen(
      unauthedRequest('https://x/api/seen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: 'meeting', entity_id: 'm1' }),
      }),
      env,
    )
    expect(res.status).toBe(401)
    expect(db.prepare('SELECT COUNT(*) AS n FROM entity_seen').get()).toEqual({ n: 0 })
  })

  it('accepts entity_type=day (Phase 9 §9.5.1) and stores the seen row for the caller', async () => {
    const res = await handleMarkSeen(
      authedRequest('https://x/api/seen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: 'day', entity_id: '2026-07-15' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(db.prepare("SELECT viewer_slug FROM entity_seen WHERE entity_type = 'day' AND entity_id = '2026-07-15'").all())
      .toEqual([{ viewer_slug: 'nick-ingraham' }])
  })

  it('marking a meeting seen clears it from the unseen list (the write and the read agree)', async () => {
    meeting('m-mark', 'Mark me', 'n', -1)
    expect((await unseen()).data).toHaveLength(1)
    // last_seen_at must be strictly after updated_at; the meeting was updated a day ago.
    const res = await handleMarkSeen(
      authedRequest('https://x/api/seen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: 'meeting', entity_id: 'm-mark' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect((await unseen()).data).toHaveLength(0)
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
  function privateTaskThread() {
    task('task-1', 'Task One')
    entry({
      id: 'root-task-a', entity_type: 'task', entity_id: 'task-1', parent_id: null,
      visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes what should I do next?', created_at: sqlTs(-2),
    })
    entry({
      id: 'reply-task-a', entity_type: 'task', entity_id: 'task-1', parent_id: 'root-task-a',
      visibility: 'author', actor_slug: 'claude-ai', body: 'Here is my answer to your question.', created_at: sqlTs(-1),
    })
  }

  it('LEAK-CLASS REGRESSION (MANDATORY): a different viewer, who authored no thread, gets ZERO rows for another user\'s private answered Hermes thread', async () => {
    privateTaskThread()
    // 'user-b' authored nothing — the private root belongs to 'nick-ingraham'.
    const body = await unseen(authedRequest('https://x/api/seen/unseen', { headers: { 'X-Test-User': 'user-b@umn.edu' } }))
    expect(body.data).toEqual([])
    expect(body.count).toBe(0)
  })

  it('badges the requester\'s OWN unseen Hermes answer on a private task thread', async () => {
    privateTaskThread()
    const body = await unseen()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_type: 'task', entity_id: 'task-1', new_count: 1, title: 'Task One' })
  })

  it('does not badge a private thread on a deleted task', async () => {
    privateTaskThread()
    db.prepare("UPDATE tasks SET deleted_at = ?, status = 'deleted' WHERE id = 'task-1'").run(sqlTs(0))
    expect((await unseen()).data).toHaveLength(0)
  })

  it('badges the requester\'s OWN unseen Hermes answer on a private DAY thread (Today nav badge)', async () => {
    entry({
      id: 'root-day-a', entity_type: 'day', entity_id: '2026-07-15', parent_id: null,
      visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes good morning, what is on today?', created_at: sqlTs(-2),
    })
    entry({
      id: 'reply-day-a', entity_type: 'day', entity_id: '2026-07-15', parent_id: 'root-day-a',
      visibility: 'author', actor_slug: 'claude-ai', body: 'Good morning — here is your day.', created_at: sqlTs(-1),
    })
    const body = await unseen()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_type: 'day', entity_id: '2026-07-15', new_count: 1 })
  })

  it('does NOT badge a private thread Hermes has not answered yet (still the "Thinking..." placeholder)', async () => {
    task('task-2', 'Task Two')
    entry({
      id: 'root-task-pending', entity_type: 'task', entity_id: 'task-2', parent_id: null,
      visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes another question', created_at: sqlTs(-1),
    })
    entry({
      id: 'reply-task-pending', entity_type: 'task', entity_id: 'task-2', parent_id: 'root-task-pending',
      visibility: 'author', actor_slug: 'claude-ai', body: 'Thinking about this... (AI response pending)', created_at: sqlTs(-1),
    })
    expect((await unseen()).data).toHaveLength(0)
  })

  it('does not re-badge once the requester has seen the thread AFTER the answer landed', async () => {
    privateTaskThread()
    seen('task', 'task-1', 'nick-ingraham', 0)
    expect((await unseen()).data).toHaveLength(0)
  })

  // schema-v103 regression: Hermes's answer is an in-place UPDATE of the
  // placeholder row, so reply.created_at is fixed at ASK time forever. Before
  // v103, mark-seen firing ANY time after the ask (even before Hermes answered)
  // would swallow the badge. MANDATORY: last_seen_at sits strictly BETWEEN
  // placeholder-creation and answer-completion, and the thread MUST still badge
  // because answered_at (set only when the answer lands) is after it.
  it('badges an answer even when last_seen_at falls BETWEEN placeholder-creation and answer-completion (schema-v103, the in-place-UPDATE bug class)', async () => {
    task('task-3', 'Task Three')
    entry({
      id: 'root-task-c', entity_type: 'task', entity_id: 'task-3', parent_id: null,
      visibility: 'author', actor_slug: 'nick-ingraham', body: '@hermes a third question', created_at: sqlTs(-3),
    })
    const answeredAt = sqlTs(-1)
    entry({
      // Created at ask time (-3); body/answered_at updated in place at answer time (-1).
      id: 'reply-task-c', entity_type: 'task', entity_id: 'task-3', parent_id: 'root-task-c',
      visibility: 'author', actor_slug: 'claude-ai', body: 'Here is my third answer.', created_at: sqlTs(-3), answered_at: answeredAt,
    })
    seen('task', 'task-3', 'nick-ingraham', -2)
    const body = await unseen()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ entity_type: 'task', entity_id: 'task-3', new_count: 1 })
    // latest_at reflects ANSWER time, not the ask-time created_at.
    expect(body.data[0].latest_at).toBe(answeredAt)
  })
})
