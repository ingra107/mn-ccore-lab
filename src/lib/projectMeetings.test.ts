import { describe, it, expect } from 'vitest'
import { isProjectMeeting, meetingTagList, meetingsForProject } from './projectMeetings'

const project = { id: 'proj_abc', slug: 'lpv-adherence-paper' }
const m = (id: string, date: string, tags: string | null) => ({ id, date, title: id, tags })

describe('meetingTagList', () => {
  it('reads a JSON array of strings', () => {
    expect(meetingTagList('["a","b"]')).toEqual(['a', 'b'])
  })
  it('ignores non-string elements, as the server rule does (json_each type text)', () => {
    expect(meetingTagList('["a",1,null,{"x":1}]')).toEqual(['a'])
  })
  it('is empty for null, CSV, a JSON object and malformed JSON', () => {
    expect(meetingTagList(null)).toEqual([])
    expect(meetingTagList('a, b')).toEqual([])
    expect(meetingTagList('{"a":1}')).toEqual([])
    expect(meetingTagList('["a"')).toEqual([])
  })
})

describe('isProjectMeeting', () => {
  it('matches the project slug or id exactly', () => {
    expect(isProjectMeeting(m('1', '2026-10-10', '["lpv-adherence-paper"]'), project)).toBe(true)
    expect(isProjectMeeting(m('2', '2026-10-10', '["proj_abc"]'), project)).toBe(true)
  })
  it('does not match a prefix, a different case or another project', () => {
    expect(isProjectMeeting(m('3', '2026-10-10', '["lpv-adherence"]'), project)).toBe(false)
    expect(isProjectMeeting(m('4', '2026-10-10', '["LPV-Adherence-Paper"]'), project)).toBe(false)
    expect(isProjectMeeting(m('5', '2026-10-10', '["other"]'), project)).toBe(false)
  })
})

describe('meetingsForProject', () => {
  it('splits upcoming (soonest first) from past (latest first) and drops untagged meetings', () => {
    const rows = [
      m('past-old', '2026-09-01', '["lpv-adherence-paper"]'),
      m('soon', '2026-10-10', '["lpv-adherence-paper","x"]'),
      m('today', '2026-10-09', '["proj_abc"]'),
      m('past-new', '2026-10-01', '["lpv-adherence-paper"]'),
      m('later', '2026-11-01', '["lpv-adherence-paper"]'),
      m('lab', '2026-10-12', '["other"]'),
      m('none', '2026-10-12', null),
    ]
    const { upcoming, past } = meetingsForProject(rows, project, '2026-10-09')
    expect(upcoming.map((r) => r.id)).toEqual(['today', 'soon', 'later'])
    expect(past.map((r) => r.id)).toEqual(['past-new', 'past-old'])
  })
})
