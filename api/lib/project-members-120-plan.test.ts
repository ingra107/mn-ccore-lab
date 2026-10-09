// project-members-120-plan.test.ts -- the #145 Lane B seed and the v120
// triggers, on the migrated schema (prodSchemaDb: the real chain, FKs on).

import { describe, it, expect } from 'vitest'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'
import { planProjectMembers, SEED_SOURCE } from '../../scripts/project-members-120-plan'

const team = [
  { slug: 'nick-ingraham', email: 'ingra107@umn.edu', name: 'Nick Ingraham' },
  { slug: 'casey-eddington', email: 'eddin022@umn.edu', name: 'Casey Eddington' },
  { slug: 'nate-mesfin', email: 'mesfin@umn.edu', name: 'Nate Mesfin' },
]
const projects = [
  { id: 'proj_a', slug: 'a', title: 'Alpha', category: 'MNCCORE', pi: 'nate-mesfin', deleted_at: null },
  { id: 'proj_b', slug: 'b', title: 'Beta', category: 'CLIF', pi: 'Some Outside PI', deleted_at: null },
  { id: 'proj_pb', slug: 'pb', title: 'PB thing', category: 'Peripheral Brain', pi: 'nick-ingraham', deleted_at: null },
  { id: 'proj_gone', slug: 'gone', title: 'Gone', category: 'MNCCORE', pi: 'casey-eddington', deleted_at: '2026-01-01' },
]
const assignments = [
  { project_id: 'proj_a', assignee: 'casey-eddington' },
  { project_id: 'b', assignee: 'EDDIN022@umn.edu' },       // a slug ref and an email: both resolve
  { project_id: 'proj_b', assignee: 'not_a_real_person' }, // reported, not seeded
  { project_id: 'proj_pb', assignee: 'casey-eddington' },  // PB: skipped
  { project_id: 'proj_gone', assignee: 'nate-mesfin' },    // deleted project: not seeded
  { project_id: 'proj_missing', assignee: 'nate-mesfin' }, // unknown project: ignored
]

describe('the seed plan', () => {
  const plan = planProjectMembers(projects, assignments, team)

  it('Nick on every live project; others from assignees and pi; no PB, deleted or unknown person', () => {
    expect(plan.pairs.map((p) => `${p.member_slug}@${p.project_id}`)).toEqual([
      'casey-eddington@proj_a', 'casey-eddington@proj_b',
      'nate-mesfin@proj_a',
      'nick-ingraham@proj_a', 'nick-ingraham@proj_b', 'nick-ingraham@proj_pb',
    ])
    expect(plan.unresolved.join('\n')).toContain('not_a_real_person')
    expect(plan.unresolved.join('\n')).toContain('Some Outside PI')
    expect(plan.skippedPb).toEqual(['casey-eddington on pb: Peripheral Brain project, not seeded'])
  })

  it('prints a per-person list', () => {
    expect(plan.perPerson[0]).toBe('casey-eddington (Casey Eddington): 2 project(s)')
    expect(plan.perPerson.join('\n')).toContain('Alpha [a]  <- assignee')
    expect(plan.perPerson.join('\n')).toContain('every live project (3)')
  })

  it('applies on the migrated schema, is idempotent, and its rollback removes exactly its rows', () => {
    const db = prodSchemaDb()
    for (const t of team) insertRow(db, 'team_members', { id: `tm-${t.slug}`, name: t.name, slug: t.slug, email: t.email })
    for (const p of projects) insertRow(db, 'projects', { ...p, status: 'active', stage: 'idea' })
    // A trigger-made row (the pi trigger adds nate on proj_a) must survive the rollback.
    const before = db.prepare('SELECT project_id, member_slug, added_by FROM project_members ORDER BY 1, 2').all()
    // The pi trigger skips proj_gone (deleted) and proj_pb (Peripheral Brain).
    expect(before).toEqual([{ project_id: 'proj_a', member_slug: 'nate-mesfin', added_by: 'pi' }])
    db.exec(plan.apply)
    db.exec(plan.apply)
    const seeded = db.prepare('SELECT COUNT(*) AS n FROM project_members WHERE added_by = ?').get(SEED_SOURCE) as { n: number }
    expect(seeded.n).toBe(5) // 6 pairs, nate@proj_a already there from the trigger
    db.exec(plan.rollback)
    expect(db.prepare('SELECT project_id, member_slug, added_by FROM project_members ORDER BY 1, 2').all()).toEqual(before)
  })
})

describe('the v120 triggers', () => {
  function base() {
    const db = prodSchemaDb()
    for (const t of team) insertRow(db, 'team_members', { id: `tm-${t.slug}`, name: t.name, slug: t.slug, email: t.email })
    insertRow(db, 'projects', { id: 'proj_x', slug: 'x', title: 'X', category: 'MNCCORE', status: 'active', stage: 'idea' })
    return db
  }
  const members = (db: ReturnType<typeof base>) =>
    db.prepare("SELECT member_slug, added_by FROM project_members WHERE project_id = 'proj_x' ORDER BY 1").all()

  it('an assignment joins the assignee, by id or legacy slug; a reassignment joins the new one', () => {
    const db = base()
    insertRow(db, 'tasks', { id: 't1', project_id: 'x', title: 't1', assignee: 'casey-eddington' })
    expect(members(db)).toEqual([{ member_slug: 'casey-eddington', added_by: 'assignment' }])
    db.prepare("UPDATE tasks SET assignee = 'nate-mesfin' WHERE id = 't1'").run()
    expect(members(db)).toEqual([{ member_slug: 'casey-eddington', added_by: 'assignment' }, { member_slug: 'nate-mesfin', added_by: 'assignment' }])
  })

  it('an unknown assignee, a deleted task or a project-less task joins no one and the task write stands', () => {
    const db = base()
    insertRow(db, 'tasks', { id: 't2', project_id: 'proj_x', title: 't2', assignee: 'ningraha' })
    insertRow(db, 'tasks', { id: 't3', project_id: 'proj_x', title: 't3', assignee: 'casey-eddington', deleted_at: '2026-01-01', status: 'deleted' })
    insertRow(db, 'tasks', { id: 't4', title: 't4', assignee: 'casey-eddington' })
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE id IN ('t2','t3','t4')").get()).toEqual({ n: 3 })
    expect(members(db)).toEqual([])
  })

  it('a second assignment does not touch the existing row', () => {
    const db = base()
    insertRow(db, 'project_members', { project_id: 'proj_x', member_slug: 'casey-eddington', added_by: 'nick-ingraham' })
    insertRow(db, 'tasks', { id: 't5', project_id: 'proj_x', title: 't5', assignee: 'casey-eddington' })
    expect(members(db)).toEqual([{ member_slug: 'casey-eddington', added_by: 'nick-ingraham' }])
  })

  it('naming a pi joins them; a Peripheral Brain project joins no one', () => {
    const db = base()
    db.prepare("UPDATE projects SET pi = 'nate-mesfin' WHERE id = 'proj_x'").run()
    expect(members(db)).toEqual([{ member_slug: 'nate-mesfin', added_by: 'pi' }])
    insertRow(db, 'projects', { id: 'proj_pb', slug: 'pb', title: 'PB', category: 'Peripheral Brain', pi: 'nate-mesfin', status: 'active', stage: 'idea' })
    insertRow(db, 'tasks', { id: 't6', project_id: 'proj_pb', title: 't6', assignee: 'casey-eddington' })
    expect(db.prepare("SELECT COUNT(*) AS n FROM project_members WHERE project_id = 'proj_pb'").get()).toEqual({ n: 0 })
  })

  it('a member row blocks deleting the team member (RESTRICT) and follows a slug rename (CASCADE)', () => {
    const db = base()
    insertRow(db, 'project_members', { project_id: 'proj_x', member_slug: 'casey-eddington', added_by: 't' })
    expect(() => db.prepare("DELETE FROM team_members WHERE slug = 'casey-eddington'").run()).toThrow(/FOREIGN KEY/)
    db.prepare("UPDATE team_members SET slug = 'casey-e' WHERE slug = 'casey-eddington'").run()
    expect(members(db)).toEqual([{ member_slug: 'casey-e', added_by: 't' }])
  })
})
