/**
 * researchAreas -- the curated "What we study" areas and the real count of
 * published papers in each. Papers carry only five raw topic tags (about 70 of
 * ~620 rows), so areas are matched on the title: a paper is in an area when its
 * title names one of the area's terms and none of its exclusions. A paper can sit
 * in more than one area. Counts come from the live publication list; nothing
 * here is a typed-in number.
 *
 * The terms are tight on purpose (word boundaries; cancer, smoking and screening
 * titles are excluded) and were checked against the live list, 15 titles per
 * area, in s68. A bare `lung`, `respiratory` or `ards` is NOT a term: they match
 * lung-cancer papers and the "ards" in "Towards" and "Reviews". An area whose
 * work has no honest title term yet (clinical decision-making: the lab's papers
 * there are new) has no `terms`, so it shows no number and links by raw topic tag.
 */
import type { Publication } from '../data/types'
import { isPublished } from './publicationCounts'

export interface ResearchArea {
  id: string
  label: string
  blurb: string
  /** Matched against the title. Omit when no honest title term exists: no count is shown. */
  terms?: RegExp
  /** Words that take a title out of the area even when `terms` matches. */
  not?: RegExp
  /** Raw topic tag to link by when the area has no `terms`. */
  topic?: string
}

const CANCER_ETC = /cancer|oncolog|smok|tobacco|screening|nodule/i

export const RESEARCH_AREAS: ResearchArea[] = [
  {
    id: 'variation',
    label: 'Provider variation and quality',
    blurb: 'How the quality of care is measured, and how it varies across clinicians, hospitals and payment systems.',
    terms: /(provider|practice|hospital|clinician|physician|center|site|regional|state)[- ]?(level )?variation|variation in (care|practice|use|rates|incidence|outcomes|\w+ (use|rates|care))|\bquality (of care|measure|metric|indicator|report|rating)|hospital quality|hospital compar|pay[- ]for[- ]performance|public(ly)? report|performance measure|risk[- ]adjust|\badherence/i,
    not: /cancer|oncolog|smok|tobacco|screening|cost variation|heart rate|\bHIV\b/i,
  },
  {
    id: 'respiratory',
    label: 'Ventilation and respiratory failure',
    blurb: 'Lung-protective ventilation, ARDS, oxygenation and the care of patients on a ventilator.',
    terms: /\bventilat|\bARDS\b|(acute )?respiratory (failure|distress)|oxygenat|\bECMO\b|tidal volume|intubat|extubat|prone position|\bhypoxemi|lung[- ]protective|\bPEEP\b|spontaneous breathing trial|respiratory therapist|tracheostom|lung injury/i,
    not: CANCER_ETC,
  },
  {
    id: 'sepsis',
    label: 'Sepsis and serious infection',
    blurb: 'Defining, recognizing and treating sepsis, shock and serious infection in the ICU.',
    terms: /\bsepsis|\bseptic|\bshock\b|vasopressor|bacteremi|bloodstream|serious infection|nosocomial|necrotizing|intra-abdominal infection|surgical infection/i,
    not: CANCER_ETC,
  },
  {
    id: 'covid',
    label: 'COVID-19',
    blurb: 'Treatment trials, hospital outcomes and long-term effects of COVID-19.',
    terms: /covid|sars-cov|coronavirus/i,
  },
  {
    id: 'data',
    label: 'Data science and CLIF',
    blurb: 'Open data standards and tools that let ICU data from many hospitals be analyzed together.',
    terms: /\bclif\b|natural language processing|machine learning|deep learning|large language model|\bLLMs?\b|common data model|data standard|EHR[- ]based|electronic health record (data|consortium|system|research)|federat/i,
    not: /filopodia|pay-for-performance|incentive/i,
  },
  {
    id: 'decisions',
    label: 'Clinical decision-making',
    blurb: 'How cognitive style and heuristics drive what clinicians do at the bedside.',
    topic: 'decision-making',
  },
]

export function inArea(pub: Pick<Publication, 'title'>, area: ResearchArea): boolean {
  if (!area.terms) return false
  return area.terms.test(pub.title) && !(area.not && area.not.test(pub.title))
}

export function areaById(id: string | null | undefined): ResearchArea | undefined {
  return RESEARCH_AREAS.find((a) => a.id === id)
}

/** Where an area's card links: the title-matched list, or its raw topic tag. */
export function areaHref(area: ResearchArea): string {
  return area.terms ? `/publications?area=${area.id}` : `/publications?topic=${encodeURIComponent(area.topic ?? '')}`
}

export interface AreaCount {
  area: ResearchArea
  /** null when the area has no honest title term: show no number. */
  papers: number | null
}

/** Published papers per area, in RESEARCH_AREAS order. */
export function areaCounts(pubs: ReadonlyArray<Pick<Publication, 'title' | 'status'>>): AreaCount[] {
  const published = pubs.filter(isPublished)
  return RESEARCH_AREAS.map((area) => ({
    area,
    papers: area.terms ? published.filter((p) => inArea(p, area)).length : null,
  }))
}
