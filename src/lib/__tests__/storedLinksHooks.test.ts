/**
 * storedLinksHooks — unit tests for useTaskLinks / useProjectLinks queryFn
 * shapes (B3 Task 8b, 2026-06-21; honesty refactor backlog #144, 2026-06-22).
 *
 * Tests the REAL fetch + parse logic by importing the production queryFns
 * (fetchTaskLinks / fetchProjectLinks from src/hooks/useApiData.ts) and
 * driving them against a mocked global fetch. No React / React Query context
 * needed for this shape-verification layer — but the test now breaks if the
 * real hook's fetch shape breaks (no inline mirror to drift out of sync).
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchTaskLinks,
  fetchProjectLinks,
  type StoredLink,
  type TaskLinksPayload,
} from '../../hooks/useApiData'

// Alias the production queryFns to the names the suite asserts against.
const taskLinksQueryFn = fetchTaskLinks
const projectLinksQueryFn = fetchProjectLinks

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

describe('fetchTaskLinks (real useTaskLinks queryFn)', () => {
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

describe('fetchProjectLinks (real useProjectLinks queryFn)', () => {
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
