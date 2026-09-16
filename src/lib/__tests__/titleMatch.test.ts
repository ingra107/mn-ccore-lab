// titleMatch — the "Is this the paper?" scorer (#129).
import { describe, it, expect } from 'vitest'
import { bestPublicationMatch, titleSimilarity, titleTokens } from '../titleMatch'

const PUBS = [
  { id: 'amagai-2025-icu-readmission-epidemiology', title: 'The Epidemiology of ICU Readmissions Across Ten Health Systems' },
  { id: 'gen-10-1101-2025-03-10-25323672', title: 'The Epidemiology of Intensive Care Unit Readmissions Across Ten Health Systems' },
  { id: 'gen-10-1542-peds-2012-3527', title: 'Measuring Hospital Quality Using Pediatric Readmission and Revisit Rates' },
  { id: 'lupus', title: 'Thirty-Day Hospital Readmissions in Systemic Lupus Erythematosus: Predictors and Hospital- and State-Level Variation' },
]

describe('titleTokens / titleSimilarity', () => {
  it('drops stopwords and punctuation, keeps content words', () => {
    expect([...titleTokens('The Epidemiology of ICU Readmissions (CLIF)')]).toEqual(['epidemiology', 'icu', 'readmissions', 'clif'])
  })
  it('is 1 for the same title and 0 for an empty one', () => {
    expect(titleSimilarity('ICU Readmissions', 'ICU readmissions!')).toBe(1)
    expect(titleSimilarity('', 'ICU readmissions')).toBe(0)
  })
})

describe('bestPublicationMatch', () => {
  it('finds the readmissions paper from the project title and prefers the exact-journal row on a tie', () => {
    const m = bestPublicationMatch('Epidemiology of ICU readmissions across ten health systems', PUBS)
    expect(m?.pub.id).toBe('amagai-2025-icu-readmission-epidemiology')
    expect(m!.score).toBeGreaterThanOrEqual(0.6)
  })
  it('returns null when nothing clears the threshold', () => {
    expect(bestPublicationMatch('ADHERE-LPV cluster randomized trial protocol', PUBS)).toBeNull()
  })
  it('does not match on shared generic words alone', () => {
    expect(bestPublicationMatch('Hospital readmissions', PUBS)).toBeNull()
  })
})
