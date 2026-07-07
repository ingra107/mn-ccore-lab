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
//   9. Email-drafts sync-bulk — PI-or-API-key gate
//  10. File-activity sync — PI-or-API-key gate
//  11. Meeting detail — full row for authed, public cols for unauth
//
// Security-review follow-up (hub-hardening-2026-05-27 findings):
//  I-1: Fail-closed — absent request → denied on sessions/lane3/inbox-events GET/regulatory ICS
//  I-3: Meeting sub-routes (agenda/prep/generate-agenda) — unauth → 401
//  I-4: Null-assignee guard — unassigned-task file attach by non-owner non-PI ALLOWED
//  M-2: Inbox sync-bulk write — non-PI JWT → 403, API-key → allowed
//
// Uses the same lightweight SQL-shape stub pattern as security-gates.test.ts.

import { describe, it, expect } from 'vitest'
import { handleNotifications, handleNotificationCount, handleMarkNotificationRead } from './notifications'
import { handleGetSessions } from './sessions'
import { handleLane3List } from './lane3'
import { handleInboxEvents, handleSyncBulkInboxEvents } from './inbox-events'
import { handleRegulatoryIcs } from './regulatory'
import { handleUploadUrl, handleUploadDone, handleGetFile } from './uploads'
import { handleCreateDecision } from './decisions'
import { handleSyncEmailDrafts } from './email-drafts'
import { handleSyncFileActivity } from './file-activity'
import { handleGetMeeting, handleGetAgendaItems, handleMeetingPrep, handleGenerateAgenda } from './meetings'
import type { Env } from '../helpers'

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

/** Minimal Env that satisfies helpers.ts test-mode auth + PI-email lookup. */
function makeEnv(overrides: Partial<Env> = {}): Env {
  const base = {
    TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
    PB_API_KEY: 'valid-test-api-key',
    DB: {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
      batch: async () => [],
    },
  }
  return { ...base, ...overrides } as unknown as Env
}

/** Env with a lab_settings row giving PI email = PI_EMAIL. */
function piEnv(overrides: Partial<Env> = {}): Env {
  return makeEnv({
    DB: {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (/lab_settings.*pi_emails/.test(sql) || /pi_emails/.test(sql)) {
              return { value: JSON.stringify([PI_EMAIL]) }
            }
            return null
          },
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        first: async () => {
          if (/lab_settings.*pi_emails/.test(sql) || /pi_emails/.test(sql)) {
            return { value: JSON.stringify([PI_EMAIL]) }
          }
          return null
        },
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
      batch: async () => [],
    },
    ...overrides,
  } as unknown as Env)
}

// ── 1. Notifications — auth required, recipient from JWT ──────────────────────

describe('handleNotifications — auth gate + recipient from JWT', () => {
  it('returns 401 for unauthenticated callers (list)', async () => {
    const env = makeEnv()
    const url = new URL('https://x/api/notifications')
    const res = await handleNotifications(url, unauthRequest(), env)
    expect(res.status).toBe(401)
  })

  it('returns 401 for unauthenticated callers (count)', async () => {
    const env = makeEnv()
    const url = new URL('https://x/api/notifications/count')
    const res = await handleNotificationCount(url, unauthRequest(), env)
    expect(res.status).toBe(401)
  })

  it('returns 200 for an authenticated caller (list)', async () => {
    const env = piEnv({
      DB: {
        prepare: (_sql: string) => ({
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [{ id: 'n1', recipient_slug: PI_SLUG }] }),
            first: async () => ({ value: JSON.stringify([PI_EMAIL]) }),
          }),
          all: async () => ({ results: [] }),
          first: async () => ({ value: JSON.stringify([PI_EMAIL]) }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
    const url = new URL('https://x/api/notifications')
    const res = await handleNotifications(url, piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('ignores ?recipient= param — query uses JWT-derived slug', async () => {
    // The DB receives a slug derived from the JWT, not from ?recipient=
    let capturedSlug: unknown = null
    const env = makeEnv({
      DB: {
        prepare: (_sql: string) => ({
          bind: (...args: unknown[]) => {
            // First bind arg after "WHERE recipient_slug = ?" is the slug
            capturedSlug = args[0]
            return {
              all: async () => ({ results: [] }),
              first: async () => ({ value: JSON.stringify([PI_EMAIL]) }),
              run: async () => ({ success: true }),
            }
          },
          first: async () => ({ value: JSON.stringify([PI_EMAIL]) }),
          all: async () => ({ results: [] }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
    const url = new URL('https://x/api/notifications?recipient=SPOOFED_SLUG')
    await handleNotifications(url, piRequest(), env)
    // Must be the PI's canonical slug (nick-ingraham), not the spoofed value
    expect(capturedSlug).toBe(PI_SLUG)
    expect(capturedSlug).not.toBe('SPOOFED_SLUG')
  })
})

// ── 2. Notifications — POST /:id/read owner-or-PI gate ───────────────────────

describe('handleMarkNotificationRead — owner-or-PI gate', () => {
  function notifEnv(recipientSlug: string) {
    return makeEnv({
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (/FROM notifications WHERE id/.test(sql)) {
                return { recipient_slug: recipientSlug }
              }
              if (/pi_emails/.test(sql)) {
                return { value: JSON.stringify([PI_EMAIL]) }
              }
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => {
            if (/pi_emails/.test(sql)) return { value: JSON.stringify([PI_EMAIL]) }
            return null
          },
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
  }

  it('returns 401 when unauthenticated', async () => {
    const env = notifEnv(NON_PI_SLUG)
    const res = await handleMarkNotificationRead('n1', unauthRequest({ method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('allows the recipient (owner) to mark their own notification read', async () => {
    const env = notifEnv(NON_PI_SLUG)
    const res = await handleMarkNotificationRead('n1', nonPiRequest({ method: 'POST' }), env)
    expect(res.status).toBe(200)
  })

  it('returns 403 when a non-PI tries to mark another user\'s notification read', async () => {
    // Non-PI caller (nate-mesfin) tries to mark nick-ingraham's notification
    const env = notifEnv(PI_SLUG) // notification belongs to PI
    const res = await handleMarkNotificationRead('n1', nonPiRequest({ method: 'POST' }), env)
    expect(res.status).toBe(403)
  })

  it('allows PI to mark any notification read', async () => {
    // PI caller (nick-ingraham) marks nate-mesfin's notification
    const env = notifEnv(NON_PI_SLUG)
    const res = await handleMarkNotificationRead('n1', piRequest({ method: 'POST' }), env)
    expect(res.status).toBe(200)
  })

  it('returns 404 when notification does not exist', async () => {
    const env = makeEnv({
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (/FROM notifications WHERE id/.test(sql)) return null // not found
              if (/pi_emails/.test(sql)) return { value: JSON.stringify([PI_EMAIL]) }
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
    const res = await handleMarkNotificationRead('missing-id', piRequest({ method: 'POST' }), env)
    expect(res.status).toBe(404)
  })
})

// ── 3. Sessions — PI-or-API-key gate ────────────────────────────────────────

describe('handleGetSessions — PI-or-API-key gate', () => {
  function sessionsEnv() {
    return piEnv()
  }

  const baseUrl = new URL('https://x/api/sessions?seq_after=0')

  it('returns 403 for unauthenticated callers', async () => {
    const res = await handleGetSessions(baseUrl, sessionsEnv(), unauthRequest())
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI authenticated team members', async () => {
    const res = await handleGetSessions(baseUrl, sessionsEnv(), nonPiRequest())
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI callers', async () => {
    const res = await handleGetSessions(baseUrl, sessionsEnv(), piRequest())
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const env = makeEnv({ PB_API_KEY: 'valid-test-api-key' } as unknown as Env)
    const res = await handleGetSessions(baseUrl, env, apiKeyRequest())
    expect(res.status).toBe(200)
  })

  it('still returns 400 when seq_after is missing (PI passes gate, hits param validation)', async () => {
    // PI caller passes the gate; 400 fires because seq_after param is absent
    const urlNoParam = new URL('https://x/api/sessions')
    const res = await handleGetSessions(urlNoParam, sessionsEnv(), piRequest())
    expect(res.status).toBe(400)
  })
})

// ── 4. Lane3 — PI-or-API-key gate ────────────────────────────────────────────

describe('handleLane3List — PI-or-API-key gate', () => {
  function lane3Env() {
    return piEnv()
  }

  const baseUrl = new URL('https://x/api/lane3/agent_knowledge?seq_after=0')

  it('returns 403 for unauthenticated callers', async () => {
    const res = await handleLane3List('agent_knowledge', baseUrl, lane3Env(), unauthRequest())
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI team members', async () => {
    const res = await handleLane3List('agent_knowledge', baseUrl, lane3Env(), nonPiRequest())
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI callers', async () => {
    const res = await handleLane3List('agent_knowledge', baseUrl, lane3Env(), piRequest())
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const env = makeEnv({ PB_API_KEY: 'valid-test-api-key' } as unknown as Env)
    const res = await handleLane3List('agent_knowledge', baseUrl, env, apiKeyRequest())
    expect(res.status).toBe(200)
  })

  it('returns 400 for unknown table names (gate fires before table validation)', async () => {
    // PI caller but invalid table → 400 from table validation after gate
    const url = new URL('https://x/api/lane3/unknown_table?seq_after=0')
    const res = await handleLane3List('unknown_table', url, lane3Env(), piRequest())
    expect(res.status).toBe(400)
  })
})

// ── 5. Inbox-events GET — PI-or-API-key gate ─────────────────────────────────

describe('handleInboxEvents — PI-or-API-key gate', () => {
  function inboxEnv() {
    return piEnv()
  }

  const baseUrl = new URL('https://x/api/inbox-events')

  it('returns 403 for unauthenticated callers', async () => {
    const res = await handleInboxEvents(baseUrl, inboxEnv(), unauthRequest())
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI team members', async () => {
    const res = await handleInboxEvents(baseUrl, inboxEnv(), nonPiRequest())
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI callers', async () => {
    const res = await handleInboxEvents(baseUrl, inboxEnv(), piRequest())
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const env = makeEnv({ PB_API_KEY: 'valid-test-api-key' } as unknown as Env)
    const res = await handleInboxEvents(baseUrl, env, apiKeyRequest())
    expect(res.status).toBe(200)
  })
})

// ── 6. Regulatory ICS — auth-only (not PI) ──────────────────────────────────

describe('handleRegulatoryIcs — auth-only gate (not PI-only)', () => {
  function icsEnv() {
    return makeEnv({
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (/FROM regulatory_items/.test(sql)) {
                return {
                  id: 'reg1', title: 'IRB Protocol', item_type: 'irb',
                  renewal_due: '2026-12-31', expiration_date: '2026-12-31',
                  protocol_number: 'IRB-001', notes: 'test',
                }
              }
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
  }

  it('returns 401 for unauthenticated callers', async () => {
    const env = icsEnv()
    const res = await handleRegulatoryIcs('reg1', env, unauthRequest())
    expect(res.status).toBe(401)
  })

  it('returns 200 for a non-PI authenticated team member (team CAN access iCal)', async () => {
    const env = icsEnv()
    const res = await handleRegulatoryIcs('reg1', env, nonPiRequest())
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('BEGIN:VCALENDAR')
  })

  it('returns 200 for PI callers', async () => {
    const env = icsEnv()
    const res = await handleRegulatoryIcs('reg1', env, piRequest())
    expect(res.status).toBe(200)
  })
})

// ── 7. Uploads create — canAccessEntity on context ───────────────────────────

describe('handleUploadUrl / handleUploadDone — canAccessEntity on context', () => {
  function uploadsEnv(isPbProject: boolean) {
    return makeEnv({
      R2_ACCESS_KEY_ID: 'test-key',
      R2_SECRET_ACCESS_KEY: 'test-secret',
      CF_ACCOUNT_ID: 'test-account',
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (/FROM projects/.test(sql)) {
                return { category: isPbProject ? 'Peripheral Brain' : 'MNCCORE' }
              }
              if (/pi_emails/.test(sql)) {
                return { value: JSON.stringify([PI_EMAIL]) }
              }
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    } as unknown as Env)
  }

  it('handleUploadUrl: blocks non-PI uploading to a PB-category project', async () => {
    const env = uploadsEnv(true)
    const req = new Request('https://x/api/upload/url', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'secret.pdf',
        contentType: 'application/pdf',
        context: { type: 'project', id: 'pb-secret' },
      }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const res = await handleUploadUrl(req, user, env)
    expect(res.status).toBe(403)
  })

  it('handleUploadUrl: allows non-PI uploading to a non-PB project', async () => {
    const env = uploadsEnv(false)
    const req = new Request('https://x/api/upload/url', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'report.pdf',
        contentType: 'application/pdf',
        context: { type: 'project', id: 'mnccore-project' },
      }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const res = await handleUploadUrl(req, user, env)
    // Should get past the entity gate — may fail on actual R2 signing in test (503 ok)
    expect([200, 503]).toContain(res.status)
    expect(res.status).not.toBe(403)
  })

  it('handleUploadDone: blocks non-PI committing a file record on a PB project', async () => {
    const env = uploadsEnv(true)
    const req = new Request('https://x/api/upload/done', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'project/pb-secret/file.pdf',
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        entityType: 'project',
        entityId: 'pb-secret',
      }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const res = await handleUploadDone(req, user, env)
    expect(res.status).toBe(403)
  })

  it('handleUploadDone: allows PI to commit a file record on a PB project', async () => {
    const env = uploadsEnv(true)
    const req = new Request('https://x/api/upload/done', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'project/pb-secret/file.pdf',
        filename: 'file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        entityType: 'project',
        entityId: 'pb-secret',
      }),
    })
    const user = { email: PI_EMAIL, name: 'Nick' }
    const res = await handleUploadDone(req, user, env)
    // File not in R2 (FILES not bound) → 400 from R2 head check, but NOT 403
    expect(res.status).not.toBe(403)
  })

  it('handleUploadDone: response carries a same-origin, non-expiring url for the composer to insert', async () => {
    const env = uploadsEnv(false)
    const req = new Request('https://x/api/upload/done', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'task/task-1/1700000000000-shot.png',
        filename: 'shot.png',
        contentType: 'image/png',
        sizeBytes: 512,
        entityType: 'task',
        entityId: 'task-1',
      }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const res = await handleUploadDone(req, user, env)
    expect(res.status).toBe(200)
    const data = await res.json() as { data?: { url?: string } }
    // Same-origin path (not a presigned R2 URL — those expire in 1h, useless
    // for a link embedded permanently in a comment body).
    expect(data.data?.url).toBe('/api/files/task/task-1/1700000000000-shot.png/raw')
  })
})

// ── 7b. GET /api/files/:key raw-bytes route (paste-to-image render path) ─────

describe('handleGetFile — raw=true streams bytes for <img src>', () => {
  function fileRow() {
    return { entity_type: 'task', entity_id: 'task-1', filename: 'shot.png', content_type: 'image/png' }
  }

  function envWithFiles(filesBinding: unknown) {
    return makeEnv({
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => (/FROM file_attachments/.test(sql) ? fileRow() : null),
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
      FILES: filesBinding,
    } as unknown as Env)
  }

  it('streams the object body with its content-type when FILES.get resolves', async () => {
    const env = envWithFiles({
      get: async (_key: string) => ({
        body: new Response('fake-bytes').body,
        httpMetadata: { contentType: 'image/png' },
        writeHttpMetadata: (headers: Headers) => headers.set('content-type', 'image/png'),
      }),
    })
    const res = await handleGetFile('task/task-1/shot.png', env, false, true)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(await res.text()).toBe('fake-bytes')
  })

  it('returns 404 when the R2 object is missing (never silently 200s an empty image)', async () => {
    const env = envWithFiles({ get: async () => null })
    const res = await handleGetFile('task/task-1/missing.png', env, false, true)
    expect(res.status).toBe(404)
  })

  it('returns 503 (not a silent empty 200) when the FILES binding itself is absent', async () => {
    const env = envWithFiles(undefined)
    const res = await handleGetFile('task/task-1/shot.png', env, false, true)
    expect(res.status).toBe(503)
  })

  it('raw=false (default) is unchanged — still the presigned-URL JSON envelope', async () => {
    const env = makeEnv({
      R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', CF_ACCOUNT_ID: 'a',
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => (/FROM file_attachments/.test(sql) ? fileRow() : null),
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    } as unknown as Env)
    const res = await handleGetFile('task/task-1/shot.png', env, false, false)
    expect(res.status).toBe(200)
    const data = await res.json() as { data?: { downloadUrl?: string } }
    expect(data.data?.downloadUrl).toContain('X-Amz-Signature')
  })
})

// ── 8. Decisions create — resolveActor rejects foreign decided_by ─────────────

describe('handleCreateDecision — resolveActor for decided_by', () => {
  function decisionsEnv(memberExists: boolean) {
    return piEnv({
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (/pi_emails/.test(sql)) return { value: JSON.stringify([PI_EMAIL]) }
              if (/FROM team_members WHERE slug/.test(sql)) {
                return memberExists ? { id: 'tm1' } : null
              }
              if (/FROM hub_decisions WHERE id/.test(sql)) {
                return { id: 'dec1', title: 'Test decision', decided_by: NON_PI_SLUG }
              }
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
  }

  it('non-PI caller cannot spoof a foreign decided_by', async () => {
    const env = decisionsEnv(true) // member exists but caller is not PI
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const req = new Request('https://x/api/decisions', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test', decided_by: PI_SLUG }),
    })
    const res = await handleCreateDecision(req, user, env)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/not authorized/i)
  })

  it('non-PI caller with no decided_by override uses their own slug (OK)', async () => {
    const env = decisionsEnv(true)
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const req = new Request('https://x/api/decisions', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test decision' }),
    })
    const res = await handleCreateDecision(req, user, env)
    expect(res.status).toBe(201)
  })

  it('PI caller may delegate decided_by to another team member', async () => {
    const env = decisionsEnv(true)
    const user = { email: PI_EMAIL, name: 'Nick' }
    const req = new Request('https://x/api/decisions', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test', decided_by: NON_PI_SLUG }),
    })
    const res = await handleCreateDecision(req, user, env)
    expect(res.status).toBe(201)
  })

  it('unknown decided_by slug returns 400 even for PI', async () => {
    const env = decisionsEnv(false) // member does NOT exist
    const user = { email: PI_EMAIL, name: 'Nick' }
    const req = new Request('https://x/api/decisions', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test', decided_by: 'ghost-user' }),
    })
    const res = await handleCreateDecision(req, user, env)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/unknown actor/i)
  })
})

// ── 9. Email-drafts sync-bulk — PI-or-API-key gate ──────────────────────────

describe('handleSyncEmailDrafts — PI-or-API-key gate', () => {
  function draftEnv() {
    return piEnv()
  }

  it('returns 403 for unauthenticated callers', async () => {
    const req = new Request('https://x/api/email-drafts/sync-bulk', {
      method: 'POST',
      body: JSON.stringify({ drafts: [{ id: 'd1', status: 'draft' }] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await handleSyncEmailDrafts(req, draftEnv())
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI team members', async () => {
    const req = new Request('https://x/api/email-drafts/sync-bulk', {
      method: 'POST',
      body: JSON.stringify({ drafts: [{ id: 'd1', status: 'draft' }] }),
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
    })
    const res = await handleSyncEmailDrafts(req, draftEnv())
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI callers', async () => {
    const req = new Request('https://x/api/email-drafts/sync-bulk', {
      method: 'POST',
      body: JSON.stringify({ drafts: [{ id: 'd1', status: 'draft' }] }),
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
    })
    const res = await handleSyncEmailDrafts(req, draftEnv())
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const env = makeEnv({ PB_API_KEY: 'valid-test-api-key' } as unknown as Env)
    const req = new Request('https://x/api/email-drafts/sync-bulk', {
      method: 'POST',
      body: JSON.stringify({ drafts: [{ id: 'd1', status: 'draft' }] }),
      headers: {
        Authorization: VALID_API_KEY,
        'Content-Type': 'application/json',
      },
    })
    const res = await handleSyncEmailDrafts(req, env)
    expect(res.status).toBe(200)
  })
})

// ── 10. File-activity sync — PI-or-API-key gate ──────────────────────────────

describe('handleSyncFileActivity — PI-or-API-key gate', () => {
  function faEnv() {
    return piEnv()
  }

  it('returns 403 for unauthenticated callers', async () => {
    const req = new Request('https://x/api/file-activity/sync', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ date: '2026-05-27', file_count: 1, total_events: 1 }] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await handleSyncFileActivity(req, faEnv())
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI team members', async () => {
    const req = new Request('https://x/api/file-activity/sync', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ date: '2026-05-27', file_count: 1, total_events: 1 }] }),
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
    })
    const res = await handleSyncFileActivity(req, faEnv())
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI callers', async () => {
    const req = new Request('https://x/api/file-activity/sync', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ date: '2026-05-27', file_count: 1, total_events: 1 }] }),
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
    })
    const res = await handleSyncFileActivity(req, faEnv())
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const env = makeEnv({ PB_API_KEY: 'valid-test-api-key' } as unknown as Env)
    const req = new Request('https://x/api/file-activity/sync', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ date: '2026-05-27', file_count: 1, total_events: 1 }] }),
      headers: {
        Authorization: VALID_API_KEY,
        'Content-Type': 'application/json',
      },
    })
    const res = await handleSyncFileActivity(req, env)
    expect(res.status).toBe(200)
  })
})

// ── 11. Meeting detail — full row for authed, public cols for unauth ──────────

describe('handleGetMeeting — auth projection', () => {
  const FULL_ROW = {
    id: 'mtg1', date: '2026-05-28', title: 'Team standup',
    type: 'biweekly', status: 'upcoming', facilitator: PI_SLUG,
    agenda: 'PRIVATE AGENDA', notes: 'INTERNAL NOTES',
    decisions: 'TEAM DECISIONS', attendees: 'everyone',
    created_at: '2026-05-28', updated_at: '2026-05-28',
  }

  function meetingEnv() {
    return makeEnv({
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (/FROM meetings WHERE id/.test(sql)) {
                // Return only the columns the handler selected
                const isStar = /SELECT \*/.test(sql)
                if (isStar) return { ...FULL_ROW }
                // Public col projection: id, date, title, type, status, facilitator, created_at, updated_at
                const { agenda: _a, notes: _n, decisions: _d, attendees: _at, ...pub } = FULL_ROW
                return pub
              }
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
  }

  it('unauthenticated callers get public-safe columns only (no agenda/notes/decisions)', async () => {
    const res = await handleGetMeeting('mtg1', meetingEnv(), false)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.title).toBe('Team standup') // public field preserved
    expect(body.data).not.toHaveProperty('agenda')
    expect(body.data).not.toHaveProperty('notes')
    expect(body.data).not.toHaveProperty('decisions')
    expect(body.data).not.toHaveProperty('attendees')
  })

  it('authenticated callers get the full row (including agenda/notes/decisions)', async () => {
    const res = await handleGetMeeting('mtg1', meetingEnv(), true)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data).toHaveProperty('agenda', 'PRIVATE AGENDA')
    expect(body.data).toHaveProperty('notes', 'INTERNAL NOTES')
    expect(body.data).toHaveProperty('decisions', 'TEAM DECISIONS')
  })

  it('returns 404 when meeting does not exist', async () => {
    const env = makeEnv()
    const res = await handleGetMeeting('ghost-mtg', env, true)
    expect(res.status).toBe(404)
  })
})

// ── I-1: Fail-closed — absent request → denied on all PI-gated handlers ───────

describe('I-1 fail-closed: absent request → denied (no open-gate legacy path)', () => {
  it('handleGetSessions: absent request → 403', async () => {
    const env = piEnv()
    const url = new URL('https://x/api/sessions?seq_after=0')
    // No request arg — must fail closed, not skip the gate
    const res = await handleGetSessions(url, env, undefined)
    expect(res.status).toBe(403)
  })

  it('handleLane3List: absent request → 403', async () => {
    const env = piEnv()
    const url = new URL('https://x/api/lane3/agent_knowledge?seq_after=0')
    const res = await handleLane3List('agent_knowledge', url, env, undefined)
    expect(res.status).toBe(403)
  })

  // Z1.6 (2026-05-28): handleInboxEvents / handleRegulatoryIcs signatures
  // now require `request: Request` (was `request?: Request`). The fail-closed
  // path for "absent request" is replaced by a compile-time guarantee — the
  // type checker refuses to call the handler without a Request. The Z5.2 lint
  // bans new `request?: Request` signatures in api/routes/*.ts so this gap
  // can't re-open. The two runtime tests below would not compile against the
  // new signatures and are removed; the regression is now structurally
  // impossible rather than runtime-checked.
})

// ── I-3: Meeting sub-routes — unauth → 401 ───────────────────────────────────

describe('I-3: meeting sub-routes agenda/prep/generate-agenda — unauth → 401', () => {
  function subRouteMeetingEnv() {
    return makeEnv({
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              if (/FROM meetings WHERE id/.test(sql)) {
                return { id: 'mtg1', date: '2026-05-28', title: 'Team standup', type: 'biweekly', status: 'upcoming', facilitator: 'nick-ingraham' }
              }
              if (/FROM meetings WHERE date/.test(sql)) return null
              return null
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        batch: async () => [],
      } as unknown as Env['DB'],
    })
  }

  it('handleGetAgendaItems: unauth (isAuthed=false) → 401', async () => {
    const env = subRouteMeetingEnv()
    const res = await handleGetAgendaItems('mtg1', env, false)
    expect(res.status).toBe(401)
  })

  it('handleGetAgendaItems: authed (isAuthed=true) → 200', async () => {
    const env = subRouteMeetingEnv()
    const res = await handleGetAgendaItems('mtg1', env, true)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('handleMeetingPrep: unauth (isAuthed=false) → 401', async () => {
    const env = subRouteMeetingEnv()
    const res = await handleMeetingPrep('mtg1', env, false)
    expect(res.status).toBe(401)
  })

  it('handleMeetingPrep: authed (isAuthed=true) → 200', async () => {
    const env = subRouteMeetingEnv()
    const res = await handleMeetingPrep('mtg1', env, true)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { meeting: unknown } }
    expect(body.data).toHaveProperty('meeting')
  })

  it('handleGenerateAgenda: unauth (isAuthed=false) → 401', async () => {
    const env = subRouteMeetingEnv()
    const res = await handleGenerateAgenda('mtg1', env, false)
    expect(res.status).toBe(401)
  })

  it('handleGenerateAgenda: authed (isAuthed=true) → 200', async () => {
    const env = subRouteMeetingEnv()
    const res = await handleGenerateAgenda('mtg1', env, true)
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

  function syncBulkEnv() {
    return piEnv()
  }

  it('returns 403 for unauthenticated callers', async () => {
    const env = syncBulkEnv()
    const user = { email: NON_PI_EMAIL, name: 'Anon' }
    const req = new Request('https://x/api/inbox-events/sync-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [sampleEvent] }),
    })
    const res = await handleSyncBulkInboxEvents(req, user, env)
    expect(res.status).toBe(403)
  })

  it('returns 403 for non-PI JWT callers', async () => {
    const env = syncBulkEnv()
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const req = new Request('https://x/api/inbox-events/sync-bulk', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: [sampleEvent] }),
    })
    const res = await handleSyncBulkInboxEvents(req, user, env)
    expect(res.status).toBe(403)
  })

  it('returns 200 for PI JWT callers', async () => {
    const env = syncBulkEnv()
    const user = { email: PI_EMAIL, name: 'Nick' }
    const req = new Request('https://x/api/inbox-events/sync-bulk', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: [sampleEvent] }),
    })
    const res = await handleSyncBulkInboxEvents(req, user, env)
    expect(res.status).toBe(200)
  })

  it('returns 200 for API-key callers (PB sync service)', async () => {
    const env = makeEnv({ PB_API_KEY: 'valid-test-api-key' } as unknown as Env)
    const user = { email: 'system@pb', name: 'PB Sync' }
    const req = new Request('https://x/api/inbox-events/sync-bulk', {
      method: 'POST',
      headers: {
        Authorization: VALID_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: [sampleEvent] }),
    })
    const res = await handleSyncBulkInboxEvents(req, user, env)
    expect(res.status).toBe(200)
  })
})
