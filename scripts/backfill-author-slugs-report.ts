/**
 * #1126 — DRY-RUN report for existing prod `publications` rows whose
 * `author_slugs` was collapsed to a single lab author by the pre-fix dedup
 * bug: `fetch-publications.ts` tags each fetched pub `authorSlugs:
 * [member.slug]` per member, and neither its own intra-generated dedup nor
 * `mergePublications.ts` used to UNION `authorSlugs` across a duplicate DOI
 * — the duplicate copy (and whichever co-author slug it carried) was simply
 * dropped. That generation-time bug is fixed elsewhere in #1126
 * (mergePublications.ts / fetch-publications.ts). This script is the
 * SEPARATE, READ-ONLY half: it reports what already-inserted prod rows
 * would gain if backfilled, and does NOT touch D1.
 *
 * WHY name-matching against the `authors` byline, not a raw-slug re-union:
 * the raw per-fetch `authorSlugs` tag that got dropped at generation time is
 * GONE — it was never persisted anywhere but the one surviving copy, and
 * that copy is what prod has today. The one thing every prod row still
 * carries intact is the FULL `authors` byline text (OpenAlex/ORCID write
 * every co-author into it, lab or not — the union bug only ever touched the
 * `authorSlugs` column, never `authors`). So the only way to RECOVER the
 * missing co-authors on an already-inserted row is to re-derive them from
 * that byline text. `resolveLabCoAuthors` (src/lib/authorAvatars.ts) already
 * does exactly this — it is the SAME primitive the author-avatar-stack UI
 * uses (#906, wave-6 commit 9ee95b9b), reused here rather than forked.
 *
 * CAVEAT (read before acting on the output): `resolveLabCoAuthors` matches
 * by SUBSTRING against each team member's `authorName` (e.g. "Dudley RA").
 * That is a heuristic, not an exact match — see its own docstring for the
 * known false-positive shape. Fine for a report a human reviews; NOT fine to
 * pipe into a live UPDATE unreviewed, and doubly not once `author_slugs`
 * starts gating write authorization (#906's featured-publications PUT names
 * this as its prerequisite). Spot-check the `added` slugs on a sample of
 * real papers before trusting the full candidate list.
 *
 * Usage:
 *   1. Pull prod's existing pubs (author_slugs needs `authors` alongside it
 *      to re-derive from — the plain doi/pubmed/title/year dump the sibling
 *      insert-generated-pubs.ts uses is NOT enough):
 *      bash scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
 *        --command "SELECT id, title, authors, author_slugs FROM publications" \
 *        > /tmp/prod_pubs_full.json
 *   2. npx tsx scripts/backfill-author-slugs-report.ts /tmp/prod_pubs_full.json
 *   3. This PRINTS a report + candidate `UPDATE` statements for reference.
 *      It does not write a --file for wrangler and executes nothing. Bring
 *      the counts + sample back for an explicit go/no-go before anything in
 *      this output is ever run against D1 (scope-question: exact command,
 *      target [prod vs a test D1 first], rollback [a scripts/wrangler-d1
 *      d1 export backup before], and who reviews the sample).
 */
import { readFileSync } from 'node:fs'
import { getAllMembers } from '../src/data/team'
import { resolveLabCoAuthors } from '../src/lib/authorAvatars'

interface ProdPubRow {
  id: string
  title: string
  authors: string | null
  author_slugs: string | null
}

interface Candidate {
  id: string
  title: string
  existing: string[]
  proposed: string[]
  added: string[]
}

function esc(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

function parseSlugs(raw: string | null, rowId: string): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    console.warn(`[backfill-author-slugs-report] ${rowId}: malformed author_slugs JSON, treating as empty`)
    return []
  }
}

function main() {
  const dumpPath = process.argv[2]
  if (!dumpPath) {
    console.error('usage: tsx scripts/backfill-author-slugs-report.ts <prod-pubs-full.json>')
    process.exit(1)
  }
  // wrangler --json wraps results as [{ results: [...] }] (or {result:[{results}]}).
  const raw = JSON.parse(readFileSync(dumpPath, 'utf8'))
  const rows: ProdPubRow[] = Array.isArray(raw) ? (raw[0]?.results ?? []) : (raw.result?.[0]?.results ?? [])
  if (!rows.length) {
    console.error('[backfill-author-slugs-report] 0 rows read from dump — check the dump path/shape.')
    process.exit(1)
  }

  const members = getAllMembers()
  const candidates: Candidate[] = []
  let unchanged = 0

  for (const row of rows) {
    const existing = parseSlugs(row.author_slugs, row.id)
    const resolved = resolveLabCoAuthors({ authors: row.authors ?? '', authorSlugs: existing }, members)
    const proposed = resolved.map((r) => r.slug)
    const added = proposed.filter((s) => !existing.includes(s))
    if (added.length === 0) {
      unchanged++
      continue
    }
    candidates.push({ id: row.id, title: row.title, existing, proposed, added })
  }

  console.log(
    `[backfill-author-slugs-report] scanned=${rows.length} unchanged=${unchanged} candidates=${candidates.length}`,
  )
  console.log('')

  const SAMPLE = 20
  for (const c of candidates.slice(0, SAMPLE)) {
    console.log(`id=${c.id}`)
    console.log(`  title:    ${c.title}`)
    console.log(`  existing: ${JSON.stringify(c.existing)}`)
    console.log(`  proposed: ${JSON.stringify(c.proposed)}`)
    console.log(`  added:    ${JSON.stringify(c.added)}`)
    console.log('  -- REVIEW ONLY, NOT EXECUTED --')
    console.log(`  UPDATE publications SET author_slugs = ${esc(JSON.stringify(c.proposed))} WHERE id = ${esc(c.id)};`)
    console.log('')
  }
  if (candidates.length > SAMPLE) {
    console.log(`... and ${candidates.length - SAMPLE} more candidates not shown (sample capped at ${SAMPLE}).`)
    console.log('')
  }

  console.log('No D1 write was made. This is a REPORT ONLY.')
  console.log('Spot-check a few "added" slugs above against the real paper for a false-positive')
  console.log('name match (see the CAVEAT in this file\'s header), then bring the full candidate')
  console.log('count + sample back for an explicit go/no-go — target, backup, and rollback shape —')
  console.log('before any UPDATE from this output runs against D1.')
}

main()
