/**
 * api/index.one-activity-store.test.ts -- a comment or note is stored once.
 *
 * Until 2026-10-11 the task and project composers wrote each comment/update to
 * activity_entries AND to activity_log (an "echo"), so any reader of both
 * counted it twice (Lab pulse) and the echo quoted private (@me) notes into a
 * feed with no visibility gate. Drives the REAL worker: POST through the route,
 * then read the store and every reader that used to depend on the echo.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from './index'
import type { Env } from './types'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'
import { nowInstant } from './lib/time'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PI_EMAIL = 'ingra107@umn.edu'
const MEMBER_EMAIL = 'eddin022@umn.edu'
const TASK = 'task_onestore'
const PROJ = 'proj_onestore'
const SLUG = 'onestore-proj'
const POSTED_TYPES = ['comment', 'task_update', 'project_update']

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Data Analyst', member_type: 'research_team', email: MEMBER_EMAIL })
  insertRow(db, 'projects', { id: PROJ, slug: SLUG, title: 'One Store Project', status: 'active' })
  insertRow(db, 'tasks', { id: TASK, title: 'One store task', project_id: PROJ, assignee: 'nick-ingraham', status: 'todo' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

async function call(method: 'GET' | 'POST', path: string, who: string, body?: unknown) {
  const headers: Record<string, string> = { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env,
    CTX,
  )
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, text, json }
}

const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { c: number }).c

async function postAll(who = PI_EMAIL, prefix = '') {
  expect((await call('POST', `/api/tasks/${TASK}/comments`, who, { content: `${prefix}task comment ONESTORE` })).status).toBe(201)
  expect((await call('POST', `/api/tasks/${TASK}/updates`, who, { content: `${prefix}task note ONESTORE` })).status).toBe(201)
  expect((await call('POST', `/api/projects/${SLUG}/comments`, who, { content: `${prefix}project comment ONESTORE` })).status).toBe(201)
  expect((await call('POST', `/api/projects/${SLUG}/updates`, who, { content: `${prefix}project update ONESTORE` })).status).toBe(201)
}

describe('a comment or note is stored once', () => {
  it('each of the four composers writes one activity_entries row and no activity_log row', async () => {
    await postAll()
    expect(count("SELECT COUNT(*) AS c FROM activity_entries WHERE body LIKE '%ONESTORE'")).toBe(4)
    expect(count("SELECT COUNT(*) AS c FROM activity_log WHERE type IN ('comment', 'task_update', 'project_update')")).toBe(0)
    expect(count("SELECT COUNT(*) AS c FROM activity_log WHERE description LIKE '%ONESTORE%'")).toBe(0)
  })

  it('GET /api/activity shows each post once, shaped like an activity_log row', async () => {
    await postAll()
    const r = await call('GET', '/api/activity?limit=50', PI_EMAIL)
    expect(r.status).toBe(200)
    const rows = r.json.data as Array<{ type: string; description: string; actor: string; related_id: string; related_type: string }>
    const posted = rows.filter((x) => POSTED_TYPES.includes(x.type))
    expect(posted.map((x) => x.type).sort()).toEqual(['comment', 'comment', 'project_update', 'task_update'])
    expect(posted.every((x) => x.actor === 'nick-ingraham')).toBe(true)
    expect(posted.find((x) => x.type === 'task_update')).toMatchObject({
      related_type: 'task',
      related_id: TASK,
      description: 'Posted note on "One store task": "task note ONESTORE"',
    })
    expect(posted.find((x) => x.type === 'project_update')).toMatchObject({ related_type: 'project', related_id: PROJ })
    expect(rows.filter((x) => x.description.includes('ONESTORE')).length).toBe(2)
  })

  it('an @me note reaches the author and no one else, in the feed and in search', async () => {
    await postAll(PI_EMAIL, '@me ')
    const own = await call('GET', '/api/activity?limit=50', PI_EMAIL)
    expect(own.text).toContain('ONESTORE')
    const other = await call('GET', '/api/activity?limit=50', MEMBER_EMAIL)
    expect(other.status).toBe(200)
    expect(other.text).not.toContain('ONESTORE')
    expect((await call('GET', '/api/search?q=ONESTORE', PI_EMAIL)).text).toContain('task note ONESTORE')
    const search = await call('GET', '/api/search?q=ONESTORE', MEMBER_EMAIL)
    expect(search.json.data).toEqual([])
  })

  it('a hidden thread leaves the feed', async () => {
    await postAll()
    db.prepare("UPDATE activity_entries SET hidden_at = datetime('now')").run()
    const r = await call('GET', '/api/activity?limit=50', PI_EMAIL)
    expect(r.text).not.toContain('ONESTORE')
  })

  it('the lab-wide heatmap counts each post once', async () => {
    await postAll()
    const r = await call('GET', '/api/activity/heatmap?days=3', PI_EMAIL)
    expect(r.status).toBe(200)
    const total = Object.values(r.json.data as Record<string, number>).reduce((a, b) => a + b, 0)
    expect(total).toBe(4)
  })

  it('team pulse counts the poster as active once and the project update once', async () => {
    await postAll()
    const r = await call('GET', '/api/team/pulse?hours=48', PI_EMAIL)
    expect(r.status).toBe(200)
    expect(r.json.data.active_this_week).toBe(1)
    expect(r.json.data.totals.updates).toBe(1)
  })

  it('the task drawer shows a comment once and hides an old echo row', async () => {
    await postAll()
    insertRow(db, 'activity_log', { id: 'al-old', type: 'comment', description: 'Commented on task', actor: 'nick-ingraham', related_id: TASK, related_type: 'task' })
    const r = await call('GET', `/api/tasks/${TASK}/detail`, PI_EMAIL)
    expect(r.status).toBe(200)
    expect(r.text.split('task comment ONESTORE').length - 1).toBe(1)
    expect(r.text).not.toContain('Commented on task')
  })

  // Posts made before 2026-10-11 left an activity_log echo that nothing deleted.
  // Seed a real audit row plus, for one post of each shape, the post and its echo.
  function seedLegacy() {
    const ts = nowInstant().replace('T', ' ').slice(0, 19)
    insertRow(db, 'activity_entries', { id: 'ae-leg-note', kind: 'update', entity_type: 'task', entity_id: TASK, actor_slug: 'nick-ingraham', body: 'LEGACYNOTE', visibility: 'team', created_at: ts })
    insertRow(db, 'activity_entries', { id: 'ae-leg-com', kind: 'comment', entity_type: 'task', entity_id: TASK, actor_slug: 'nick-ingraham', body: 'LEGACYCOM', visibility: 'team', created_at: ts })
    insertRow(db, 'activity_entries', { id: 'ae-leg-proj', kind: 'update', entity_type: 'project', entity_id: PROJ, project_id: PROJ, actor_slug: 'nick-ingraham', body: 'LEGACYPROJ', visibility: 'team', created_at: ts })
    insertRow(db, 'activity_log', { id: 'al-leg-note', type: 'task_update', description: 'Posted note on "One store task": "LEGACYNOTE"', actor: 'nick-ingraham', related_id: TASK, related_type: 'task', timestamp: ts })
    insertRow(db, 'activity_log', { id: 'al-leg-com', type: 'comment', description: 'Commented on task', actor: 'nick-ingraham', related_id: TASK, related_type: 'task', timestamp: ts })
    insertRow(db, 'activity_log', { id: 'al-leg-proj', type: 'project_update', description: `Posted update on ${SLUG}: "LEGACYPROJ"`, actor: PI_EMAIL, related_id: SLUG, related_type: 'project', timestamp: ts })
    insertRow(db, 'activity_log', { id: 'al-audit', type: 'project_update', description: 'Updated project fields: status', actor: 'nick-ingraham', related_id: PROJ, related_type: 'project', timestamp: ts })
  }

  it('a legacy echo row does not repeat its post in the feed, heatmap, prep, cadence or search', async () => {
    seedLegacy()
    const feed = (await call('GET', '/api/activity?limit=50', PI_EMAIL)).json.data as Array<{ id: string }>
    expect(feed.map((x) => x.id).sort()).toEqual(['ae-leg-com', 'ae-leg-note', 'ae-leg-proj', 'al-audit'])
    const heat = (await call('GET', '/api/activity/heatmap?days=3', PI_EMAIL)).json.data as Record<string, number>
    expect(Object.values(heat).reduce((a, b) => a + b, 0)).toBe(4)
    insertRow(db, 'meetings', { id: 'mtg-leg', title: 'M', date: '2099-01-01', type: 'lab', audience: 'lab' })
    const prep = (await call('GET', '/api/meetings/mtg-leg/prep', PI_EMAIL)).json.data.recentActivity as Array<{ description: string }>
    expect(prep.length).toBe(4)
    const search = await call('GET', '/api/search?q=LEGACYPROJ', PI_EMAIL)
    expect(search.text).not.toContain('al-leg-proj')
    const cad = await call('GET', '/api/meetings/cadence-check', PI_EMAIL)
    expect(cad.status).toBe(200)
  })

  it('meeting prep lists the posts once', async () => {
    await postAll()
    insertRow(db, 'meetings', { id: 'mtg-onestore', title: 'M', date: '2099-01-01', type: 'lab', audience: 'lab' })
    const r = await call('GET', '/api/meetings/mtg-onestore/prep', PI_EMAIL)
    expect(r.status).toBe(200)
    const rows = r.json.data.recentActivity as Array<{ type: string }>
    expect(rows.filter((x) => POSTED_TYPES.includes(x.type)).length).toBe(4)
  })
})
