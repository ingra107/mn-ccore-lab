// projects.create-home-kind.test.ts -- contract phase step 1, ruling 2.
//
// The bug: trg_projects_home_product_ins (schema-v125) hard-coded every new
// project's home product as a MANUSCRIPT at NEW.stage. A grant application
// created on the Hub was born a manuscript (prod 2026-10-12: 37 of 105 home
// products disagree with projects.stage, every one a non-manuscript home).
// schema-v129 seeds the home from the create's {kind, stage}
// (project_home_seed), so a create that names a grant application can only
// make a grant application. Runs on the migration-chain database, so the
// trigger, the seed table's FK and the batch transaction are the real ones.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleCreateProject, handleGetProjects } from './projects'
import { _resetValidationFlagsCache } from '../helpers'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'
import { slugClaimCheck } from '../lib/project-slug'

const user = { email: 'nick@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
})

async function create(body: Record<string, unknown>) {
  const res = await handleCreateProject(
    new Request('https://x/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    user, env, slugClaimCheck(env.DB),
  )
  return { status: res.status, body: await res.json() as { data?: Record<string, unknown>; error?: string } }
}

const homeOf = (projectId: string) => db.prepare(
  'SELECT kind, stage, is_home FROM products WHERE project_id = ? AND deleted_at IS NULL',
).all(projectId) as { kind: string; stage: string; is_home: number }[]

describe('a project is born with the product its creator named (schema-v129)', () => {
  it('a grant application at "submitted" gets a grant home at that stage, not a manuscript', async () => {
    const { status, body } = await create({ title: 'R01 renewal', kind: 'grant_application', stage: 'submitted' })
    expect(status).toBe(201)
    const id = body.data!.id as string
    expect(homeOf(id)).toEqual([{ kind: 'grant_application', stage: 'submitted', is_home: 1 }])
    // The response carries the home (the browser read shape).
    expect(body.data).toMatchObject({ home_kind: 'grant_application', home_stage: 'submitted', product_count: 1, product_open_count: 1 })
    // The seed is consumed: the table is empty at rest.
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_home_seed').get()).toEqual({ n: 0 })
    // projects.stage (still written until step 3) is not a grant word.
    expect((db.prepare('SELECT stage FROM projects WHERE id = ?').get(id) as { stage: string }).stage).toBe('idea')
  })

  it('no kind = a manuscript at its first rung; a stage alone stays on the manuscript ladder', async () => {
    const a = await create({ title: 'Plain' })
    expect(homeOf(a.body.data!.id as string)).toEqual([{ kind: 'manuscript', stage: 'idea', is_home: 1 }])
    const b = await create({ title: 'Drafting', stage: 'writing' })
    expect(homeOf(b.body.data!.id as string)).toEqual([{ kind: 'manuscript', stage: 'writing', is_home: 1 }])
  })

  it('a kind with no stage starts on that kind\'s first rung', async () => {
    const { body } = await create({ title: 'Prize', kind: 'honor' })
    expect(homeOf(body.data!.id as string)).toEqual([{ kind: 'honor', stage: 'preparing', is_home: 1 }])
  })

  it('an off-ladder pair is refused in words and no project lands', async () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n
    const bad = await create({ title: 'Wrong', kind: 'grant_application', stage: 'writing' })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toMatch(/not on the grant_application ladder/)
    const unknown = await create({ title: 'Wrong kind', kind: 'novel' })
    expect(unknown.status).toBe(400)
    expect((db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n).toBe(before)
  })

  it('the trigger itself refuses an off-ladder seed: the batch rolls back whole', () => {
    expect(() => db.transaction(() => {
      db.prepare("INSERT INTO project_home_seed (project_id, kind, stage) VALUES ('proj_x', 'grant_application', 'writing')").run()
    })()).toThrow(/FOREIGN KEY/)
  })

  it('a create with no seed behaves as v125 did (PB creates until the PB lane lands)', () => {
    db.prepare("INSERT INTO projects (id, title, slug, stage, status, category) VALUES ('proj_pb1', 'PB made', 'pb-made', 'submitted', 'active', 'MNCCORE')").run()
    expect(homeOf('proj_pb1')).toEqual([{ kind: 'manuscript', stage: 'submitted', is_home: 1 }])
  })

  it('GET /api/projects carries each project\'s home product, and the sync wire does not', async () => {
    const { body } = await create({ title: 'Abstract', kind: 'abstract' })
    const id = body.data!.id as string
    const browser = await (await handleGetProjects(new URL('https://x/api/projects'), env)).json() as { data: Record<string, unknown>[] }
    expect(browser.data.find((r) => r.id === id)).toMatchObject({ home_kind: 'abstract', home_kind_label: expect.any(String), product_count: 1 })
    const wire = await (await handleGetProjects(new URL('https://x/api/projects?seq_after=0'), env)).json() as { data: Record<string, unknown>[] }
    const row = wire.data.find((r) => r.id === id)!
    expect('home_kind' in row).toBe(false)
    expect('stage' in row).toBe(true)
  })
})
