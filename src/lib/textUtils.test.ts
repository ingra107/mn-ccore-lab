import { describe, it, expect } from 'vitest'
import { stripConsortiumPrefix } from './textUtils'

describe('stripConsortiumPrefix', () => {
  it('strips a redundant consortium tag', () => {
    expect(stripConsortiumPrefix('CLIF: Sepsis cohort').clean).toBe('Sepsis cohort')
    expect(stripConsortiumPrefix('MN-CCORE Lab website').clean).toBe('Lab website')
  })
  it('keeps the name whole when the remainder is the acronym expansion', () => {
    const t = 'MNCCORE (Minnesota Critical Care Outcomes & Research Effort)'
    expect(stripConsortiumPrefix(t).clean).toBe(t)
  })
})
