// #159/#160/#162: search finds a project through its products and ranks a
// project's name above tasks that mention the word. Runs the route's SQL on the
// real schema.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleGetSearch } from './search'
import { nowInstant } from '../lib/time'
import type { Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

interface Hit { id: string; type: string; title: string; url: string; subtitle?: string }

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db), PB_API_KEY: 'k' } as unknown as Env
  insertRow(db, 'projects', { id: 'proj_grant', slug: 'quality-grant', title: 'ICU Quality Reporting Grant', category: 'CLIF', status: 'active', description: 'Standard cross-ICU reporting' })
  insertRow(db, 'projects', { id: 'proj_vent', slug: 'vent-dashboard', title: 'Vent Dashboard', category: 'CLIF', status: 'active', description: 'x' })
  insertRow(db, 'products', { id: 'prd_abs', project_id: 'proj_grant', kind: 'abstract', stage: 'planning', title: 'ATS 2027 QI dashboard', is_home: 0, sort_order: 1 })
  for (let i = 0; i < 20; i++) {
    insertRow(db, 'tasks', { id: `task_${i}`, title: `Review the dashboard numbers ${i}`, status: 'in_progress', priority: 'high', assignee: 'nick-ingraham', created_at: nowInstant() })
  }
})

async function search(q: string): Promise<Hit[]> {
  const url = new URL(`https://x/api/search?q=${encodeURIComponent(q)}`)
  const res = await handleGetSearch(url, env, new Request(url, { headers: { Authorization: 'Bearer k' } }))
  return ((await res.json()) as { data: Hit[] }).data
}

describe('search reaches products and ranks project names first', () => {
  it('a product hit carries its project and links to it', async () => {
    const hit = (await search('ATS 2027')).find((h) => h.type === 'product')!
    expect(hit.title).toContain('ATS 2027 QI dashboard')
    expect(hit.subtitle).toContain('ICU Quality Reporting Grant')
    expect(hit.url).toBe('/portal/projects/quality-grant')
  })

  it('a project or product named for the word outranks tasks that mention it', async () => {
    const hits = await search('dashboard')
    expect(hits.slice(0, 2).map((h) => h.type).sort()).toEqual(['product', 'project'])
  })

  it('p: narrows to projects and products; t: to tasks; a stray colon is just a search', async () => {
    const p = await search('p: dashboard')
    expect(p.length).toBe(2)
    expect(new Set(p.map((h) => h.type))).toEqual(new Set(['project', 'product']))
    const t = await search('t:dashboard')
    expect(new Set(t.map((h) => h.type))).toEqual(new Set(['task']))
    expect(await search('nope: dashboard')).toEqual([])
  })
})
