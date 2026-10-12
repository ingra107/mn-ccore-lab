import { describe, it, expect } from 'vitest'
import {
  addYearsIso, barOf, dayToIso, defaultTermYears, formatUsd, ganttSpan, grantName, isoToDay, mechanismOf, movedTerms,
} from '../grants'

describe('mechanism and default term (the reconciled plan: R01 5y, R21 2y, K 5y, R03 2y, else 3y)', () => {
  it.each([
    ['NHLBI R01', 'R01', 5], ['NIH R21', 'R21', 2], ['NHLBI K23', 'K23', 5], ['NIH K08', 'K08', 5],
    ['NHLBI R03', 'R03', 2], ['NIH DP2', 'DP2', 3], ['ARPA-H', null, 3], [null, null, 3],
  ] as const)('%s', (venue, mech, years) => {
    expect(mechanismOf(venue)).toBe(mech)
    expect(defaultTermYears(venue)).toBe(years)
  })
})

describe('dates', () => {
  it('round-trips a day number', () => {
    expect(dayToIso(isoToDay('2022-12-15'))).toBe('2022-12-15')
    expect(isoToDay('2024-03-01') - isoToDay('2024-02-28')).toBe(2) // leap year
  })
  it('adds years, keeping Feb 29 inside February', () => {
    expect(addYearsIso('2027-07-01', 5)).toBe('2032-07-01')
    expect(addYearsIso('2024-02-29', 1)).toBe('2025-02-28')
  })
})

describe('barOf: an award is real, an application is hypothetical', () => {
  it('an award runs start to end, solid', () => {
    expect(barOf({ id: 'a', kind: 'award', period_start: '2022-12-15', period_end: '2027-11-30', venue: 'NHLBI K23' }))
      .toEqual({ id: 'a', start: '2022-12-15', end: '2027-11-30', hypothetical: false })
  })
  it('an application runs its proposed start plus the mechanism term, hypothetical', () => {
    expect(barOf({ id: 'b', kind: 'grant_application', period_start: '2027-07-01', period_end: null, venue: 'NHLBI R01' }))
      .toEqual({ id: 'b', start: '2027-07-01', end: '2032-07-01', hypothetical: true })
  })
  it('no start, no bar', () => {
    expect(barOf({ id: 'c', kind: 'award', period_start: null, period_end: '2027-01-01', venue: null })).toBeNull()
  })
})

describe('movedTerms: what a drag writes', () => {
  it('an award moves both ends and keeps its length', () => {
    const t = movedTerms({ kind: 'award', period_start: '2022-12-15', period_end: '2027-11-30' }, 31)!
    expect(t).toEqual({ period_start: '2023-01-15', period_end: '2027-12-31' })
    expect(isoToDay(t.period_end!) - isoToDay(t.period_start!)).toBe(isoToDay('2027-11-30') - isoToDay('2022-12-15'))
  })
  it('an application moves its proposed start only', () => {
    expect(movedTerms({ kind: 'grant_application', period_start: '2027-07-01', period_end: null }, -30))
      .toEqual({ period_start: '2027-06-01' })
  })
  it('no move, no write', () => {
    expect(movedTerms({ kind: 'award', period_start: '2022-12-15', period_end: '2027-11-30' }, 0)).toBeNull()
  })
})

describe('display', () => {
  it('names a grant by project short name, then its own name', () => {
    expect(grantName({ project_short_name: 'R03', project_title: 'R03: Decision-Making', project_slug: 'r03', short_name: null, title: 'A1' })).toBe('R03 · A1')
    expect(grantName({ project_short_name: null, project_title: 'K23: Provider Variation', project_slug: 'k23', short_name: null, title: null })).toBe('K23: Provider Variation')
  })
  it('formats money', () => {
    expect(formatUsd(644588)).toBe('$645K')
    expect(formatUsd(2_000_000)).toBe('$2M')
    expect(formatUsd(null)).toBe('')
  })
  it('the span covers every bar and today, in whole years', () => {
    const s = ganttSpan([{ id: 'a', start: '2022-12-15', end: '2027-11-30', hypothetical: false }], ['2028-03-01'], '2026-10-12')
    expect(dayToIso(s.from)).toBe('2022-01-01')
    expect(dayToIso(s.to)).toBe('2029-01-01')
  })
})
