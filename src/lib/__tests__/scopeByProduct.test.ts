import { describe, expect, it } from 'vitest'
import { itemMarker, scopeByProduct, type ProductRow } from '../products'

const prod = (id: string, name: string): ProductRow => ({
  id, project_id: 'proj_a', kind: 'manuscript', kind_label: 'Manuscript', stage: 'idea', stage_label: 'Idea',
  stage_ordinal: 10, stage_is_terminal: 0, title: name, short_name: name, waiting_on: null, venue: null,
  due_date: null, deadline: null, folder: null, repo_url: null, stage_entered_at: null, stage_notes: null,
  sort_order: 0, is_home: 0, lineage_rank: 0, grew_from_id: null, seq: 1, created_at: '', updated_at: '',
})

// Newest first, as the tabs send them.
const items = [
  { id: 'a', product_id: null },
  { id: 'b', product_id: 'prd_1' },
  { id: 'c', product_id: 'prd_2' },
  { id: 'd', product_id: 'prd_1' },
  { id: 'e', product_id: null },
]

describe('scopeByProduct', () => {
  it('All keeps every item in the tab order', () => {
    expect(scopeByProduct(items, null).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('under a product: its own items first, then project-wide ones, each group in the tab order; other products drop out', () => {
    expect(scopeByProduct(items, 'prd_1').map((i) => i.id)).toEqual(['b', 'd', 'a', 'e'])
    expect(scopeByProduct(items, 'prd_2').map((i) => i.id)).toEqual(['c', 'a', 'e'])
  })

  it('a product with nothing of its own still shows the project-wide items', () => {
    expect(scopeByProduct(items, 'prd_9').map((i) => i.id)).toEqual(['a', 'e'])
  })
})

describe('scopeByProduct with a tombstoned product', () => {
  const live = [prod('prd_1', 'Trial ops'), prod('prd_2', 'Protocol paper')]
  // prd_dead was tombstoned: its files and its stage-history lines are still tagged to it.
  const withDead = [
    { id: 'stage-dead', product_id: 'prd_dead' },
    { id: 'b', product_id: 'prd_1' },
    { id: 'file-dead', product_id: 'prd_dead' },
    { id: 'a', product_id: null },
  ]
  it("reads a tag on a product that is not live as project-wide: shown under every chip, after the chip's own", () => {
    expect(scopeByProduct(withDead, 'prd_1', live).map((i) => i.id)).toEqual(['b', 'stage-dead', 'file-dead', 'a'])
    expect(scopeByProduct(withDead, 'prd_2', live).map((i) => i.id)).toEqual(['stage-dead', 'file-dead', 'a'])
  })
  it('without the live list the tag is taken as given', () => {
    expect(scopeByProduct(withDead, 'prd_1').map((i) => i.id)).toEqual(['b', 'a'])
  })
  it("a task with no product follows the product's own tasks", () => {
    const tasks = [{ id: 't1', product_id: null }, { id: 't2', product_id: 'prd_1' }, { id: 't3', product_id: 'prd_2' }]
    expect(scopeByProduct(tasks, 'prd_1', live).map((i) => i.id)).toEqual(['t2', 't1'])
  })
})

describe('itemMarker', () => {
  const two = [prod('prd_1', 'Trial ops'), prod('prd_2', 'Protocol paper')]
  it('says "project" for a tag on a product that is not live', () => {
    expect(itemMarker('prd_dead', two)).toBe('project')
  })
  it('says "project" for an untagged item and the product name for a tagged one', () => {
    expect(itemMarker(null, two)).toBe('project')
    expect(itemMarker('prd_2', two)).toBe('Protocol paper')
  })
  it('says nothing when the project has fewer than 2 products', () => {
    expect(itemMarker(null, [two[0]])).toBeNull()
    expect(itemMarker('prd_1', [])).toBeNull()
  })
})
