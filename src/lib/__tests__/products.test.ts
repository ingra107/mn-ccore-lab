import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  addProduct,
  groupByKind,
  ladderFor,
  productLabel,
  productViewMode,
  setProductHome,
  setProductStage,
  sortProducts,
  ulid,
  type ProductKind,
  type ProductRow,
} from '../products'

const kinds: ProductKind[] = [
  { kind: 'manuscript', label: 'Manuscript', plural_label: 'Manuscripts', has_page: 1, can_fund: 0, sort_order: 10,
    stages: [{ stage: 'idea', label: 'Idea', ordinal: 10, is_terminal: 0 }, { stage: 'writing', label: 'Writing', ordinal: 40, is_terminal: 0 }] },
  { kind: 'grant_application', label: 'Grant application', plural_label: 'Grant applications', has_page: 1, can_fund: 0, sort_order: 30,
    stages: [{ stage: 'preparing', label: 'Preparing', ordinal: 10, is_terminal: 0 }] },
]

const row = (id: string, extra: Partial<ProductRow>): ProductRow => ({
  id, project_id: 'proj_X', kind: 'manuscript', kind_label: 'Manuscript', stage: 'idea', stage_label: 'Idea',
  stage_ordinal: 10, stage_is_terminal: 0, title: null, short_name: null, waiting_on: null, venue: null,
  due_date: null, deadline: null, folder: null, repo_url: null, stage_entered_at: null, stage_notes: null,
  sort_order: 0, is_home: 0, lineage_rank: 0, grew_from_id: null, created_at: '', updated_at: '', ...extra,
})

describe('product display helpers', () => {
  it('names a product by short name, then title, then its kind, never an id', () => {
    expect(productLabel(row('prd_1', { short_name: 'A1', title: 'R03 resubmission' }))).toBe('A1')
    expect(productLabel(row('prd_2', { title: 'R03 resubmission' }))).toBe('R03 resubmission')
    expect(productLabel(row('prd_3', {}))).toBe('Manuscript')
  })

  it('chips for 2+ products, a ladder for one', () => {
    expect(productViewMode(1)).toBe('ladder')
    expect(productViewMode(2)).toBe('chips')
  })

  it('sorts home first, then sort_order', () => {
    const out = sortProducts([row('prd_b', { sort_order: 1 }), row('prd_a', { sort_order: 2, is_home: 1 }), row('prd_c', { sort_order: 0 })])
    expect(out.map((p) => p.id)).toEqual(['prd_a', 'prd_c', 'prd_b'])
  })

  it('groups by kind in the kind table order and skips empty kinds', () => {
    const groups = groupByKind(
      [row('prd_g', { kind: 'grant_application', kind_label: 'Grant application' }), row('prd_m1', {}), row('prd_m2', {})],
      kinds,
    )
    expect(groups.map((g) => [g.label, g.products.length])).toEqual([['Manuscripts', 2], ['Grant application', 1]])
  })

  it('keeps a product whose kind left the kind list', () => {
    const groups = groupByKind([row('prd_h', { kind: 'honor', kind_label: 'Honor' })], kinds)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Honor')
  })

  it('reads a ladder from the kind data', () => {
    expect(ladderFor(kinds, 'manuscript').map((s) => s.stage)).toEqual(['idea', 'writing'])
    expect(ladderFor(kinds, 'nope')).toEqual([])
  })
})

describe('ulid', () => {
  it('is 26 Crockford characters and sorts by time', () => {
    const a = ulid(1_700_000_000_000)
    const b = ulid(1_700_000_001_000)
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true)
  })
})

describe('product writes go through /api/mutations', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  function mockResults(results: object[]) {
    const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results }) } as Response)
    global.fetch = fn
    return fn
  }
  const sent = (fn: ReturnType<typeof vi.fn>) => JSON.parse(fn.mock.calls[0][1].body).mutations[0]

  it('sets a stage with an update patch on products', async () => {
    const fn = mockResults([{ status: 'accepted' }])
    await setProductStage('prd_abc', 'writing')
    expect(fn.mock.calls[0][0]).toBe('/api/mutations')
    const m = sent(fn)
    expect(m).toMatchObject({ table: 'products', op: 'update', record_id: 'prd_abc', patch: { stage: 'writing' }, base_seq: null })
    expect(m.mutation_id).toMatch(/^mut_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(m.origin_machine).toMatch(/^hub_ui:/)
  })

  it('makes a home by setting is_home=1 on the new home only', async () => {
    const fn = mockResults([{ status: 'accepted' }])
    await setProductHome('prd_new')
    expect(sent(fn).patch).toEqual({ is_home: 1 })
  })

  it('adds a product with a same-project lineage rank above its parent', async () => {
    const fn = mockResults([{ status: 'accepted' }])
    await addProduct({ projectId: 'proj_X', kind: 'grant_application', stage: 'preparing', name: ' A1 ', growsFrom: { id: 'prd_a0', lineage_rank: 2 } })
    const m = sent(fn)
    expect(m.op).toBe('insert')
    expect(m.record_id).toMatch(/^prd_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(m.payload).toMatchObject({
      project_id: 'proj_X', kind: 'grant_application', stage: 'preparing', title: 'A1', short_name: 'A1',
      is_home: 0, grew_from_id: 'prd_a0', grew_from_rank: 2, lineage_rank: 3,
    })
  })

  it('adds a product with no parent as a root', async () => {
    const fn = mockResults([{ status: 'accepted' }])
    await addProduct({ projectId: 'proj_X', kind: 'manuscript', stage: 'idea', name: 'Aim 2' })
    expect(sent(fn).payload).not.toHaveProperty('grew_from_id')
    expect(sent(fn).payload).not.toHaveProperty('lineage_rank')
  })

  it('throws the Worker\'s own refusal when a write is not accepted', async () => {
    mockResults([{ status: 'error', reason: 'product_home_live: mark another product home first', code: 'x' }])
    await expect(setProductStage('prd_abc', 'idea')).rejects.toThrow('product_home_live')
  })

  it('throws when the Worker answers nothing for the mutation', async () => {
    mockResults([])
    await expect(setProductHome('prd_abc')).rejects.toThrow()
  })
})
