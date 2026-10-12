import { describe, it, expect } from 'vitest'
import { agencyOf, grantsForPi, isPiOf, type PublicGrant } from './publicGrants'

describe('publicGrants', () => {
  it('splits a venue into agency and mechanism', () => {
    expect(agencyOf('NHLBI K23')).toBe('NHLBI')
    expect(agencyOf('NIH R01')).toBe('NIH')
    expect(agencyOf(null)).toBe('')
  })

  it('matches a PI by slug or by name', () => {
    expect(isPiOf('nick-ingraham', 'nick-ingraham')).toBe(true)
    expect(isPiOf('Nick Ingraham', 'nick-ingraham')).toBe(true)
    expect(isPiOf('nate-mesfin', 'nick-ingraham')).toBe(false)
    expect(isPiOf(null, 'nick-ingraham')).toBe(false)
  })

  it('an anonymous row (id, venue, bucket only) belongs to nobody, so no list is invented', () => {
    const anon: PublicGrant[] = [{ id: 'a', venue: 'NHLBI K23', bucket: 'active' }]
    expect(grantsForPi(anon, 'nick-ingraham')).toEqual([])
  })

  it('a member sees their own active then proposed grants, never an ended one or a peer\'s', () => {
    const rows: PublicGrant[] = [
      { id: '1', venue: 'NHLBI R01', bucket: 'proposed', pi: 'nick-ingraham', title: 'Provider Variation' },
      { id: '2', venue: 'NHLBI K23', bucket: 'active', pi: 'nick-ingraham' },
      { id: '3', venue: 'NIH R03', bucket: 'ended', pi: 'nick-ingraham' },
      { id: '4', venue: 'NHLBI K23', bucket: 'proposed', pi: 'nate-mesfin' },
    ]
    expect(grantsForPi(rows, 'nick-ingraham')).toEqual([
      { mechanism: 'K23', title: 'NHLBI K23', agency: 'NHLBI', bucket: 'active' },
      { mechanism: 'R01', title: 'Provider Variation', agency: 'NHLBI', bucket: 'proposed' },
    ])
  })
})
