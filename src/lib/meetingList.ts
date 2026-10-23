// The Meetings page's default list (Nick 2026-10-23: "the default should just be
// meetings that are filled in with information"). Future meetings exist on
// purpose (agenda prep creates them, and /meetings/:id/prep reads them), but
// sorted newest-date-first they sat above every meeting that happened and the
// page opened on an empty one. The default view is now three parts:
//   upcoming: dated after today, soonest first (a small strip with Prep links)
//   past:     today or earlier WITH content, newest first (the page opens here)
//   empty:    today or earlier with no notes, decisions or actions (behind a toggle)
// A filter tab or a search shows every match in one list, so nothing is
// unreachable.

import type { Meeting } from '../data/types'

/** A meeting someone wrote something into: notes, a decision or an action item. */
export function meetingHasContent(m: Pick<Meeting, 'notes' | 'decisions' | 'actionItems'>): boolean {
  return !!m.notes?.trim() || (m.decisions?.length ?? 0) > 0 || (m.actionItems?.length ?? 0) > 0
}

export interface MeetingListSplit<M> {
  upcoming: M[]
  past: M[]
  empty: M[]
}

export function splitMeetingList<M extends Pick<Meeting, 'date' | 'notes' | 'decisions' | 'actionItems'>>(
  meetings: readonly M[],
  todayKey: string,
): MeetingListSplit<M> {
  const day = (m: M) => m.date.slice(0, 10)
  const upcoming = meetings.filter((m) => day(m) > todayKey).sort((a, b) => a.date.localeCompare(b.date))
  const rest = meetings.filter((m) => day(m) <= todayKey).sort((a, b) => b.date.localeCompare(a.date))
  return {
    upcoming,
    past: rest.filter(meetingHasContent),
    empty: rest.filter((m) => !meetingHasContent(m)),
  }
}
