// phase1b-acl.test.ts — Phase 1b-A caller-identity + ownership + gating ACL
//
// Covers the 9 endpoint groups hardened in hub-hardening-2026-05-27:
//   1. Notifications — GET list/count (auth required; recipient from JWT not param)
//   2. Notifications — POST /:id/read (owner-or-PI gate)
//   3. Sessions — PI-or-API-key gate
//   4. Lane3 — PI-or-API-key gate
//   5. Inbox-events GET — PI-or-API-key gate
//   6. Regulatory ICS — auth-only gate (not PI-only)
//   7. Uploads create (url + done) — canAccessEntity on context/entityId
//   8. Decisions create — resolveActor rejects foreign decided_by for non-PI
//   9. (retired 2026-09-30, #8836: the email-drafts sync-bulk route was removed)
//  10. File-activity sync — PI-or-API-key gate
//  11. Meeting detail — full row for authed, public cols for unauth
//
// Security-review follow-up (hub-hardening-2026-05-27 findings):
//  I-1: Fail-closed — absent request → denied on sessions/lane3/inbox-events GET/regulatory ICS
//  I-3: Meeting sub-routes (agenda/prep/generate-agenda) — unauth → 401
//  I-4: Null-assignee guard — unassigned-task file attach by non-owner non-PI ALLOWED
//  M-2: Inbox sync-bulk write — non-PI JWT → 403, API-key → allowed
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut gave each case its own regex-routed stub (a canned project
// category for ANY `FROM projects`, `{ recipient_slug }` for any notification
// lookup, writes that always "succeeded"), so an allowed write was never seen
// to land and a refused one never seen to write nothing. Here one world is
// seeded per test -- the PI and a team member, a PB project and a team
// project, their tasks, notifications, a regulatory item and a meeting -- and
// each gate case reads the stored rows. The R2 binding (env.FILES) is an
// external service and stays a fake.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleNotifications, handleNotificationCount, handleMarkNotificationRead } from './notifications'
import { handleGetSessions } from './sessions'
import { handleLane3List } from './lane3'
import { handleInboxEvents, handleSyncBulkInboxEvents } from './inbox-events'
import { handleRegulatoryIcs } from './regulatory'
import { handleUploadUrl, handleUploadDone, handleGetFile } from './uploads'
import { handleCreateDecision } from './decisions'
import { handleSyncFileActivity } from './file-activity'
import { handleGetMeeting, handleGetAgendaItems, handleMeetingPrep, handleGenerateAgenda } from './meetings'
import type { Env } from '../helpers'
import { viewerDb, personViewer } from '../lib/viewer-db'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

// ── Shared test primitives ────────────────────────────────────────────────────

const PI_EMAIL = 'ingra107@umn.edu'
// nate@umn.edu → LUT maps 'nate' → 'nate-mesfin'
const NON_PI_EMAIL = 'nate@umn.edu'
const PI_SLUG = 'nick-ingraham'
const NON_PI_SLUG = 'nate-mesfin'
const VALID_API_KEY = 'Bearer valid-test-api-key'

/** Request that looks like a PI JWT (test-mode bypass). */
function piRequest(extra: RequestInit = {}): Request {
  return new Request('https://x/api/test', {
    method: 'GET',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'X-Test-User': PI_EMAIL,
    },
    ...extra,
  })
}

/** Request that looks like a non-PI JWT. */
function nonPiRequest(extra: RequestInit = {}): Request {
  return new Request('https://x/api/test', {
    method: 'GET',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'X-Test-User': NON_PI_EMAIL,
    },
    ...extra,
  })
}

/** Unauthenticated request (no headers). */
function unauthRequest(extra: RequestInit = {}): Request {
  return new Request('https://x/api/test', { method: 'GET', ...extra })
}

/** Request carrying a valid API key in Authorization: Bearer. */
function apiKeyRequest(extra: RequestInit = {}): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: { Authorization: VALID_API_KEY },
    ...extra,
  })
}

let db: InstanceType<typeof Database>

beforeEach(() => {
  db = prodSchemaDb()
  // The chain seeds pi_emails with the lab's own list; this suite's PI is PI_EMAIL.
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: PI_SLUG, email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate', slug: NON_PI_SLUG, email: NON_PI_EMAIL })
  insertRow(db, 'projects', { id: 'proj_pb', slug: 'pb-secret', title: 'PB secret', category: 'Peripheral Brain' })
  insertRow(db, 'projects', { id: 'proj_mn', slug: 'mnccore-project', title: 'Team project', category: 'MNCCORE' })
  for (const id of ['task-1', 'task-123']) {
    insertRow(db, 'tasks', { id, title: id, status: 'todo', priority: 'medium', assignee: NON_PI_SLUG })
  }
})

/** Env over the real database; `overrides` add bindings (R2 credentials, FILES). */
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
    PB_API_KEY: 'valid-test-api-key',
    DB: d1Adapter(db),
    ...overrides,
  } as unknown as Env
}
const piEnv = makeEnv
const count = (sql: string, ...v: unknown[]) => (db.prepare(sql).get(...v) as { n: number }).n

// ── 1. Notifications — auth required, recipient from JWT ──────────────────────

describe('handleNotifications — auth gate + recipient from JWT', () => {
  beforeEach(() => {
    insertRow(db, 'notifications', { id: 'n-pi', recipient_slug: PI_SLUG, type: 'update', source_type: 'x', source_id: 'x', title: 'For Nick' })
    insertRow(db, 'notifications', { id: 'n-nate', recipient_slug: NON_PI_SLUG, type: 'update', source_type: 'x', source_id: 'x', title: 'For Nate' })
  })

  it('returns 401 for unauthenticated callers (list)', async () => {
    const res = await handleNotifications(new URL('https://x/api/notifications'), unauthRequest(), makeEnv())
    expect(res.status).toBe(401)
  })

  it('returns 401 for unauthenticated callers (count)', async () => {
    const res = await handleNotificationCount(new URL('https://x/api/notifications/count'), unauthRequest(), makeEnv())
    expect(res.status).toBe(401)
  })

  it('returns 200 for an authenticated caller (list), with only their own notifications', async () => {
    const res = await handleNotifications(new URL('https://x/api/notifications'), piRequest(), piEnv())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ id: string }> }
    expect(body.data.map((n) => n.id)).toEqual(['n-pi'])
  })

  it('ignores ?recipient= param — the list is the JWT-derived slug\'s', async () => {
    const res = await handleNotifications(new URL(`https://x/api/notifications?recipient=${NON_PI_SLUG}`), piRequest(), piEnv())
    const body = await res.json() as { data: Array<{ id: string; recipient_slug: string }> }
    // Must be the PI's own (nick-ingraham), not the spoofed recipient's.
    expect(body.data.map((n) => n.id)).toEqual(['n-pi'])
  })
})

// ── 2. Notifications — POST /:id/read owner-or-PI gate ───────────────────────

describe('handleMarkNotificationRead — owner-or-PI gate', () => {
  beforeEach(() => {
    insertRow(db, 'notifications', { id: 'n-nate', recipient_slug: NON_PI_SLUG, type: 'update', source_type: 'x', source_id: 'x', title: 'For Nate' })
    insertRow(db, 'notifications', { id: 'n-pi', recipient_slug: PI_SLUG, type: 'update', source_type: 'x', source_id: 'x', title: 'For Nick' })
  })
  const read = (id: string) => (db.prepare('SELECT read FROM notifications WHERE id = ?').get(id) as { read: number }).read

  it('returns 401 when unauthenticated, and marks nothing', async () => {
    const res = await handleMarkNotificationRead('n-nate', unauthRequest({ method: 'POST' }), makeEnv())
    expect(res.status).toBe(401)
    expect(read('n-nate')).toBe(0)
  })

  it('allows the recipient (owner) to mark their own notification read', async () => {
    const res = await handleMarkNotificationRead('n-nate', nonPiRequest({ method: 'POST' }), makeEnv())
    expect(res.status).toBe(200)
    expect(read('n-nate')).toBe(1)
  })

  it('returns 403 when a non-PI tries to mark another user\'s notification read', async () => {
    // Non-PI caller (nate-mesfin) tries to mark nick-ingraham's notification
    const res = await handleMarkNotificationRead('n-pi', nonPiRequest({ method: 'POST' }), makeEnv())
    expect(res.status).toBe(403)
    expect(read('n-pi')).toBe(0)
  })

  it('allows PI to mark any notification read', async () => {
    const res = await handleMarkNotificationRead('n-nate', piRequest({ method: 'POST' }), makeEnv())
    expect(res.status).toBe(200)
    expect(read('n-nate')).toBe(1)
  })

  it('returns 404 when notification does not exist', async () => {
    const res = await handleMarkNotificationRead('missing-id', piRequest({ method: 'POST' }), makeEnv())
    expect(res.status).toBe(404)
  })
})

// ── 3. Sessions — PI-or-API-key gate ────────────────────────────────────────

describe('handleGetSessions — PI-or-API-key gate', () => {
  const baseUrl = new URL('https://x/api/sessions?seq_after=0')

  it('returns 403 for unauthenticated callers', async () => {
    const res = await handleGetSessions(baseUrl, piEnv(), unauthRequest())
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI authenticated team members', async () => {
    const res = await handleGetSessions(baseUrl, piEnv(), nonPiRequest())
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI callers', async () => {
    const res = await handleGetSessions(baseUrl, piEnv(), piRequest())
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const res = await handleGetSessions(baseUrl, makeEnv(), apiKeyRequest())
    expect(res.status).toBe(200)
  })

  it('still returns 400 when seq_after is missing (PI passes gate, hits param validation)', async () => {
    const res = await handleGetSessions(new URL('https://x/api/sessions'), piEnv(), piRequest())
    expect(res.status).toBe(400)
  })
})

// ── 4. Lane3 — PI-or-API-key gate ────────────────────────────────────────────

describe('handleLane3List — PI-or-API-key gate', () => {
  const baseUrl = new URL('https://x/api/lane3/agent_knowledge?seq_after=0')

  it('returns 403 for unauthenticated callers', async () => {
    const res = await handleLane3List('agent_knowledge', baseUrl, piEnv(), unauthRequest())
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI team members', async () => {
    const res = await handleLane3List('agent_knowledge', baseUrl, piEnv(), nonPiRequest())
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI callers', async () => {
    const res = await handleLane3List('agent_knowledge', baseUrl, piEnv(), piRequest())
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const res = await handleLane3List('agent_knowledge', baseUrl, makeEnv(), apiKeyRequest())
    expect(res.status).toBe(200)
  })

  it('returns 400 for unknown table names (gate fires before table validation)', async () => {
    const url = new URL('https://x/api/lane3/unknown_table?seq_after=0')
    const res = await handleLane3List('unknown_table', url, piEnv(), piRequest())
    expect(res.status).toBe(400)
  })
})

// ── 5. Inbox-events GET — PI-or-API-key gate ─────────────────────────────────

describe('handleInboxEvents — PI-or-API-key gate', () => {
  const baseUrl = new URL('https://x/api/inbox-events')
  beforeEach(() => {
    insertRow(db, 'inbox_events', { id: 'evt_acl_1', source: 'hub_ui', raw_text: 'private capture', captured_at: '2026-05-27T10:00:00Z' })
  })

  it('returns 403 for unauthenticated callers, and leaks no capture text', async () => {
    const res = await handleInboxEvents(baseUrl, piEnv(), unauthRequest())
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('private capture')
  })

  it('returns 403 for non-PI team members', async () => {
    const res = await handleInboxEvents(baseUrl, piEnv(), nonPiRequest())
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('private capture')
  })

  it('returns 200 for PI callers, with the capture', async () => {
    const res = await handleInboxEvents(baseUrl, piEnv(), piRequest())
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('private capture')
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const res = await handleInboxEvents(baseUrl, makeEnv(), apiKeyRequest())
    expect(res.status).toBe(200)
  })
})

// ── 6. Regulatory ICS — auth-only (not PI) ──────────────────────────────────

describe('handleRegulatoryIcs — auth-only gate (not PI-only)', () => {
  beforeEach(() => {
    insertRow(db, 'regulatory_items', {
      id: 'reg1', project_id: 'proj_mn', title: 'IRB Protocol', item_type: 'irb',
      renewal_due: '2026-12-31', expiration_date: '2026-12-31', protocol_number: 'IRB-001', notes: 'test',
    })
  })

  it('returns 401 for unauthenticated callers', async () => {
    const res = await handleRegulatoryIcs('reg1', makeEnv(), unauthRequest())
    expect(res.status).toBe(401)
  })

  it('returns 200 for a non-PI authenticated team member (team CAN access iCal)', async () => {
    const res = await handleRegulatoryIcs('reg1', makeEnv(), nonPiRequest())
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('IRB Protocol')
  })

  it('returns 200 for PI callers', async () => {
    const res = await handleRegulatoryIcs('reg1', makeEnv(), piRequest())
    expect(res.status).toBe(200)
  })
})

// ── 7. Uploads create — canAccessEntity on context ───────────────────────────

describe('handleUploadUrl / handleUploadDone — canAccessEntity on context', () => {
  function uploadsEnv(extra: Partial<Env> = {}) {
    return makeEnv({ R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret', CF_ACCOUNT_ID: 'test-account', ...extra } as unknown as Env)
  }
  function post(path: string, email: string, body: unknown) {
    return new Request(`https://x${path}`, {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': email, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  const attachments = () => db.prepare('SELECT entity_type, entity_id, r2_key, uploaded_by FROM file_attachments ORDER BY r2_key').all()
  /** Nate's own handle: he is on no project here, so pb-secret is one he is not on. */
  const asNate = (e: Env) => ({ ...e, DB: viewerDb(e.DB, personViewer({ slug: 'nate-mesfin', email: NON_PI_EMAIL, pi: false })) }) as Env

  it('handleUploadUrl: blocks a non-member uploading to a project they are not on', async () => {
    const req = post('/api/upload/url', NON_PI_EMAIL, { filename: 'secret.pdf', contentType: 'application/pdf', context: { type: 'project', id: 'pb-secret' } })
    const res = await handleUploadUrl(req, { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, asNate(uploadsEnv()))
    expect(res.status).toBe(403)
  })

  it('handleUploadUrl: allows non-PI uploading to a non-PB project', async () => {
    const req = post('/api/upload/url', NON_PI_EMAIL, { filename: 'report.pdf', contentType: 'application/pdf', context: { type: 'project', id: 'mnccore-project' } })
    const res = await handleUploadUrl(req, { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, uploadsEnv())
    expect(res.status).toBe(200)
  })

  it('handleUploadUrl: presigned URL is path-style with the bucket segment', async () => {
    // R2's S3 API resolves the first path segment as the bucket. Presigning
    // without it 403'd every PUT since the feature shipped (bucket-less URL bug).
    const req = post('/api/upload/url', NON_PI_EMAIL, { filename: 'shot.png', contentType: 'image/png', context: { type: 'task', id: 'task-123' } })
    const res = await handleUploadUrl(req, { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, uploadsEnv())
    expect(res.status).toBe(200)
    const { data } = await res.json() as { data: { uploadUrl: string; key: string } }
    expect(new URL(data.uploadUrl).pathname).toBe(`/mnccore-files/${data.key}`)
  })

  it('handleUploadDone: blocks a non-member committing a file record on a project they are not on, and stores nothing', async () => {
    const req = post('/api/upload/done', NON_PI_EMAIL, {
      key: 'project/pb-secret/file.pdf', filename: 'file.pdf', contentType: 'application/pdf', sizeBytes: 1024, entityType: 'project', entityId: 'pb-secret',
    })
    const res = await handleUploadDone(req, { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, asNate(uploadsEnv()))
    expect(res.status).toBe(403)
    expect(attachments()).toEqual([])
  })

  it('handleUploadDone: allows PI to commit a file record on a PB project', async () => {
    const req = post('/api/upload/done', PI_EMAIL, {
      key: 'project/pb-secret/file.pdf', filename: 'file.pdf', contentType: 'application/pdf', sizeBytes: 1024, entityType: 'project', entityId: 'pb-secret',
    })
    const res = await handleUploadDone(req, { email: PI_EMAIL, name: 'Nick', slug: 'nick-ingraham' }, uploadsEnv())
    expect(res.status).toBe(200)
    expect(attachments()).toMatchObject([{ entity_type: 'project', r2_key: 'project/pb-secret/file.pdf' }])
  })

  it('handleUploadDone: refuses a record whose object is not in R2 (FILES bound, head misses), and stores nothing', async () => {
    const req = post('/api/upload/done', NON_PI_EMAIL, {
      key: 'task/task-1/missing.png', filename: 'missing.png', contentType: 'image/png', sizeBytes: 1, entityType: 'task', entityId: 'task-1',
    })
    const res = await handleUploadDone(req, { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, uploadsEnv({ FILES: { head: async () => null } } as unknown as Env))
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(attachments()).toEqual([])
  })

  it('handleUploadDone: response carries a same-origin, non-expiring url for the composer to insert', async () => {
    const req = post('/api/upload/done', NON_PI_EMAIL, {
      key: 'task/task-1/1700000000000-shot.png', filename: 'shot.png', contentType: 'image/png', sizeBytes: 512, entityType: 'task', entityId: 'task-1',
    })
    const res = await handleUploadDone(req, { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, uploadsEnv())
    expect(res.status).toBe(200)
    const data = await res.json() as { data?: { url?: string } }
    // Same-origin path (not a presigned R2 URL — those expire in 1h, useless
    // for a link embedded permanently in a comment body).
    expect(data.data?.url).toBe('/api/files/task/task-1/1700000000000-shot.png/raw')
    expect(attachments()).toMatchObject([{ entity_type: 'task', entity_id: 'task-1', r2_key: 'task/task-1/1700000000000-shot.png' }])
  })
})

// ── 7b. GET /api/files/:key raw-bytes route (paste-to-image render path) ─────

describe('handleGetFile — raw=true streams bytes for <img src>', () => {
  beforeEach(() => {
    insertRow(db, 'file_attachments', {
      id: 'fa1', entity_type: 'task', entity_id: 'task-1', filename: 'shot.png', content_type: 'image/png', r2_key: 'task/task-1/shot.png',
    })
  })

  it('streams the object body with its content-type when FILES.get resolves', async () => {
    const env = makeEnv({
      FILES: {
        get: async (_key: string) => ({
          body: new Response('fake-bytes').body,
          httpMetadata: { contentType: 'image/png' },
          writeHttpMetadata: (headers: Headers) => headers.set('content-type', 'image/png'),
        }),
      },
    } as unknown as Env)
    const res = await handleGetFile('task/task-1/shot.png', env, false, true)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(await res.text()).toBe('fake-bytes')
  })

  it('returns 404 when the R2 object is missing (never silently 200s an empty image)', async () => {
    const res = await handleGetFile('task/task-1/shot.png', makeEnv({ FILES: { get: async () => null } } as unknown as Env), false, true)
    expect(res.status).toBe(404)
  })

  it('returns 503 (not a silent empty 200) when the FILES binding itself is absent', async () => {
    const res = await handleGetFile('task/task-1/shot.png', makeEnv(), false, true)
    expect(res.status).toBe(503)
  })

  it('raw=false (default) is unchanged — still the presigned-URL JSON envelope', async () => {
    const env = makeEnv({ R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', CF_ACCOUNT_ID: 'a' } as unknown as Env)
    const res = await handleGetFile('task/task-1/shot.png', env, false, false)
    expect(res.status).toBe(200)
    const data = await res.json() as { data?: { downloadUrl?: string } }
    expect(data.data?.downloadUrl).toContain('X-Amz-Signature')
  })
})

// ── 8. Decisions create — resolveActor rejects foreign decided_by ─────────────

describe('handleCreateDecision — resolveActor for decided_by', () => {
  function decisionReq(email: string, body: unknown) {
    return new Request('https://x/api/decisions', {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': email, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  const decisions = () => db.prepare('SELECT title, decided_by FROM hub_decisions ORDER BY title').all() as Array<{ title: string; decided_by: string }>
  let before: number
  beforeEach(() => { before = count('SELECT COUNT(*) AS n FROM hub_decisions') })

  it('non-PI caller cannot spoof a foreign decided_by, and nothing is stored', async () => {
    const res = await handleCreateDecision(decisionReq(NON_PI_EMAIL, { title: 'Spoof attempt', decided_by: PI_SLUG }), { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, piEnv())
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/not authorized/i)
    expect(count('SELECT COUNT(*) AS n FROM hub_decisions')).toBe(before)
  })

  it('non-PI caller with no decided_by override is stored under their own slug', async () => {
    const res = await handleCreateDecision(decisionReq(NON_PI_EMAIL, { title: 'Own decision' }), { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, piEnv())
    expect(res.status).toBe(201)
    expect(decisions().find((d) => d.title === 'Own decision')?.decided_by).toBe(NON_PI_SLUG)
  })

  it('PI caller may delegate decided_by to another team member', async () => {
    const res = await handleCreateDecision(decisionReq(PI_EMAIL, { title: 'Delegated', decided_by: NON_PI_SLUG }), { email: PI_EMAIL, name: 'Nick', slug: 'nick-ingraham' }, piEnv())
    expect(res.status).toBe(201)
    expect(decisions().find((d) => d.title === 'Delegated')?.decided_by).toBe(NON_PI_SLUG)
  })

  it('unknown decided_by slug returns 400 even for PI, and nothing is stored', async () => {
    const res = await handleCreateDecision(decisionReq(PI_EMAIL, { title: 'Ghost', decided_by: 'ghost-user' }), { email: PI_EMAIL, name: 'Nick', slug: 'nick-ingraham' }, piEnv())
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/unknown actor/i)
    expect(count('SELECT COUNT(*) AS n FROM hub_decisions')).toBe(before)
  })
})

// ── 10. File-activity sync — PI-or-API-key gate ──────────────────────────────

describe('handleSyncFileActivity — PI-or-API-key gate', () => {
  const ENTRIES = { entries: [{ date: '2026-05-27', project_id: 'proj_mn', file_count: 1, total_events: 1 }] }
  function req(headers: Record<string, string>) {
    return new Request('https://x/api/file-activity/sync', {
      method: 'POST', body: JSON.stringify(ENTRIES), headers: { 'Content-Type': 'application/json', ...headers },
    })
  }
  const rows = () => count('SELECT COUNT(*) AS n FROM file_activity_daily')

  it('returns 403 for unauthenticated callers, and stores nothing', async () => {
    const res = await handleSyncFileActivity(req({}), piEnv())
    expect(res.status).toBe(403)
    expect(rows()).toBe(0)
  })

  it('returns 403 for non-PI team members, and stores nothing', async () => {
    const res = await handleSyncFileActivity(req({ 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': NON_PI_EMAIL }), piEnv())
    expect(res.status).toBe(403)
    expect(rows()).toBe(0)
  })

  it('returns 200 for PI callers, and stores the day', async () => {
    const res = await handleSyncFileActivity(req({ 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': PI_EMAIL }), piEnv())
    expect(res.status).toBe(200)
    expect(rows()).toBe(1)
  })

  it('returns 200 for API-key callers (PB sync service); a re-sync of the same (date, project) upserts', async () => {
    expect((await handleSyncFileActivity(req({ Authorization: VALID_API_KEY }), makeEnv())).status).toBe(200)
    expect((await handleSyncFileActivity(req({ Authorization: VALID_API_KEY }), makeEnv())).status).toBe(200)
    expect(rows()).toBe(1)
  })
})

// ── 11. Meeting detail — full row (the route is auth: 'authed'; anonymous
// callers are refused before the handler, api/index.anon-reads.test.ts) ──────

describe('handleGetMeeting — full row', () => {
  beforeEach(() => {
    insertRow(db, 'meetings', {
      id: 'mtg1', date: '2026-05-28', title: 'Team standup', type: 'biweekly', status: 'upcoming', facilitator: PI_SLUG,
      agenda: 'PRIVATE AGENDA', notes: 'INTERNAL NOTES', decisions: 'TEAM DECISIONS', attendees: 'everyone',
    })
  })

  it('authenticated callers get the full row (including agenda/notes/decisions)', async () => {
    const res = await handleGetMeeting('mtg1', makeEnv())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data).toHaveProperty('agenda', 'PRIVATE AGENDA')
    expect(body.data).toHaveProperty('notes', 'INTERNAL NOTES')
    expect(body.data).toHaveProperty('decisions', 'TEAM DECISIONS')
  })

  it('returns 404 when meeting does not exist', async () => {
    const res = await handleGetMeeting('ghost-mtg', makeEnv())
    expect(res.status).toBe(404)
  })
})

// ── I-1: Fail-closed — absent request → denied on all PI-gated handlers ───────

describe('I-1 fail-closed: absent request → denied (no open-gate legacy path)', () => {
  it('handleGetSessions: absent request → 403', async () => {
    // No request arg — must fail closed, not skip the gate
    const res = await handleGetSessions(new URL('https://x/api/sessions?seq_after=0'), piEnv(), undefined)
    expect(res.status).toBe(403)
  })

  it('handleLane3List: absent request → 403', async () => {
    const res = await handleLane3List('agent_knowledge', new URL('https://x/api/lane3/agent_knowledge?seq_after=0'), piEnv(), undefined)
    expect(res.status).toBe(403)
  })

  // Z1.6 (2026-05-28): handleInboxEvents / handleRegulatoryIcs signatures
  // now require `request: Request` (was `request?: Request`). The fail-closed
  // path for "absent request" is replaced by a compile-time guarantee — the
  // type checker refuses to call the handler without a Request. The Z5.2 lint
  // bans new `request?: Request` signatures in api/routes/*.ts so this gap
  // can't re-open.
})

// ── I-3: Meeting sub-routes — unauth → 401 ───────────────────────────────────

describe('I-3: meeting sub-routes agenda/prep/generate-agenda — unauth → 401', () => {
  beforeEach(() => {
    insertRow(db, 'meetings', { id: 'mtg1', date: '2026-05-28', title: 'Team standup', type: 'biweekly', status: 'upcoming', facilitator: PI_SLUG })
  })

  it('handleGetAgendaItems: unauth (isAuthed=false) → 401', async () => {
    const res = await handleGetAgendaItems('mtg1', makeEnv(), false)
    expect(res.status).toBe(401)
  })

  it('handleGetAgendaItems: authed (isAuthed=true) → 200', async () => {
    const res = await handleGetAgendaItems('mtg1', makeEnv(), true)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('handleMeetingPrep: unauth (isAuthed=false) → 401', async () => {
    const res = await handleMeetingPrep('mtg1', makeEnv(), false)
    expect(res.status).toBe(401)
  })

  it('handleMeetingPrep: authed (isAuthed=true) → 200', async () => {
    const res = await handleMeetingPrep('mtg1', makeEnv(), true)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { meeting: { id: string } } }
    expect(body.data.meeting.id).toBe('mtg1')
  })

  it('handleGenerateAgenda: unauth (isAuthed=false) → 401', async () => {
    const res = await handleGenerateAgenda('mtg1', makeEnv(), false)
    expect(res.status).toBe(401)
  })

  it('handleGenerateAgenda: authed (isAuthed=true) → 200', async () => {
    const res = await handleGenerateAgenda('mtg1', makeEnv(), true)
    expect(res.status).toBe(200)
    const body = await res.json() as { meeting_id: string }
    expect(body.meeting_id).toBe('mtg1')
  })
})

// ── I-4: Null-assignee guard — unassigned task NOT a lockout ─────────────────
//
// The task-file attach/delete gates live inline in index.ts, so the guard
// logic cannot be directly imported. Instead we verify the boolean invariant
// that drives the decision: only block when assignee is non-null AND differs
// AND caller is not PI. This is the exact condition the handler evaluates.

describe('I-4: null-assignee guard boolean invariant', () => {
  // Mirror of the guard in index.ts:
  //   task.assignee != null && task.assignee !== callerSlug && !isPI
  function gateBlocks(assignee: string | null, callerSlug: string, isPI: boolean): boolean {
    return assignee != null && assignee !== callerSlug && !isPI
  }

  it('null assignee — non-owner non-PI: ALLOWED (no lockout)', () => {
    expect(gateBlocks(null, NON_PI_SLUG, false)).toBe(false)
  })

  it('null assignee — any caller: ALLOWED', () => {
    expect(gateBlocks(null, 'any-slug', false)).toBe(false)
    expect(gateBlocks(null, 'any-slug', true)).toBe(false)
  })

  it('assigned to caller — non-PI: ALLOWED (owner)', () => {
    expect(gateBlocks(NON_PI_SLUG, NON_PI_SLUG, false)).toBe(false)
  })

  it('assigned to a different user — non-PI: BLOCKED (foreign owner)', () => {
    expect(gateBlocks(PI_SLUG, NON_PI_SLUG, false)).toBe(true)
  })

  it('assigned to a different user — PI caller: ALLOWED (PI bypasses)', () => {
    expect(gateBlocks(NON_PI_SLUG, PI_SLUG, true)).toBe(false)
  })
})

// ── M-2: Inbox sync-bulk write — non-PI JWT → 403, API-key → allowed ─────────

describe('M-2: handleSyncBulkInboxEvents — PI-or-API-key gate on write path', () => {
  const sampleEvent = {
    id: 'ev_test_01',
    source: 'hub_ui',
    captured_at: '2026-05-27T10:00:00Z',
  }
  function bulkReq(headers: Record<string, string>) {
    return new Request('https://x/api/inbox-events/sync-bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ events: [sampleEvent] }),
    })
  }
  const stored = () => count("SELECT COUNT(*) AS n FROM inbox_events WHERE id = 'ev_test_01'")

  it('returns 403 for unauthenticated callers, and writes nothing', async () => {
    const res = await handleSyncBulkInboxEvents(bulkReq({}), { email: NON_PI_EMAIL, name: 'Anon', slug: 'nate-mesfin' }, piEnv())
    expect(res.status).toBe(403)
    expect(stored()).toBe(0)
  })

  it('returns 403 for non-PI JWT callers, and writes nothing', async () => {
    const res = await handleSyncBulkInboxEvents(
      bulkReq({ 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': NON_PI_EMAIL }),
      { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, piEnv(),
    )
    expect(res.status).toBe(403)
    expect(stored()).toBe(0)
  })

  it('returns 200 for PI JWT callers, and the event is stored', async () => {
    const res = await handleSyncBulkInboxEvents(
      bulkReq({ 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': PI_EMAIL }),
      { email: PI_EMAIL, name: 'Nick', slug: 'nick-ingraham' }, piEnv(),
    )
    expect(res.status).toBe(200)
    expect(stored()).toBe(1)
  })

  it('returns 200 for API-key callers (PB sync service), and the event is stored', async () => {
    const res = await handleSyncBulkInboxEvents(bulkReq({ Authorization: VALID_API_KEY }), { email: 'system@pb', name: 'PB Sync', slug: 'system' }, makeEnv())
    expect(res.status).toBe(200)
    expect(stored()).toBe(1)
  })
})
