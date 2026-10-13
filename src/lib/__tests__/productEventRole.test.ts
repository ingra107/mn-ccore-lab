import { describe, it, expect } from 'vitest'
import {
  byEventDateDesc,
  eventDateInputError,
  matchesRoleFilter,
  nickRoleLabel,
  productDateFacts,
  type ProductRoles,
} from '../products'

const ROLES: ProductRoles = {
  author_positions: [
    { position: 'first', label: 'First author', sort_order: 10 },
    { position: 'co_first', label: 'Co-first author', sort_order: 20 },
    { position: 'middle', label: 'Middle author', sort_order: 30 },
    { position: 'senior', label: 'Senior author', sort_order: 40 },
  ],
  event_roles: [
    { role: 'presenter', label: 'Presenter', sort_order: 10 },
    { role: 'moderator', label: 'Moderator', sort_order: 20 },
  ],
}
const ev = (iso: string) => `E:${iso}`
const due = (iso: string) => `D:${iso}`

describe('productDateFacts (schema-v135)', () => {
  const base = { due_date: null, deadline: null, event_date: null }
  it('a delivered talk shows its event date and never "Due"', () => {
    expect(productDateFacts({ ...base, kind: 'talk', stage_is_terminal: 1, event_date: '2024-02-11', due_date: '2024-02-11' }, ev, due))
      .toEqual(['E:2024-02-11'])
  })
  it('a delivered talk the backfill has not reached shows its due day as the date, not "Due"', () => {
    expect(productDateFacts({ ...base, kind: 'talk', stage_is_terminal: 1, due_date: '2024-02-11' }, ev, due))
      .toEqual(['E:2024-02-11'])
  })
  it('a talk still ahead keeps its prep due date beside the event date', () => {
    expect(productDateFacts({ ...base, kind: 'talk', stage_is_terminal: 0, event_date: '2026-11', due_date: '2026-10-30' }, ev, due))
      .toEqual(['E:2026-11', 'Due D:2026-10-30'])
  })
  it('a presented abstract shows its month', () => {
    expect(productDateFacts({ ...base, kind: 'abstract', stage_is_terminal: 1, event_date: '2019-05' }, ev, due)).toEqual(['E:2019-05'])
  })
  it('a manuscript keeps Due and Deadline as before', () => {
    expect(productDateFacts({ ...base, kind: 'manuscript', stage_is_terminal: 0, due_date: '2026-11-01', deadline: '2026-12-01' }, ev, due))
      .toEqual(['D:2026-11-01', 'D:2026-12-01'].map((s, i) => (i === 0 ? `Due ${s}` : `Deadline ${s}`)))
  })
})

describe('nickRoleLabel', () => {
  it.each([
    [{ nick_author_position: 'first', nick_event_role: 'presenter' }, 'First author, presenter'],
    [{ nick_author_position: null, nick_event_role: 'presenter' }, 'Presenter'],
    [{ nick_author_position: 'senior', nick_event_role: null }, 'Senior author'],
    [{ nick_author_position: null, nick_event_role: null }, null],
    [{ nick_author_position: 'investigator', nick_event_role: null }, 'investigator'],
  ])('%j -> %j', (p, want) => expect(nickRoleLabel(p, ROLES)).toBe(want))
})

describe('matchesRoleFilter', () => {
  const p = (pos: string | null, role: string | null) => ({ nick_author_position: pos, nick_event_role: role })
  it('presenter is the event role; first includes co-first; senior and middle are positions', () => {
    expect(matchesRoleFilter(p('first', 'presenter'), 'presenter')).toBe(true)
    expect(matchesRoleFilter(p('first', 'presenter'), 'first')).toBe(true)
    expect(matchesRoleFilter(p('co_first', null), 'first')).toBe(true)
    expect(matchesRoleFilter(p('middle', null), 'first')).toBe(false)
    expect(matchesRoleFilter(p('senior', null), 'senior')).toBe(true)
    expect(matchesRoleFilter(p('middle', null), 'middle')).toBe(true)
    expect(matchesRoleFilter(p(null, 'moderator'), 'presenter')).toBe(false)
    expect(matchesRoleFilter(p(null, null), '')).toBe(true)
  })
})

describe('byEventDateDesc', () => {
  const r = (id: string, kind: string, event_date: string | null) => ({ id, product: { kind, event_date } })
  it('newest first inside a kind, undated last in their order, kinds kept in their order', () => {
    const rows = [
      r('a', 'abstract', '2019-05'), r('b', 'abstract', null), r('c', 'abstract', '2024-05-19'),
      r('d', 'abstract', '2024'), r('e', 'abstract', null), r('t1', 'talk', '2020-04-04'), r('t2', 'talk', '2025-09'),
    ]
    expect(byEventDateDesc(rows).map((x) => x.id)).toEqual(['c', 'd', 'a', 'b', 'e', 't2', 't1'])
  })
})

describe('eventDateInputError', () => {
  it.each([['', null], ['2019', null], ['2019-05', null], ['2024-02-29', null]])('%j is fine', (v, want) => {
    expect(eventDateInputError(v)).toBe(want)
  })
  it.each(['2019-13', '2019-00', '2023-02-29', 'May 2019', '19', '2019-5'])('%j is refused', (v) => {
    expect(eventDateInputError(v)).not.toBeNull()
  })
})
