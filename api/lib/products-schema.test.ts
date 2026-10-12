// schema-v124 (projects hold products): every wrong state the migration claims
// to refuse, attempted against the schema replayed from the real migration
// chain (prodSchemaDb, FKs on as D1). The wrangler-local twin of these checks,
// plus the tasks-rebuild cascade probe, is scripts/probe-v124-products.ts.
//
// Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

import { describe, it, expect } from 'vitest'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'

type Db = ReturnType<typeof prodSchemaDb>

function world(): Db {
  const db = prodSchemaDb()
  // These are v124's constraints, tested on projects as they were before
  // schema-v125 (no auto-made home product). v125's create paths:
  // api/routes/mutations.product-home.test.ts.
  db.exec('DROP TRIGGER trg_projects_home_product_ins')
  for (const [id, slug] of [['proj_A', 'a'], ['proj_B', 'b']]) {
    insertRow(db, 'projects', { id, slug, title: slug.toUpperCase(), category: 'MNCCORE', status: 'active', stage: 'idea' })
  }
  return db
}

function product(db: Db, id: string, project_id: string, kind = 'manuscript', stage = 'writing', extra: Record<string, unknown> = {}) {
  return insertRow(db, 'products', { id, project_id, kind, stage, ...extra })
}

function task(db: Db, id: string, project_id: string | null, product_id: string | null) {
  return insertRow(db, 'tasks', { id, project_id, product_id, title: id, assignee: 'nobody' })
}

const refuses = (fn: () => unknown, msg: RegExp) => expect(fn).toThrow(msg)
const FK = /FOREIGN KEY constraint failed/

describe('v124 catalog: kinds and ladders are seeded data', () => {
  it('seeds the kinds (v124 six, v125 honor) and only award can fund', () => {
    const db = prodSchemaDb()
    const kinds = db.prepare('SELECT kind, can_fund FROM product_kinds ORDER BY sort_order').all()
    expect(kinds).toEqual([
      { kind: 'manuscript', can_fund: 0 }, { kind: 'abstract', can_fund: 0 },
      { kind: 'grant_application', can_fund: 0 }, { kind: 'award', can_fund: 1 },
      { kind: 'honor', can_fund: 0 }, { kind: 'trial_ops', can_fund: 0 }, { kind: 'infrastructure', can_fund: 0 },
    ])
  })
  it('seeds the ladders Nick named', () => {
    const db = prodSchemaDb()
    const ladder = (k: string) => (db.prepare('SELECT stage FROM product_stages WHERE kind = ? ORDER BY ordinal').all(k) as { stage: string }[]).map((r) => r.stage)
    expect(ladder('grant_application')).toEqual(['preparing', 'submitted', 'scored', 'funded', 'not_funded'])
    expect(ladder('award')).toEqual(['active', 'no_cost_extension', 'closeout', 'closed'])
    expect(ladder('trial_ops')).toEqual(['start_up', 'enrolling', 'follow_up', 'closeout', 'closed'])
    expect(ladder('infrastructure')).toEqual(['planning', 'building', 'running', 'retired'])
    expect(ladder('manuscript')).toEqual(['idea', 'data_collection', 'data_analysis', 'writing', 'submitted', 'revisions', 'accepted', 'published'])
  })
  it('award and trial_ops end at closed; closeout is not terminal (Nick, build rulings)', () => {
    const db = prodSchemaDb()
    const terminal = (k: string) => (db.prepare('SELECT stage FROM product_stages WHERE kind = ? AND is_terminal = 1 ORDER BY ordinal').all(k) as { stage: string }[]).map((r) => r.stage)
    expect(terminal('award')).toEqual(['closed'])
    expect(terminal('trial_ops')).toEqual(['closed'])
  })
})

describe('v124 products: stage is on its kind ladder (Level 1, composite FK)', () => {
  it('a valid product lands and gets a seq', () => {
    const db = world()
    const row = product(db, 'prd_1', 'proj_A')
    expect(row.seq).toBeGreaterThan(0)
    expect(row.lineage_rank).toBe(0)
  })
  it('refuses a stage from another kind ladder', () => {
    const db = world()
    refuses(() => product(db, 'prd_1', 'proj_A', 'manuscript', 'enrolling'), FK)
    refuses(() => product(db, 'prd_2', 'proj_A', 'grant_application', 'writing'), FK)
  })
  it('refuses an unknown kind', () => {
    refuses(() => product(world(), 'prd_1', 'proj_A', 'poem', 'idea'), FK)
  })
  it('refuses changing kind without a stage on the new ladder, accepts both together', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    refuses(() => db.prepare("UPDATE products SET kind = 'trial_ops' WHERE id = 'prd_1'").run(), FK)
    db.prepare("UPDATE products SET kind = 'trial_ops', stage = 'enrolling' WHERE id = 'prd_1'").run()
    expect(db.prepare("SELECT kind, stage FROM products WHERE id = 'prd_1'").get()).toEqual({ kind: 'trial_ops', stage: 'enrolling' })
  })
  it('a stage code renamed on the ladder carries its products along', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A', 'trial_ops', 'start_up')
    db.prepare("UPDATE product_stages SET stage = 'startup' WHERE kind = 'trial_ops' AND stage = 'start_up'").run()
    expect(db.prepare("SELECT stage FROM products WHERE id = 'prd_1'").get()).toEqual({ stage: 'startup' })
  })
  it('refuses an id without the prd_ prefix', () => {
    refuses(() => product(world(), 'proj_X', 'proj_A'), /products_id_prefix/)
  })
})

describe('v124 products: owned by a project, never by a product (Level 1)', () => {
  it('refuses a product whose owner is a product', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    refuses(() => product(db, 'prd_2', 'prd_1'), FK)
  })
  it('refuses a missing owner', () => {
    refuses(() => product(world(), 'prd_1', 'proj_missing'), FK)
  })
})

describe('v124 products: project_id is immutable (Level 2 trigger)', () => {
  it('refuses moving a product to another project', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    refuses(() => db.prepare("UPDATE products SET project_id = 'proj_B' WHERE id = 'prd_1'").run(), /product_project_immutable/)
  })
  it('a project PK re-key cascades to its products', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    db.prepare("UPDATE projects SET id = 'proj_A2' WHERE id = 'proj_A'").run()
    expect(db.prepare("SELECT project_id FROM products WHERE id = 'prd_1'").get()).toEqual({ project_id: 'proj_A2' })
  })
})

describe('v124 products: a live project keeps one live product (Level 2 trigger)', () => {
  it('refuses soft- and hard-deleting the last live product', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    refuses(() => db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_1'").run(), /product_last_live/)
    refuses(() => db.prepare("DELETE FROM products WHERE id = 'prd_1'").run(), /product_last_live/)
  })
  it('allows deleting one of two, and the last once the project is deleted', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    product(db, 'prd_2', 'proj_A', 'abstract', 'planning')
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_2'").run()
    db.prepare("UPDATE projects SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'proj_A'").run()
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_1'").run()
    expect(db.prepare("SELECT COUNT(*) AS n FROM products WHERE deleted_at IS NULL").get()).toEqual({ n: 0 })
  })
})

describe('v124 products: at most one live home product per project (Level 1, partial unique index)', () => {
  it('defaults to not home', () => {
    expect(product(world(), 'prd_1', 'proj_A').is_home).toBe(0)
  })
  it('refuses a second live home by insert; marking another home hands the marker over (v125)', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A', 'trial_ops', 'start_up', { is_home: 1 })
    refuses(() => product(db, 'prd_2', 'proj_A', 'manuscript', 'writing', { is_home: 1 }), /UNIQUE constraint failed/)
    product(db, 'prd_3', 'proj_A')
    db.prepare("UPDATE products SET is_home = 1 WHERE id = 'prd_3'").run()
    expect(db.prepare('SELECT id FROM products WHERE is_home = 1').all()).toEqual([{ id: 'prd_3' }])
  })
  it('a home in another project is fine', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A', 'trial_ops', 'start_up', { is_home: 1 })
    product(db, 'prd_2', 'proj_B', 'trial_ops', 'start_up', { is_home: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM products WHERE is_home = 1').get()).toEqual({ n: 2 })
  })
  it('a live project\'s home cannot be tombstoned while others are live (v125); a tombstoned home does not block naming a new one', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A', 'trial_ops', 'start_up', { is_home: 1 })
    product(db, 'prd_2', 'proj_A')
    refuses(() => db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_1'").run(), /product_home_live/)
    // Once the project is deleted the guard steps aside, as keep_one_live does.
    db.prepare("UPDATE projects SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'proj_A'").run()
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_1'").run()
    db.prepare("UPDATE products SET is_home = 1 WHERE id = 'prd_2'").run()
    expect(db.prepare("SELECT is_home FROM products WHERE id = 'prd_2'").get()).toEqual({ is_home: 1 })
  })
  it('refuses a value other than 0 or 1', () => {
    refuses(() => product(world(), 'prd_1', 'proj_A', 'manuscript', 'writing', { is_home: 2 }), /products_is_home_bool/)
  })
})

describe('v124 grew_from: acyclic and inside one umbrella (Level 1, rank + composite FK)', () => {
  it('an A1 records "resubmission of" its A0', () => {
    const db = world()
    product(db, 'prd_a0', 'proj_A', 'grant_application', 'not_funded')
    const a1 = product(db, 'prd_a1', 'proj_A', 'grant_application', 'preparing', { grew_from_id: 'prd_a0', grew_from_rank: 0, lineage_rank: 1 })
    expect(a1.grew_from_id).toBe('prd_a0')
  })
  it('does not depend on mint order: an older id may grow from a newer one', () => {
    const db = world()
    product(db, 'prd_Z_abstract', 'proj_A', 'abstract', 'presented')
    product(db, 'prd_A_manuscript', 'proj_A', 'manuscript', 'writing', { grew_from_id: 'prd_Z_abstract', grew_from_rank: 0, lineage_rank: 1 })
  })
  it('refuses a self-link', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    product(db, 'prd_2', 'proj_A')
    refuses(() => db.prepare("UPDATE products SET grew_from_id = 'prd_1', grew_from_rank = 0 WHERE id = 'prd_1'").run(), /products_lineage/)
    refuses(() => db.prepare("UPDATE products SET grew_from_id = 'prd_1', grew_from_rank = 0, lineage_rank = 1 WHERE id = 'prd_1'").run(), FK)
  })
  it('refuses closing a cycle', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    product(db, 'prd_2', 'proj_A', 'manuscript', 'writing', { grew_from_id: 'prd_1', grew_from_rank: 0, lineage_rank: 1 })
    // prd_1 grew from prd_2: needs rank > 1, which strands prd_2's edge to (prd_1, rank 0).
    refuses(() => db.prepare("UPDATE products SET grew_from_id = 'prd_2', grew_from_rank = 1, lineage_rank = 2 WHERE id = 'prd_1'").run(), FK)
    // keeping prd_1's rank breaks the CHECK instead.
    refuses(() => db.prepare("UPDATE products SET grew_from_id = 'prd_2', grew_from_rank = 1 WHERE id = 'prd_1'").run(), /products_lineage/)
  })
  it('refuses a lying rank and a half-written edge', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A', 'manuscript', 'writing', { lineage_rank: 3 })
    refuses(() => product(db, 'prd_2', 'proj_A', 'manuscript', 'writing', { grew_from_id: 'prd_1', grew_from_rank: 0, lineage_rank: 1 }), FK)
    refuses(() => product(db, 'prd_3', 'proj_A', 'manuscript', 'writing', { grew_from_id: 'prd_1' }), /products_lineage/)
  })
  it('refuses growing from a product in another project', () => {
    const db = world()
    product(db, 'prd_1', 'proj_A')
    refuses(() => product(db, 'prd_2', 'proj_B', 'manuscript', 'writing', { grew_from_id: 'prd_1', grew_from_rank: 0, lineage_rank: 1 }), FK)
  })
})

describe('v124 product_funding: only an award funds, never an application (Level 1)', () => {
  const setup = () => {
    const db = world()
    product(db, 'prd_paper', 'proj_A')
    product(db, 'prd_k23', 'proj_B', 'award', 'active')
    product(db, 'prd_k23_a0', 'proj_B', 'grant_application', 'funded')
    return db
  }
  const fund = (db: Db, id: string, product_id: string, funder_id: string, funder_kind: string) =>
    insertRow(db, 'product_funding', { id, product_id, funder_id, funder_kind })

  it('an award funds a paper in another project', () => {
    const db = setup()
    expect(fund(db, 'pf_1', 'prd_paper', 'prd_k23', 'award').seq).toBeGreaterThan(0)
  })
  it('refuses a non-funding kind, a lie about the funder kind, and self-funding', () => {
    const db = setup()
    refuses(() => fund(db, 'pf_1', 'prd_paper', 'prd_k23_a0', 'grant_application'), FK)
    refuses(() => fund(db, 'pf_2', 'prd_paper', 'prd_k23_a0', 'award'), FK)
    refuses(() => fund(db, 'pf_3', 'prd_k23', 'prd_k23', 'award'), /product_funding_not_self/)
    refuses(() => insertRow(db, 'product_funding', { id: 'pf_4', product_id: 'prd_paper', funder_id: 'prd_k23', funder_kind: 'award', funder_can_fund: 0 }), /product_funding_can_fund/)
  })
  it('refuses turning a funder into a kind that cannot fund, and switching can_fund off under it', () => {
    const db = setup()
    fund(db, 'pf_1', 'prd_paper', 'prd_k23', 'award')
    refuses(() => db.prepare("UPDATE products SET kind = 'manuscript', stage = 'writing' WHERE id = 'prd_k23'").run(), FK)
    // ON UPDATE CASCADE carries the 0 into funder_can_fund, whose CHECK refuses it.
    refuses(() => db.prepare("UPDATE product_kinds SET can_fund = 0 WHERE kind = 'award'").run(), /product_funding_can_fund/)
  })
  it('refuses a duplicate live pair; a tombstone does not block re-adding', () => {
    const db = setup()
    fund(db, 'pf_1', 'prd_paper', 'prd_k23', 'award')
    refuses(() => fund(db, 'pf_2', 'prd_paper', 'prd_k23', 'award'), /UNIQUE/)
    db.prepare("UPDATE product_funding SET deleted_at = datetime('now') WHERE id = 'pf_1'").run()
    fund(db, 'pf_3', 'prd_paper', 'prd_k23', 'award')
  })
})

describe('v124 tasks.product_id: same project as the task (Level 2 trigger)', () => {
  const setup = () => {
    const db = world()
    product(db, 'prd_a', 'proj_A')
    product(db, 'prd_b', 'proj_B')
    return db
  }
  it('a task on its own project product lands; one with no product takes the only product (v125)', () => {
    const db = setup()
    expect(task(db, 'task_1', 'proj_A', 'prd_a').product_id).toBe('prd_a')
    expect(task(db, 'task_2', 'proj_A', null).product_id).toBe('prd_a')
  })
  it('refuses a product from another project on insert, and a product with no project', () => {
    const db = setup()
    refuses(() => task(db, 'task_1', 'proj_A', 'prd_b'), /task_product_project_mismatch/)
    refuses(() => task(db, 'task_2', null, 'prd_a'), /task_product_project_mismatch/)
  })
  it('refuses moving the task or its product apart on update', () => {
    const db = setup()
    task(db, 'task_1', 'proj_A', 'prd_a')
    refuses(() => db.prepare("UPDATE tasks SET project_id = 'proj_B' WHERE id = 'task_1'").run(), /task_product_project_mismatch/)
    refuses(() => db.prepare("UPDATE tasks SET product_id = 'prd_b' WHERE id = 'task_1'").run(), /task_product_project_mismatch/)
    refuses(() => db.prepare("UPDATE tasks SET project_id = NULL WHERE id = 'task_1'").run(), /task_product_project_mismatch/)
    db.prepare("UPDATE tasks SET project_id = 'proj_B', product_id = 'prd_b' WHERE id = 'task_1'").run()
    db.prepare("UPDATE tasks SET project_id = NULL, product_id = NULL WHERE id = 'task_1'").run()
  })
  it('project soft-delete cascade must clear product_id with project_id (plan step 5 dependency)', () => {
    const db = setup()
    task(db, 'task_1', 'proj_A', 'prd_a')
    // today's cascade statement (mutations.ts / projects.ts) is refused once a task has a product
    refuses(() => db.prepare("UPDATE tasks SET project_id = NULL, updated_at = datetime('now') WHERE project_id = 'proj_A' AND deleted_at IS NULL").run(), /task_product_project_mismatch/)
    db.prepare("UPDATE tasks SET project_id = NULL, product_id = NULL, updated_at = datetime('now') WHERE project_id = 'proj_A' AND deleted_at IS NULL").run()
    expect(db.prepare("SELECT project_id, product_id FROM tasks WHERE id = 'task_1'").get()).toEqual({ project_id: null, product_id: null })
  })
  it('refuses a product id that does not exist', () => {
    refuses(() => task(setup(), 'task_1', 'proj_A', 'prd_missing'), /task_product_project_mismatch|FOREIGN KEY/)
  })
})
