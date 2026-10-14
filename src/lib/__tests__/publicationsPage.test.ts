import { describe, it, expect } from 'vitest'
import { planPublicationsPage, type PublicationsPageFilters } from '../publicationsPage'
import type { Publication } from '../../data/types'

let n = 0
function pub(over: Partial<Publication>): Publication {
  n += 1
  return {
    id: `p${n}`,
    title: `Paper ${n}`,
    authors: 'Smith J',
    journal: 'Some Journal',
    year: 2020,
    status: 'Published',
    topics: [],
    ...over,
  } as Publication
}

const none: PublicationsPageFilters = { years: [], statuses: [], topics: [], area: null, search: '' }

function fixture(): Publication[] {
  const list: Publication[] = []
  for (let y = 2010; y <= 2026; y++) list.push(pub({ year: y }))
  list.push(pub({ year: 2025, featured: true }))
  list.push(pub({ year: 2024, featured: true, journal: 'JAMA Network Open' }))
  list.push(pub({ year: 2026, journal: 'Critical Care Medicine' }))
  list.push(pub({ year: 2026, journal: 'Intensive Care Medicine' }))
  list.push(pub({ year: 2026, status: 'In Review' }))
  list.push(pub({ year: 2026, status: 'In Preparation' }))
  return list
}

describe('planPublicationsPage', () => {
  it('shows each paper once across Featured, high-impact and Recent', () => {
    const plan = planPublicationsPage(fixture(), none)
    const ids = [...plan.featured, ...plan.key, ...plan.recent].map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(plan.featured.length).toBe(2)
    expect(plan.key.length).toBe(2)
    expect(plan.recent.length).toBe(10)
  })

  it('hides papers that are not published by default', () => {
    const plan = planPublicationsPage(fixture(), none)
    const shown = [...plan.pool, ...plan.filtered, ...plan.featured, ...plan.key, ...plan.recent]
    expect(shown.every((p) => p.status === 'Published')).toBe(true)
  })

  it('keeps in-review and preparation papers reachable through the status filter', () => {
    const plan = planPublicationsPage(fixture(), { ...none, statuses: ['In Review', 'In Preparation'] })
    expect(plan.filtered.map((p) => p.status).sort()).toEqual(['In Preparation', 'In Review'])
  })

  it('keeps every year bar after a year is picked', () => {
    const all = planPublicationsPage(fixture(), none)
    const picked = planPublicationsPage(fixture(), { ...none, years: [2026] })
    expect(picked.barYears).toEqual(all.barYears)
    expect(picked.filtered.every((p) => p.year === 2026)).toBe(true)
  })
})
