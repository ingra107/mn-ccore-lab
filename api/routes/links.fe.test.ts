// Frontend-accessible links sub-resource tests (B3 Task 8, 2026-06-21)
// Updated 2026-06-21: derived project-field links (primary_folder, github_url,
// box_url) are now unioned into projectLinks / links at read time.
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
//   1. .first()  — task lookup (project_id) / project lookup (id + 3 derived fields)
//   2. .all()    — links SELECT for tasks and/or projects
//
// We track the SQL to route to the right stub response.
//
// projectRow now includes optional derived-link fields (primary_folder,
// github_url, box_url) that drive the read-time union.

type ProjectRow = {
  id: string
  primary_folder?: string | null
  github_url?: string | null
  box_url?: string | null
}

type DbStubOpts = {
  taskRow?: { project_id: string | null } | null
  projectRow?: ProjectRow | null
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
            // Single-row lookups (task existence, project existence + fields).
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
      // projectRow is required for fetchProjectWithLinks to resolve the project
      // (the handler now fetches the project's canonical fields + explicit links).
      projectRow: { id: 'proj_001' },
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

// ── Derived project-field links (2026-06-21 read-time union) ─────────────────
//
// Tests that primary_folder, github_url, box_url are unioned into the explicit
// links arrays at read time without touching the links table.
// Covers: handleGetTaskLinks (projectLinks) + handleGetProjectLinks (links).

const FOLDER_PATH = 'C:/Users/ingra107/Box/Research/CIRCLE'
// The mnccore:// URI the derived link builds for a local folder.
const FOLDER_DERIVED_URL = `mnccore://open/${FOLDER_PATH}`

const GITHUB_URL = 'https://github.com/ingra107/mn-ccore-lab'
const BOX_URL = 'https://umn.box.com/s/abc123'

describe('handleGetTaskLinks — derived project-field links in projectLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertProjectVisible.mockResolvedValue(null)
  })

  it('includes a derived folder link when project has primary_folder', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      projectRow: { id: 'proj_001', primary_folder: FOLDER_PATH },
      projectLinks: [],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: unknown[]; projectLinks: unknown[] }
    const types = (body.projectLinks as Record<string, unknown>[]).map(l => l.type)
    expect(types).toContain('local_folder')
    const folder = (body.projectLinks as Record<string, unknown>[]).find(l => l.type === 'local_folder')
    expect(folder?.id).toBe('derived:folder')
    expect(folder?.role).toBe('derived')
    expect(folder?.canonical_url).toBe(FOLDER_DERIVED_URL)
    expect(folder?.short_title).toBe('Project folder')
  })

  it('includes a derived github_repo link when project has github_url', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      projectRow: { id: 'proj_001', github_url: GITHUB_URL },
      projectLinks: [],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { projectLinks: Record<string, unknown>[] }
    const gh = body.projectLinks.find(l => l.type === 'github_repo')
    expect(gh?.id).toBe('derived:github')
    expect(gh?.role).toBe('derived')
    expect(gh?.canonical_url).toBe(GITHUB_URL)
    expect(gh?.short_title).toBe('ingra107/mn-ccore-lab')
  })

  it('includes a derived box_folder link when project has box_url', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      projectRow: { id: 'proj_001', box_url: BOX_URL },
      projectLinks: [],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { projectLinks: Record<string, unknown>[] }
    const box = body.projectLinks.find(l => l.type === 'box_folder')
    expect(box?.id).toBe('derived:box')
    expect(box?.role).toBe('derived')
    expect(box?.canonical_url).toBe(BOX_URL)
    expect(box?.short_title).toBe('Box folder')
  })

  it('includes all three derived links when all three fields are set', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      projectRow: {
        id: 'proj_001',
        primary_folder: FOLDER_PATH,
        github_url: GITHUB_URL,
        box_url: BOX_URL,
      },
      projectLinks: [],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { projectLinks: Record<string, unknown>[] }
    const types = body.projectLinks.map(l => l.type)
    expect(types).toContain('local_folder')
    expect(types).toContain('github_repo')
    expect(types).toContain('box_folder')
  })

  it('omits derived links when project fields are null/empty', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      projectRow: {
        id: 'proj_001',
        primary_folder: null,
        github_url: null,
        box_url: null,
      },
      projectLinks: [],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { projectLinks: Record<string, unknown>[] }
    expect(body.projectLinks).toHaveLength(0)
  })

  it('deduplicates: drops derived link when explicit row has the same canonical_url', async () => {
    // An explicit box_folder row whose canonical_url matches the derived one:
    // the explicit row (with curated title) should win and only appear once.
    const explicitBoxLink: Record<string, unknown> = {
      id: 'lnk_box_custom',
      role: 'key',
      type: 'box_folder',
      canonical_url: BOX_URL,
      short_title: 'Curated Box folder',
      sort_order: 0,
    }
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      projectRow: { id: 'proj_001', box_url: BOX_URL },
      projectLinks: [explicitBoxLink],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { projectLinks: Record<string, unknown>[] }
    const boxRows = body.projectLinks.filter(l => l.type === 'box_folder')
    expect(boxRows).toHaveLength(1)
    expect(boxRows[0].id).toBe('lnk_box_custom')
    expect(boxRows[0].short_title).toBe('Curated Box folder')
  })

  it('places explicit links before derived links', async () => {
    const env = makeEnv({
      taskRow: { project_id: 'proj_001' },
      projectRow: {
        id: 'proj_001',
        primary_folder: FOLDER_PATH,
        github_url: GITHUB_URL,
      },
      projectLinks: [DOC_LINK, BOX_LINK],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { projectLinks: Record<string, unknown>[] }
    // Explicit rows first (DOC_LINK, BOX_LINK), then derived (folder, github).
    expect(body.projectLinks[0].id).toBe('lnk_doc_001')
    expect(body.projectLinks[1].id).toBe('lnk_box_001')
    expect(body.projectLinks[2].id).toBe('derived:folder')
    expect(body.projectLinks[3].id).toBe('derived:github')
  })

  it('emits no derived links for a task with no project', async () => {
    const env = makeEnv({
      taskRow: { project_id: null },
      projectLinks: [],
    })
    const res = await handleGetTaskLinks('task_001', makeRequest(), env)
    const body = await res.json() as { projectLinks: Record<string, unknown>[] }
    expect(body.projectLinks).toHaveLength(0)
  })
})

describe('handleGetProjectLinks — derived project-field links in links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertProjectVisible.mockResolvedValue(null)
  })

  it('includes derived folder, github and box links when all three fields set', async () => {
    const env = makeEnv({
      projectRow: {
        id: 'proj_001',
        primary_folder: FOLDER_PATH,
        github_url: GITHUB_URL,
        box_url: BOX_URL,
      },
      projectLinks: [],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { links: Record<string, unknown>[] }
    const types = body.links.map(l => l.type)
    expect(types).toContain('local_folder')
    expect(types).toContain('github_repo')
    expect(types).toContain('box_folder')
    expect(body.links.find(l => l.type === 'local_folder')?.canonical_url).toBe(FOLDER_DERIVED_URL)
  })

  it('omits derived links when fields are absent', async () => {
    const env = makeEnv({
      projectRow: { id: 'proj_001' },
      projectLinks: [],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    const body = await res.json() as { links: Record<string, unknown>[] }
    expect(body.links).toHaveLength(0)
  })

  it('deduplicates: explicit row with same canonical_url wins over derived', async () => {
    const explicitFolder: Record<string, unknown> = {
      id: 'lnk_folder_explicit',
      role: 'key',
      type: 'local_folder',
      canonical_url: FOLDER_DERIVED_URL,
      short_title: 'My custom folder label',
      sort_order: 0,
    }
    const env = makeEnv({
      projectRow: { id: 'proj_001', primary_folder: FOLDER_PATH },
      projectLinks: [explicitFolder],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    const body = await res.json() as { links: Record<string, unknown>[] }
    const folderRows = body.links.filter(l => l.type === 'local_folder')
    expect(folderRows).toHaveLength(1)
    expect(folderRows[0].id).toBe('lnk_folder_explicit')
    expect(folderRows[0].short_title).toBe('My custom folder label')
  })

  it('normalizes a file:/// folder path to mnccore:// URI in derived canonical_url', async () => {
    const fileUrl = 'file:///C:/Users/ingra107/Box/Research/K%20proposal/ADHERE'
    const expectedUri = 'mnccore://open/C:/Users/ingra107/Box/Research/K proposal/ADHERE'
    const env = makeEnv({
      projectRow: { id: 'proj_001', primary_folder: fileUrl },
      projectLinks: [],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    const body = await res.json() as { links: Record<string, unknown>[] }
    const folder = body.links.find(l => l.type === 'local_folder')
    expect(folder?.canonical_url).toBe(expectedUri)
  })

  it('extracts owner/repo from a github URL for short_title', async () => {
    const env = makeEnv({
      projectRow: { id: 'proj_001', github_url: 'https://github.com/MN-CCORE/hub.git' },
      projectLinks: [],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    const body = await res.json() as { links: Record<string, unknown>[] }
    const gh = body.links.find(l => l.type === 'github_repo')
    expect(gh?.short_title).toBe('MN-CCORE/hub')
  })

  it('places explicit links before derived links', async () => {
    const env = makeEnv({
      projectRow: {
        id: 'proj_001',
        primary_folder: FOLDER_PATH,
        box_url: BOX_URL,
      },
      projectLinks: [DOC_LINK],
    })
    const res = await handleGetProjectLinks('my-project', makeRequest(), env)
    const body = await res.json() as { links: Record<string, unknown>[] }
    expect(body.links[0].id).toBe('lnk_doc_001')
    expect(body.links[1].id).toBe('derived:folder')
    expect(body.links[2].id).toBe('derived:box')
  })
})
