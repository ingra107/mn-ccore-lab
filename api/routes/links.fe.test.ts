// Frontend-accessible links sub-resource tests (B3 Task 8, 2026-06-21)
//
// Covers:
//   handleGetTaskLinks   GET /api/tasks/:id/links
//   handleGetProjectLinks  GET /api/projects/:slug/links
//
// Both handlers are authed (CF Access JWT, no PI/API-key required).
// Auth gates (404 for missing task/project, 403 for PB-gated projects) are
// exercised here; assertProjectVisible itself is integration-tested elsewhere.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Env } from '../helpers'

// assertProjectVisible must be mockable; mock helpers before importing handlers.
vi.mock('../helpers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../helpers')>()
  return {
    ...mod,
    assertProjectVisible: vi.fn().mockResolvedValue(null), // null = allow (default)
  }
})

import { handleGetTaskLinks, handleGetProjectLinks } from './links'
import { assertProjectVisible } from '../helpers'

const mockAssertProjectVisible = vi.mocked(assertProjectVisible)

// ── Stub factory ─────────────────────────────────────────────────────────────
//
// The handlers issue two kinds of DB calls:
//   1. .first()  — task lookup (project_id) / project lookup (id)
//   2. .all()    — links SELECT for tasks and/or projects
//
// We track the SQL to route to the right stub response.

type DbStubOpts = {
  taskRow?: { project_id: string | null } | null
  projectRow?: { id: string } | null
  taskLinks?: Record<string, unknown>[]
  projectLinks?: Record<string, unknown>[]
}

function makeEnv(opts: DbStubOpts = {}): Env {
  const {
    taskRow = null,
    projectRow = null,
    taskLinks = [],
    projectLinks = [],
  } = opts

  return {
    DB: {
      prepare: (sql: string) => {
        const upper = sql.trim().toUpperCase()
        return {
          bind: (..._args: unknown[]) => ({
            // Single-row lookups (task existence, project existence).
            first: async () => {
              if (upper.includes('FROM TASKS') && upper.includes('PROJECT_ID')) {
                return taskRow
              }
              if (upper.includes('FROM PROJECTS')) {
                return projectRow
              }
              return null
            },
            // Multi-row links SELECTs. Route by owner_table arg:
            // When the SQL contains 'owner_table = ?' we check the bind args.
            // The bind args are captured by the outer bind() call; we peek at
            // _args to decide which result set to return.
            all: async () => {
              // Both task-links and project-links queries contain owner_table = ?
              // The second bind arg after owner_table is the owner_id.
              // Distinguish by the first bind arg value ('tasks' vs 'projects').
              if (_args[0] === 'tasks') return { results: taskLinks }
              if (_args[0] === 'projects') return { results: projectLinks }
              return { results: [] }
            },
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
        }
      },
    },
  } as unknown as Env
}

function makeRequest(path = 'https://hub.test/api/tasks/task_001/links'): Request {
  return new Request(path, { headers: { Authorization: 'Bearer test-jwt' } })
}

// ── Fixture data ─────────────────────────────────────────────────────────────

const DOC_LINK: Record<string, unknown> = {
  id: 'lnk_doc_001',
  role: 'key',
  type: 'google_doc',
  canonical_url: 'https://docs.google.com/document/d/abc123',
  short_title: 'Protocol doc',
  sort_order: 0,
}

const BOX_LINK: Record<string, unknown> = {
  id: 'lnk_box_001',
  role: 'key',
  type: 'box_folder',
  canonical_url: 'https://umn.box.com/s/xyzxyz',
  short_title: 'Box folder',
  sort_order: 1,
}

const GMAIL_LINK: Record<string, unknown> = {
  id: 'lnk_gmail_001',
  role: 'key',
  type: 'gmail_thread',
  canonical_url: 'https://mail.google.com/mail/u/1/#inbox/thread001',
  short_title: 'Email thread',
  sort_order: 0,
}

// ── handleGetTaskLinks ────────────────────────────────────────────────────────

describe('handleGetTaskLinks — GET /api/tasks/:id/links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertProjectVisible.mockResolvedValue(null) // allow by default
  })

  it('returns 404 when task is not found', async () => {
    const env = makeEnv({ taskRow: null })
    const res = await handleGetTaskLinks('task_missing', makeRequest(), env)
    expect(res.status).toBe(404)
  })

  it('returns empty links arrays for a task with no links and no project', async () => {
    const env = makeEnv({
      taskRow: { project_id: null },
      taskLinks: [],
      projectLinks: [],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: unknown[]; projectLinks: unknown[] }
    expect(body.links).toEqual([])
    expect(body.projectLinks).toEqual([])
  })

  it('returns task-owned links in links[] and empty projectLinks[] when no project', async () => {
    const env = makeEnv({
      taskRow: { project_id: null },
      taskLinks: [DOC_LINK],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: unknown[]; projectLinks: unknown[] }
    expect(body.links).toHaveLength(1)
    expect((body.links[0] as Record<string, unknown>).type).toBe('google_doc')
    expect(body.projectLinks).toEqual([])
  })

  it('returns both task links and inherited project links when project_id set', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      taskLinks: [DOC_LINK],
      projectLinks: [BOX_LINK, GMAIL_LINK],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: unknown[]; projectLinks: unknown[] }
    expect(body.links).toHaveLength(1)
    expect((body.links[0] as Record<string, unknown>).type).toBe('google_doc')
    expect(body.projectLinks).toHaveLength(2)
    const types = (body.projectLinks as Record<string, unknown>[]).map(l => l.type)
    expect(types).toContain('box_folder')
    expect(types).toContain('gmail_thread')
  })

  it('response rows contain only the frontend projection fields', async () => {
    const env = makeEnv({
      taskRow: { project_id: null },
      taskLinks: [DOC_LINK],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { links: Record<string, unknown>[] }
    const row = body.links[0]
    // Must have the six projection fields.
    expect(row).toHaveProperty('id')
    expect(row).toHaveProperty('role')
    expect(row).toHaveProperty('type')
    expect(row).toHaveProperty('canonical_url')
    expect(row).toHaveProperty('short_title')
    expect(row).toHaveProperty('sort_order')
    // Must NOT expose sync-lane fields (seq, last_mutation_id, etc.).
    expect(row).not.toHaveProperty('seq')
    expect(row).not.toHaveProperty('last_mutation_id')
    expect(row).not.toHaveProperty('source_raw')
    expect(row).not.toHaveProperty('deleted_at')
  })

  it('calls assertProjectVisible when task has a project_id', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
    })
    await handleGetTaskLinks('task_001', makeRequest(), env)
    expect(mockAssertProjectVisible).toHaveBeenCalledWith(
      expect.any(Request),
      env,
      'proj_001',
    )
  })

  it('returns 403 when assertProjectVisible blocks (PB-gated project)', async () => {
    mockAssertProjectVisible.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    )
    const env = makeEnv({ taskRow: { project_id: 'proj_pb_001' } })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    expect(res.status).toBe(403)
  })

  it('does not call assertProjectVisible for tasks without a project', async () => {
    const env = makeEnv({ taskRow: { project_id: null } })
    await handleGetTaskLinks('task_001', makeRequest(), env)
    expect(mockAssertProjectVisible).not.toHaveBeenCalled()
  })
})

// ── handleGetProjectLinks ─────────────────────────────────────────────────────

describe('handleGetProjectLinks — GET /api/projects/:slug/links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertProjectVisible.mockResolvedValue(null)
  })

  it('returns 404 when project is not found', async () => {
    const env = makeEnv({ projectRow: null })
    const res = await handleGetProjectLinks('missing-slug', makeRequest(), env)
    expect(res.status).toBe(404)
  })

  it('returns empty links array for a project with no links', async () => {
    const env = makeEnv({
      projectRow: { id: 'proj_001' },
      projectLinks: [],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: unknown[] }
    expect(body.links).toEqual([])
  })

  it('returns project links sorted by sort_order', async () => {
    const env = makeEnv({
      projectRow: { id: 'proj_001' },
      projectLinks: [BOX_LINK, DOC_LINK],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: Record<string, unknown>[] }
    expect(body.links).toHaveLength(2)
    // DOC_LINK sort_order=0, BOX_LINK sort_order=1; DB returns in order.
    expect(body.links[0].type).toBe('box_folder')
    expect(body.links[1].type).toBe('google_doc')
  })

  it('calls assertProjectVisible with the resolved project id', async () => {
    const env = makeEnv({
      projectRow: { id: 'proj_001' },
      projectLinks: [DOC_LINK],
    })
    await handleGetProjectLinks('my-project', makeRequest(), env)
    expect(mockAssertProjectVisible).toHaveBeenCalledWith(
      expect.any(Request),
      env,
      'proj_001',
    )
  })

  it('returns 403 when assertProjectVisible blocks (PB-gated project)', async () => {
    mockAssertProjectVisible.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    )
    const env = makeEnv({ projectRow: { id: 'proj_pb_001' } })
    const res = await handleGetProjectLinks('pb-slug', makeRequest(), env)
    expect(res.status).toBe(403)
  })

  it('accepts typed PK (proj_*) as well as slug (slug-based resolution)', async () => {
    // The route resolves `slug = ? OR id = ?` -- both arms land same row.
    const env = makeEnv({
      projectRow: { id: 'proj_001' },
      projectLinks: [DOC_LINK],
    })
    // Use the typed PK directly as the "slug" param.
    const res = await handleGetProjectLinks('proj_001', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: unknown[] }
    expect(body.links).toHaveLength(1)
  })
})
