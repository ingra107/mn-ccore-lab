// project-members-120-plan.ts -- the pure half of the #145 Lane B seed.
//
// One-time write on prod `project_members` (schema-v120), generated from a
// pre-image the operator exports, so the apply and its rollback name exact
// (project, member) pairs (no predicate decides what changes at apply time).
//
// WHO IS SEEDED (Nick, 2026-10-08):
//   - nick-ingraham on EVERY live project ("currently every single project
//     that's on the website is a project that I am on or should be on");
//   - everyone else from the live tasks they are assigned and from
//     projects.pi, on live projects outside 'Peripheral Brain' (those stay
//     Nick's alone; the read rule hides them from a non-PI anyway).
// A person is a team_members row: a value matches its slug exactly, or its
// email exactly (case folded). Nothing by prefix or name. Every value that
// does not resolve is reported, never guessed ('nick', 'ningraha', and
// 'not_a_real_person' are in prod tasks.assignee; two projects.pi values are
// not team slugs). A deleted project (deleted_at set) is not seeded: it is
// not on the website; Nick reaches it with "show all projects".
//
// The CLI is scripts/backfill-120-project-members.ts. Tested against the
// migrated schema in api/lib/project-members-120-plan.test.ts.

export const SEED_SOURCE = 'backfill-v120'
export const SITE_ADMIN = 'nick-ingraham'
const PB_CATEGORY = 'Peripheral Brain'

export interface ProjectPreImage { id: string; slug: string | null; title: string | null; category: string | null; pi: string | null; deleted_at: string | null }
export interface AssignmentPreImage { project_id: string | null; assignee: string | null }
export interface TeamPreImage { slug: string | null; email: string | null; name?: string | null }

export interface SeedPair { project_id: string; member_slug: string; reasons: string[] }

export interface SeedPlan {
  pairs: SeedPair[]
  apply: string
  rollback: string
  /** One line per person, then one indented line per project: what Nick reviews. */
  perPerson: string[]
  unresolved: string[]
  skippedPb: string[]
}

function lit(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

export function planProjectMembers(
  projects: readonly ProjectPreImage[],
  assignments: readonly AssignmentPreImage[],
  team: readonly TeamPreImage[],
): SeedPlan {
  const slugs = new Set<string>()
  const byEmail = new Map<string, string>()
  const names = new Map<string, string>()
  for (const t of team) {
    if (!t.slug) continue
    slugs.add(t.slug)
    if (t.name) names.set(t.slug, t.name)
    const e = (t.email ?? '').trim().toLowerCase()
    if (e && !byEmail.has(e)) byEmail.set(e, t.slug)
  }
  const resolvePerson = (v: string | null): string | null => {
    if (!v) return null
    const s = v.trim()
    if (slugs.has(s)) return s
    return byEmail.get(s.toLowerCase()) ?? null
  }

  const live = projects.filter((p) => p.deleted_at === null)
  const byRef = new Map<string, ProjectPreImage>()
  for (const p of live) {
    byRef.set(p.id, p)
    if (p.slug) byRef.set(p.slug, p)
  }

  const pairs = new Map<string, SeedPair>()
  const unresolved = new Set<string>()
  const skippedPb = new Set<string>()
  const add = (p: ProjectPreImage, slug: string, reason: string) => {
    const k = `${p.id}\u0000${slug}`
    const cur = pairs.get(k)
    if (cur) { if (!cur.reasons.includes(reason)) cur.reasons.push(reason) } else pairs.set(k, { project_id: p.id, member_slug: slug, reasons: [reason] })
  }

  if (slugs.has(SITE_ADMIN)) for (const p of live) add(p, SITE_ADMIN, 'every live project')
  else unresolved.add(`${SITE_ADMIN}: no team_members row; Nick seeded nowhere`)

  const consider = (p: ProjectPreImage | undefined, raw: string | null, reason: string, where: string) => {
    if (!p || !raw) return
    const slug = resolvePerson(raw)
    if (!slug) { unresolved.add(`${reason} "${raw}" on ${where} (${p.slug ?? p.id}): not a team member`); return }
    if (slug === SITE_ADMIN) { add(p, slug, reason); return }
    if (p.category === PB_CATEGORY) { skippedPb.add(`${slug} on ${p.slug ?? p.id}: Peripheral Brain project, not seeded`); return }
    add(p, slug, reason)
  }

  for (const p of live) consider(p, p.pi, 'pi', 'projects.pi')
  for (const a of assignments) {
    if (!a.project_id) continue
    consider(byRef.get(a.project_id), a.assignee, 'assignee', 'tasks.assignee')
  }

  const sorted = [...pairs.values()].sort((a, b) =>
    a.member_slug.localeCompare(b.member_slug) || a.project_id.localeCompare(b.project_id))

  // Guarded so a project deleted, or a member removed, since the export makes
  // its own statement a no-op instead of failing the whole file on an FK.
  const apply = sorted.map((x) =>
    `INSERT INTO project_members (project_id, member_slug, added_by) SELECT ${lit(x.project_id)}, ${lit(x.member_slug)}, ${lit(SEED_SOURCE)} `
    + `WHERE EXISTS (SELECT 1 FROM projects WHERE id = ${lit(x.project_id)}) AND EXISTS (SELECT 1 FROM team_members WHERE slug = ${lit(x.member_slug)}) `
    + `AND NOT EXISTS (SELECT 1 FROM project_members WHERE project_id = ${lit(x.project_id)} AND member_slug = ${lit(x.member_slug)});`).join('\n')
  // Only rows this seed wrote: a row the triggers or a person added since keeps its own added_by.
  const rollback = sorted.map((x) =>
    `DELETE FROM project_members WHERE project_id = ${lit(x.project_id)} AND member_slug = ${lit(x.member_slug)} AND added_by = ${lit(SEED_SOURCE)};`).join('\n')

  const titles = new Map(live.map((p) => [p.id, `${p.title ?? '(untitled)'} [${p.slug ?? p.id}]`]))
  const perPerson: string[] = []
  const people = [...new Set(sorted.map((x) => x.member_slug))]
  for (const slug of people) {
    const mine = sorted.filter((x) => x.member_slug === slug)
    perPerson.push(`${slug}${names.has(slug) ? ` (${names.get(slug)})` : ''}: ${mine.length} project(s)`)
    if (slug === SITE_ADMIN && mine.every((x) => x.reasons.includes('every live project'))) {
      perPerson.push(`    every live project (${mine.length})`)
      continue
    }
    for (const x of mine.sort((a, b) => (titles.get(a.project_id) ?? '').localeCompare(titles.get(b.project_id) ?? ''))) {
      perPerson.push(`    ${titles.get(x.project_id)}  <- ${x.reasons.join(', ')}`)
    }
  }

  return { pairs: sorted, apply, rollback, perPerson, unresolved: [...unresolved].sort(), skippedPb: [...skippedPb].sort() }
}
