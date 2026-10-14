// /network filter state and its year-range rules (NetworkFilters.tsx renders it).
import type { Publication } from '../data/types'
import { isPublished } from './publicationCounts'

export interface NetworkFilterState {
  /** null = the full published range. The state never holds the bounds
   *  themselves, so it cannot freeze a fallback range captured before the
   *  publications load (a direct /network load used to start at now-5 and
   *  show "Clear" as if the visitor had filtered). */
  yearRange: [number, number] | null
  activeTopics: string[]
  mnccoreOnly: boolean
}

export interface YearBounds { min: number; max: number }

/** Published year bounds; null until there is a published paper. */
export function yearBounds(publications: ReadonlyArray<Publication>): YearBounds | null {
  const years = publications.filter(isPublished).map((p) => p.year).filter((y) => Number.isFinite(y))
  if (!years.length) return null
  return { min: Math.min(...years), max: Math.max(...years) }
}

/** The range a filter applies: the chosen one, else the full bounds. */
export function effectiveYearRange(filters: NetworkFilterState, bounds: YearBounds | null): [number, number] | null {
  if (filters.yearRange) return filters.yearRange
  return bounds ? [bounds.min, bounds.max] : null
}

/** Store a picked range, folding the full range back to null. */
export function withYearRange(filters: NetworkFilterState, range: [number, number], bounds: YearBounds): NetworkFilterState {
  const full = range[0] <= bounds.min && range[1] >= bounds.max
  return { ...filters, yearRange: full ? null : range }
}
