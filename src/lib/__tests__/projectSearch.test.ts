// #159/#162: the project matcher and the palette ranking. The palette case is the
// reported one: tasks that merely hold the letters of "dashboard" used to fill
// its 12 rows, so the project never showed.

import { describe, it, expect } from 'vitest'
import { findProjects, projectMatchRank, rankPaletteItems, searchWords } from '../projectSearch'
import { parseSearchPrefix } from '../../../shared/searchPrefix'

const grant = {
  title: 'CLIF ICU Quality Reporting Grant (Gao-Howard)', short_name: 'ICU Quality Grant',
  slug: 'clif-icu-quality', description: 'Lead Cathy Gao-Howard. Standardized cross-ICU reporting.',
}
const abstract = { title: 'ATS 2027 QI dashboard', short_name: null, kind_label: 'Abstract', venue: 'ATS' }

describe('projectMatchRank', () => {
  it('finds a project through its products and its description', () => {
    expect(projectMatchRank('dashboard', grant, [abstract])).toBe(1)
    expect(projectMatchRank('dashboard', grant)).toBe(-1)
    expect(projectMatchRank("Cathy's dashboard", grant, [abstract])).toBe(1)
  })
  it('a hit in the name ranks 0', () => {
    expect(projectMatchRank('quality grant', grant)).toBe(0)
  })
  it('every word must be there', () => {
    expect(projectMatchRank('cathy sepsis', grant, [abstract])).toBe(-1)
  })
  it('strips a possessive only', () => {
    expect(searchWords("Cathy's  ICU")).toEqual(['cathy', 'icu'])
  })
})

describe('findProjects', () => {
  it('name hits lead, misses drop, order otherwise holds', () => {
    const items = ['about-a', 'named', 'miss', 'about-b']
    const ranks: Record<string, number> = { 'about-a': 1, named: 0, miss: -1, 'about-b': 1 }
    expect(findProjects('x', items, (i) => ranks[i])).toEqual(['named', 'about-a', 'about-b'])
  })
})

describe('rankPaletteItems', () => {
  const task = (label: string) => ({ label, category: 'task' })
  it('a project found by its product beats tasks that only hold the letters', () => {
    const fuzzy = Array.from({ length: 30 }, (_, i) => task(`Do a short board review ${i}`))
    const project = { label: grant.title, category: 'project', keywords: 'ats 2027 qi dashboard' }
    const out = rankPaletteItems([...fuzzy, project], 'dashboard')
    expect(out).toEqual([project]) // the letter-matches do not pad the list
  })
  it('fuzzy still catches a typo when nothing really matched', () => {
    const p = { label: 'Vent Dashboard', category: 'project' }
    expect(rankPaletteItems([p], 'dashbrd')).toEqual([p])
  })
  it('a project named for the word leads a task named for it', () => {
    const t = task('Review the dashboard')
    const p = { label: 'Vent Dashboard', category: 'project' }
    expect(rankPaletteItems([t, p], 'dashboard')).toEqual([p, t])
  })
})

describe('parseSearchPrefix', () => {
  it('reads p: with or without a space, and leaves other colons alone', () => {
    expect(parseSearchPrefix('p: dashboard')).toEqual({ types: ['project', 'product'], term: 'dashboard' })
    expect(parseSearchPrefix('t:review')).toEqual({ types: ['task'], term: 'review' })
    expect(parseSearchPrefix('CLIF: quality')).toEqual({ types: null, term: 'CLIF: quality' })
    expect(parseSearchPrefix('plain words')).toEqual({ types: null, term: 'plain words' })
  })
})
