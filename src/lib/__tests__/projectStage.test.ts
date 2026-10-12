// Contract phase step 1: a project's stage is its products'. Compact displays
// read the home product plus "+N"; rollups count products by kind and stage;
// "finished" is status done or every live product terminal.
import { describe, it, expect } from 'vitest'
import { compactStageLabel, homeStageText, ladderRampStep, productStageCounts, stageCountLabel } from '../projectStage'
import { isProjectFinished } from '../taskConstants'
import type { ProductKind, ProductRow } from '../products'

const prd = (id: string, project_id: string, kind: string, stage: string, extra: Partial<ProductRow> = {}): ProductRow => ({
  id, project_id, kind, kind_label: kind === 'manuscript' ? 'Manuscript' : 'Grant application', kind_sort: kind === 'manuscript' ? 10 : 20,
  stage, stage_label: stage[0].toUpperCase() + stage.slice(1), stage_ordinal: stage === 'idea' ? 10 : 40, stage_is_terminal: 0,
  title: null, short_name: null, waiting_on: null, venue: null, due_date: null, deadline: null, folder: null, repo_url: null,
  stage_entered_at: null, stage_notes: null, sort_order: 0, is_home: 1, lineage_rank: 0, grew_from_id: null, seq: 1,
  created_at: '', updated_at: '', ...extra,
})

describe('compact stage', () => {
  it('a manuscript home reads as its rung; another kind names the kind', () => {
    expect(homeStageText({ home_kind: 'manuscript', home_stage: 'writing', home_stage_label: 'Writing' })).toBe('Writing')
    expect(homeStageText({ home_kind: 'grant_application', home_kind_label: 'Grant application', home_stage: 'submitted', home_stage_label: 'Submitted' }))
      .toBe('Grant application · Submitted')
  })

  it('adds +N for the products past the home, and is empty with no home', () => {
    expect(compactStageLabel({ home_kind: 'manuscript', home_stage: 'writing', home_stage_label: 'Writing', product_count: 3 })).toBe('Writing +2')
    expect(compactStageLabel({ home_kind: null, home_stage: null, product_count: 0 })).toBe('')
  })
})

describe('finished', () => {
  it('is status done, or every live product terminal; a project with no products is not finished by them', () => {
    expect(isProjectFinished({ status: 'done' })).toBe(true)
    expect(isProjectFinished({ status: 'active', product_count: 2, product_open_count: 0 })).toBe(true)
    expect(isProjectFinished({ status: 'active', product_count: 2, product_open_count: 1 })).toBe(false)
    expect(isProjectFinished({ status: 'active', product_count: 0, product_open_count: 0 })).toBe(false)
  })
})

describe('rollups count products, by kind and stage', () => {
  it('counts each product once, kind-qualified, in kind then ladder order, filtered by project', () => {
    const rows = productStageCounts({
      a: [prd('p1', 'a', 'grant_application', 'submitted'), prd('p2', 'a', 'manuscript', 'writing', { is_home: 0 })],
      b: [prd('p3', 'b', 'manuscript', 'writing')],
      c: [prd('p4', 'c', 'manuscript', 'idea')],
    }, (id) => id !== 'c')
    expect(rows.map((r) => [r.kind, r.stage, r.count])).toEqual([
      ['manuscript', 'writing', 2],
      ['grant_application', 'submitted', 1],
    ])
    expect(stageCountLabel(rows[1])).toBe('Grant application · Submitted')
  })

  it('ramps a rung by its place on its own ladder', () => {
    const kinds = [{ kind: 'honor', stages: [{ stage: 'preparing' }, { stage: 'submitted' }, { stage: 'received' }] }] as unknown as ProductKind[]
    expect(ladderRampStep(kinds, 'honor', 'preparing')).toBe(0)
    expect(ladderRampStep(kinds, 'honor', 'submitted')).toBe(0.5)
    expect(ladderRampStep(kinds, 'honor', 'nope')).toBe(0)
  })
})
