// project-members-120-plan.test.ts -- the #145 Lane B seed and the v120
// triggers, on the migrated schema (prodSchemaDb: the real chain, FKs on).

import { describe, it, expect } from 'vitest'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'
import { planProjectMembers, windowSweep, titleSurname, surnameOf, SEED_SOURCE, TITLE_SOURCE, WINDOW_SOURCE } from '../../scripts/project-members-120-plan'

const team = [
  { slug: 'nick-ingraham', email: 'ingra107@umn.edu', name: 'Nick Ingraham' },
  { slug: 'casey-eddington', email: 'eddin022@umn.edu', name: 'Casey Eddington' },
  { slug: 'nate-mesfin', email: 'mesfin@umn.edu', name: 'Nate Mesfin' },
  { slug: 'kendall-mceachron', email: 'kmc@umn.edu', name: 'Kendall McEachron' },
  { slug: 'pat-smith', email: 'ps@umn.edu', name: 'Pat Smith' },
  { slug: 'lee-smith', email: 'ls@umn.edu', name: 'Lee Smith' },
]
const projects = [
  { id: 'proj_a', slug: 'a', title: 'Alpha', category: 'MNCCORE', pi: 'nate-mesfin', deleted_at: null },
  { id: 'proj_b', slug: 'b', title: 'Beta', category: 'CLIF', pi: 'Some Outside PI', deleted_at: null },
  { id: 'proj_pb', slug: 'pb', title: 'PB thing', category: 'Peripheral Brain', pi: 'nick-ingraham', deleted_at: null },
  { id: 'proj_gone', slug: 'gone', title: 'Gone', category: 'MNCCORE', pi: 'casey-eddington', deleted_at: '2026-01-01' },
  { id: 'proj_cl', slug: 'cl', title: 'Central Line Days Disparities (McEachron)', category: 'MNCCORE', pi: null, deleted_at: null },
  { id: 'proj_sm', slug: 'sm', title: 'Something (Smith)', category: 'MNCCORE', pi: null, deleted_at: null },
  { id: 'proj_nx', slug: 'nx', title: 'Outside Work (Jones)', category: 'MNCCORE', pi: null, deleted_at: null },
  { id: 'proj_ce', slug: 'ce', title: 'Casey Study (Eddington)', category: 'MNCCORE', pi: null, deleted_at: null },
]
const assignments = [
  { project_id: 'proj_a', assignee: 'casey-eddington' },
  { project_id: 'b', assignee: 'EDDIN022@umn.edu' },       // a slug ref and an email: both resolve
  { project_id: 'proj_b', assignee: 'not_a_real_person' }, // reported, not seeded
  { project_id: 'proj_pb', assignee: 'casey-eddington' },  // PB: skipped
  { project_id: 'proj_gone', assignee: 'nate-mesfin' },    // deleted project: not seeded
  { project_id: 'proj_missing', assignee: 'nate-mesfin' }, // unknown project: ignored
  { project_id: 'proj_ce', assignee: 'casey-eddington' },  // assignee AND title
]

describe('the seed plan', () => {
  const plan = planProjectMembers(projects, assignments, team)
  const pair = (slug: string, id: string) => plan.pairs.find((p) => p.member_slug === slug && p.project_id === id)

  it('title parsing: a trailing single-word (LastName), and a surname is the last word of a name', () => {
    expect(titleSurname('Central Line Days Disparities (McEachron)')).toBe('mceachron')
    expect(titleSurname('No surname')).toBeNull()
    expect(titleSurname('Two (Words Here)')).toBeNull()
    expect(surnameOf('Kendall McEachron')).toBe('mceachron')
    expect(surnameOf('Cher')).toBeNull()
  })

  it('Nick on every live project; others from assignees, pi and a unique title surname; no PB, deleted or unknown person', () => {
    expect(plan.pairs.map((p) => `${p.member_slug}@${p.project_id}`)).toEqual([
      'casey-eddington@proj_a', 'casey-eddington@proj_b', 'casey-eddington@proj_ce',
      'kendall-mceachron@proj_cl',
      'nate-mesfin@proj_a',
      'nick-ingraham@proj_a', 'nick-ingraham@proj_b', 'nick-ingraham@proj_ce', 'nick-ingraham@proj_cl',
      'nick-ingraham@proj_nx', 'nick-ingraham@proj_pb', 'nick-ingraham@proj_sm',
    ])
    expect(pair('kendall-mceachron', 'proj_cl')).toMatchObject({ reasons: ['title'], added_by: TITLE_SOURCE })
    expect(pair('casey-eddington', 'proj_ce')).toMatchObject({ reasons: ['assignee', 'title'], added_by: SEED_SOURCE })
    expect(plan.unresolved.join('\n')).toContain('not_a_real_person')
    expect(plan.unresolved.join('\n')).toContain('Some Outside PI')
    expect(plan.skippedPb).toEqual(['casey-eddington on pb: Peripheral Brain project, not seeded'])
    expect(plan.titleSkipped.join('\n')).toContain('"smith" matches 2 members (pat-smith, lee-smith)')
    expect(plan.titleSkipped.join('\n')).toContain('"jones" matches no member')
  })

  it("prints a per-person list with each row's source", () => {
    expect(plan.perPerson[0]).toBe('casey-eddington (Casey Eddington): 3 project(s)')
    const text = plan.perPerson.join('\n')
    expect(text).toContain('Alpha [a]  <- assignee')
    expect(text).toContain('Alpha [a]  <- pi')
    expect(text).toContain('Central Line Days Disparities (McEachron) [cl]  <- title')
    expect(text).toContain('Casey Study (Eddington) [ce]  <- assignee, title')
    expect(text).toContain('every live project (7)  <- nick')
  })

  it('applies on the migrated schema, is idempotent, covers a project created after the export, and its rollback removes exactly its rows', () => {
    const db = prodSchemaDb()
    for (const t of team) insertRow(db, 'team_members', { id: `tm-${t.slug}`, name: t.name, slug: t.slug, email: t.email })
    for (const p of projects) insertRow(db, 'projects', { ...p, status: 'active', stage: 'idea' })
    // Created after the export: not in the plan's pairs, but Nick's statement covers it.
    insertRow(db, 'projects', { id: 'proj_late', slug: 'late', title: 'Late', category: 'MNCCORE', status: 'active', stage: 'idea' })
    // A trigger-made row (the pi trigger adds nate on proj_a) must survive the rollback.
    const before = db.prepare('SELECT project_id, member_slug, added_by FROM project_members ORDER BY 1, 2').all()
    expect(before).toEqual([{ project_id: 'proj_a', member_slug: 'nate-mesfin', added_by: 'pi' }])
    db.exec(plan.apply)
    db.exec(plan.apply)
    const by = (a: string) => (db.prepare('SELECT COUNT(*) AS n FROM project_members WHERE added_by = ?').get(a) as { n: number }).n
    expect(by(SEED_SOURCE)).toBe(8 + 3) // Nick on 8 live projects (7 + late) + casey x3
    expect(by(TITLE_SOURCE)).toBe(1)
    expect(db.prepare("SELECT 1 AS x FROM project_members WHERE project_id = 'proj_late' AND member_slug = 'nick-ingraham'").get()).toEqual({ x: 1 })
    db.exec(plan.rollback)
    expect(db.prepare('SELECT project_id, member_slug, added_by FROM project_members ORDER BY 1, 2').all()).toEqual(before)
  })
})

describe('the window sweep', () => {
  it("joins each creator from the 'Created project' log row since the DDL, and Nick; rollback removes only its rows", () => {
    const db = prodSchemaDb()
    for (const t of team) insertRow(db, 'team_members', { id: `tm-${t.slug}`, name: t.name, slug: t.slug, email: t.email })
    insertRow(db, 'projects', { id: 'proj_w', slug: 'w', title: 'W', category: 'MNCCORE', status: 'active', stage: 'idea' })
    insertRow(db, 'projects', { id: 'proj_old', slug: 'old', title: 'Old', category: 'MNCCORE', status: 'active', stage: 'idea' })
    insertRow(db, 'activity_log', { id: 'al1', type: 'project', description: 'Created project: W', actor: 'mesfin@umn.edu', related_id: 'proj_w', timestamp: '2026-10-09 06:00:00' })
    insertRow(db, 'activity_log', { id: 'al2', type: 'project', description: 'Created project: Old', actor: 'eddin022@umn.edu', related_id: 'proj_old', timestamp: '2026-10-01 00:00:00' })
    const w = windowSweep('2026-10-09 05:00:00')
    db.exec(w.apply)
    const rows = db.prepare('SELECT project_id, member_slug FROM project_members WHERE added_by = ? ORDER BY 1, 2').all(WINDOW_SOURCE)
    expect(rows).toEqual([
      { project_id: 'proj_old', member_slug: 'nick-ingraham' },
      { project_id: 'proj_w', member_slug: 'nate-mesfin' },
      { project_id: 'proj_w', member_slug: 'nick-ingraham' },
    ])
    db.exec(w.rollback)
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_members').get()).toEqual({ n: 0 })
    expect(() => windowSweep('yesterday')).toThrow()
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
