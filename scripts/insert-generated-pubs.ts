/**
 * #357 — generate a NON-DESTRUCTIVE INSERT for the auto-fetched publications
 * that prod D1 does not already have.
 *
 * Why not `npm run seed`: seed-d1.ts does `DELETE FROM publications` then
 * re-inserts the static set. Prod D1 holds more publications than the static
 * seed (114 vs ~77), so a full re-seed would DROP the prod-only rows. This
 * script instead emits INSERT OR IGNORE statements for ONLY the generated pubs
 * that are absent from prod — dedup by DOI → PubMed → (base)title+year — so it
 * can never delete or duplicate a prod row.
 *
 * Usage:
 *   1. Pull prod's existing pubs to JSON:
 *      bash scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
 *        --command "SELECT doi, pubmed, title, year FROM publications" > /tmp/prod_pubs.json
 *   2. npx tsx scripts/insert-generated-pubs.ts /tmp/prod_pubs.json > /tmp/insert_pubs.sql
 *   3. Review /tmp/insert_pubs.sql, then execute:
 *      bash scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=/tmp/insert_pubs.sql
 */
import { readFileSync } from 'node:fs'
import type { Publication } from '../src/data/types'
import { curatedPublications } from '../src/data/publications'
import { generatedPublications } from '../src/data/publications.generated'
import { dedupKeys } from '../src/data/mergePublications'

function esc(v: string | null | undefined): string {
  if (v == null) return 'NULL'
  return `'${v.replace(/'/g, "''")}'`
}
function num(v: number | null | undefined): string {
  return v == null ? 'NULL' : String(v)
}
function jsonOrNull(v: unknown): string {
  if (v == null) return 'NULL'
  return `'${JSON.stringify(v).replace(/'/g, "''")}'`
}

function main() {
  const prodPath = process.argv[2]
  if (!prodPath) {
    console.error('usage: tsx scripts/insert-generated-pubs.ts <prod-pubs.json>')
    process.exit(1)
  }
  // wrangler --json wraps results as [{ results: [...] }] (or {result:[{results}]}).
  const raw = JSON.parse(readFileSync(prodPath, 'utf8'))
  const prodRows: Array<{ doi?: string; pubmed?: string; title?: string; year?: number }> =
    Array.isArray(raw) ? raw[0]?.results ?? [] : raw.result?.[0]?.results ?? []

  const seen = new Set<string>()
  const addKeys = (p: Partial<Publication>) => {
    for (const k of dedupKeys(p as Publication)) seen.add(k)
  }
  // Seed the "already present" set with BOTH curated and live prod rows.
  for (const p of curatedPublications) addKeys(p)
  for (const r of prodRows) addKeys({ doi: r.doi, pubmed: r.pubmed, title: r.title, year: r.year })

  const toInsert: Publication[] = []
  for (const g of generatedPublications) {
    const keys = dedupKeys(g)
    if (keys.some((k) => seen.has(k))) continue
    for (const k of keys) seen.add(k)
    toInsert.push(g)
  }

  // NB: no `BEGIN TRANSACTION`/`COMMIT` — Cloudflare D1 rejects raw SQL
  // transaction statements (it wraps a `--file` execution atomically itself).
  const lines: string[] = [
    '-- #357 non-destructive INSERT of auto-fetched publications absent from prod.',
    `-- generated=${generatedPublications.length} curated=${curatedPublications.length} prod=${prodRows.length} -> to-insert=${toInsert.length}`,
  ]
  for (const p of toInsert) {
    lines.push(
      `INSERT OR IGNORE INTO publications ` +
        `(id, title, authors, journal, year, status, doi, pubmed, abstract, topics, featured, author_slugs) VALUES ` +
        `(${esc(p.id)}, ${esc(p.title)}, ${esc(p.authors)}, ${esc(p.journal)}, ${num(p.year)}, ${esc(p.status)}, ` +
        `${esc(p.doi)}, ${esc(p.pubmed)}, ${esc(p.abstract)}, ${jsonOrNull(p.topics)}, ${num(p.featured ? 1 : 0)}, ${jsonOrNull(p.authorSlugs)});`,
    )
  }
  console.log(lines.join('\n'))
  console.error(`[insert-generated-pubs] ${toInsert.length} rows to INSERT (of ${generatedPublications.length} generated).`)
}

main()
