/**
 * NIH products export (read-only starter, consult 2026-10-22 move 4).
 *
 *   npx tsx scripts/nih-products-export.ts [project-slug] [--out file.md]
 *
 * Default slug: the PI's K23 (k23-provider-variation-icu-outcomes).
 * Reads prod D1 through scripts/wrangler-d1 (SELECT only). Writes nothing to D1.
 *
 * Only columns that exist are used:
 *   products:            title, kind, stage, venue, event_date, nick_author_position,
 *                        nick_event_role, period_start/end (awards)
 *   publications:        title, authors (JSON), journal, year, status, doi, pubmed
 *   project_publications project_id, publication_id, role
 *   project_members:     project_id, member_slug  (joined to team_members.name/role)
 *   projects:            pubmed_id, doi, citation, publication_date, author_role
 * There is NO pmcid column anywhere, and no product -> publication link. So PMCID
 * is always reported MISSING (it cannot be stored today), and a published
 * manuscript product is matched to a publication by title only as a hint.
 *
 * NIH rules this shape follows (verify wording each year; NIH forms drift):
 *   RPPR instructions: https://grants.nih.gov/grants-process/submit/submission-structure/forms-and-instructions/rppr
 *   C.1 Publications: peer-reviewed articles from the award, each needs a PMCID
 *     (or NIHMSID) to be compliant with the NIH Public Access Policy.
 *   C.2 Website(s) or other Internet site(s); C.3 Technologies or techniques;
 *     C.4 Inventions/patents; C.5 Other products (non-publication).
 *   D.1 Participants: name, role, person-months (person-months NOT stored here).
 *   Biosketch products: SciENcv, NIH Common Forms (NOT-OD-26-018 per consult).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { d1Select } from './_lib/d1-readonly'

const DEFAULT_SLUG = 'k23-provider-variation-icu-outcomes'
const PI_SLUG = 'nick-ingraham'

const d1 = d1Select

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const cell = (v: unknown) => (v == null || v === '' ? '' : String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '))

interface Project { id: string; slug: string; title: string; pubmed_id: string | null; doi: string | null; citation: string | null; publication_date: string | null; author_role: string | null }
interface Product { id: string; kind: string; stage: string; title: string | null; venue: string | null; event_date: string | null; nick_author_position: string | null; nick_event_role: string | null; period_start: string | null; period_end: string | null }
interface Pub { id: string; title: string; authors: string; journal: string | null; year: number | null; status: string | null; doi: string | null; pubmed: string | null; role: string }
interface Member { member_slug: string; name: string; role: string | null; member_type: string | null }

function main() {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const out = outIdx >= 0 ? args[outIdx + 1] : null
  const slug = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') ?? DEFAULT_SLUG

  const project = d1<Project>(
    `SELECT id, slug, title, pubmed_id, doi, citation, publication_date, author_role FROM projects WHERE slug = ${q(slug)} AND deleted_at IS NULL`,
  )[0]
  if (!project) throw new Error(`no live project with slug ${slug}`)

  const products = d1<Product>(
    `SELECT id, kind, stage, title, venue, event_date, nick_author_position, nick_event_role, period_start, period_end
     FROM products WHERE project_id = ${q(project.id)} AND deleted_at IS NULL
     ORDER BY kind, COALESCE(event_date, '9999'), sort_order`,
  )
  const pubs = d1<Pub>(
    `SELECT p.id, p.title, p.authors, p.journal, p.year, p.status, p.doi, p.pubmed, pp.role
     FROM project_publications pp JOIN publications p ON p.id = pp.publication_id
     WHERE pp.project_id = ${q(project.id)} ORDER BY p.year DESC, p.title`,
  )
  const members = d1<Member>(
    `SELECT pm.member_slug, tm.name, tm.role, tm.member_type
     FROM project_members pm LEFT JOIN team_members tm ON tm.slug = pm.member_slug
     WHERE pm.project_id = ${q(project.id)} ORDER BY tm.name`,
  )
  const nickName = d1<{ name: string; author_name: string | null }>(
    `SELECT name, author_name FROM team_members WHERE slug = ${q(PI_SLUG)}`,
  )[0]

  const missing: string[] = []
  const L: string[] = []
  L.push(`# NIH products export: ${project.title}`)
  L.push('')
  L.push(`Project slug \`${project.slug}\`. Generated ${new Date().toISOString().slice(0, 10)} from prod D1 (read-only).`)
  L.push(`PI of record: ${nickName?.name ?? PI_SLUG}. Review every line against PubMed / NIH before use; this is a draft list, not a form.`)
  L.push('')
  L.push('Rules followed: RPPR instructions https://grants.nih.gov/grants-process/submit/submission-structure/forms-and-instructions/rppr (C.1 publications need a PMCID or NIHMSID; C.5 other products; D.1 participants). Biosketch products come from SciENcv.')
  L.push('')

  // ---- C.1 publications (publications table) ----
  L.push('## C.1 Publications (publications table linked to this project)')
  L.push('')
  if (pubs.length === 0) L.push('_None linked via project_publications._')
  else {
    L.push('| Year | Title | Journal | Authors (Nick position) | Status | DOI | PMID | PMCID |')
    L.push('|---|---|---|---|---|---|---|---|')
    for (const p of pubs) {
      let authors: string[] = []
      try { authors = JSON.parse(p.authors) as string[] } catch { /* keep empty */ }
      const needle = (nickName?.author_name ?? '').toLowerCase().split(/[ ,]+/)[0]
      const idx = needle ? authors.findIndex(a => a.toLowerCase().includes(needle)) : -1
      const pos = idx < 0 ? '' : `${idx + 1} of ${authors.length}`
      L.push(`| ${cell(p.year)} | ${cell(p.title)} | ${cell(p.journal)} | ${cell(pos)} | ${cell(p.status)} | ${cell(p.doi)} | ${cell(p.pubmed)} | |`)
      if (!p.pubmed) missing.push(`Publication "${p.title}" (${p.year ?? 'no year'}): no PMID stored`)
      if (!p.doi) missing.push(`Publication "${p.title}" (${p.year ?? 'no year'}): no DOI stored`)
      if (idx < 0) missing.push(`Publication "${p.title}": Nick's author position not derivable from authors JSON`)
      if (p.status && p.status !== 'Published') missing.push(`Publication "${p.title}": status "${p.status}" is not Published; RPPR C.1 lists published/accepted only`)
      missing.push(`Publication "${p.title}": PMCID/NIHMSID not stored (no column exists; look up on PMC)`)
    }
  }
  L.push('')

  // ---- Products ----
  const byKind = new Map<string, Product[]>()
  for (const pr of products) {
    const list = byKind.get(pr.kind) ?? []
    list.push(pr)
    byKind.set(pr.kind, list)
  }
  L.push('## Products (products table on this project)')
  L.push('')
  if (products.length === 0) L.push('_No live products on this project._')
  for (const [kind, list] of byKind) {
    L.push(`### ${kind} (${list.length})`)
    L.push('')
    L.push('| Title | Stage | Venue | event_date | Nick author position | Nick event role |')
    L.push('|---|---|---|---|---|---|')
    for (const pr of list) {
      const label = pr.title ?? `(the project itself, ${pr.id})`
      L.push(`| ${cell(label)} | ${cell(pr.stage)} | ${cell(pr.venue)} | ${cell(pr.event_date)} | ${cell(pr.nick_author_position)} | ${cell(pr.nick_event_role)} |`)
      const done = /^(published|presented|delivered|accepted)/i.test(pr.stage)
      if (kind === 'award' && !pr.period_start) missing.push(`Award "${label}": no period_start/period_end`)
      if (done && !pr.event_date) missing.push(`Product "${label}" [${kind}/${pr.stage}]: no event_date`)
      if (/manuscript/i.test(kind) && done && !pr.nick_author_position) missing.push(`Product "${label}" [${kind}/${pr.stage}]: no nick_author_position`)
      if (/(talk|abstract|poster)/i.test(kind) && done && !pr.nick_event_role) missing.push(`Product "${label}" [${kind}/${pr.stage}]: no nick_event_role`)
      if (/manuscript/i.test(kind) && /published/i.test(pr.stage)) {
        const hit = pr.title ? pubs.find(p => p.title.toLowerCase().startsWith(pr.title!.toLowerCase().slice(0, 40))) : undefined
        if (!hit) missing.push(`Product "${label}": published manuscript with no matching publications row (matched by title only; there is no product -> publication link)`)
        else missing.push(`Product "${label}": PMCID not stored (see publication ${hit.id})`)
      }
    }
    L.push('')
  }

  // ---- Nick's products on ALL projects (the K23 report spans projects) ----
  const allNick = d1<{ ptitle: string; kind: string; stage: string; title: string | null; venue: string | null; event_date: string | null; nick_author_position: string | null; nick_event_role: string | null }>(
    `SELECT pj.title AS ptitle, pr.kind, pr.stage, pr.title, pr.venue, pr.event_date, pr.nick_author_position, pr.nick_event_role
     FROM products pr JOIN projects pj ON pj.id = pr.project_id
     WHERE pr.deleted_at IS NULL AND pj.deleted_at IS NULL
       AND (pr.nick_author_position IS NOT NULL OR pr.nick_event_role IS NOT NULL)
     ORDER BY pr.kind, COALESCE(pr.event_date, '0000') DESC`,
  )
  L.push('## Nick products on ANY project (author position or event role set)')
  L.push('')
  L.push('Not limited to this project: a K23 report draws on every project Nick publishes under. Filter by reporting year by hand.')
  L.push('')
  L.push('| Kind | Title | Project | Stage | event_date | Position / role | Venue |')
  L.push('|---|---|---|---|---|---|---|')
  for (const r of allNick) L.push(`| ${cell(r.kind)} | ${cell(r.title ?? '(project itself)')} | ${cell(r.ptitle)} | ${cell(r.stage)} | ${cell(r.event_date)} | ${cell(r.nick_author_position ?? r.nick_event_role)} | ${cell(r.venue)} |`)
  L.push('')
  const gap = d1<{ n: number; nodate: number }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN event_date IS NULL THEN 1 ELSE 0 END) AS nodate
     FROM products WHERE deleted_at IS NULL AND kind IN ('manuscript','abstract','talk') AND stage IN ('published','presented','delivered')`,
  )[0]
  if (gap) missing.push(`Across all projects: ${gap.nodate} of ${gap.n} published/presented/delivered products have no event_date`)
  const pubGap = d1<{ n: number; nopm: number }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN pubmed IS NULL OR pubmed = '' THEN 1 ELSE 0 END) AS nopm
     FROM publications WHERE author_slugs LIKE '%${PI_SLUG}%'`,
  )[0]
  if (pubGap) missing.push(`publications table: ${pubGap.nopm} of ${pubGap.n} Nick-authored rows have no PMID; none can hold a PMCID`)

  // ---- project-level citation fields ----
  L.push('## Project-level citation fields (projects table)')
  L.push('')
  L.push(`citation: ${project.citation ?? '(empty)'}  | doi: ${project.doi ?? '(empty)'} | pubmed_id: ${project.pubmed_id ?? '(empty)'} | publication_date: ${project.publication_date ?? '(empty)'} | author_role: ${project.author_role ?? '(empty)'}`)
  L.push('')

  // ---- D.1 participants ----
  L.push('## D.1 Participants (project_members x team_members)')
  L.push('')
  L.push('| Name | Role | Member type | Person-months |')
  L.push('|---|---|---|---|')
  for (const m of members) L.push(`| ${cell(m.name ?? m.member_slug)} | ${cell(m.role)} | ${cell(m.member_type)} | |`)
  if (members.length) missing.push('Participants: person-months per member not stored (RPPR D.1 asks for it)')
  L.push('')

  // ---- MISSING ----
  L.push('## MISSING')
  L.push('')
  const uniq = [...new Set(missing)]
  if (uniq.length === 0) L.push('_Nothing flagged._')
  else for (const m of uniq) L.push(`- ${m}`)
  L.push('')

  const md = L.join('\n')
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(resolve(out), md, 'utf8')
    console.error(`wrote ${out}`)
  } else process.stdout.write(md)
}

main()
