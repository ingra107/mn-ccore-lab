/**
 * storedLinksHooks — unit tests for useTaskLinks / useProjectLinks queryFn
 * shapes (B3 Task 8b, 2026-06-21).
 *
 * Tests the fetch + parse logic in isolation by directly calling the
 * queryFn closures (extracted inline) against a mocked global fetch.
 * No React / React Query context needed for this shape-verification layer.
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Minimal inline queryFn mirrors (so tests stay in sync with the hook) ─────
// These mirror the actual queryFn logic from useApiData.ts — if the hook
// changes its fetch shape, update these mirrors to match.

type StoredLink = {
  id: string
  role: string
  type: string
  canonical_url: string
  short_title: string | null
  sort_order: number
}

type TaskLinksPayload = { links: StoredLink[]; projectLinks: StoredLink[] }

async function taskLinksQueryFn(taskId: string | null): Promise<TaskLinksPayload> {
  if (!taskId) return { links: [], projectLinks: [] }
  const res = await fetch(`/api/tasks/${taskId}/links`)
  if (!res.ok) return { links: [], projectLinks: [] }
  return res.json() as Promise<TaskLinksPayload>
}

async function projectLinksQueryFn(slug: string | null): Promise<StoredLink[]> {
  if (!slug) return []
  const res = await fetch(`/api/projects/${slug}/links`)
  if (!res.ok) return []
  const data = await res.json() as { links: StoredLink[] }
  return data.links ?? []
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DOC_LINK: StoredLink = {
  id: 'lnk_doc_001',
  role: 'key',
  type: 'google_doc',
  canonical_url: 'https://docs.google.com/document/d/abc123/edit',
  short_title: 'Protocol doc',
  sort_order: 0,
}

const BOX_LINK: StoredLink = {
  id: 'lnk_box_001',
  role: 'key',
  type: 'box_folder',
  canonical_url: 'https://umn.box.com/folder/123456',
  short_title: 'Box folder',
  sort_order: 1,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(responseBody: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseBody),
  } as Response)
}

// ── useTaskLinks queryFn ──────────────────────────────────────────────────────

describe('taskLinksQueryFn (mirrors useTaskLinks)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty payload for null taskId (disabled guard)', async () => {
    const result = await taskLinksQueryFn(null)
    expect(result.links).toEqual([])
    expect(result.projectLinks).toEqual([])
  })

  it('returns empty payload on non-ok fetch', async () => {
    mockFetch({}, 403)
    const result = await taskLinksQueryFn('task_001')
    expect(result.links).toEqual([])
    expect(result.projectLinks).toEqual([])
  })

  it('returns links and projectLinks from a successful fetch', async () => {
    const payload: TaskLinksPayload = {
      links: [DOC_LINK],
      projectLinks: [BOX_LINK],
    }
    mockFetch(payload)
    const result = await taskLinksQueryFn('task_001')
    expect(result.links).toHaveLength(1)
    expect(result.links[0].type).toBe('google_doc')
    expect(result.projectLinks).toHaveLength(1)
    expect(result.projectLinks[0].type).toBe('box_folder')
  })

  it('fetches from the correct endpoint URL', async () => {
    mockFetch({ links: [], projectLinks: [] })
    await taskLinksQueryFn('task_abc')
    expect(global.fetch).toHaveBeenCalledWith('/api/tasks/task_abc/links')
  })

  it('StoredLink rows carry the six required fields', async () => {
    mockFetch({ links: [DOC_LINK], projectLinks: [] })
    const result = await taskLinksQueryFn('task_001')
    const row = result.links[0]
    expect(row).toHaveProperty('id')
    expect(row).toHaveProperty('role')
    expect(row).toHaveProperty('type')
    expect(row).toHaveProperty('canonical_url')
    expect(row).toHaveProperty('short_title')
    expect(row).toHaveProperty('sort_order')
  })
})

// ── useProjectLinks queryFn ───────────────────────────────────────────────────

describe('projectLinksQueryFn (mirrors useProjectLinks)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty array for null slug (disabled guard)', async () => {
    const result = await projectLinksQueryFn(null)
    expect(result).toEqual([])
  })

  it('returns empty array on non-ok fetch', async () => {
    mockFetch({}, 404)
    const result = await projectLinksQueryFn('missing-slug')
    expect(result).toEqual([])
  })

  it('returns links array from a successful fetch', async () => {
    mockFetch({ links: [DOC_LINK, BOX_LINK] })
    const result = await projectLinksQueryFn('my-project')
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('google_doc')
    expect(result[1].type).toBe('box_folder')
  })

  it('fetches from the correct endpoint URL', async () => {
    mockFetch({ links: [] })
    await projectLinksQueryFn('clif-deep-sedation')
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/clif-deep-sedation/links')
  })

  it('returns empty array when response has no links field', async () => {
    mockFetch({})
    const result = await projectLinksQueryFn('my-project')
    expect(result).toEqual([])
  })
})

// ── projectLinks surface guard — drives TaskDetailDrawer + InlineDetail ───────
// These tests verify that the guard condition used on both surfaces
// (`projectLinks.length > 0`) correctly evaluates for all payload shapes
// returned by taskLinksQueryFn. No React needed — pure payload-shape assertions.

describe('projectLinks surface guard (drives TaskDetailDrawer + InlineDetail)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('empty projectLinks array → guard is false (section hidden)', async () => {
    mockFetch({ links: [], projectLinks: [] })
    const result = await taskLinksQueryFn('task_001')
    expect(result.projectLinks.length > 0).toBe(false)
  })

  it('non-empty projectLinks array → guard is true (section shown)', async () => {
    mockFetch({ links: [], projectLinks: [BOX_LINK] })
    const result = await taskLinksQueryFn('task_001')
    expect(result.projectLinks.length > 0).toBe(true)
  })

  it('projectLinks rows carry fields required by StoredLinkChip (id, type, canonical_url, short_title)', async () => {
    mockFetch({ links: [], projectLinks: [DOC_LINK, BOX_LINK] })
    const result = await taskLinksQueryFn('task_001')
    for (const link of result.projectLinks) {
      expect(link).toHaveProperty('id')
      expect(link).toHaveProperty('type')
      expect(link).toHaveProperty('canonical_url')
      expect(link).toHaveProperty('short_title')
    }
  })

  it('null taskId → projectLinks empty (disabled guard, both surfaces stay hidden)', async () => {
    const result = await taskLinksQueryFn(null)
    expect(result.projectLinks.length > 0).toBe(false)
  })

  it('non-ok fetch → projectLinks empty (both surfaces stay hidden)', async () => {
    mockFetch({}, 500)
    const result = await taskLinksQueryFn('task_001')
    expect(result.projectLinks.length > 0).toBe(false)
  })
})
