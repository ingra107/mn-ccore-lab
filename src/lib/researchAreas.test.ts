import { describe, it, expect } from 'vitest'
import type { Publication } from '../data/types'
import { areaCounts, areaById, areaHref, inArea, RESEARCH_AREAS } from './researchAreas'
import { isPlaceholderPublication, dedupePublications } from './publicationCounts'

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
    expect(isPlaceholderPublication({ title: 'Supplementary Materials 1 from Determinants of Lung Cancer Screening' })).toBe(true)
    expect(isPlaceholderPublication({ title: 'Data from Determinants of Lung Cancer Screening in a Minnesota community' })).toBe(true)
    expect(isPlaceholderPublication({ title: 'Supplementation of vitamin D in the ICU' })).toBe(false)
  })
})

describe('dedupePublications', () => {
  const row = (title: string, year: number, doi?: string, featured = false) => ({ title, year, doi, featured })
  it('collapses a shared DOI, then a shared normalized title, keeping the newest year', () => {
    const out = dedupePublications([
      row('Variability in First Academic Medicine Job Offers', 2025, 'https://doi.org/10.1101/x'),
      row('Variability in first academic medicine job offers.', 2026, 'https://doi.org/10.1093/y'),
      row('A paper', 2020, 'https://doi.org/10.1/z'),
      row('Same DOI, other title', 2021, 'HTTPS://DOI.ORG/10.1/Z'),
    ])
    expect(out.map((p) => [p.title, p.year])).toEqual([
      ['Variability in first academic medicine job offers.', 2026],
      ['Same DOI, other title', 2021],
    ])
  })
  it('keeps a featured row over a newer plain one, and leaves rows with no key alone', () => {
    const out = dedupePublications([row('Twin', 2022, undefined, true), row('Twin', 2024), row('', 2020), row('', 2021)])
    expect(out).toHaveLength(3)
    expect(out[0].featured).toBe(true)
  })
})

describe('researchAreas: tight terms (s68 cold review)', () => {
  const area = (id: string) => areaById(id)!
  it('does not count lung-cancer or smoking papers as ventilation', () => {
    expect(inArea({ title: 'Lung cancer screening in a Minnesota urban Indigenous community' }, area('respiratory'))).toBe(false)
    expect(inArea({ title: 'Respiratory therapist-driven spontaneous breathing trial' }, area('respiratory'))).toBe(true)
  })
  it('does not match "ards" inside another word', () => {
    expect(inArea({ title: 'Towards better care: Reviews of ventilation' }, area('respiratory'))).toBe(true) // ventilation, not "ards"
    expect(inArea({ title: 'Towards a new standard for Reviews' }, area('respiratory'))).toBe(false)
    expect(inArea({ title: 'Lung function in ARDS survivors' }, area('respiratory'))).toBe(true)
  })
  it('keeps heart-rate variability and cost variation out of provider variation', () => {
    expect(inArea({ title: 'Heart rate variability and quality of care' }, area('variation'))).toBe(false)
    expect(inArea({ title: 'Hospital variation in ICU risk-adjusted mortality' }, area('variation'))).toBe(true)
  })
  it('has no number for decision-making: it links by raw topic tag instead', () => {
    const counts = areaCounts([{ title: 'Patient decision aids for prostate cancer', status: 'Published' }])
    expect(counts.find((c) => c.area.id === 'decisions')?.papers).toBeNull()
    expect(areaHref(area('decisions'))).toBe('/publications?topic=decision-making')
    expect(areaHref(area('covid'))).toBe('/publications?area=covid')
  })
})
