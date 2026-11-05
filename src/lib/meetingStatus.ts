// A meeting's status, derived when it is READ.
//
// api/routes/meetings.ts inserts every row with status 'upcoming' and nothing
// ever updates it, so the stored value says nothing for a past meeting. A date
// before today, or any debrief (notes or decisions), means it happened.
// 'in-progress' and 'completed' are trusted when stored; 'upcoming' never is.

import { localDateKey } from './dateUtils'

export type MeetingStatus = 'upcoming' | 'in-progress' | 'completed'

export function meetingStatus(m: {
  date: string
  status?: string | null
  notes?: string | null
  decisions?: string | string[] | null
}): MeetingStatus {
  if (m.status === 'completed' || m.status === 'in-progress') return m.status
  if (m.date.slice(0, 10) < localDateKey()) return 'completed'
  if (m.notes && m.notes.trim()) return 'completed'
  const d = m.decisions
  const hasDecisions = Array.isArray(d) ? d.length > 0 : !!d && d.trim() !== '' && d.trim() !== '[]'
  return hasDecisions ? 'completed' : 'upcoming'
}

/**
 * How far off a meeting is, in days. A meeting row has a date and no time, so
 * this never names an hour (it used to assume 3 pm for every meeting). Null once
 * the day has passed.
 */
export function meetingCountdownLabel(date: string, today: string = localDateKey()): string | null {
  const dayNumber = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, day) / 86400000
  }
  const days = dayNumber(date) - dayNumber(today)
  if (days < 0) return null
  if (days === 0) return 'Today'
  return days === 1 ? 'Tomorrow' : `In ${days} days`
}
