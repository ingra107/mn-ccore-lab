// Group a newest-first list by the viewer's calendar day, for the bell.
import { formatMediumDate, localDateKey } from './dateUtils'
import { dbStampDay } from './time'

export function groupByViewerDay<T extends { created_at?: string | null }>(items: T[], now: Date = new Date()): { label: string; items: T[] }[] {
  const today = localDateKey(now)
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = localDateKey(yesterdayDate)

  const byDay = new Map<string, T[]>()
  for (const item of items) {
    const day = dbStampDay(item.created_at)
    const list = byDay.get(day)
    if (list) list.push(item)
    else byDay.set(day, [item])
  }
  return [...byDay].map(([day, list]) => ({
    label: !day ? 'Earlier' : day === today ? 'Today' : day === yesterday ? 'Yesterday' : formatMediumDate(day),
    items: list,
  }))
}
