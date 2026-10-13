import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { currentIsoWeek, isIsoWeek, isoWeekMonday, shiftIsoWeek, mondayOf } from '../lib/isoWeek'

// The Lab overview's one week control: `?week=YYYY-Www` in the URL, ISO Monday
// weeks, shareable and in browser history. Absent (or malformed) = this week.
// The Team and Pipeline tabs read it, and so does the Insights dashboard route.

export type TimeRange = '7d' | '4w' | '3m' | 'all'
export const RANGES: readonly TimeRange[] = ['7d', '4w', '3m', 'all'] as const
export const RANGE_WEEKS: Record<TimeRange, number> = { '7d': 1, '4w': 4, '3m': 13, 'all': 52 }
const DEFAULT_RANGE: TimeRange = '4w'

export function useWeekParam() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('week')
  const thisWeek = currentIsoWeek()
  const week = isIsoWeek(raw) ? raw : thisWeek
  const isCurrent = week === thisWeek
  const monday = useMemo(() => isoWeekMonday(week) ?? mondayOf(new Date()), [week])

  const setWeek = useCallback((next: string) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      // Going to (or past) the current week clears the param: this week is the default.
      if (next >= thisWeek) p.delete('week')
      else p.set('week', next)
      return p
    })
  }, [setParams, thisWeek])

  return {
    week,
    monday,
    isCurrent,
    /**
     * The `?week=` to send the API: always explicit. The label is the viewer's
     * local ISO week; the server's own "current week" is UTC, so leaving it off
     * could show one week's label over another week's data near Sunday night.
     */
    apiWeek: week as string | undefined,
    prev: () => setWeek(shiftIsoWeek(week, -1)),
    next: () => setWeek(shiftIsoWeek(week, 1)),
    reset: () => setWeek(thisWeek),
  }
}

export function useRangeParam() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('range')
  const range: TimeRange = (RANGES as readonly string[]).includes(raw ?? '') ? (raw as TimeRange) : DEFAULT_RANGE
  const setRange = useCallback((next: TimeRange) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (next === DEFAULT_RANGE) p.delete('range')
      else p.set('range', next)
      return p
    })
  }, [setParams])
  return { range, setRange }
}
