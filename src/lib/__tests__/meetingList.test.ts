import { describe, it, expect } from 'vitest'
import { splitMeetingList, meetingHasContent } from '../meetingList'

const m = (id: string, date: string, extra: Record<string, unknown> = {}) => ({ id, date, notes: '', decisions: [], actionItems: [], ...extra })

describe('splitMeetingList', () => {
  const today = '2026-10-23'
  const list = [
    m('future-far', '2026-11-05'),
    m('future-near', '2026-10-29', { notes: 'agenda draft' }),
    m('today-empty', '2026-10-23'),
    m('past-notes', '2026-10-22', { notes: 'Summary' }),
    m('past-decision', '2026-10-12', { decisions: ['Send the survey'] }),
    m('past-empty', '2026-10-08'),
    m('past-action', '2026-09-30', { actionItems: [{ id: 'a' }] }),
  ]

  it("puts future meetings, and today's not yet written up, in upcoming, soonest first", () => {
    expect(splitMeetingList(list, today).upcoming.map((x) => x.id)).toEqual(['today-empty', 'future-near', 'future-far'])
  })

  it("today's meeting with notes is past, not upcoming", () => {
    const s = splitMeetingList([m('today-done', '2026-10-23', { notes: 'Done' })], today)
    expect(s.past.map((x) => x.id)).toEqual(['today-done'])
    expect(s.upcoming).toEqual([])
  })

  it('keeps past meetings with content, newest first; the page opens on the first', () => {
    expect(splitMeetingList(list, today).past.map((x) => x.id)).toEqual(['past-notes', 'past-decision', 'past-action'])
  })

  it('sets aside earlier meetings with nothing in them', () => {
    expect(splitMeetingList(list, today).empty.map((x) => x.id)).toEqual(['past-empty'])
  })

  it('whitespace-only notes are not content', () => {
    expect(meetingHasContent({ notes: '  \n', decisions: [], actionItems: [] })).toBe(false)
  })
})
