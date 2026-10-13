/**
 * api/routes/products.scoped-items.test.ts -- schema-v131: a product's own
 * description, and product tags on files, revisions and activity.
 *
 * Nick, 2026-10-12: untagged items are project-wide and show under every
 * product; tagged items show under their product. The client functions run
 * unchanged against the real worker on the migration-chain database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { addProduct, describeProduct, setProductStage, tagItem } from '../../src/lib/products'
import { postActivityEntry } from '../lib/activity-entry'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PI_EMAIL = 'ingra107@umn.edu'
const OUTSIDER_EMAIL = 'eddin022@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const OTHER_PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTJ'
const HOME = 'prd_01KXH4E23G0DTFGFBYS2C8RGTH'

let db: InstanceType<typeof Database>
let env: Env
let as = PI_EMAIL
const realFetch = global.fetch
const rows = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: OUTSIDER_EMAIL })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  as = PI_EMAIL
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'projects', { id: OTHER_PROJECT, slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active' }, { stage: 'writing' })
  insertRow(db, 'project_members', { project_id: OTHER_PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    worker.fetch(new Request(`https://hub.test${String(input)}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': as },
    }), env, CTX)) as unknown as typeof fetch
})

afterEach(() => { global.fetch = realFetch })

async function second() {
  const p = await addProduct('r03', { kind: 'manuscript', stage: 'idea', name: 'Protocol paper' })
  return p.id
}

describe('products.description', () => {
  it('a member writes a product description; empty clears it; the read sends it', async () => {
    const w = await describeProduct('r03', HOME, '  The trial itself.  ')
    expect(w.id).toBe(HOME)
    expect(rows('SELECT description FROM products WHERE id = ?', HOME)[0].description).toBe('The trial itself.')
    const read = await (await fetch('/api/projects/r03/products')).json() as { products: { id: string; description: string | null }[] }
    expect(read.products.find((p) => p.id === HOME)!.description).toBe('The trial itself.')
    await describeProduct('r03', HOME, '   ')
    expect(rows('SELECT description FROM products WHERE id = ?', HOME)[0].description).toBeNull()
  })

  it('refuses a product of another project and a description that is too long', async () => {
    insertRow(db, 'products', { id: 'prd_other', project_id: OTHER_PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
    await expect(describeProduct('r03', 'prd_other', 'x')).rejects.toMatchObject({ status: 404 })
    await expect(describeProduct('r03', HOME, 'x'.repeat(4001))).rejects.toMatchObject({ status: 400 })
  })
})

describe('product tags on files, revisions and activity', () => {
  it('re-tags a file, a revision and a project entry, and null returns each to project-wide', async () => {
    const prd = await second()
    insertRow(db, 'file_attachments', { id: 'f1', entity_type: 'project', entity_id: 'r03', filename: 'a.pdf', r2_key: 'project/r03/a.pdf' })
    insertRow(db, 'manuscript_revisions', { id: 'rev1', project_id: PROJECT, round: 1 })
    insertRow(db, 'activity_entries', { id: 'ae1', entity_type: 'project', entity_id: PROJECT, project_id: PROJECT, kind: 'update', visibility: 'team', actor_slug: 'nick-ingraham', body: 'note', update_type: 'progress' })

    await tagItem('r03', 'file', 'f1', prd)
    await tagItem('r03', 'revision', 'rev1', prd)
    await tagItem('r03', 'activity', 'ae1', prd)
    expect(rows('SELECT product_id FROM file_attachments WHERE id = ?', 'f1')[0].product_id).toBe(prd)
    expect(rows('SELECT product_id FROM manuscript_revisions WHERE id = ?', 'rev1')[0].product_id).toBe(prd)
    expect(rows('SELECT product_id FROM activity_entries WHERE id = ?', 'ae1')[0].product_id).toBe(prd)

    await tagItem('r03', 'file', 'f1', null)
    expect(rows('SELECT product_id FROM file_attachments WHERE id = ?', 'f1')[0].product_id).toBeNull()
  })

  it('refuses a product from another project, and an item from another project', async () => {
    insertRow(db, 'products', { id: 'prd_other', project_id: OTHER_PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
    insertRow(db, 'file_attachments', { id: 'f1', entity_type: 'project', entity_id: 'r03', filename: 'a.pdf', r2_key: 'project/r03/a.pdf' })
    insertRow(db, 'file_attachments', { id: 'f2', entity_type: 'project', entity_id: 'other', filename: 'b.pdf', r2_key: 'project/other/b.pdf' })
    await expect(tagItem('r03', 'file', 'f1', 'prd_other')).rejects.toMatchObject({ status: 404 })
    await expect(tagItem('r03', 'file', 'f2', HOME)).rejects.toMatchObject({ status: 404 })
  })

  it('the D1 triggers refuse a product outside the item\'s project, whoever writes it', () => {
    insertRow(db, 'products', { id: 'prd_other', project_id: OTHER_PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
    expect(() => insertRow(db, 'file_attachments', { id: 'f9', entity_type: 'project', entity_id: 'r03', filename: 'x', r2_key: 'k9', product_id: 'prd_other' }))
      .toThrow(/item_product_project_mismatch/)
    expect(() => insertRow(db, 'file_attachments', { id: 'f8', entity_type: 'task', entity_id: 'task_1', filename: 'x', r2_key: 'k8', product_id: HOME }))
      .toThrow(/item_product_project_mismatch/)
    expect(() => insertRow(db, 'manuscript_revisions', { id: 'rv9', project_id: PROJECT, round: 1, product_id: 'prd_other' }))
      .toThrow(/item_product_project_mismatch/)
    expect(() => insertRow(db, 'activity_entries', { id: 'ae9', entity_type: 'project', entity_id: PROJECT, project_id: PROJECT, kind: 'update', visibility: 'team', actor_slug: 'nick-ingraham', body: 'x', product_id: 'prd_other' }))
      .toThrow(/item_product_project_mismatch/)
  })

  it('a note posted with a product is tagged; the feed sends it; a stranger product is a 400', async () => {
    const prd = await second()
    const post = await fetch('/api/projects/r03/updates', { method: 'POST', body: JSON.stringify({ content: 'protocol note', product_id: prd }) })
    expect(post.status).toBe(201)
    const feed = await (await fetch('/api/projects/r03/activity')).json() as { data: { body: string; product_id: string | null }[] }
    expect(feed.data.find((e) => e.body === 'protocol note')!.product_id).toBe(prd)
    const plain = await fetch('/api/projects/r03/updates', { method: 'POST', body: JSON.stringify({ content: 'umbrella note' }) })
    expect(plain.status).toBe(201)
    const feed2 = await (await fetch('/api/projects/r03/activity')).json() as { data: { body: string; product_id: string | null }[] }
    expect(feed2.data.find((e) => e.body === 'umbrella note')!.product_id).toBeNull()
    insertRow(db, 'products', { id: 'prd_other', project_id: OTHER_PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
    const bad = await fetch('/api/projects/r03/updates', { method: 'POST', body: JSON.stringify({ content: 'x', product_id: 'prd_other' }) })
    expect(bad.status).toBe(400)
  })

  it('a product stage line lands on the feed tagged to that product', async () => {
    const prd = await second()
    const stages = rows("SELECT stage FROM product_stages WHERE kind = 'manuscript' ORDER BY ordinal")
    await setProductStage('r03', prd, String(stages[2].stage))
    const feed = await (await fetch('/api/projects/r03/activity')).json() as { data: { body: string; product_id: string | null }[] }
    const line = feed.data.find((e) => e.body.startsWith('Stage (Protocol paper)'))
    expect(line).toBeTruthy()
    expect(line!.product_id).toBe(prd)
  })

  it('a lifecycle line for a tombstoned product is kept and tagged; a person\'s write to it is a 400', async () => {
    const prd = await second()
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = ?").run(prd)
    const posted = await postActivityEntry({
      env, user: { email: PI_EMAIL, slug: 'nick-ingraham' } as never,
      entityType: 'project', entityId: PROJECT, kind: 'system', body: 'Stage (Protocol paper): Idea → Writing',
      actorSlug: 'nick-ingraham', visibility: 'team', fireSideEffects: false,
      sourceTable: 'lifecycle', sourceId: 'mut_x:product_stage', productId: prd,
    })
    expect(posted.ok).toBe(true)
    expect(rows("SELECT product_id FROM activity_entries WHERE source_id = 'mut_x:product_stage'")[0].product_id).toBe(prd)
    const person = await fetch('/api/projects/r03/updates', { method: 'POST', body: JSON.stringify({ content: 'late note', product_id: prd }) })
    expect(person.status).toBe(400)
  })

  it('POST /api/tasks takes a live product of the task\'s project, and says why it refuses any other', async () => {
    const prd = await second()
    const make = (extra: Record<string, unknown>) => fetch('/api/tasks', {
      method: 'POST', body: JSON.stringify({ description: `t ${Math.random()}`, assignee: 'nick-ingraham', ...extra }),
    })
    const ok = await make({ project_id: 'r03', product_id: prd })
    expect(ok.status).toBe(201)
    expect(rows("SELECT product_id FROM tasks WHERE description LIKE 't %' ORDER BY created_at DESC LIMIT 1")[0].product_id).toBe(prd)
    insertRow(db, 'products', { id: 'prd_other', project_id: OTHER_PROJECT, kind: 'manuscript', stage: 'idea', is_home: 0 })
    expect((await make({ project_id: 'r03', product_id: 'prd_other' })).status).toBe(400)
    expect((await make({ product_id: prd })).status).toBe(400)
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = ?").run(prd)
    const dead = await make({ project_id: 'r03', product_id: prd })
    expect(dead.status).toBe(400)
    expect(((await dead.json()) as { error: string }).error).toMatch(/not in this project/)
  })

  it('a non-member cannot re-tag', async () => {
    insertRow(db, 'file_attachments', { id: 'f1', entity_type: 'project', entity_id: 'r03', filename: 'a.pdf', r2_key: 'project/r03/a.pdf' })
    as = OUTSIDER_EMAIL
    await expect(tagItem('r03', 'file', 'f1', HOME)).rejects.toMatchObject({ status: 404 })
    expect(rows('SELECT product_id FROM file_attachments WHERE id = ?', 'f1')[0].product_id).toBeNull()
  })
})
