// Two morning-list checks, from a signed-in member's seat through the REAL
// worker, so env.DB is the caller's viewer-bound handle (Rule 90).
//   - A soft-deleted task is not a completion: contributions and team pulse
//     left it in their counts.
//   - A member who cannot see a meeting or decision cannot change it, and is
//     told so: the reorder answered ok after writing nothing, and the outcome
//     route logged activity against a row the member cannot read.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { nowInstant } from '../lib/time'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const NOW = nowInstant()

let db: InstanceType<typeof Database>
let env: Env

async function call(who: string, method: string, path: string, body?: unknown) {
  const res = await worker.fetch(new Request(`https://hub.test${path}`, {
    method,
    headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, CTX)
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

const agendaOrder = (meetingId: string) => db.prepare(
  'SELECT id, sort_order FROM agenda_items WHERE meeting_id = ? ORDER BY id',
).all(meetingId)
const outcomeOf = (id: string) => db.prepare('SELECT outcome, outcome_status FROM hub_decisions WHERE id = ?').get(id)
const outcomeLogs = () => db.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE related_id = 'dec-hidden'").get() as { n: number }

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  insertRow(db, 'meetings', { id: 'mtg-hidden', date: '2026-10-06', title: 'Private', owner_slug: 'nick-ingraham' })
  insertRow(db, 'meetings', { id: 'mtg-mine', date: '2026-10-06', title: 'Casey sync', owner_slug: 'casey-eddington' })
  for (const [id, meeting_id, sort_order] of [['a1', 'mtg-hidden', 1], ['a2', 'mtg-hidden', 2], ['b1', 'mtg-mine', 1], ['b2', 'mtg-mine', 2]] as const) {
    insertRow(db, 'agenda_items', { id, meeting_id, content: id, added_by: 'test', sort_order })
  }
  insertRow(db, 'hub_decisions', { id: 'dec-hidden', title: 'Hidden', decided_by: 'nick-ingraham', meeting_id: 'mtg-hidden' })
  insertRow(db, 'hub_decisions', { id: 'dec-mine', title: 'Mine', decided_by: 'nick-ingraham', meeting_id: 'mtg-mine' })
  const done = (id: string, extra: Record<string, unknown>) => insertRow(db, 'tasks', {
    id, title: id, assignee: 'casey-eddington', status: 'done', priority: 'medium',
    completed: 1, completed_at: NOW, completed_by: 'casey-eddington', ...extra,
  })
  done('task_live', {})
  done('task_gone', { deleted_at: NOW })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: 'k', REQUIRE_AUTH: '1' } as unknown as Env
})

describe('a soft-deleted task is not a completion', () => {
  it('contributions lists only the live task', async () => {
    const { status, body } = await call(CASEY, 'GET', '/api/team/casey-eddington/contributions?period=90')
    expect(status).toBe(200)
    const data = body.data as { tasks: { id: string }[] }
    expect(data.tasks.map((t) => t.id)).toEqual(['task_live'])
  })

  it('team pulse counts only the live task', async () => {
    const { status, body } = await call(CASEY, 'GET', '/api/team/pulse?hours=48')
    expect(status).toBe(200)
    const data = body.data as { activity: { slug: string; completions: number }[]; totals: { completions: number } }
    expect(data.activity.find((m) => m.slug === 'casey-eddington')?.completions).toBe(1)
    expect(data.totals.completions).toBe(1)
  })

  // The same read in two more places: the member and lab-wide heatmaps.
  it.each([['her own', '?slug=casey-eddington'], ['lab-wide', '']])('the %s activity heatmap counts only the live task', async (_label, query) => {
    const { status, body } = await call(CASEY, 'GET', `/api/activity/heatmap${query}`)
    expect(status).toBe(200)
    const days = body.data as Record<string, number>
    expect(Object.values(days).reduce((sum, n) => sum + n, 0)).toBe(1)
  })
})

describe('POST /api/meetings/:id/agenda/reorder from a member\'s seat', () => {
  it('a hidden meeting answers 404 and its order stands', async () => {
    const before = agendaOrder('mtg-hidden')
    const { status } = await call(CASEY, 'POST', '/api/meetings/mtg-hidden/agenda/reorder', { ids: ['a2', 'a1'] })
    expect(agendaOrder('mtg-hidden')).toEqual(before)
    expect(status).toBe(404)
  })

  it('control: on her own meeting the order changes', async () => {
    const { status } = await call(CASEY, 'POST', '/api/meetings/mtg-mine/agenda/reorder', { ids: ['b2', 'b1'] })
    expect(status).toBe(200)
    expect(agendaOrder('mtg-mine')).toEqual([{ id: 'b1', sort_order: 2 }, { id: 'b2', sort_order: 1 }])
  })
})

describe('POST /api/decisions/:id/outcome from a member\'s seat', () => {
  const body = { outcome: 'Changed', outcome_status: 'recorded' }

  it('a hidden decision answers 404, stays as it was, and logs nothing', async () => {
    const before = outcomeOf('dec-hidden')
    const logsBefore = outcomeLogs().n
    const { status } = await call(CASEY, 'POST', '/api/decisions/dec-hidden/outcome', body)
    expect(outcomeOf('dec-hidden')).toEqual(before)
    expect(status).toBe(404)
    expect(outcomeLogs().n).toBe(logsBefore)
  })

  it('control: a decision she can see takes the outcome', async () => {
    const { status } = await call(CASEY, 'POST', '/api/decisions/dec-mine/outcome', body)
    expect(status).toBe(200)
    expect(outcomeOf('dec-mine')).toEqual({ outcome: 'Changed', outcome_status: 'recorded' })
  })
})
