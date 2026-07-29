import { describe, it, expect } from 'vitest'
import { mechanismFamily, MECHANISM_ACCENT, MECHANISM_FILL } from '../grantMechanism'

describe('mechanismFamily', () => {
  it('maps grants.mechanism literals (prod value space) to families', () => {
    // Prod D1 value space measured 2026-07-29: R01, R03, K23.
    expect(mechanismFamily('R01')).toBe('R01')
    expect(mechanismFamily('R03')).toBe('R03')
    expect(mechanismFamily('K23')).toBe('K')
  })

  it('maps projects.type enum values (PB enums.py SSOT) to families', () => {
    // projects.type grant values: R01 / R03 / K. `K` is the generic bucket.
    expect(mechanismFamily('R01')).toBe('R01')
    expect(mechanismFamily('R03')).toBe('R03')
    expect(mechanismFamily('K')).toBe('K')
  })

  it('folds the whole K series into the K family', () => {
    for (const k of ['K23', 'K99', 'K08', 'K01', 'K12', 'K24']) {
      expect(mechanismFamily(k)).toBe('K')
    }
  })

  it('sends non-grant project types to other (badge gate renders none of these)', () => {
    for (const t of ['CLIF', 'Nick_Lab', 'Friends', 'Mentees', 'Admin', 'Personal']) {
      expect(mechanismFamily(t)).toBe('other')
    }
  })

  it('sends null/empty/placeholder to other', () => {
    expect(mechanismFamily(null)).toBe('other')
    expect(mechanismFamily(undefined)).toBe('other')
    expect(mechanismFamily('')).toBe('other')
    // GrantTimelineCard renders '—' when mechanism is missing.
    expect(mechanismFamily('—')).toBe('other')
  })

  it('is case- and whitespace-insensitive (defensive: mechanism is free text)', () => {
    expect(mechanismFamily(' r01 ')).toBe('R01')
    expect(mechanismFamily('k23')).toBe('K')
  })

  it('does not swallow future non-K mechanisms into a colored family', () => {
    for (const m of ['R21', 'U01', 'T32', 'F32']) {
      expect(mechanismFamily(m)).toBe('other')
    }
  })
})

describe('color maps', () => {
  it('accent lane: family semantics R01=teal, R03=maroon, K=gold, other=slate', () => {
    expect(MECHANISM_ACCENT.R01).toBe('var(--teal)')
    expect(MECHANISM_ACCENT.R03).toBe('var(--maroon)')
    expect(MECHANISM_ACCENT.K).toBe('var(--gold)')
    expect(MECHANISM_ACCENT.other).toBe('var(--slate)')
  })

  it('fill lane: theme-stable literal hex only, never CSS vars (Rule 41 class)', () => {
    for (const v of Object.values(MECHANISM_FILL)) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('fill lane preserves the original 2026-03-24 dashboard palette byte-for-byte', () => {
    expect(MECHANISM_FILL.R01).toBe('#2d8a8a')
    expect(MECHANISM_FILL.R03).toBe('#7a0019')
    expect(MECHANISM_FILL.K).toBe('#c9a84c')
    expect(MECHANISM_FILL.other).toBe('#64748b')
  })
})
