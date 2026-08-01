/**
 * #357 — build-time team-member publications fetch.
 *
 *   ORCID public API  = PRIMARY source (used when a member has an `orcidId`).
 *   Google Scholar    = FENCED FALLBACK (used when a member has only a
 *                       `scholarId`). Scraping Scholar is fragile + ToS-gray,
 *                       so it is (a) build-time only — NEVER in the live request
 *                       path, and (b) wrapped so any failure degrades to
 *                       "no pubs for this member", never aborts the run.
 *
 * Output: rewrites src/data/publications.generated.ts. Those entries only FILL
 * GAPS — mergePublications() keeps every curated pub in publications.ts
 * authoritative and drops generated duplicates (DOI → PubMed → title+year).
 *
 * Run:   npm run fetch:publications        (npx tsx scripts/fetch-publications.ts)
 * Then:  review the diff of publications.generated.ts, commit it. Seeding into
 *        prod D1 happens on deploy (Nick's gate) — this script does not deploy.
 *
 * Env flags:
 *   PUBFETCH_NO_SCHOLAR=1   skip the Scholar fallback entirely (ORCID-only run).
 *   PUBFETCH_DELAY_MS=2000  ms between members (default 1500) — be polite.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Publication } from '../src/data/types'
import {
  directors,
  seniorMentors,
  facultyCollaborators,
  researchTeam,
} from '../src/data/team'
import { dedupKeys, unionAuthorSlugs } from '../src/data/mergePublications'

/**
 * A work is a real publication (vs a conference-abstract stub or a
 * correction/erratum) worth listing. ORCID feeds include bare abstract numbers
 * as "titles" (e.g. "1609") and Author Correction / Erratum entries — neither
 * belongs on a public publications list.
 */
function isRealPublication(title: string): boolean {
  const t = title.trim()
  if (t.length < 6) return false
  if (/^\d+$/.test(t)) return false // conference abstract id, not a title
  if (/^(correction|author correction|erratum|corrigendum)\b/i.test(t)) return false
  if (/\(preprint\)/i.test(t)) return false // preprints clutter/duplicate a published-pubs list
  return true
}

interface FetchMember {
  name: string
  slug: string
  authorName?: string
  scholarId?: string
  orcidId?: string
  openalexId?: string
}

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/publications.generated.ts')
const DELAY_MS = Number(process.env.PUBFETCH_DELAY_MS ?? 1500)
const SKIP_SCHOLAR = process.env.PUBFETCH_NO_SCHOLAR === '1'
const SKIP_OPENALEX = process.env.PUBFETCH_NO_OPENALEX === '1'
const MAILTO = 'nicholas.ingraham@gmail.com'

function allMembers(): FetchMember[] {
  // Raw arrays (NOT getAllMembers(), which drops orcidId when flattening directors).
  const rows = [...directors, ...seniorMentors, ...facultyCollaborators, ...researchTeam]
  return rows
    .filter((m): m is typeof m & { slug: string } => Boolean(m.slug))
    .map((m) => ({
      name: m.name,
      slug: m.slug,
      authorName: 'authorName' in m ? m.authorName : undefined,
      scholarId: m.scholarId,
      orcidId: 'orcidId' in m ? m.orcidId : undefined,
      openalexId: 'openalexId' in m ? m.openalexId : undefined,
    }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function slugify(s: string, max = 6): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, max)
    .join('-')
}

function makeId(member: FetchMember, title: string, year: number | undefined, doi?: string): string {
  if (doi) return `gen-${slugify(doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''), 8)}`
  return `gen-${member.slug}-${year ?? 'na'}-${slugify(title, 5)}`
}

// ── ORCID (primary) ─────────────────────────────────────────────────────────
// Public API, no auth. Two steps: the /works summary lists put-codes; the bulk
// /works/{putCodes} endpoint (<=100 codes/call) returns FULL work records —
// which is where `contributors` (the author list) lives; the summary omits them.
async function fetchOrcid(member: FetchMember): Promise<Publication[]> {
  const sumRes = await fetch(`https://pub.orcid.org/v3.0/${member.orcidId}/works`, {
    headers: { Accept: 'application/json' },
  })
  if (!sumRes.ok) throw new Error(`ORCID summary ${sumRes.status} for ${member.orcidId}`)
  const summary = (await sumRes.json()) as OrcidWorks
  const putCodes: number[] = []
  for (const group of summary.group ?? []) {
    const pc = group['work-summary']?.[0]?.['put-code']
    if (typeof pc === 'number') putCodes.push(pc)
  }
  if (!putCodes.length) return []

  const out: Publication[] = []
  for (let i = 0; i < putCodes.length; i += 100) {
    const chunk = putCodes.slice(i, i + 100)
    const bulkRes = await fetch(
      `https://pub.orcid.org/v3.0/${member.orcidId}/works/${chunk.join(',')}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!bulkRes.ok) throw new Error(`ORCID bulk ${bulkRes.status} for ${member.orcidId}`)
    const bulk = (await bulkRes.json()) as OrcidBulk
    for (const item of bulk.bulk ?? []) {
      const pub = mapOrcidWork(member, item.work)
      if (pub) out.push(pub)
    }
  }
  return out
}

function mapOrcidWork(member: FetchMember, work?: OrcidWork): Publication | null {
  if (!work) return null
  const title = work.title?.title?.value?.trim()
  if (!title || !isRealPublication(title)) return null
  const year = numOrUndef(work['publication-date']?.year?.value)
  if (!year) return null // drop year-less works — can't place them on a dated list
  let doi: string | undefined
  let pubmed: string | undefined
  for (const ext of work['external-ids']?.['external-id'] ?? []) {
    const type = (ext['external-id-type'] || '').toLowerCase()
    const val = ext['external-id-value']
    if (!val) continue
    if (type === 'doi' && !doi) doi = `https://doi.org/${val}`
    if (type === 'pmid' && !pubmed) pubmed = `https://pubmed.ncbi.nlm.nih.gov/${val.replace(/\D/g, '')}/`
  }
  return {
    id: makeId(member, title, year, doi),
    authors: buildAuthors(work) || member.authorName || member.name,
    title,
    journal: work['journal-title']?.value?.trim() || '',
    year,
    status: 'Published',
    doi,
    pubmed,
    topics: [],
    authorSlugs: [member.slug],
  }
}

/** Author string from ORCID contributors; '' if none listed (caller falls back). */
function buildAuthors(work: OrcidWork): string {
  const names = (work.contributors?.contributor ?? [])
    .map((c) => c['credit-name']?.value?.trim())
    .filter((n): n is string => Boolean(n))
  return names.join(', ')
}

// ── Google Scholar (fenced fallback) ────────────────────────────────────────
// No official API. Minimal parse of the citations page HTML. Best-effort:
// Google may block or restructure at any time — that is exactly why every call
// site is wrapped and degrades to [].
async function fetchScholar(member: FetchMember): Promise<Publication[]> {
  const url = `https://scholar.google.com/citations?user=${member.scholarId}&hl=en&cstart=0&pagesize=100`
  const res = await fetch(url, {
    headers: {
      // A real UA — Scholar 403s the default fetch UA. Still ToS-gray; run sparingly.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Scholar ${res.status} for ${member.scholarId}`)
  const html = await res.text()
  const out: Publication[] = []
  // Each publication is a <tr class="gsc_a_tr"> ... </tr> block.
  const rows = html.split('<tr class="gsc_a_tr">').slice(1)
  for (const row of rows) {
    const title = decodeEntities(matchGroup(row, /class="gsc_a_at"[^>]*>([^<]+)</))
    if (!title || !isRealPublication(title)) continue
    const grays = [...row.matchAll(/class="gs_gray">([^<]*)</g)].map((m) => decodeEntities(m[1]))
    const authors = grays[0] || member.authorName || member.name
    const venue = grays[1] || ''
    const year = numOrUndef(matchGroup(row, /class="gsc_a_h[^"]*"[^>]*>(\d{4})</) || matchGroup(row, /gsc_a_y[^>]*>\s*<[^>]*>(\d{4})</))
    out.push({
      id: makeId(member, title, year),
      authors,
      title,
      // Strip a trailing ", 2024" / volume tail from the venue string.
      journal: venue.replace(/,?\s*\d{4}$/, '').replace(/,\s*[^,]*\d+[^,]*$/, '').trim(),
      year: year ?? 0,
      status: 'Published',
      topics: [],
      authorSlugs: [member.slug],
    })
  }
  return out
}

// ── OpenAlex (primary — fullest coverage) ────────────────────────────────────
// Resolve an OpenAlex author id (stored openalexId, or via the member's ORCID),
// then pull all their journal ARTICLES (`type:article` excludes preprints /
// datasets / errata / book chapters). OpenAlex is a superset of ORCID + PubMed +
// Crossref and carries the full author list — so it fills members whose ORCID is
// empty (e.g. an ORCID with 0 works but 53 on OpenAlex).
interface OAWork {
  title?: string
  display_name?: string
  publication_year?: number
  doi?: string | null
  ids?: { pmid?: string }
  authorships?: Array<{ author?: { display_name?: string } }>
  primary_location?: { source?: { display_name?: string } }
}
interface OAWorksPage {
  results?: OAWork[]
  meta?: { next_cursor?: string | null }
}

async function resolveOpenAlexId(m: FetchMember): Promise<string | undefined> {
  if (m.openalexId) return m.openalexId
  if (!m.orcidId) return undefined
  const res = await fetch(`https://api.openalex.org/authors/orcid:${m.orcidId}?mailto=${MAILTO}`)
  if (!res.ok) return undefined
  const a = (await res.json()) as { id?: string }
  return a.id ? a.id.replace('https://openalex.org/', '') : undefined
}

async function fetchOpenAlex(member: FetchMember, authorId: string): Promise<Publication[]> {
  const out: Publication[] = []
  let cursor: string | null = '*'
  let pages = 0
  while (cursor && pages < 20) {
    const url =
      `https://api.openalex.org/works?filter=authorships.author.id:${authorId},type:article` +
      `&per-page=200&cursor=${encodeURIComponent(cursor)}&mailto=${MAILTO}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`OpenAlex works ${res.status} for ${authorId}`)
    const data = (await res.json()) as OAWorksPage
    for (const w of data.results ?? []) {
      const pub = mapOpenAlexWork(member, w)
      if (pub) out.push(pub)
    }
    cursor = data.meta?.next_cursor ?? null
    pages++
    if (!(data.results ?? []).length) break
  }
  return out
}

function mapOpenAlexWork(member: FetchMember, w: OAWork): Publication | null {
  const title = (w.title || w.display_name || '').trim()
  if (!title || !isRealPublication(title)) return null
  const year = w.publication_year
  if (!year) return null
  const doi = w.doi || undefined // already a full https://doi.org/... URL
  const pmid = w.ids?.pmid ? w.ids.pmid.replace(/\D/g, '') : ''
  const pubmed = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined
  const authors = (w.authorships ?? [])
    .map((a) => a.author?.display_name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 30)
    .join(', ')
  return {
    id: makeId(member, title, year, doi),
    authors: authors || member.authorName || member.name,
    title,
    journal: w.primary_location?.source?.display_name?.trim() || '',
    year,
    status: 'Published',
    doi,
    pubmed,
    topics: [],
    authorSlugs: [member.slug],
  }
}

// ── driver ──────────────────────────────────────────────────────────────────
async function main() {
  const members = allMembers()
  const all: Publication[] = []
  let openalexCount = 0
  let orcidCount = 0
  let scholarCount = 0
  let skipped = 0

  for (const m of members) {
    try {
      const oaId = SKIP_OPENALEX ? undefined : await resolveOpenAlexId(m)
      if (oaId) {
        const pubs = await fetchOpenAlex(m, oaId)
        all.push(...pubs)
        openalexCount++
        console.log(`  [OpenAlex] ${m.slug}: ${pubs.length} articles`)
      } else if (m.orcidId) {
        const pubs = await fetchOrcid(m)
        all.push(...pubs)
        orcidCount++
        console.log(`  [ORCID]    ${m.slug}: ${pubs.length} works`)
      } else if (m.scholarId && !SKIP_SCHOLAR) {
        const pubs = await fetchScholar(m)
        all.push(...pubs)
        scholarCount++
        console.log(`  [Scholar]  ${m.slug}: ${pubs.length} works`)
      } else {
        skipped++
        continue
      }
    } catch (err) {
      // FENCED: a member's fetch failure never aborts the run.
      skipped++
      console.warn(`  [SKIP]     ${m.slug}: ${(err as Error).message}`)
    }
    await sleep(DELAY_MS)
  }

  // Dedup within the generated set (stable, keep first) — same multi-key logic
  // mergePublications uses, so a title dup is caught even when only one copy
  // carries a DOI. #1126: UNION authorSlugs across duplicate copies instead
  // of dropping them — each per-member fetch above tags a pub `authorSlugs:
  // [member.slug]`, so a paper co-authored by two lab members arrives here
  // as two near-identical copies (one per author's own fetch run); silently
  // keeping only the first collapsed co-authorship to a single lab author.
  const keyToIndex = new Map<string, number>()
  const deduped: Publication[] = []
  for (const p of all) {
    const keys = dedupKeys(p)
    const dupIndex = keys.map((k) => keyToIndex.get(k)).find((i) => i !== undefined)
    if (dupIndex !== undefined) {
      deduped[dupIndex] = unionAuthorSlugs(deduped[dupIndex], p)
      continue
    }
    for (const k of keys) keyToIndex.set(k, deduped.length)
    deduped.push(p)
  }

  writeFileSync(OUT, render(deduped), 'utf8')
  console.log(
    `\nWrote ${deduped.length} generated publications to publications.generated.ts ` +
      `(openalex=${openalexCount}, orcid=${orcidCount}, scholar=${scholarCount}, skipped=${skipped}).`,
  )
  console.log('Review the diff, then commit. Seeding prod D1 is a separate deploy step (Nick gates it).')
}

function render(pubs: Publication[]): string {
  const header = `import type { Publication } from './types'

/**
 * AUTO-GENERATED by scripts/fetch-publications.ts — do NOT hand-edit. (#357)
 * Regenerate with: npm run fetch:publications
 * ORCID primary / Google Scholar fenced fallback; build-time only.
 * These entries only fill gaps — mergePublications() keeps curated pubs
 * authoritative. Review before committing.
 */
export const generatedPublications: Publication[] = ${JSON.stringify(pubs, null, 2)}
`
  return header
}

// ── tiny helpers ─────────────────────────────────────────────────────────────
function matchGroup(s: string, re: RegExp): string | undefined {
  const m = s.match(re)
  return m ? m[1] : undefined
}
function numOrUndef(v: string | number | undefined | null): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
function decodeEntities(s: string | undefined): string {
  if (!s) return ''
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// ── ORCID response shapes (only the fields we read) ──────────────────────────
interface OrcidWorks {
  group?: Array<{
    'work-summary'?: Array<{ 'put-code'?: number }>
  }>
}

interface OrcidBulk {
  bulk?: Array<{ work?: OrcidWork }>
}

interface OrcidWork {
  title?: { title?: { value?: string } }
  'journal-title'?: { value?: string }
  'publication-date'?: { year?: { value?: string } }
  'external-ids'?: { 'external-id'?: Array<{ 'external-id-type'?: string; 'external-id-value'?: string }> }
  contributors?: { contributor?: Array<{ 'credit-name'?: { value?: string } }> }
}

main().catch((err) => {
  console.error('fetch-publications failed:', err)
  process.exit(1)
})
