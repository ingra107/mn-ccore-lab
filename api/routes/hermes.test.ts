// hermes.test.ts — Phase 10 (Hermes Lane Unification, 2026-07-23): the PB
// listener's leak-safe older-day retrieval, GET /api/hermes/day-index.
//
// PRIVACY-CRITICAL — same leak class as the two 2026-07-22 defects (see
// api/routes/hermes.ts header + seen.ts §9.5.1). The MANDATORY test below
// exercises the dangerous authentication mode (a valid API key, which
// bypasses every other visibility gate in this codebase) and asserts a
// non-owner requester gets zero rows AND the serialized response contains
// none of the owner's content.
//
// A small stateful in-memory D1 stub covers team_members / ai_requests /
// activity_entries, matching the pattern established by seen.test.ts and
// bug-reports.status.test.ts. No live binding, no network, no prod Hub.

import { describe, it, expect } from 'vitest'
import { handleGetHermesDayIndex } from './hermes'
import type { Env } from '../helpers'

type Row = Record<string, unknown>
const API_KEY = 'test-hermes-key'

interface ActivityEntryRow extends Row {
  id: string
  entity_type: string
  entity_id: string // YYYY-MM-DD for 'day' rows
  parent_id: string | null
  actor_slug: string
  body: string
  hidden_at: string | null
  created_at: string // ISO
}

interface AiRequestRow extends Row {
  id: string
  source_id: string
  requested_by: string | null
}

/** SQLite `date(<iso-date>, '<±N> days')` — day-granularity shift on a
 *  YYYY-MM-DD string, matching what the real D1 query computes. */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  // anti-pattern-allowed: pure UTC civil-date arithmetic anchored at T00:00:00Z (all-UTC ops, no local tz, no roll-tomorrow)
  return d.toISOString().slice(0, 10)
}

function makeStatefulEnv(opts: {
  teamSlugs?: string[]
  aiRequests?: AiRequestRow[]
  activityEntries?: ActivityEntryRow[]
} = {}): { env: Env } {
  const teamSlugs = new Set(opts.teamSlugs ?? [])
  const aiRequests = opts.aiRequests ?? []
  const activityEntries = opts.activityEntries ?? []

  const prepare = (sql: string) => {
    const upper = sql.toUpperCase()
    return {
      bind: (...args: unknown[]) => ({
        first: async <T = Row>() => {
          if (upper.includes('FROM TEAM_MEMBERS')) {
            const [slug] = args as [string]
            return (teamSlugs.has(slug) ? ({} as T) : null)
          }
          if (upper.includes('FROM AI_REQUESTS')) {
            const [id] = args as [string]
            const row = aiRequests.find((r) => r.id === id)
            return (row as unknown as T) ?? null
          }
          if (upper.includes('FROM ACTIVITY_ENTRIES') && !upper.includes('BETWEEN')) {
            // The single-row trigger lookup (SELECT entity_type, entity_id,
            // actor_slug FROM activity_entries WHERE id = ? LIMIT 1).
            const [id] = args as [string]
            const row = activityEntries.find((r) => r.id === id)
            return (row as unknown as T) ?? null
          }
          return null
        },
        all: async <T = Row>() => {
          if (upper.includes('FROM ACTIVITY_ENTRIES') && upper.includes('BETWEEN')) {
            // The handler now precomputes the window bounds in JS (shiftIsoDate)
            // and binds plain literal dates — no date() function in the SQL
            // text for the stub to emulate.
            const [slug, start, end, slug2] = args as [string, string, string, string]
            const filtered = activityEntries
              .filter((ae) =>
                ae.entity_type === 'day'
                && ae.parent_id === null
                && ae.actor_slug === slug
                && ae.entity_id >= start
                && ae.entity_id <= end
                && (ae.hidden_at === null || ae.actor_slug === slug2),
              )
              .sort((a, b) =>
                b.entity_id.localeCompare(a.entity_id)
                || b.created_at.localeCompare(a.created_at)
                || b.id.localeCompare(a.id),
              )
            return { results: filtered as unknown as T[] }
          }
          return { results: [] as T[] }
        },
        run: async () => ({ meta: { changes: 0 } }),
      }),
      first: async () => null,
      all: async <T = Row>() => ({ results: [] as T[] }),
      run: async () => ({ meta: { changes: 0 } }),
    }
  }

  const env = { DB: { prepare }, PB_API_KEY: API_KEY } as unknown as Env
  return { env }
}

function req(url: string, opts: { key?: boolean } = { key: true }): Request {
  const headers: Record<string, string> = {}
  if (opts.key !== false) headers['Authorization'] = `Bearer ${API_KEY}`
  return new Request(url, { headers })
}

const EXACT_EMPTY = { data: [], count: 0 }

describe('GET /api/hermes/day-index — API-key gate', () => {
  it('403s without a valid API key', async () => {
    const { env } = makeStatefulEnv()
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=a&requested_by=b', { key: false }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('403s with a wrong API key value (presence alone is not sufficient)', async () => {
    const { env } = makeStatefulEnv()
    const res = await handleGetHermesDayIndex(
      new Request('https://x/api/hermes/day-index?ai_request_id=a&requested_by=b', {
        headers: { Authorization: 'Bearer wrong-key' },
      }),
      env,
    )
    expect(res.status).toBe(403)
  })
})

describe('GET /api/hermes/day-index — LEAK-CLASS REGRESSION (MANDATORY)', () => {
  const ownerOldRoot: ActivityEntryRow = {
    id: 'root-owner-old', entity_type: 'day', entity_id: '2026-07-01', parent_id: null,
    actor_slug: 'owner-slug', body: 'Owner private thoughts about a sensitive topic.',
    hidden_at: null, created_at: '2026-07-01T09:00:00.000Z',
  }
  const ownerOldReply: ActivityEntryRow = {
    id: 'reply-owner-old', entity_type: 'day', entity_id: '2026-07-01', parent_id: 'root-owner-old',
    actor_slug: 'claude-ai', body: 'Hermes answer to the owner, containing owner-only detail.',
    hidden_at: null, created_at: '2026-07-01T09:05:00.000Z',
  }
  const nonownerTrigger: ActivityEntryRow = {
    id: 'trigger-nonowner', entity_type: 'day', entity_id: '2026-07-20', parent_id: null,
    actor_slug: 'nonowner-slug', body: '@hermes what did I discuss last week?',
    hidden_at: null, created_at: '2026-07-20T08:00:00.000Z',
  }
  const nonownerAiRequest: AiRequestRow = {
    id: 'ai-nonowner-1', source_id: 'trigger-nonowner', requested_by: 'nonowner-slug',
  }

  it('a non-owner requester (valid API key, OWN ai_request_id + requested_by) gets ZERO rows for a date containing the owner\'s private day thread, and the response leaks none of the owner\'s content', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug', 'nonowner-slug'],
      aiRequests: [nonownerAiRequest],
      activityEntries: [ownerOldRoot, ownerOldReply, nonownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-nonowner-1&requested_by=nonowner-slug'),
      env,
    )
    expect(res.status).toBe(200)
    const text = await res.clone().text()
    const body = JSON.parse(text) as { data: unknown[]; count: number }
    expect(body).toEqual(EXACT_EMPTY)
    // Belt-and-braces per the leak-regression spec: the RAW serialized text
    // must not contain the owner's root id, date, preview text, or reply text.
    expect(text).not.toContain('root-owner-old')
    expect(text).not.toContain('2026-07-01')
    expect(text).not.toContain('Owner private thoughts')
    expect(text).not.toContain('Hermes answer to the owner')
  })
})

describe('GET /api/hermes/day-index — controls', () => {
  const ownerRoot: ActivityEntryRow = {
    id: 'root-owner-1', entity_type: 'day', entity_id: '2026-07-01', parent_id: null,
    actor_slug: 'owner-slug', body: 'Owner talked about the grant deadline this morning.',
    hidden_at: null, created_at: '2026-07-01T09:00:00.000Z',
  }
  const ownerTrigger: ActivityEntryRow = {
    id: 'trigger-owner', entity_type: 'day', entity_id: '2026-07-20', parent_id: null,
    actor_slug: 'owner-slug', body: '@hermes remind me what I said last week?',
    hidden_at: null, created_at: '2026-07-20T08:00:00.000Z',
  }
  const ownerAiRequest: AiRequestRow = { id: 'ai-owner-1', source_id: 'trigger-owner', requested_by: 'owner-slug' }

  it('the owner sees their own root', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [ownerAiRequest],
      activityEntries: [ownerRoot, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: Array<{ date: string; roots: Row[] }>; count: number }
    expect(res.status).toBe(200)
    expect(body.count).toBe(1)
    expect(body.data[0].date).toBe('2026-07-01')
    expect(body.data[0].roots).toHaveLength(1)
    expect(body.data[0].roots[0]).toMatchObject({
      id: 'root-owner-1',
      preview: 'Owner talked about the grant deadline this morning.',
      hidden: false,
    })
    expect(body.data[0].roots[0].created_at).toBe('2026-07-01T09:00:00.000Z')
  })

  it('the requester\'s own hidden root IS included (dismiss is a frontend verb, not "forget")', async () => {
    const hiddenOwn: ActivityEntryRow = {
      id: 'root-owner-hidden', entity_type: 'day', entity_id: '2026-07-02', parent_id: null,
      actor_slug: 'owner-slug', body: 'A dismissed morning thought.',
      hidden_at: '2026-07-02T10:00:00.000Z', created_at: '2026-07-02T09:00:00.000Z',
    }
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [ownerAiRequest],
      activityEntries: [hiddenOwn, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: Array<{ date: string; roots: Row[] }> }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].roots[0]).toMatchObject({ id: 'root-owner-hidden', hidden: true })
  })

  it('another user\'s hidden root is NOT returned', async () => {
    const otherHidden: ActivityEntryRow = {
      id: 'root-other-hidden', entity_type: 'day', entity_id: '2026-07-02', parent_id: null,
      actor_slug: 'someone-else', body: 'Someone else dismissed this.',
      hidden_at: '2026-07-02T10:00:00.000Z', created_at: '2026-07-02T09:00:00.000Z',
    }
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug', 'someone-else'],
      aiRequests: [ownerAiRequest],
      activityEntries: [otherHidden, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: unknown[]; count: number }
    expect(body).toEqual(EXACT_EMPTY)
  })

  it('another user\'s TEAM-visible day root is excluded too (own-only policy, Nick\'s owner decision)', async () => {
    const teamRoot: ActivityEntryRow = {
      id: 'root-team-other', entity_type: 'day', entity_id: '2026-07-03', parent_id: null,
      actor_slug: 'someone-else', body: 'A team-shared day update from someone else.',
      hidden_at: null, created_at: '2026-07-03T09:00:00.000Z',
    }
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug', 'someone-else'],
      aiRequests: [ownerAiRequest],
      activityEntries: [teamRoot, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: unknown[]; count: number }
    expect(body).toEqual(EXACT_EMPTY)
  })

  it('missing requested_by returns the identical empty payload', async () => {
    const { env } = makeStatefulEnv({ teamSlugs: ['owner-slug'], aiRequests: [ownerAiRequest], activityEntries: [ownerRoot, ownerTrigger] })
    const res = await handleGetHermesDayIndex(req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1'), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('an unknown (never-provisioned) requested_by identity returns empty — never an invented slug', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [{ id: 'ai-x', source_id: 'trigger-x', requested_by: 'ghost-slug' }],
      activityEntries: [ownerRoot],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-x&requested_by=ghost-slug'),
      env,
    )
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('a mismatched requested_by (does not match the stored ai_requests row) returns empty', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug', 'someone-else'],
      aiRequests: [ownerAiRequest],
      activityEntries: [ownerRoot, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=someone-else'),
      env,
    )
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('a valid requester paired with ANOTHER requester\'s ai_request_id returns empty', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug', 'nonowner-slug'],
      aiRequests: [
        ownerAiRequest,
        { id: 'ai-nonowner-2', source_id: 'trigger-nonowner-2', requested_by: 'nonowner-slug' },
      ],
      activityEntries: [
        ownerRoot,
        ownerTrigger,
        { id: 'trigger-nonowner-2', entity_type: 'day', entity_id: '2026-07-20', parent_id: null, actor_slug: 'nonowner-slug', body: '@hermes hi', hidden_at: null, created_at: '2026-07-20T08:00:00.000Z' },
      ],
    })
    // nonowner-slug is a genuinely-resolvable identity, but supplies OWNER's ai_request_id.
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=nonowner-slug'),
      env,
    )
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('a trigger row that is not entity_type="day" returns empty', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [{ id: 'ai-task-trigger', source_id: 'trigger-task', requested_by: 'owner-slug' }],
      activityEntries: [
        ownerRoot,
        { id: 'trigger-task', entity_type: 'task', entity_id: 'task_abc123', parent_id: null, actor_slug: 'owner-slug', body: '@hermes on a task', hidden_at: null, created_at: '2026-07-20T08:00:00.000Z' },
      ],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-task-trigger&requested_by=owner-slug'),
      env,
    )
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('a trigger row authored by a DIFFERENT actor than the resolved requester returns empty (ownership mismatch)', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug', 'someone-else'],
      aiRequests: [{ id: 'ai-spoof', source_id: 'trigger-spoofed', requested_by: 'owner-slug' }],
      activityEntries: [
        ownerRoot,
        { id: 'trigger-spoofed', entity_type: 'day', entity_id: '2026-07-20', parent_id: null, actor_slug: 'someone-else', body: '@hermes', hidden_at: null, created_at: '2026-07-20T08:00:00.000Z' },
      ],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-spoof&requested_by=owner-slug'),
      env,
    )
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('a malformed trigger entity_id (not YYYY-MM-DD) returns empty', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [{ id: 'ai-bad-date', source_id: 'trigger-bad-date', requested_by: 'owner-slug' }],
      activityEntries: [
        ownerRoot,
        { id: 'trigger-bad-date', entity_type: 'day', entity_id: 'not-a-date', parent_id: null, actor_slug: 'owner-slug', body: '@hermes', hidden_at: null, created_at: '2026-07-20T08:00:00.000Z' },
      ],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-bad-date&requested_by=owner-slug'),
      env,
    )
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('an unknown ai_request_id returns empty', async () => {
    const { env } = makeStatefulEnv({ teamSlugs: ['owner-slug'] })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=nope&requested_by=owner-slug'),
      env,
    )
    expect(await res.json()).toEqual(EXACT_EMPTY)
  })

  it('excludes the anchor (triggering) day itself and anything 31+ days back', async () => {
    const anchorDayRoot: ActivityEntryRow = {
      id: 'root-anchor-day', entity_type: 'day', entity_id: '2026-07-20', parent_id: null,
      actor_slug: 'owner-slug', body: 'Same-day root — must not appear (today is automatic context elsewhere).',
      hidden_at: null, created_at: '2026-07-20T07:00:00.000Z',
    }
    const tooOldRoot: ActivityEntryRow = {
      id: 'root-too-old', entity_type: 'day', entity_id: '2026-06-19', parent_id: null,
      actor_slug: 'owner-slug', body: '31 days back — outside the 30-day lookback.',
      hidden_at: null, created_at: '2026-06-19T09:00:00.000Z',
    }
    const withinRoot: ActivityEntryRow = {
      id: 'root-within', entity_type: 'day', entity_id: '2026-06-20', parent_id: null,
      actor_slug: 'owner-slug', body: 'Exactly 30 days back — the earliest included day.',
      hidden_at: null, created_at: '2026-06-20T09:00:00.000Z',
    }
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [ownerAiRequest],
      activityEntries: [anchorDayRoot, tooOldRoot, withinRoot, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: Array<{ date: string }> }
    const dates = body.data.map((d) => d.date)
    expect(dates).toContain('2026-06-20')
    expect(dates).not.toContain('2026-07-20')
    expect(dates).not.toContain('2026-06-19')
  })

  it('per-day cap: only the 5 newest roots on a single busy day are returned, newest-first', async () => {
    const busyDay: ActivityEntryRow[] = Array.from({ length: 7 }, (_, i) => ({
      id: `root-busy-${i}`,
      entity_type: 'day',
      entity_id: '2026-07-05',
      parent_id: null,
      actor_slug: 'owner-slug',
      body: `Busy day root #${i}`,
      hidden_at: null,
      created_at: `2026-07-05T${String(8 + i).padStart(2, '0')}:00:00.000Z`, // 08:00..14:00, increasing
    }))
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [ownerAiRequest],
      activityEntries: [...busyDay, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: Array<{ date: string; roots: Array<{ id: string }> }> }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].roots).toHaveLength(5)
    // Newest-first: root-busy-6 (14:00) down to root-busy-2 (10:00); the two
    // oldest (root-busy-0, root-busy-1) are dropped by the per-day cap.
    expect(body.data[0].roots.map((r) => r.id)).toEqual([
      'root-busy-6', 'root-busy-5', 'root-busy-4', 'root-busy-3', 'root-busy-2',
    ])
  })

  it('total cap: at most 40 roots across all days, dropping the oldest first', async () => {
    // 9 days x 5 roots/day (already at the per-day cap) = 45 roots > 40 total.
    const manyDays: ActivityEntryRow[] = []
    for (let day = 0; day < 9; day++) {
      const date = shiftDate('2026-07-19', -day) // 9 distinct days within the 30-day window
      for (let i = 0; i < 5; i++) {
        manyDays.push({
          id: `root-d${day}-${i}`,
          entity_type: 'day',
          entity_id: date,
          parent_id: null,
          actor_slug: 'owner-slug',
          body: `day ${day} root ${i}`,
          hidden_at: null,
          created_at: `${date}T0${i}:00:00.000Z`,
        })
      }
    }
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [ownerAiRequest],
      activityEntries: [...manyDays, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: Array<{ date: string; roots: unknown[] }>; count: number }
    const totalRoots = body.data.reduce((n, d) => n + d.roots.length, 0)
    expect(totalRoots).toBeLessThanOrEqual(40)
    // The OLDEST day (day 8, furthest back) must be the one trimmed/dropped,
    // not the newest (day 0).
    const dates = body.data.map((d) => d.date)
    expect(dates[0]).toBe(shiftDate('2026-07-19', 0))
    expect(dates).not.toContain(shiftDate('2026-07-19', -8))
  })

  it('preview truncates to the first 100 Unicode characters of the body', async () => {
    const longBody = 'x'.repeat(250)
    const longRoot: ActivityEntryRow = {
      id: 'root-long', entity_type: 'day', entity_id: '2026-07-06', parent_id: null,
      actor_slug: 'owner-slug', body: longBody, hidden_at: null, created_at: '2026-07-06T09:00:00.000Z',
    }
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [ownerAiRequest],
      activityEntries: [longRoot, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: Array<{ roots: Array<{ preview: string }> }> }
    expect(body.data[0].roots[0].preview).toHaveLength(100)
    expect(body.data[0].roots[0].preview).toBe('x'.repeat(100))
  })

  it('the response shape carries ONLY date/id/created_at/preview/hidden — no replies, full body, or metadata', async () => {
    const { env } = makeStatefulEnv({
      teamSlugs: ['owner-slug'],
      aiRequests: [ownerAiRequest],
      activityEntries: [ownerRoot, ownerTrigger],
    })
    const res = await handleGetHermesDayIndex(
      req('https://x/api/hermes/day-index?ai_request_id=ai-owner-1&requested_by=owner-slug'),
      env,
    )
    const body = await res.json() as { data: Array<Record<string, unknown>> }
    expect(Object.keys(body.data[0]).sort()).toEqual(['date', 'roots'])
    const root = (body.data[0].roots as Array<Record<string, unknown>>)[0]
    expect(Object.keys(root).sort()).toEqual(['created_at', 'hidden', 'id', 'preview'])
  })
})
