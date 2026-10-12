import { describe, expect, it } from 'vitest'
import {
  buildPairOptions, decodePair, encodePair, pairFields, pairLabelFor, pairValueFor, withCurrent,
  type PairProject,
} from '../projectPairs'
import type { ProductRow } from '../products'

const prod = (id: string, name: string, home = 0): ProductRow => ({
  id, project_id: 'proj_a', kind: 'manuscript', kind_label: 'Manuscript', stage: 'idea', stage_label: 'Idea',
  stage_ordinal: 10, stage_is_terminal: 0, title: name, short_name: name, waiting_on: null, venue: null,
  due_date: null, deadline: null, folder: null, repo_url: null, stage_entered_at: null, stage_notes: null,
  sort_order: 0, is_home: home, lineage_rank: 0, grew_from_id: null, seq: 1, created_at: '', updated_at: '',
})

const projects: PairProject[] = [
  { id: 'proj_a', slug: 'adhere', title: 'ADHERE-LPV Trial', short_name: 'ADHERE-LPV' },
  { id: 'proj_b', slug: 'cci', title: 'CCI in ARDS', short_name: null },
]
const byProject = {
  proj_a: [prod('prd_1', 'Trial ops', 1), prod('prd_2', 'Results manuscript'), prod('prd_3', 'Protocol paper')],
  proj_b: [prod('prd_9', 'Manuscript', 1)],
}

describe('project ~ product pairs', () => {
  it('offers one option per product for a project with 2+ products, the name alone for one', () => {
    const o = buildPairOptions(projects, byProject)
    expect(o.map((x) => x.label)).toEqual([
      'ADHERE-LPV ~ Trial ops', 'ADHERE-LPV ~ Results manuscript', 'ADHERE-LPV ~ Protocol paper', 'CCI in ARDS',
    ])
    expect(o[3].value).toBe('cci')
    expect(o[3].productId).toBeNull()
  })

  it('a pick sets both ids for a pair and the project alone otherwise', () => {
    expect(pairFields(encodePair('adhere', 'prd_2'))).toEqual({ project_id: 'adhere', product_id: 'prd_2' })
    expect(pairFields('cci')).toEqual({ project_id: 'cci' })
    expect(decodePair('')).toEqual({ project_id: null, product_id: null })
  })

  it('names a task row with its pair only for a project with 2+ products', () => {
    expect(pairLabelFor('ADHERE-LPV', 'adhere', 'prd_2', projects, byProject)).toBe('ADHERE-LPV ~ Results manuscript')
    expect(pairLabelFor('CCI in ARDS', 'cci', 'prd_9', projects, byProject)).toBe('CCI in ARDS')
    // a stale product id from before a move names no pair
    // a stale product id, or none, is a project-wide task on a project with 2+ products
    expect(pairLabelFor('ADHERE-LPV', 'adhere', 'prd_9', projects, byProject)).toBe('ADHERE-LPV ~ project')
    expect(pairLabelFor('ADHERE-LPV', 'adhere', null, projects, byProject)).toBe('ADHERE-LPV ~ project')
    expect(pairLabelFor('CCI in ARDS', 'cci', null, projects, byProject)).toBe('CCI in ARDS')
  })

  it('finds the picker value a task stands on, with a fallback option when it has no pair', () => {
    expect(pairValueFor('adhere', 'prd_3', projects, byProject)).toBe('adhere::prd_3')
    expect(pairValueFor('adhere', null, projects, byProject)).toBe('adhere')
    expect(pairValueFor('cci', 'prd_9', projects, byProject)).toBe('cci')
    const opts = buildPairOptions(projects, byProject)
    const fb = withCurrent(opts, 'adhere', projects)
    expect(fb[fb.length - 1].label).toBe('ADHERE-LPV')
    expect(withCurrent(opts, 'cci', projects)).toHaveLength(opts.length)
  })
})
