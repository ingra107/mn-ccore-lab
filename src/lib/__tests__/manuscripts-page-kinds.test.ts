import { describe, it, expect } from 'vitest'
import { kindsForManuscriptsTab, manuscriptsPageTabs, type ProductKind, type ProductRow } from '../products'
import { pipelineOffNote, pipelinePlaceOf } from '../pipelinePlace'

const kind = (k: string, plural: string, sort: number, has_page = 1): ProductKind =>
  ({ kind: k, label: k, plural_label: plural, has_page, can_fund: 0, sort_order: sort, stages: [] })
const KINDS: ProductKind[] = [
  kind('manuscript', 'Manuscripts', 10), kind('abstract', 'Abstracts', 20), kind('grant_application', 'Grant applications', 30),
  kind('award', 'Awards', 40), kind('honor', 'Honors', 45), kind('trial_ops', 'Trial ops', 50, 0), kind('infrastructure', 'Infrastructure', 60, 0),
]
const row = (id: string, k: string, extra: Partial<ProductRow> = {}): ProductRow => ({
  id, project_id: 'proj_X', kind: k, kind_label: k, stage: 'idea', stage_label: 'Idea', stage_ordinal: 10,
  stage_is_terminal: 0, title: null, short_name: null, waiting_on: null, venue: null, due_date: null, deadline: null,
  folder: null, repo_url: null, stage_entered_at: null, stage_notes: null, sort_order: 0, is_home: 0, lineage_rank: 0,
  grew_from_id: null, seq: 1, created_at: '', updated_at: '', ...extra,
})
const EVERY_KIND = { proj_X: KINDS.map((k, i) => row(`p${i}`, k.kind)) }

describe('the Manuscripts page shows manuscripts and abstracts only (Nick 2026-10-12)', () => {
  it('tabs: Manuscripts, Abstracts, All, even when every kind has products', () => {
    expect(manuscriptsPageTabs(KINDS, EVERY_KIND).map((t) => t.label)).toEqual(['Manuscripts', 'Abstracts', 'All'])
  })

  it('All lists manuscript and abstract only: never a grant kind, trial ops or infrastructure', () => {
    expect(kindsForManuscriptsTab('all', KINDS)).toEqual(['manuscript', 'abstract'])
  })

  it('a grant, trial-ops or infrastructure ?kind= lists nothing here', () => {
    for (const k of ['grant_application', 'award', 'honor', 'trial_ops', 'infrastructure', 'nonsense']) {
      expect(kindsForManuscriptsTab(k, KINDS)).toEqual([])
    }
  })

  it('no abstracts: Manuscripts only, no All', () => {
    expect(manuscriptsPageTabs(KINDS, { proj_X: [row('m', 'manuscript'), row('t', 'trial_ops')] }).map((t) => t.value)).toEqual(['manuscript'])
  })
})

describe('pipeline board places', () => {
  const COLS = ['idea', 'writing', 'review']
  it('a home manuscript files under its stage; another kind is on another ladder', () => {
    expect(pipelinePlaceOf([row('m', 'manuscript', { is_home: 1, stage: 'writing' })], COLS)).toEqual({ stage: 'writing' })
    expect(pipelinePlaceOf([row('g', 'grant_application', { is_home: 1 })], COLS)).toEqual({ off: 'other_ladder' })
  })

  it('no product is "no stage": projects.stage is never read (contract phase step 1)', () => {
    expect(pipelinePlaceOf([], COLS)).toEqual({ off: 'no_stage' })
    expect(pipelinePlaceOf(undefined, COLS)).toEqual({ off: 'no_stage' })
  })

  it('a manuscript rung the board has no column for is counted, not dropped', () => {
    expect(pipelinePlaceOf([row('m', 'manuscript', { is_home: 1, stage: 'accepted' })], COLS)).toEqual({ off: 'off_board' })
  })

  it('the note names each reason it has', () => {
    expect(pipelineOffNote({ other_ladder: 2, no_stage: 1, off_board: 0 }))
      .toBe('2 projects are on another ladder (a grant, an award, several products); 1 project has no product yet. The list view shows them.')
    expect(pipelineOffNote({ other_ladder: 0, no_stage: 0, off_board: 0 })).toBeNull()
  })
})
