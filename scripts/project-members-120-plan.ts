// project-members-120-plan.ts -- the pure half of the #145 Lane B seed.
//
// One-time write on prod `project_members` (schema-v120), generated from a
// pre-image the operator exports, so the apply and its rollback name exact
// (project, member) pairs (no predicate decides what changes at apply time).
//
// WHO IS SEEDED (Nick, 2026-10-08):
//   - nick-ingraham on EVERY live project ("currently every single project
//     that's on the website is a project that I am on or should be on");
//   - everyone else from the live tasks they are assigned, from projects.pi,
//     and from the title convention "Topic (LastName)" when exactly one
//     member has that surname, on live projects outside 'Peripheral Brain'
//     (those stay Nick's alone; the read rule hides them from a non-PI).
//     The title source exists because the review found members who would
//     otherwise lose a project they read today (beret-fitzgerald on FUHN
//     Paper, dan-shyu, dave-wacker, kendall-mceachron, sami-safadi).
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
/** A row whose ONLY reason is the "Topic (LastName)" title convention. */
export const TITLE_SOURCE = 'backfill-v120-title'
/** Rows the post-deploy window sweep writes. */
export const WINDOW_SOURCE = 'window-v120'
export const SITE_ADMIN = 'nick-ingraham'
const PB_CATEGORY = 'Peripheral Brain'

export type SeedReason = 'nick' | 'pi' | 'assignee' | 'title'

export interface ProjectPreImage { id: string; slug: string | null; title: string | null; category: string | null; pi: string | null; deleted_at: string | null }
export interface AssignmentPreImage { project_id: string | null; assignee: string | null }
export interface TeamPreImage { slug: string | null; email: string | null; name?: string | null }

export interface SeedPair { project_id: string; member_slug: string; reasons: SeedReason[]; added_by: string }

export interface SeedPlan {
  /** Every (project, member) pair the seed means, Nick's included (his are written by one statement). */
  pairs: SeedPair[]
  apply: string
  rollback: string
  /** One line per person, then one indented line per project with its sources: what Nick reviews. */
  perPerson: string[]
  unresolved: string[]
  skippedPb: string[]
  /** "Topic (LastName)" titles that matched no member or more than one. */
  titleSkipped: string[]
}

function lit(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

/** A member's surname for the title convention: the last word of their name, letters only. */
export function surnameOf(name: string | null | undefined): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return null
  const last = words[words.length - 1].toLowerCase().replace(/[^a-z'-]/g, '')
  return last.length > 1 ? last : null
}

/** The trailing "(LastName)" of a project title, lower-cased, or null. */
export function titleSurname(title: string | null | undefined): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(title ?? '')
  if (!m) return null
  const inner = m[1].trim()
  return /^[A-Za-z][A-Za-z'-]*$/.test(inner) ? inner.toLowerCase() : null
}

/**
 * Nick's rows: one statement over the projects live at APPLY time, so a
 * project created between the export and the apply is covered too. INSERT OR
 * IGNORE leaves a row that already exists (a trigger's, a creator's) alone,
 * so a rollback by added_by removes only what this statement wrote.
 */
export function nickStatement(addedBy: string): string {
  return `INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) SELECT id, ${lit(SITE_ADMIN)}, ${lit(addedBy)} FROM projects WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM team_members WHERE slug = ${lit(SITE_ADMIN)});`
}

export function planProjectMembers(
  projects: readonly ProjectPreImage[],
  assignments: readonly AssignmentPreImage[],
  team: readonly TeamPreImage[],
): SeedPlan {
  const slugs = new Set<string>()
  const byEmail = new Map<string, string>()
  const names = new Map<string, string>()
  const bySurname = new Map<string, string[]>()
  for (const t of team) {
    if (!t.slug) continue
    slugs.add(t.slug)
    if (t.name) names.set(t.slug, t.name)
    const e = (t.email ?? '').trim().toLowerCase()
    if (e && !byEmail.has(e)) byEmail.set(e, t.slug)
    const sn = surnameOf(t.name)
    if (sn) bySurname.set(sn, [...(bySurname.get(sn) ?? []), t.slug])
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
  const titleSkipped = new Set<string>()
  const add = (p: ProjectPreImage, slug: string, reason: SeedReason) => {
    const k = `${p.id}\u0000${slug}`
    const cur = pairs.get(k)
    if (cur) { if (!cur.reasons.includes(reason)) cur.reasons.push(reason) } else pairs.set(k, { project_id: p.id, member_slug: slug, reasons: [reason], added_by: SEED_SOURCE })
  }

  const nickKnown = slugs.has(SITE_ADMIN)
  if (nickKnown) for (const p of live) add(p, SITE_ADMIN, 'nick')
  else unresolved.add(`${SITE_ADMIN}: no team_members row; Nick seeded nowhere`)

  const consider = (p: ProjectPreImage | undefined, raw: string | null, reason: SeedReason, where: string) => {
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
  // Nick names projects "Topic (LastName)". Exactly one member with that
  // surname -> that member; none or several -> skipped and reported.
  for (const p of live) {
    const sn = titleSurname(p.title)
    if (!sn) continue
    const hits = bySurname.get(sn) ?? []
    if (hits.length !== 1) {
      titleSkipped.add(`"${p.title}" [${p.slug ?? p.id}]: surname "${sn}" matches ${hits.length === 0 ? 'no member' : `${hits.length} members (${hits.join(', ')})`}`)
      continue
    }
    if (hits[0] === SITE_ADMIN) { add(p, SITE_ADMIN, 'title'); continue }
    if (p.category === PB_CATEGORY) { skippedPb.add(`${hits[0]} on ${p.slug ?? p.id}: Peripheral Brain project, not seeded (title)`); continue }
    add(p, hits[0], 'title')
  }
  for (const x of pairs.values()) {
    if (x.member_slug !== SITE_ADMIN && x.reasons.length === 1 && x.reasons[0] === 'title') x.added_by = TITLE_SOURCE
  }

  const sorted = [...pairs.values()].sort((a, b) =>
    a.member_slug.localeCompare(b.member_slug) || a.project_id.localeCompare(b.project_id))
  const others = sorted.filter((x) => x.member_slug !== SITE_ADMIN)

  // Guarded so a project deleted, or a member removed, since the export makes
  // its own statement a no-op instead of failing the whole file on an FK.
  const apply = [
    ...(nickKnown ? [nickStatement(SEED_SOURCE)] : []),
    ...others.map((x) =>
      `INSERT INTO project_members (project_id, member_slug, added_by) SELECT ${lit(x.project_id)}, ${lit(x.member_slug)}, ${lit(x.added_by)} `
      + `WHERE EXISTS (SELECT 1 FROM projects WHERE id = ${lit(x.project_id)}) AND EXISTS (SELECT 1 FROM team_members WHERE slug = ${lit(x.member_slug)}) `
      + `AND NOT EXISTS (SELECT 1 FROM project_members WHERE project_id = ${lit(x.project_id)} AND member_slug = ${lit(x.member_slug)});`),
  ].join('\n')
  // Only rows this seed wrote: a row the triggers or a person added keeps its own added_by.
  const liveIds = live.map((p) => p.id).sort()
  const rollback = [
    `-- Pre-image: the ${liveIds.length} projects live at export time (Nick's statement also covers any created after it):`,
    ...liveIds.map((id) => `--   ${id}`),
    `DELETE FROM project_members WHERE member_slug = ${lit(SITE_ADMIN)} AND added_by = ${lit(SEED_SOURCE)};`,
    ...others.map((x) =>
      `DELETE FROM project_members WHERE project_id = ${lit(x.project_id)} AND member_slug = ${lit(x.member_slug)} AND added_by = ${lit(x.added_by)};`),
  ].join('\n')

  const titles = new Map(live.map((p) => [p.id, `${p.title ?? '(untitled)'} [${p.slug ?? p.id}]`]))
  const perPerson: string[] = []
  const people = [...new Set(sorted.map((x) => x.member_slug))]
  for (const slug of people) {
    const mine = sorted.filter((x) => x.member_slug === slug)
    perPerson.push(`${slug}${names.has(slug) ? ` (${names.get(slug)})` : ''}: ${mine.length} project(s)`)
    if (slug === SITE_ADMIN) {
      perPerson.push(`    every live project (${mine.length})  <- nick`)
      continue
    }
    for (const x of mine.sort((a, b) => (titles.get(a.project_id) ?? '').localeCompare(titles.get(b.project_id) ?? ''))) {
      perPerson.push(`    ${titles.get(x.project_id)}  <- ${x.reasons.join(', ')}`)
    }
  }

  return {
    pairs: sorted, apply, rollback, perPerson,
    unresolved: [...unresolved].sort(), skippedPb: [...skippedPb].sort(), titleSkipped: [...titleSkipped].sort(),
  }
}

/**
 * The post-deploy window sweep. Between the v120 DDL and the deploy whose
 * applyInsert writes the creator's row, the old code created projects with
 * no creator membership. This joins each such project's creator (from the
 * "Created project: ..." activity_log row handleCreateProject writes; actor
 * is the creator's email or slug), and re-runs Nick's statement. `sinceUtc`
 * is the DDL apply time, 'YYYY-MM-DD HH:MM:SS' UTC.
 */
export function windowSweep(sinceUtc: string): { apply: string; rollback: string } {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sinceUtc)) throw new Error('since must be YYYY-MM-DD HH:MM:SS (UTC)')
  const creator = `INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) `
    + `SELECT p.id, tm.slug, ${lit(WINDOW_SOURCE)} FROM activity_log al `
    + `JOIN projects p ON p.id = al.related_id AND p.deleted_at IS NULL `
    + `JOIN team_members tm ON tm.slug IS NOT NULL AND (lower(tm.email) = lower(al.actor) OR tm.slug = al.actor) `
    + `WHERE al.type = 'project' AND al.description LIKE 'Created project:%' AND al.timestamp >= ${lit(sinceUtc)};`
  return {
    apply: [nickStatement(WINDOW_SOURCE), creator].join('\n'),
    rollback: `DELETE FROM project_members WHERE added_by = ${lit(WINDOW_SOURCE)};`,
  }
}
