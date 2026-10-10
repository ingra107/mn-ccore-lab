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
