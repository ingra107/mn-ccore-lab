/**
 * publicationsPage -- which paper goes in which section of /publications.
 *
 * Two rules the page used to break (overnight 2026-10-14):
 *   - Published only by default. A paper in review or in preparation is not
 *     "the published work"; it shows when the visitor picks its status in the
 *     filters, never in the default lists. Counts read the same pool.
 *   - One card per paper. Featured, In high-impact journals and Recent are
 *     disjoint: a paper shown higher up is not repeated lower down.
 * The year bars are drawn from every filter EXCEPT the year, so tapping a bar
 * keeps all the bars on screen (the tapped one lit) and a second tap clears it.
 */
import type { Publication } from '../data/types'
import { isPublished } from './publicationCounts'
import { inArea, type ResearchArea } from './researchAreas'

// High-impact journal names for the "In high-impact journals" section.
export const KEY_JOURNALS = [
  'New England Journal of Medicine',
  'The Lancet Infectious Diseases',
  'The Lancet Respiratory Medicine',
  'Lancet Respiratory Medicine',
  'Lancet Healthy Longevity',
  'Intensive Care Medicine',
  'JAMA Network Open',
  'Annals of Surgery',
  'Critical Care Medicine',
]

export const FEATURED_COUNT = 10
export const RECENT_COUNT = 10

export interface PublicationsPageFilters {
  years: number[]
  statuses: string[]
  topics: string[]
  area: ResearchArea | null
  search: string
}

export interface PublicationsPagePlan {
  /** The rows the page counts from: published, or the picked statuses. */
  pool: Publication[]
  /** pool after every filter but the year: the year bars' source. */
  beforeYear: Publication[]
  /** pool after every filter: the list, the stats, the bibliography. */
  filtered: Publication[]
  /** Newest year first, from beforeYear. */
  barYears: number[]
  featured: Publication[]
  key: Publication[]
  /** The default list: newest first, minus anything already shown above. */
  recent: Publication[]
}

const byYearDesc = (a: Publication, b: Publication) => b.year - a.year

export function planPublicationsPage(
  publications: ReadonlyArray<Publication>,
  f: PublicationsPageFilters,
): PublicationsPagePlan {
  const pool = f.statuses.length > 0
    ? publications.filter((p) => f.statuses.includes(p.status))
    : publications.filter(isPublished)

  const q = f.search.trim().toLowerCase()
  const beforeYear = pool.filter((p) => {
    if (f.topics.length > 0 && !p.topics.some((t) => f.topics.includes(t))) return false
    if (f.area && !inArea(p, f.area)) return false
    if (q && !(
      p.title.toLowerCase().includes(q) ||
      p.authors.toLowerCase().includes(q) ||
      p.journal.toLowerCase().includes(q) ||
      (p.abstract ?? '').toLowerCase().includes(q)
    )) return false
    return true
  })
  const filtered = f.years.length > 0 ? beforeYear.filter((p) => f.years.includes(p.year)) : beforeYear
  const barYears = [...new Set(beforeYear.map((p) => p.year))].sort((a, b) => b - a)

  // The curated sections always read the published pool, whatever is filtered.
  const published = publications.filter(isPublished)
  const featured = [...published].filter((p) => p.featured).sort(byYearDesc).slice(0, FEATURED_COUNT)
  const shown = new Set(featured.map((p) => p.id))
  const key = published.filter((p) => !shown.has(p.id) && KEY_JOURNALS.some((j) => p.journal.includes(j)))
  key.forEach((p) => shown.add(p.id))
  const recent = [...filtered].filter((p) => !shown.has(p.id)).sort(byYearDesc).slice(0, RECENT_COUNT)

  return { pool, beforeYear, filtered, barYears, featured, key, recent }
}
