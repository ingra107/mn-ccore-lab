import { describe, it, expect } from 'vitest'
import { isProjectMeeting, meetingTagList, meetingsForProject, grantedProjectList, meetingProjectPills } from './projectMeetings'
import { projectShortLabel } from './displayNames'

const project = { id: 'proj_abc', slug: 'lpv-adherence-paper' }
const granted = (...ids: string[]) => JSON.stringify(ids.map((id) => ({ id, slug: null, short_name: null, title: null })))
const m = (id: string, date: string, grantedIds: string[] | null, tags: string | null = null) =>
  ({ id, date, title: id, tags, granted_projects: grantedIds === null ? null : granted(...grantedIds) })

describe('meetingTagList', () => {
  it('reads a JSON array of strings', () => {
    expect(meetingTagList('["a","b"]')).toEqual(['a', 'b'])
  })
  it('ignores non-string elements', () => {
    expect(meetingTagList('["a",1,null,{"x":1}]')).toEqual(['a'])
  })
  it('is empty for null, CSV, a JSON object and malformed JSON', () => {
    expect(meetingTagList(null)).toEqual([])
    expect(meetingTagList('a, b')).toEqual([])
    expect(meetingTagList('{"a":1}')).toEqual([])
    expect(meetingTagList('["a"')).toEqual([])
  })
})

describe('isProjectMeeting: GRANTED, never discussed (schema-v122)', () => {
  it('is true only when the meeting is granted to the project id', () => {
    expect(isProjectMeeting(m('1', '2026-10-10', ['proj_abc']), project)).toBe(true)
    expect(isProjectMeeting(m('2', '2026-10-10', ['proj_other']), project)).toBe(false)
  })
  it('a tag naming the project (discussed only) does not make it the project\'s meeting', () => {
    expect(isProjectMeeting(m('3', '2026-10-10', [], '["lpv-adherence-paper","proj_abc"]'), project)).toBe(false)
    expect(isProjectMeeting(m('4', '2026-10-10', null, '["lpv-adherence-paper"]'), project)).toBe(false)
  })
})

describe('meetingsForProject', () => {
  it('splits upcoming (soonest first) from past (latest first) and drops ungranted meetings', () => {
    const rows = [
      m('past-old', '2026-09-01', ['proj_abc']),
      m('soon', '2026-10-10', ['proj_abc', 'proj_x']),
      m('today', '2026-10-09', ['proj_abc']),
      m('past-new', '2026-10-01', ['proj_abc']),
      m('later', '2026-11-01', ['proj_abc']),
      m('discussed', '2026-10-12', [], '["lpv-adherence-paper"]'),
      m('none', '2026-10-12', null),
    ]
    const { upcoming, past } = meetingsForProject(rows, project, '2026-10-09')
    expect(upcoming.map((r) => r.id)).toEqual(['today', 'soon', 'later'])
    expect(past.map((r) => r.id)).toEqual(['past-new', 'past-old'])
  })
})

describe('grantedProjectList', () => {
  it('reads the API column and drops anything without a string id', () => {
    expect(grantedProjectList('[{"id":"proj_a","slug":"a","short_name":"A","title":"Alpha"},{"slug":"b"},7]'))
      .toEqual([{ id: 'proj_a', slug: 'a', short_name: 'A', title: 'Alpha' }])
    expect(grantedProjectList(null)).toEqual([])
    expect(grantedProjectList('not json')).toEqual([])
  })
})

describe('meetingProjectPills', () => {
  const projects = [
    { id: 'proj_dnr', slug: 'dnr-study', title: 'Do-not-resuscitate orders in the ICU', short_name: 'DNR' },
    { id: 'proj_lpv', slug: 'adhere-lpv', title: 'ADHERE-LPV trial', short_name: 'LPV' },
    { id: 'proj_k23', slug: 'k23', title: 'K23 award', short_name: null },
  ]

  it('discussed projects are faded until granted; granted ones are full contrast; labels are short names', () => {
    const pills = meetingProjectPills(['dnr-study', 'adhere-lpv'], grantedProjectList(granted('proj_dnr')), projects)
    expect(pills.map((p) => [p.label, p.granted, p.discussed])).toEqual([['DNR', true, true], ['LPV', false, true]])
  })

  it('a project granted but not discussed (added by hand) still shows, granted', () => {
    const pills = meetingProjectPills(['dnr-study'], grantedProjectList(JSON.stringify([{ id: 'proj_k23', slug: 'k23', short_name: null, title: 'K23 award' }])), projects)
    expect(pills.map((p) => [p.label, p.granted, p.discussed])).toEqual([['DNR', false, true], ['K23 award', true, false]])
  })

  it('a topic word or a project the viewer is not on is a faded pill with no project id', () => {
    const pills = meetingProjectPills(['sedation'], [], projects)
    expect(pills).toEqual([{ key: 'tag:sedation', projectId: null, slug: 'sedation', label: 'sedation', granted: false, discussed: true }])
  })

  it('a tag spelled as the id and as the slug is one pill', () => {
    expect(meetingProjectPills(['dnr-study', 'proj_dnr'], [], projects)).toHaveLength(1)
  })

  it('never renders a "#"', () => {
    expect(projectShortLabel({ short_name: null, title: null, slug: 'x' })).toBe('x')
    for (const p of meetingProjectPills(['dnr-study', 'zzz'], [], projects)) expect(p.label).not.toContain('#')
  })
})
