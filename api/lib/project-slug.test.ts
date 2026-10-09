// A project slug may never spell a project id (2026-10-09, cold review): the
// helpers, the mutation chokepoint every project write passes (processOne,
// reached by POST /api/mutations and in-Worker applyMutation alike), and the
// schema-v121 trigger replayed from the migration chain.

import { describe, it, expect } from 'vitest'
import { isValidProjectSlug, looksLikeProjectId } from './project-slug'
import { applyMutation } from '../routes/mutations'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import type { Env } from '../helpers'

describe('project-slug helpers', () => {
  it('accepts the create format and refuses everything else', () => {
    for (const ok of ['a', 'lpv-adherence-paper', 'clif-2026', 'x1-y2']) expect(isValidProjectSlug(ok), ok).toBe(true)
    for (const bad of ['proj_01ABC', 'Proj', 'a_b', '-a', 'a-', 'a--b', '', 'a b', 'a/b', null, 7]) expect(isValidProjectSlug(bad), String(bad)).toBe(false)
  })
  it('looksLikeProjectId is case-blind on the proj_ prefix', () => {
    expect(looksLikeProjectId('proj_01ABC')).toBe(true)
    expect(looksLikeProjectId('PROJ_x')).toBe(true)
    expect(looksLikeProjectId('project-x')).toBe(false)
    expect(looksLikeProjectId(undefined)).toBe(false)
  })
})

describe('the mutation chokepoint refuses an id-shaped slug from any caller', () => {
  const world = () => {
    const db = prodSchemaDb()
    insertRow(db, 'projects', { id: 'proj_mine', slug: 'mine', title: 'Mine', category: 'MNCCORE', status: 'active', stage: 'idea' })
    insertRow(db, 'projects', { id: 'proj_hidden', slug: 'hidden', title: 'Hidden', category: 'MNCCORE', status: 'active', stage: 'idea' })
    return { db, env: { DB: d1Adapter(db) } as unknown as Env }
  }
  const user = { email: 'service@api', name: 'PB', slug: 'nick-ingraham' }

  it('update: a slug set to another project id is refused and nothing changes', async () => {
    const { db, env } = world()
    const res = await applyMutation(env, { table: 'projects', record_id: 'proj_mine', op: 'update', patch: { slug: 'proj_hidden' }, route: 'test', user })
    expect(res.status).not.toBe('accepted')
    expect((db.prepare("SELECT slug FROM projects WHERE id = 'proj_mine'").get() as { slug: string }).slug).toBe('mine')
  })

  it('insert: a new project whose slug is id-shaped is refused', async () => {
    const { db, env } = world()
    const res = await applyMutation(env, {
      table: 'projects', record_id: 'proj_new', op: 'insert',
      payload: { title: 'New', slug: 'PROJ_hidden', status: 'active', stage: 'idea', category: 'MNCCORE' }, route: 'test', user,
    })
    expect(res.status).not.toBe('accepted')
    expect(db.prepare("SELECT COUNT(*) AS n FROM projects WHERE id = 'proj_new'").get()).toEqual({ n: 0 })
  })

  it('an ordinary slug change still lands', async () => {
    const { db, env } = world()
    const res = await applyMutation(env, { table: 'projects', record_id: 'proj_mine', op: 'update', patch: { slug: 'mine-renamed' }, route: 'test', user })
    expect(res.status).toBe('accepted')
    expect((db.prepare("SELECT slug FROM projects WHERE id = 'proj_mine'").get() as { slug: string }).slug).toBe('mine-renamed')
  })
})

describe('schema-v121 triggers (D1 itself)', () => {
  const db = () => {
    const d = prodSchemaDb()
    insertRow(d, 'projects', { id: 'proj_a', slug: 'a', title: 'A', category: 'MNCCORE', status: 'active', stage: 'idea' })
    insertRow(d, 'projects', { id: 'legacyid', slug: 'b', title: 'B', category: 'MNCCORE', status: 'active', stage: 'idea' })
    return d
  }
  it('refuses a slug that starts with proj_ or equals any project id, on insert and update', () => {
    const d = db()
    expect(() => d.prepare("UPDATE projects SET slug = 'proj_x' WHERE id = 'proj_a'").run()).toThrow(/may not be a project id/)
    expect(() => d.prepare("UPDATE projects SET slug = 'legacyid' WHERE id = 'proj_a'").run()).toThrow(/may not be a project id/)
    expect(() => insertRow(d, 'projects', { id: 'proj_c', slug: 'Proj_y', title: 'C', category: 'MNCCORE', status: 'active', stage: 'idea' })).toThrow(/may not be a project id/)
  })
  it('refuses a new id equal to an existing slug, and leaves ordinary writes alone', () => {
    const d = db()
    expect(() => insertRow(d, 'projects', { id: 'a', slug: 'zzz', title: 'Z', category: 'MNCCORE', status: 'active', stage: 'idea' })).toThrow(/may not be a project id/)
    d.prepare("UPDATE projects SET slug = 'a-renamed', title = 'A2' WHERE id = 'proj_a'").run()
    d.prepare("UPDATE projects SET slug = 'a-renamed' WHERE id = 'proj_a'").run()
  })
  it('allows one attachment row per R2 key', () => {
    const d = db()
    insertRow(d, 'file_attachments', { id: 'f1', entity_type: 'project', entity_id: 'a', filename: 'x', r2_key: 'project/a/x' })
    expect(() => insertRow(d, 'file_attachments', { id: 'f2', entity_type: 'project', entity_id: 'b', filename: 'x', r2_key: 'project/a/x' })).toThrow(/UNIQUE/)
  })
})
