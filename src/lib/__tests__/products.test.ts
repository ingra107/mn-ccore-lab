import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  addProduct,
  groupByKind,
  ladderFor,
  productLabel,
  productsOfKinds,
  productViewMode,
  setProductHome,
  setProductStage,
  sortProducts,
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
  sort_order: 0, is_home: 0, lineage_rank: 0, grew_from_id: null, seq: 1, created_at: '', updated_at: '', ...extra,
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

describe('product writes go to the project\'s own route', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  const product = { id: 'prd_abc', stage: 'writing', stage_label: 'Writing', seq: 7, is_home: 1 }
  function mockOk() {
    const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ product }) } as Response)
    global.fetch = fn
    return fn
  }
  const sent = (fn: ReturnType<typeof vi.fn>) => JSON.parse(fn.mock.calls[0][1].body)

  it('sets a stage as a compare-and-swap on what the screen showed', async () => {
    const fn = mockOk()
    const out = await setProductStage('r03', 'prd_abc', 'writing', { seq: 6, stage: 'idea' })
    expect(fn.mock.calls[0][0]).toBe('/api/projects/r03/products')
    expect(sent(fn)).toEqual({ action: 'stage', product_id: 'prd_abc', stage: 'writing', base_seq: 6, from_stage: 'idea' })
    expect(out.seq).toBe(7)
  })

  it('makes a home with the home action', async () => {
    const fn = mockOk()
    await setProductHome('r03', 'prd_new')
    expect(sent(fn)).toEqual({ action: 'home', product_id: 'prd_new' })
  })

  it('adds a product by name and parent id; the Worker derives the ranks', async () => {
    const fn = mockOk()
    await addProduct('r03', { kind: 'grant_application', stage: 'preparing', name: ' A1 ', growsFromId: 'prd_a0' })
    expect(sent(fn)).toEqual({ action: 'add', kind: 'grant_application', stage: 'preparing', name: 'A1', grew_from_id: 'prd_a0' })
  })

  it('throws the Worker\'s own refusal text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 409, statusText: 'Conflict',
      json: async () => ({ error: 'product_home_live: mark another product home first' }),
    } as Response)
    await expect(setProductStage('r03', 'prd_abc', 'idea')).rejects.toThrow('product_home_live')
  })
})

describe('productsOfKinds (the Manuscripts page\'s kind tabs)', () => {
  const projects = [
    { id: 'proj_B', slug: 'b', title: 'Beta study', short_name: 'Beta', category: 'CLIF', status: 'active' },
    { id: 'proj_A', slug: 'a', title: 'Alpha R03', short_name: 'R03', category: 'MNCCORE', status: 'active' },
  ] as never[]
  const byProject = {
    proj_A: [
      row('a-home', { project_id: 'proj_A', kind: 'manuscript', is_home: 1 }),
      row('a-a1', { project_id: 'proj_A', kind: 'grant_application', short_name: 'A1', lineage_rank: 1 }),
      row('a-a0', { project_id: 'proj_A', kind: 'grant_application', short_name: 'A0', lineage_rank: 0 }),
    ],
    proj_B: [row('b-g', { project_id: 'proj_B', kind: 'grant_application', short_name: 'K23' })],
    proj_hidden: [row('h-g', { project_id: 'proj_hidden', kind: 'grant_application' })],
  }

  it('lists products, not projects: R03\'s A0 and A1 are both rows, in lineage order', () => {
    const rows = productsOfKinds(byProject, projects, ['grant_application'])
    expect(rows.map((r) => r.product.id)).toEqual(['b-g', 'a-a0', 'a-a1'])
    expect(rows.map((r) => r.project.slug)).toEqual(['b', 'a', 'a'])
  })

  it('All: every asked kind, in the kinds\' order, then project name', () => {
    const rows = productsOfKinds(byProject, projects, ['manuscript', 'grant_application'])
    expect(rows.map((r) => r.product.id)).toEqual(['a-home', 'b-g', 'a-a0', 'a-a1'])
  })

  it('leaves out products of projects this screen does not hold', () => {
    const rows = productsOfKinds(byProject, projects, ['grant_application'])
    expect(rows.some((r) => r.product.id === 'h-g')).toBe(false)
  })
})
