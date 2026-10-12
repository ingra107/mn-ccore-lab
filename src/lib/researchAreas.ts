/**
 * researchAreas -- the curated "What we study" areas and the real count of
 * published papers in each. Papers carry only five raw topic tags (about 70 of
 * ~620 rows), so the areas are matched on the title instead: a paper is in an
 * area when its title names one of the area's terms. A paper can sit in more
 * than one area. Counts are computed from the live publication list; nothing
 * here is a typed-in number.
 */
import type { Publication } from '../data/types'
import { isPublished } from './publicationCounts'

export interface ResearchArea {
  id: string
  label: string
  blurb: string
  /** Matched against the lowercase title. */
  terms: RegExp
}

export const RESEARCH_AREAS: ResearchArea[] = [
  {
    id: 'variation',
    label: 'Provider variation and quality',
    blurb: 'How individual clinician practice shapes ICU outcomes, and how to measure it fairly across hospitals.',
    terms: /quality|variation|adherence|provider|physician|performance|patient safety|public report|disparit/,
  },
  {
    id: 'respiratory',
    label: 'Ventilation and respiratory failure',
    blurb: 'Lung-protective ventilation, ARDS, oxygenation and the care of patients on a ventilator.',
    terms: /ventilat|ards\b|respiratory|lung|oxygen|ecmo|tidal|intubat|pneumon|prone|pulmonary/,
  },
  {
    id: 'sepsis',
    label: 'Sepsis and infection',
    blurb: 'Defining, recognizing and treating sepsis, shock and serious infection in the ICU.',
    terms: /sepsis|septic|infect|antibiotic|bacter|vasopressor|shock/,
  },
  {
    id: 'covid',
    label: 'COVID-19',
    blurb: 'Randomized trials and cohort studies of outpatient and hospital treatment of COVID-19.',
    terms: /covid|sars-cov|coronavirus/,
  },
  {
    id: 'data',
    label: 'Data science and CLIF',
    blurb: 'Open data standards and tools that let ICU data from many hospitals be analyzed together.',
    terms: /clif|machine learning|electronic health|data standard|consortium|prediction|algorithm|natural language|deep learning/,
  },
  {
    id: 'decisions',
    label: 'Clinical decision-making',
    blurb: 'How cognitive style and heuristics drive what clinicians do at the bedside.',
    terms: /decision|heuristic|cognitive|bias|judg/,
  },
]

export function inArea(pub: Pick<Publication, 'title'>, area: ResearchArea): boolean {
  return area.terms.test(pub.title.toLowerCase())
}

export function areaById(id: string | null | undefined): ResearchArea | undefined {
  return RESEARCH_AREAS.find((a) => a.id === id)
}

export interface AreaCount {
  area: ResearchArea
  papers: number
}

/** Published papers per area, in RESEARCH_AREAS order. */
export function areaCounts(pubs: ReadonlyArray<Pick<Publication, 'title' | 'status'>>): AreaCount[] {
  const published = pubs.filter(isPublished)
  return RESEARCH_AREAS.map((area) => ({ area, papers: published.filter((p) => inArea(p, area)).length }))
}
