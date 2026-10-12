import { describe, it, expect } from 'vitest'
import type { Publication } from '../data/types'
import { areaCounts, areaById, inArea, RESEARCH_AREAS } from './researchAreas'
import { isPlaceholderPublication } from './publicationCounts'

const p = (title: string, status: Publication['status'] = 'Published') => ({ title, status })

describe('researchAreas', () => {
  it('counts published papers per area from the title; one paper can sit in two areas', () => {
    const counts = areaCounts([
      p('Lung-protective ventilation in sepsis-induced ARDS'),
      p('COVID-19 outpatient treatment trial'),
      p('Pilot of a ventilator bundle', 'In Review'),
    ])
    const by = Object.fromEntries(counts.map((c) => [c.area.id, c.papers]))
    expect(by.respiratory).toBe(1)
    expect(by.sepsis).toBe(1)
    expect(by.covid).toBe(1)
    expect(by.data).toBe(0)
  })

  it('looks an area up by id and rejects an unknown one', () => {
    expect(areaById('covid')?.label).toBe('COVID-19')
    expect(areaById('nope')).toBeUndefined()
    expect(inArea({ title: 'Provider variation in care' }, RESEARCH_AREAS[0])).toBe(true)
  })
})

describe('isPlaceholderPublication', () => {
  it('flags test fixtures and imported report tables, not real papers', () => {
    expect(isPlaceholderPublication({ title: 'test_delete_ CLIF infrastructure paper' })).toBe(true)
    expect(isPlaceholderPublication({ title: '[Table], Table 5. Information sources' })).toBe(true)
    expect(isPlaceholderPublication({ title: '[Figure], Figure 6. Hypothetical world' })).toBe(true)
    expect(isPlaceholderPublication({ title: 'A Common Longitudinal ICU Data Format (CLIF)' })).toBe(false)
    expect(isPlaceholderPublication({ title: 'Testing a new ventilator' })).toBe(false)
  })
})
