/**
 * Which scraped works may become lab publications (#357 / #905 scrape).
 *
 * The 2026-10-13 integrity audit of prod `publications` found every bad
 * generated row fell into a class the scrape could have tested for: an
 * OpenAlex author cluster that swallowed a different person ("Ryan Dudley"
 * filed under R. Adams Dudley), 10.17615 repository deposits of journal
 * papers, abstract books and referee reports, consortium bylines of hundreds
 * of names, and preprints or meeting abstracts that duplicate the published
 * paper. `isAcceptableWork` is the one test for all of them; the fetch runs
 * it on every candidate and the prod insert runs it again on what it emits.
 *
 * `excludedPublication` is the other half: a row someone deliberately deleted
 * from prod stays deleted, because the next scrape mints the same id
 * (fetch-publications.ts makeId is deterministic) and the prod insert dedups
 * only against rows that still exist.
 */
import exclusionsFile from '../data/publicationExclusions.json'

export type RejectReason =
  | 'excluded'
  | 'repository-doi'
  | 'non-paper-type'
  | 'non-paper-title'
  | 'name-conflict'
  | 'consortium-byline'
  | 'preprint-shadowed'
  | 'abstract-shadowed'

export interface Verdict {
  ok: boolean
  reason?: RejectReason
  detail?: string
}

/** What the scrape knows about one member's place on a work's byline. */
export interface Byline {
  /** Length of the FULL byline (OpenAlex list results cap authorships at 100). */
  count: number
  /** 0-based position of the member's authorship; -1 when the member is not on it. */
  memberIndex: number
  /** The name as printed on the work (OpenAlex `raw_author_name`). */
  rawName?: string
  /**
   * True when the member listed this work themselves (its DOI is in their own
   * ORCID record). Only then may a byline name that disagrees with theirs pass.
   */
  claimed: boolean
  /**
   * Personal names on the PubMed byline (AuthorList, never the InvestigatorList
   * of group members), when the work has a PMID and PubMed was read. Used only
   * to let a byline over 100 names through when PubMed names the member.
   */
  pubmedNames?: string[]
}

export interface CandidateWork {
  title: string
  doi?: string
  pubmed?: string
  /** OpenAlex or ORCID work type, e.g. 'article', 'peer-review', 'paratext'. */
  type?: string
  /** Venue display name, e.g. 'medRxiv', 'JAMA'. */
  sourceName?: string
  /** Absent for sources that carry no byline detail (prior generated rows). */
  byline?: Byline
}

/** Every name the member is known by (team.ts name, authorName, OpenAlex display_name). */
export type MemberNames = string[]

/** A title -> published-of-record index over the works already known (curated, prod, this run). */
export interface TitleIndex {
  /** normalized title -> the DOIs/PMIDs of non-preprint works carrying it */
  entries: Map<string, Array<{ doi: string; hasPmid: boolean; preprint: boolean }>>
}

export const MAX_UNRANKED_AUTHORS = 100
const LEAD_SLOTS = 3

// University repository deposits (UNC, eScholarship) of papers published elsewhere.
const REPOSITORY_DOI_PREFIXES = ['10.17615/']
// medRxiv/bioRxiv, SSRN, Research Square, Preprints.org.
const PREPRINT_DOI_PREFIXES = ['10.1101/', '10.2139/', '10.21203/', '10.20944/']
const PREPRINT_SOURCE = /\b(medrxiv|biorxiv|ssrn|research square|preprints\.org|arxiv)\b/i
// Conference abstracts are NOT here: the audit verified stand-alone ones (a JCO
// supplement abstract); one that duplicates the full paper is 'abstract-shadowed'.
const NON_PAPER_TYPES = new Set(['peer-review', 'paratext', 'erratum', 'retraction', 'supplementary-materials', 'dataset'])
// Records that are not a paper whatever their type says: abstract books,
// referee reports, and search-page placeholders.
const NON_PAPER_TITLES = [
  /^referee report\b/i,
  /\bannual meeting abstracts?\s*$/i,
  /\babstract book\b/i,
  /^abstracts? (of|from) the\b/i,
  /^results for literature search$/i,
  // Figures and tables catalogued as their own works (a 2004 AHRQ report's
  // "Figure C12, Scenario 3: ..." and "[Table], Table 15. ..." rows).
  /^\[(table|figure)\b/i,
  /^(table|figure|fig\.?)\s+[a-z]?\d+[a-z]?\s*[,.:]/i,
  /^acronyms and abbreviations$/i,
]

export function normalizeDoi(doi?: string | null): string {
  if (!doi) return ''
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
}

export function normalizeTitle(title?: string | null): string {
  if (!title) return ''
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isPreprint(w: Pick<CandidateWork, 'doi' | 'type' | 'sourceName'>): boolean {
  const doi = normalizeDoi(w.doi)
  if (PREPRINT_DOI_PREFIXES.some((p) => doi.startsWith(p))) return true
  if (w.type === 'preprint' || w.type === 'posted-content') return true
  return PREPRINT_SOURCE.test(w.sourceName ?? '')
}

/**
 * A title key loose enough that a preprint and its published version meet:
 * parentheticals dropped, plurals folded. The medRxiv "...Physiology Scores,
 * version 2 (LAPS2)" and the Medical Care "...Physiology Score, Version 2"
 * share one key.
 */
export function titleKey(title?: string | null): string {
  return normalizeTitle((title ?? '').replace(/\([^)]*\)/g, ' '))
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ')
}

export function buildTitleIndex(
  works: Array<{ title: string; doi?: string | null; pubmed?: string | null; type?: string; sourceName?: string }>,
): TitleIndex {
  const entries: TitleIndex['entries'] = new Map()
  for (const w of works) {
    const key = titleKey(w.title)
    if (!key) continue
    const list = entries.get(key) ?? []
    list.push({
      doi: normalizeDoi(w.doi),
      hasPmid: Boolean(w.pubmed && /\d{5,}/.test(w.pubmed)),
      preprint: isPreprint({ doi: w.doi ?? undefined, type: w.type, sourceName: w.sourceName }),
    })
    entries.set(key, list)
  }
  return { entries }
}

interface ParsedName {
  surnames: string[]
  /** given names written out (len >= 2) */
  words: string[]
  /** first letters of every given token */
  initials: string[]
  /** the first given token, and whether it is only an initial */
  first?: { text: string; initial: boolean }
}

function asciiLower(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Parse "First M. Last", "Last, First M" and the PubMed form "Last FM"
 * (an all-caps run of up to 3 letters after the surname is initials).
 */
export function parseName(raw: string): ParsedName {
  const trimmed = raw.trim()
  let surnamePart: string
  let givenPart: string
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',')
    surnamePart = last
    givenPart = rest.join(' ')
  } else {
    const parts = trimmed.split(/\s+/).filter(Boolean)
    const tail = parts[parts.length - 1] ?? ''
    if (parts.length >= 2 && /^[A-Z]{1,3}$/.test(tail) && !/^[A-Z]{1,3}$/.test(parts[0])) {
      // PubMed "Dudley RA": surname(s) first, initials block last
      surnamePart = parts.slice(0, -1).join(' ')
      givenPart = tail.split('').join(' ')
    } else {
      surnamePart = tail
      givenPart = parts.slice(0, -1).join(' ')
    }
  }
  const surnames = asciiLower(surnamePart).split(/[^a-z]+/).filter(Boolean)
  const tokens = givenPart.split(/[\s.]+/).filter(Boolean)
  const words: string[] = []
  const initials: string[] = []
  let first: ParsedName['first']
  for (const tok of tokens) {
    const lower = asciiLower(tok).replace(/[^a-z-]/g, '')
    if (!lower) continue
    const initial = lower.length === 1
    if (!first) first = { text: lower, initial }
    initials.push(lower[0])
    if (!initial) words.push(lower)
  }
  return { surnames, words, initials, first }
}

function wordsAgree(a: string, b: string): boolean {
  if (a.startsWith(b) || b.startsWith(a)) return true // Jeff / Jeffrey, Ben / Benjamin
  return a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3) // Dave / David, Nate / Nathan
}

/**
 * Could this printed byline name be the member? The surname must match, and the
 * printed first given name must agree with one the member is known by: a
 * written-out name ("Ryan") must match a written-out name of theirs (an initial
 * of theirs is not enough), an initial ("R") must match one of their initials.
 */
export function bylineNameMatchesMember(rawName: string, memberNames: MemberNames): boolean {
  const raw = parseName(rawName)
  const known = memberNames.map(parseName)
  const surnames = new Set(known.flatMap((k) => k.surnames))
  if (!raw.surnames.some((s) => surnames.has(s))) return false
  if (!raw.first) return true // surname only: nothing to contradict
  const words = known.flatMap((k) => k.words)
  const initials = new Set(known.flatMap((k) => k.initials))
  if (raw.first.initial) return initials.has(raw.first.text)
  return words.some((w) => wordsAgree(raw.first!.text, w))
}

/** The one gate: may this work be listed as the member's publication? */
export function isAcceptableWork(work: CandidateWork, memberNames: MemberNames, titles?: TitleIndex): Verdict {
  const doi = normalizeDoi(work.doi)
  if (REPOSITORY_DOI_PREFIXES.some((p) => doi.startsWith(p))) {
    return { ok: false, reason: 'repository-doi', detail: doi }
  }
  if (work.type && NON_PAPER_TYPES.has(work.type)) {
    return { ok: false, reason: 'non-paper-type', detail: work.type }
  }
  if (NON_PAPER_TITLES.some((re) => re.test(work.title.trim()))) {
    return { ok: false, reason: 'non-paper-title', detail: work.title }
  }

  const b = work.byline
  if (b) {
    if (!b.claimed) {
      if (b.memberIndex < 0) return { ok: false, reason: 'name-conflict', detail: 'member not on the byline' }
      if (!b.rawName) return { ok: false, reason: 'name-conflict', detail: 'no printed name to check' }
      if (!bylineNameMatchesMember(b.rawName, memberNames)) {
        return { ok: false, reason: 'name-conflict', detail: `byline prints "${b.rawName}"` }
      }
    }
    if (b.count > MAX_UNRANKED_AUTHORS) {
      // A long byline counts only when the member leads or closes it, or PubMed
      // names them as a byline author. PubMed keeps a consortium's members off
      // its AuthorList; OpenAlex lists them all (KPMP: 353 names).
      const lead = b.memberIndex >= 0 && (b.memberIndex < LEAD_SLOTS || b.memberIndex >= b.count - LEAD_SLOTS)
      const onPubmed = (b.pubmedNames ?? []).some((n) => bylineNameMatchesMember(n, memberNames))
      if (!lead && !onPubmed) {
        return {
          ok: false,
          reason: 'consortium-byline',
          detail: `${b.count} authors, member at ${b.memberIndex < 0 ? 'none' : b.memberIndex + 1}`,
        }
      }
    }
  }

  if (titles) {
    // Another record of the same title, never the work itself (a different DOI).
    const twins = (titles.entries.get(titleKey(work.title)) ?? []).filter((t) => !t.preprint && t.doi !== doi)
    if (isPreprint(work)) {
      if (twins.length) {
        return { ok: false, reason: 'preprint-shadowed', detail: 'a published version carries the same title' }
      }
    } else if (!work.pubmed && doi && twins.some((t) => t.hasPmid)) {
      return { ok: false, reason: 'abstract-shadowed', detail: 'an indexed paper carries the same title' }
    }
  }
  return { ok: true }
}

// ── persisted exclusions ─────────────────────────────────────────────────────

export interface PublicationExclusion {
  id: string
  doi?: string
  reason: string
}

export const publicationExclusions: PublicationExclusion[] = (
  exclusionsFile as { excluded: PublicationExclusion[] }
).excluded

const excludedIds = new Set(publicationExclusions.map((e) => e.id))
const excludedDois = new Set(publicationExclusions.map((e) => normalizeDoi(e.doi)).filter(Boolean))

// ── PubMed byline ────────────────────────────────────────────────────────────

/**
 * PMID -> personal author names ("ForeName LastName") from a PubMed efetch XML
 * response. Reads only the AuthorList: a consortium's members sit in the
 * InvestigatorList, and a CollectiveName (the group itself) is not a person.
 */
export function parsePubmedAuthors(xml: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const article of xml.split('<PubmedArticle>').slice(1)) {
    const pmid = article.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1]
    if (!pmid) continue
    const list = article.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/)?.[1] ?? ''
    const names: string[] = []
    for (const author of list.split(/<Author[\s>]/).slice(1)) {
      const last = author.match(/<LastName>([^<]*)<\/LastName>/)?.[1]
      if (!last) continue
      const fore = author.match(/<ForeName>([^<]*)<\/ForeName>/)?.[1] ?? author.match(/<Initials>([^<]*)<\/Initials>/)?.[1] ?? ''
      names.push(`${fore} ${last}`.trim())
    }
    out.set(pmid, names)
  }
  return out
}

/** True when a row was deliberately removed and must not be re-created. */
export function excludedPublication(p: { id?: string; doi?: string | null }): boolean {
  if (p.id && excludedIds.has(p.id)) return true
  const doi = normalizeDoi(p.doi)
  return Boolean(doi) && excludedDois.has(doi)
}
