// F22/F18: a search result opens the thing it names, not a list. Runs the
// route's SQL on the real schema (same fixture as search.products.test.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleGetSearch } from './search'
import { nowInstant } from '../lib/time'
import type { Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

interface Hit { id: string; type: string; title: string; url: string; subtitle?: string; details?: Record<string, unknown> }

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db), PB_API_KEY: 'k' } as unknown as Env
  insertRow(db, 'projects', { id: 'proj_nih', slug: 'zebra-r01', title: 'Zebra R01 renewal', category: 'MNCCORE', status: 'active', description: 'x' })
  insertRow(db, 'products', { id: 'prd_grant', project_id: 'proj_nih', kind: 'grant_application', stage: 'preparing', title: 'Zebra R01 application', is_home: 0, sort_order: 1 })
  insertRow(db, 'ideas', { id: 'idea_1', title: 'Zebra stripes as a severity score', description: 'x', submitted_by: 'nick', status: 'new', created_at: nowInstant() })
  insertRow(db, 'artifacts', { id: 'art_1', title: 'Report', body_md: 'x', version: 1, created_by: 'claude-ai', updated_at: nowInstant() })
  insertRow(db, 'file_attachments', { id: 'file_1', filename: 'zebra-notes.pdf', entity_type: 'artifact', entity_id: 'art_1', r2_key: 'k/file_1', content_type: 'application/pdf', uploaded_by: 'nick', created_at: nowInstant() })
  insertRow(db, 'publications', { id: 'pub_1', title: 'Zebra physiology in the ICU', journal: 'Crit Care', year: 2025, authors: 'Ingraham N', status: 'Published', created_at: nowInstant() })
})

async function search(q: string): Promise<Hit[]> {
  const url = new URL(`https://x/api/search?q=${encodeURIComponent(q)}`)
  const res = await handleGetSearch(url, env, new Request(url, { headers: { Authorization: 'Bearer k' } }))
  return ((await res.json()) as { data: Hit[] }).data
}

async function searchBody(q: string): Promise<{ count: number; truncated: boolean }> {
  const url = new URL(`https://x/api/search?q=${encodeURIComponent(q)}`)
  const res = await handleGetSearch(url, env, new Request(url, { headers: { Authorization: 'Bearer k' } }))
  return (await res.json()) as { count: number; truncated: boolean }
}

describe('the 50-result cap says so', () => {
  it('flags truncated when more than 50 matched, not otherwise', async () => {
    // 15 per source, so spread the word over enough sources to pass 50.
    for (let i = 0; i < 15; i++) {
      insertRow(db, 'tasks', { id: `tk_${i}`, title: `quokka task ${i}`, status: 'todo', priority: 'low', assignee: 'nick' })
      insertRow(db, 'ideas', { id: `id_${i}`, title: `quokka idea ${i}`, description: 'x', submitted_by: 'nick', status: 'new' })
      insertRow(db, 'meetings', { id: `mt_${i}`, title: `quokka meeting ${i}`, date: '2026-11-01', type: 'lab' })
      insertRow(db, 'publications', { id: `pb_${i}`, title: `quokka paper ${i}`, authors: 'A B', status: 'Published' })
    }
    const big = await searchBody('quokka')
    expect(big.count).toBe(50)
    expect(big.truncated).toBe(true)
    expect((await searchBody('physiology')).truncated).toBe(false)
  })
})

describe('search results open the thing, not a list', () => {
  it('an idea opens on its board tab with the idea named', async () => {
    const hit = (await search('stripes')).find((h) => h.type === 'idea')!
    expect(hit.url).toBe('/portal/projects?tab=ideas&open=idea_1')
  })

  it('a grant opens its project', async () => {
    const hit = (await search('zebra')).find((h) => h.type === 'grant')!
    expect(hit.url).toBe('/portal/projects/zebra-r01')
  })

  it('a file on an artifact opens the artifact, not the search page', async () => {
    const hit = (await search('zebra-notes')).find((h) => h.type === 'file')!
    expect(hit.url).toBe('/portal/artifacts/art_1')
  })

  it('a publication result says it is on the public site', async () => {
    const hit = (await search('physiology')).find((h) => h.type === 'publication')!
    expect(hit.url).toBe('/publications/pub_1')
    expect(hit.subtitle).toContain('Public site')
    expect(hit.details?.external).toBe(true)
  })
})
