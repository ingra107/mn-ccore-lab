// project-home.readers.test.ts -- contract phase step 1.
//
// Every Hub reader that named projects.stage now reads the home product
// (compact displays) or counts products by kind and stage (rollups). This
// runs each moved read on the migration-chain database, so a join alias, an
// ambiguous column or a GROUP BY the real schema refuses fails here rather
// than in prod. The fixture makes projects.stage disagree with the products
// on purpose: a reader still reading the column would show 'published'.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Env } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'
import { handleInsightConnections, handleInsightsDashboard } from '../routes/insights'
import { handlePIDashboard } from '../routes/pi-dashboard'
import { handleGetNarratives } from '../routes/narratives'
import { handleTrajectory } from '../routes/trajectory'
import { handleGetMemberProjects } from '../routes/project-members'
import { handlePapersByPublication } from '../routes/paper-links'
import { handleGetSearch } from '../routes/search'
import { handleProjectHealth } from '../routes/projects'
import { handleGenerateAgenda } from '../routes/meetings'
import type { Viewer } from './viewer-db'

let db: InstanceType<typeof Database>
let env: Env

function project(id: string, slug: string, title: string, category = 'MNCCORE') {
  // projects.stage = 'published' everywhere: no product says so.
  db.prepare(`INSERT INTO projects (id, title, slug, stage, status, category, pi, updated_at)
              VALUES (?, ?, ?, 'published', 'active', ?, 'nick-ingraham', '2026-01-01 00:00:00')`).run(id, title, slug, category)
}

beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  // v125/v129: each insert makes its home product; set the homes to the
  // shapes under test, then put projects.stage back to 'published' (the v126
  // mirror copied a single manuscript's stage onto it).
  project('proj_A', 'alpha', 'Alpha sepsis study')
  project('proj_B', 'bravo', 'Bravo sepsis grant')
  db.prepare("UPDATE products SET stage = 'writing' WHERE project_id = 'proj_A'").run()
  db.prepare("UPDATE products SET kind = 'grant_application', stage = 'submitted' WHERE project_id = 'proj_B'").run()
  db.prepare(`INSERT INTO products (id, project_id, kind, stage, is_home) VALUES ('prd_extra', 'proj_A', 'abstract', 'submitted', 0)`).run()
  db.prepare("UPDATE projects SET stage = 'published'").run()
  db.prepare("INSERT OR IGNORE INTO team_members (id, slug, name, role) VALUES ('m1', 'casey-eddington', 'Casey Eddington', 'member')").run()
  db.prepare("INSERT OR IGNORE INTO team_members (id, slug, name, role) VALUES ('m2', 'nick-ingraham', 'Nick Ingraham', 'pi')").run()
  db.prepare("INSERT INTO project_members (project_id, member_slug, added_by) VALUES ('proj_A', 'casey-eddington', 'nick-ingraham')").run()
  db.prepare("INSERT INTO tasks (id, title, project_id, assignee, status) VALUES ('t1', 'Draft', 'proj_A', 'casey-eddington', 'todo')").run()
  // Both stalled for the agenda (not updated in 30+ days), after every write above.
  db.prepare("UPDATE projects SET updated_at = '2026-01-01 00:00:00'").run()
})

const read = async (res: Response) => (await res.json()) as Record<string, unknown>

describe('Hub readers read products, never projects.stage', () => {
  it('pipeline funnel, revisions count and PI dashboard count products by kind and stage', async () => {
    const dash = (await read(await handleInsightsDashboard(env))).data as Record<string, unknown>
    const funnel = dash.pipelineFunnel as { kind: string; stage: string; count: number }[]
    expect(funnel.map((r) => `${r.kind}:${r.stage}:${r.count}`).sort()).toEqual([
      'abstract:submitted:1', 'grant_application:submitted:1', 'manuscript:writing:1',
    ])
    expect(funnel.some((r) => r.stage === 'published')).toBe(false)
    const pi = await read(await handlePIDashboard(env, true))
    const byStage = (pi.data as { productsByStage: { kind: string; count: number }[] }).productsByStage
    expect(byStage.reduce((n, r) => n + r.count, 0)).toBe(3)
  })

  it('connections, narratives and health carry the home product', async () => {
    const conn = await read(await handleInsightConnections(env))
    expect(JSON.stringify(conn)).not.toMatch(/Published/)
    const arcs = (await read(await handleGetNarratives(env))).data as { projects: { slug: string; stage_label: string }[]; stageDistribution: { count: number }[] }[]
    const alpha = arcs[0].projects.find((p) => p.slug === 'alpha')!
    expect(alpha.stage_label).toBe('Writing +1')
    expect(arcs[0].stageDistribution.reduce((n, r) => n + r.count, 0)).toBe(3)
    const health = (await read(await handleProjectHealth(env))).data as { slug: string; stage_label: string; home_kind: string }[]
    expect(health.find((h) => h.slug === 'bravo')).toMatchObject({ home_kind: 'grant_application', stage_label: expect.stringMatching(/Submitted$/) })
  })

  it('member projects, paper links, search, trajectory and the agenda read the home', async () => {
    const mine = (await read(await handleGetMemberProjects('casey-eddington', env))).data as Record<string, unknown>[]
    expect(mine[0]).toMatchObject({ home_kind: 'manuscript', home_stage: 'writing', product_count: 2 })
    expect('stage' in mine[0]).toBe(false)

    db.prepare("INSERT INTO publications (id, title, authors) VALUES ('pub1', 'P', 'Ingraham N')").run()
    db.prepare("INSERT INTO project_publications (project_id, publication_id, role) VALUES ('proj_B', 'pub1', 'output')").run()
    const papers = (await read(await handlePapersByPublication(new URL('https://x/?publication_id=pub1'), env))).data as Record<string, unknown>[]
    expect(papers[0]).toMatchObject({ home_kind: 'grant_application', home_stage: 'submitted' })

    const search = await read(await handleGetSearch(new URL('https://x/api/search?q=sepsis'), env, new Request('https://x')))
    const hits = (search.data as { type: string; subtitle: string }[]).filter((r) => r.type === 'project')
    expect(hits.map((h) => h.subtitle).sort()).toEqual(['Grant application · Submitted · MNCCORE', 'Writing +1 · MNCCORE'])

    const traj = (await read(await handleTrajectory('casey-eddington', env, { kind: 'service' } as unknown as Viewer, true))).data as { projects: Record<string, unknown>[]; projectStages: Record<string, unknown>[] }
    expect(traj.projects[0]).toMatchObject({ home_stage: 'writing' })
    expect(traj.projectStages[0]).toMatchObject({ home_kind: 'manuscript' })

    db.prepare("INSERT INTO meetings (id, title, date) VALUES ('m1', 'Lab', '2026-10-12')").run()
    const agenda = await read(await handleGenerateAgenda('m1', env, true))
    const stalled = (agenda.sections as { title: string; items: { stage: string | null }[] }[]).find((s) => s.title.startsWith('Stalled'))!
    expect(stalled.items.map((i) => i.stage).sort()).toEqual(['Grant application · Submitted', 'Writing +1'])
  })
})
