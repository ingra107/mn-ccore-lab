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
import { curatedPublications } from '../src/data/publications'
import {
  buildTitleIndex,
  excludedPublication,
  isAcceptableWork,
  MAX_UNRANKED_AUTHORS,
  parsePubmedAuthors,
  type CandidateWork,
  type RejectReason,
} from '../src/lib/publicationFilter'

/** A fetched work, the Publication it would become, and the names its member goes by. */
export interface Candidate {
  pub: Publication
  work: CandidateWork
  memberNames: string[]
}

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

export interface FetchMember {
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

export function allMembers(): FetchMember[] {
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
async function fetchOrcid(member: FetchMember): Promise<Candidate[]> {
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

  const out: Candidate[] = []
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
      // The member's own ORCID record: claimed, byline unknown.
      if (pub) out.push({ pub, work: { title: pub.title, doi: pub.doi, pubmed: pub.pubmed, type: item.work?.type }, memberNames: memberNames(member) })
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
async function fetchScholar(member: FetchMember): Promise<Candidate[]> {
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
  const out: Candidate[] = []
  // Each publication is a <tr class="gsc_a_tr"> ... </tr> block.
  const rows = html.split('<tr class="gsc_a_tr">').slice(1)
  for (const row of rows) {
    const title = decodeEntities(matchGroup(row, /class="gsc_a_at"[^>]*>([^<]+)</))
    if (!title || !isRealPublication(title)) continue
    const grays = [...row.matchAll(/class="gs_gray">([^<]*)</g)].map((m) => decodeEntities(m[1]))
    const authors = grays[0] || member.authorName || member.name
    const venue = grays[1] || ''
    const year = numOrUndef(matchGroup(row, /class="gsc_a_h[^"]*"[^>]*>(\d{4})</) || matchGroup(row, /gsc_a_y[^>]*>\s*<[^>]*>(\d{4})</))
    const pub: Publication = {
      id: makeId(member, title, year),
      authors,
      title,
      // Strip a trailing ", 2024" / volume tail from the venue string.
      journal: venue.replace(/,?\s*\d{4}$/, '').replace(/,\s*[^,]*\d+[^,]*$/, '').trim(),
      year: year ?? 0,
      status: 'Published',
      topics: [],
      authorSlugs: [member.slug],
    }
    // The member's own Scholar profile: listed by them, byline unknown.
    out.push({ pub, work: { title: pub.title }, memberNames: memberNames(member) })
  }
  return out
}

// ── OpenAlex (primary — fullest coverage) ────────────────────────────────────
// Resolve an OpenAlex author id (stored openalexId, or via the member's ORCID),
// then pull all their journal ARTICLES (`type:article` excludes preprints /
// datasets / errata / book chapters). OpenAlex is a superset of ORCID + PubMed +
// Crossref and carries the full author list — so it fills members whose ORCID is
// empty (e.g. an ORCID with 0 works but 53 on OpenAlex).
//
// An OpenAlex author id is a CLUSTER of byline names, and clusters swallow other
// people: "Ryan Dudley" on a 2,438-author JAMA trial is filed under R. Adams
// Dudley (2026-10-13 audit). So every work carries its byline facts into
// isAcceptableWork: the printed name at the member's authorship, the full byline
// length and the member's place on it. A work whose DOI is in the member's own
// ORCID record counts as claimed by them.
interface OAAuthorship {
  author?: { id?: string | null; display_name?: string }
  raw_author_name?: string
}
export interface OAWork {
  id?: string
  title?: string
  display_name?: string
  type?: string
  publication_year?: number
  doi?: string | null
  ids?: { pmid?: string }
  authorships?: OAAuthorship[]
  primary_location?: { source?: { display_name?: string } | null } | null
}
interface OAWorksPage {
  results?: OAWork[]
  meta?: { next_cursor?: string | null }
}

export interface OAAuthor {
  /** filter value: one id, or several joined by '|' */
  query: string
  ids: Set<string>
  /** OpenAlex display names of those ids (never the alternatives: a swallowed
   *  person's name lands there too) */
  names: string[]
}

const OA_PREFIX = 'https://openalex.org/'
const bareOaId = (id?: string | null) => (id ?? '').replace(OA_PREFIX, '')

/**
 * Printed forms of a member's name that neither team.ts nor OpenAlex carries.
 * Each entry needs its evidence. Raymond A Dudley: PMID 23174012 (Acta
 * Paediatrica 2013) prints it, with UCSF Departments of Medicine and Health
 * Policy as the affiliation, which is R. Adams Dudley's UCSF department.
 */
const BYLINE_ALIASES: Record<string, string[]> = {
  'adams-dudley': ['Raymond A Dudley'],
}

function memberNames(m: FetchMember, extra: string[] = []): string[] {
  return [m.name, m.authorName, ...(BYLINE_ALIASES[m.slug] ?? []), ...extra].filter((n): n is string => Boolean(n))
}

/**
 * Attach each OpenAlex candidate's PubMed byline (AuthorList names), 200 PMIDs
 * per efetch. A failed batch leaves those candidates without PubMed names, so
 * the filter falls back to the OpenAlex byline alone for them.
 */
export async function attachPubmedBylines(cands: Candidate[]): Promise<void> {
  const byPmid = new Map<string, Candidate[]>()
  for (const c of cands) {
    const pmid = c.work.pubmed?.match(/(\d{5,})/)?.[1]
    if (!pmid || !c.work.byline) continue
    byPmid.set(pmid, [...(byPmid.get(pmid) ?? []), c])
  }
  const pmids = [...byPmid.keys()]
  for (let i = 0; i < pmids.length; i += 200) {
    const chunk = pmids.slice(i, i + 200)
    const res = await fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `db=pubmed&retmode=xml&email=${MAILTO}&id=${chunk.join(',')}`,
    })
    if (!res.ok) {
      console.warn(`  [PubMed]   efetch ${res.status} for ${chunk.length} PMIDs; those works keep the OpenAlex byline only`)
      continue
    }
    for (const [pmid, names] of parsePubmedAuthors(await res.text())) {
      for (const c of byPmid.get(pmid) ?? []) c.work.byline!.pubmedNames = names
    }
    await sleep(400) // NCBI asks for <= 3 requests/second without a key
  }
}

export async function resolveOpenAlexAuthor(m: FetchMember): Promise<OAAuthor | undefined> {
  let ids: string[] = []
  if (m.openalexId) ids = m.openalexId.split('|').map((s) => s.trim()).filter(Boolean)
  else if (m.orcidId) {
    const res = await fetch(`https://api.openalex.org/authors/orcid:${m.orcidId}?mailto=${MAILTO}`)
    if (!res.ok) return undefined
    const a = (await res.json()) as { id?: string }
    if (a.id) ids = [bareOaId(a.id)]
  }
  if (!ids.length) return undefined
  const names: string[] = []
  for (const id of ids) {
    const res = await fetch(`https://api.openalex.org/authors/${id}?mailto=${MAILTO}`)
    if (!res.ok) continue
    const a = (await res.json()) as { display_name?: string }
    if (a.display_name) names.push(a.display_name)
  }
  return { query: ids.join('|'), ids: new Set(ids), names }
}

/** DOIs the member lists in their own ORCID record (lowercase, no doi.org prefix). */
export async function fetchOrcidDois(orcidId: string): Promise<Set<string>> {
  const out = new Set<string>()
  const res = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/works`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`ORCID summary ${res.status} for ${orcidId}`)
  const summary = (await res.json()) as OrcidWorks
  for (const group of summary.group ?? []) {
    for (const ext of group['external-ids']?.['external-id'] ?? []) {
      if ((ext['external-id-type'] || '').toLowerCase() === 'doi' && ext['external-id-value']) {
        out.add(ext['external-id-value'].trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ''))
      }
    }
  }
  return out
}

async function fetchOpenAlex(member: FetchMember, author: OAAuthor, orcidDois: Set<string>): Promise<Candidate[]> {
  const out: Candidate[] = []
  let cursor: string | null = '*'
  let pages = 0
  while (cursor && pages < 20) {
    const url =
      `https://api.openalex.org/works?filter=authorships.author.id:${author.query},type:article` +
      `&per-page=200&cursor=${encodeURIComponent(cursor)}&mailto=${MAILTO}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`OpenAlex works ${res.status} for ${author.query}`)
    const data = (await res.json()) as OAWorksPage
    for (const listed of data.results ?? []) {
      // List results cap authorships at 100; the single-work record has them all.
      const w = (listed.authorships?.length ?? 0) >= MAX_UNRANKED_AUTHORS ? await fetchFullWork(listed) : listed
      const c = mapOpenAlexWork(member, w, author, orcidDois)
      if (c) out.push(c)
    }
    cursor = data.meta?.next_cursor ?? null
    pages++
    if (!(data.results ?? []).length) break
  }
  return out
}

export async function fetchFullWork(w: OAWork): Promise<OAWork> {
  const id = bareOaId(w.id)
  if (!id) return w
  const res = await fetch(`https://api.openalex.org/works/${id}?mailto=${MAILTO}`)
  if (!res.ok) throw new Error(`OpenAlex work ${res.status} for ${id}`)
  return (await res.json()) as OAWork
}

export function mapOpenAlexWork(member: FetchMember, w: OAWork, author: OAAuthor, orcidDois: Set<string>): Candidate | null {
  const title = (w.title || w.display_name || '').trim()
  if (!title || !isRealPublication(title)) return null
  const year = w.publication_year
  if (!year) return null
  const doi = w.doi || undefined // already a full https://doi.org/... URL
  const pmid = w.ids?.pmid ? w.ids.pmid.replace(/\D/g, '') : ''
  const pubmed = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined
  const authorships = w.authorships ?? []
  const memberIndex = authorships.findIndex((a) => author.ids.has(bareOaId(a.author?.id)))
  const authors = authorships
    .map((a) => a.author?.display_name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 30)
    .join(', ')
  const sourceName = w.primary_location?.source?.display_name?.trim() || ''
  const bareDoi = (doi ?? '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
  const pub: Publication = {
    id: makeId(member, title, year, doi),
    authors: authors || member.authorName || member.name,
    title,
    journal: sourceName,
    year,
    status: 'Published',
    doi,
    pubmed,
    topics: [],
    authorSlugs: [member.slug],
  }
  return {
    pub,
    work: {
      title,
      doi,
      pubmed,
      type: w.type,
      sourceName,
      byline: {
        count: authorships.length,
        memberIndex,
        rawName: memberIndex >= 0 ? authorships[memberIndex].raw_author_name : undefined,
        claimed: Boolean(bareDoi) && orcidDois.has(bareDoi),
      },
    },
    memberNames: memberNames(member, author.names),
  }
}

// ── driver ──────────────────────────────────────────────────────────────────
async function main() {
  const members = allMembers()
  const all: Candidate[] = []
  let openalexCount = 0
  let orcidCount = 0
  let scholarCount = 0
  let skipped = 0

  for (const m of members) {
    try {
      const oa = SKIP_OPENALEX ? undefined : await resolveOpenAlexAuthor(m)
      if (oa) {
        const orcidDois = m.orcidId ? await fetchOrcidDois(m.orcidId).catch(() => new Set<string>()) : new Set<string>()
        const cands = await fetchOpenAlex(m, oa, orcidDois)
        all.push(...cands)
        openalexCount++
        console.log(`  [OpenAlex] ${m.slug}: ${cands.length} articles`)
      } else if (m.orcidId) {
        const cands = await fetchOrcid(m)
        all.push(...cands)
        orcidCount++
        console.log(`  [ORCID]    ${m.slug}: ${cands.length} works`)
      } else if (m.scholarId && !SKIP_SCHOLAR) {
        const cands = await fetchScholar(m)
        all.push(...cands)
        scholarCount++
        console.log(`  [Scholar]  ${m.slug}: ${cands.length} works`)
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

  await attachPubmedBylines(all)
  const accepted = filterCandidates(all)

  // Dedup within the generated set (stable, keep first) — same multi-key logic
  // mergePublications uses, so a title dup is caught even when only one copy
  // carries a DOI. #1126: UNION authorSlugs across duplicate copies instead
  // of dropping them — each per-member fetch above tags a pub `authorSlugs:
  // [member.slug]`, so a paper co-authored by two lab members arrives here
  // as two near-identical copies (one per author's own fetch run); silently
  // keeping only the first collapsed co-authorship to a single lab author.
  const keyToIndex = new Map<string, number>()
  const deduped: Publication[] = []
  for (const p of accepted) {
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

/**
 * Keep the candidates isAcceptableWork passes, minus deliberate exclusions.
 * The title index spans curated pubs and every candidate, so a preprint or a
 * meeting abstract is caught even when its published twin came from another
 * member's fetch or carries a different year.
 */
export function filterCandidates(all: Candidate[]): Publication[] {
  const titles = buildTitleIndex([...curatedPublications, ...all.map((c) => c.work)])
  const rejected = new Map<RejectReason, number>()
  const kept: Publication[] = []
  for (const c of all) {
    if (excludedPublication(c.pub)) {
      rejected.set('excluded', (rejected.get('excluded') ?? 0) + 1)
      continue
    }
    const v = isAcceptableWork(c.work, c.memberNames, titles)
    if (!v.ok) {
      rejected.set(v.reason!, (rejected.get(v.reason!) ?? 0) + 1)
      console.log(`  [REJECT]   ${c.pub.authorSlugs?.[0]}: ${v.reason} (${v.detail ?? ''}) ${c.pub.title.slice(0, 70)}`)
      continue
    }
    kept.push(c.pub)
  }
  console.log(`  rejected: ${JSON.stringify(Object.fromEntries(rejected))}`)
  return kept
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
    'external-ids'?: { 'external-id'?: Array<{ 'external-id-type'?: string; 'external-id-value'?: string }> }
  }>
}

interface OrcidBulk {
  bulk?: Array<{ work?: OrcidWork }>
}

interface OrcidWork {
  title?: { title?: { value?: string } }
  'journal-title'?: { value?: string }
  type?: string
  'publication-date'?: { year?: { value?: string } }
  'external-ids'?: { 'external-id'?: Array<{ 'external-id-type'?: string; 'external-id-value'?: string }> }
  contributors?: { contributor?: Array<{ 'credit-name'?: { value?: string } }> }
}

// Run only as the entry point, so a dry run can import the mapping + filter
// above and exercise the same code against saved data.
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((err) => {
    console.error('fetch-publications failed:', err)
    process.exit(1)
  })
}
