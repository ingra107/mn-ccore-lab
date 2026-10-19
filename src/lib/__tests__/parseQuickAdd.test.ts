import { describe, it, expect } from 'vitest'
import {
  parseQuickAddInput, productSuggestions, productToken, resolveProduct, type QuickAddContext,
} from '../parseQuickAdd'
import type { ProductRow } from '../products'

function prod(over: Partial<ProductRow> & { id: string; project_id: string; kind: string; kind_label: string }): ProductRow {
  return {
    stage: 'idea', stage_label: 'Idea', stage_ordinal: 1, stage_is_terminal: 0, title: null, short_name: null,
    waiting_on: null, venue: null, due_date: null, deadline: null, folder: null, repo_url: null,
    stage_entered_at: null, stage_notes: null, sort_order: 0, is_home: 0, lineage_rank: 0, grew_from_id: null,
    seq: 1, created_at: '', updated_at: '', ...over,
  }
}

const HOME = prod({ id: 'prd_home', project_id: 'proj_adhere', kind: 'trial_ops', kind_label: 'Trial operations', short_name: 'Trial ops', is_home: 1 })
const RESULTS = prod({ id: 'prd_results', project_id: 'proj_adhere', kind: 'manuscript', kind_label: 'Manuscript', short_name: 'Results paper' })
const POSTER = prod({ id: 'prd_poster', project_id: 'proj_adhere', kind: 'abstract', kind_label: 'Abstract', title: 'Poster' })
const OTHER = prod({ id: 'prd_other', project_id: 'proj_other', kind: 'manuscript', kind_label: 'Manuscript', short_name: 'Results paper' })

const ctx: QuickAddContext = {
  projects: [
    { id: 'proj_adhere', slug: 'adhere-lpv-trial', title: 'ADHERE-LPV Trial', short_name: 'ADHERE-LPV' },
    { id: 'proj_other', slug: 'other-study', title: 'Other Study', short_name: null },
    // Live next to the ADHERE project: the static list's "adherence" paper, done.
    { id: 'proj_lpv', slug: 'lpv-adherence-paper', title: 'LPV Adherence Paper', short_name: null },
    { id: 'proj_clif1', slug: 'clif-alpha', title: 'CLIF: Alpha', short_name: null },
    { id: 'proj_clif2', slug: 'clif-beta', title: 'CLIF: Beta', short_name: null },
  ],
  productsByProject: { proj_adhere: [HOME, RESULTS, POSTER], proj_other: [OTHER] },
}

describe('parseQuickAddInput, bare #project (as before)', () => {
  it('resolves against the static list when there is no live context', () => {
    const p = parseQuickAddInput('Fix the figure #adhere')
    expect(p.projectSlug).toBe('lpv-adherence-paper')
    expect(p.productId).toBeNull()
    expect(p.title).toBe('Fix the figure')
  })

  it('leaves product_id alone with a live context too', () => {
    const p = parseQuickAddInput('Draft intro #adhere', ctx)
    expect(p.projectSlug).toBe('adhere-lpv-trial')
    expect(p.productId).toBeNull()
    expect(p.productName).toBeNull()
  })
})

describe('parseQuickAddInput, #project~product', () => {
  it('sets project and product from "Draft intro #adhere~results"', () => {
    const p = parseQuickAddInput('Draft intro #adhere~results', ctx)
    expect(p.title).toBe('Draft intro')
    expect(p.projectSlug).toBe('adhere-lpv-trial')
    expect(p.productId).toBe('prd_results')
    expect(p.productName).toBe('Manuscript: Results paper')
    const tok = p.tokens.find((t) => t.type === 'project')!
    expect(tok.text).toBe('#adhere~results')
  })

  it('matches the kind label, a title, and a hyphenated short name', () => {
    expect(parseQuickAddInput('x #adhere~manuscript', ctx).productId).toBe('prd_results')
    expect(parseQuickAddInput('x #adhere~poster', ctx).productId).toBe('prd_poster')
    expect(parseQuickAddInput('x #adhere~trial-ops', ctx).productId).toBe('prd_home')
    expect(parseQuickAddInput('x #adhere~RESULTS-PAPER', ctx).productId).toBe('prd_results')
  })

  it('takes the first match by the Worker order on a tie (home first)', () => {
    expect(parseQuickAddInput('x #adhere~tr', ctx).productId).toBe('prd_home')
  })

  it('keeps the project and no product when the product does not match', () => {
    const p = parseQuickAddInput('x #adhere~nonesuch', ctx)
    expect(p.projectSlug).toBe('adhere-lpv-trial')
    expect(p.productId).toBeNull()
    expect(p.title).toBe('x ~nonesuch')
  })

  it('never takes a product of another project', () => {
    const p = parseQuickAddInput('x #other~results', ctx)
    expect(p.projectSlug).toBe('other-study')
    expect(p.productId).toBe('prd_other')
    expect(parseQuickAddInput('x #adhere~results', ctx).productId).not.toBe('prd_other')
  })

  it('reads a trailing "~" as the project alone', () => {
    const p = parseQuickAddInput('x #adhere~', ctx)
    expect(p.projectSlug).toBe('adhere-lpv-trial')
    expect(p.productId).toBeNull()
  })

  it('leaves "~product" in the title when there is no live context', () => {
    const p = parseQuickAddInput('x #adhere~results')
    expect(p.projectSlug).toBe('lpv-adherence-paper')
    expect(p.productId).toBeNull()
    expect(p.title).toBe('x ~results')
  })

  it('treats "~x" as a product only when it resolves ("#lpv~5 min")', () => {
    const p = parseQuickAddInput('Break #lpv~5 min', ctx)
    expect(p.projectSlug).toBe('lpv-adherence-paper')
    expect(p.productId).toBeNull()
    expect(p.title).toBe('Break ~5 min')
    expect(p.tokens.find((t) => t.type === 'project')!.text).toBe('#lpv')
  })

  it('does not treat a "~" outside a project token as syntax', () => {
    const p = parseQuickAddInput('Budget ~5 days #adhere~results', ctx)
    expect(p.title).toBe('Budget ~5 days')
    expect(p.productId).toBe('prd_results')
  })

  it('combines with the other tokens', () => {
    const p = parseQuickAddInput('Draft intro #adhere~results p1 tomorrow', ctx)
    expect(p.productId).toBe('prd_results')
    expect(p.priority).toBe(1)
    expect(p.dueDate).not.toBeNull()
    expect(p.title).toBe('Draft intro')
  })

  it('a live prefix beats a static fuzzy hit: #adhere files on ADHERE, not the done paper', () => {
    // Static "adherence" (lpv-adherence-paper) is live too, but "adhere" is a
    // prefix of only the ADHERE-LPV project's keys.
    expect(parseQuickAddInput('x #adhere', ctx).projectSlug).toBe('adhere-lpv-trial')
    expect(parseQuickAddInput('x #adhere~results', ctx).projectSlug).toBe('adhere-lpv-trial')
  })

  it('an exact live name wins, hyphens and case aside', () => {
    expect(parseQuickAddInput('x #ADHERE-LPV', ctx).projectSlug).toBe('adhere-lpv-trial')
    expect(parseQuickAddInput('x #lpv-adherence-paper', ctx).projectSlug).toBe('lpv-adherence-paper')
  })

  it('an ambiguous prefix names nothing and the token stays in the title', () => {
    const p = parseQuickAddInput('x #clif', ctx)
    expect(p.projectSlug).toBeNull()
    expect(p.title).toBe('x #clif')
    expect(parseQuickAddInput('x #clif-a', ctx).projectSlug).toBe('clif-alpha')
  })

  it('an unknown token stays plain text', () => {
    const p = parseQuickAddInput('x #zzzzz~results', ctx)
    expect(p.projectSlug).toBeNull()
    expect(p.title).toBe('x #zzzzz~results')
  })

  it('without the live lists (still loading, or the fetch failed) the static lookup answers', () => {
    expect(parseQuickAddInput('x #clif', undefined).projectSlug).not.toBeNull()
    expect(parseQuickAddInput('x #adhere', undefined).projectSlug).toBe('lpv-adherence-paper')
  })
})

describe('resolveProduct / productSuggestions / productToken', () => {
  it('resolves exact before prefix before inside', () => {
    expect(resolveProduct('results', [HOME, RESULTS, POSTER])?.id).toBe('prd_results')
    expect(resolveProduct('aper', [HOME, RESULTS, POSTER])?.id).toBe('prd_results')
    expect(resolveProduct('', [HOME, RESULTS])).toBeNull()
  })

  it('lists every product of the project after "#adhere~", and narrows as you type', () => {
    expect(productSuggestions('adhere', '', ctx).map((p) => p.id)).toEqual(['prd_home', 'prd_results', 'prd_poster'])
    expect(productSuggestions('adhere', 'po', ctx).map((p) => p.id)).toEqual(['prd_poster'])
    expect(productSuggestions('adhere', 'zzz', ctx)).toEqual([])
    expect(productSuggestions('zzzzz', '', ctx)).toEqual([])
  })

  it('writes a label as one token', () => {
    expect(productToken(RESULTS)).toBe('results-paper')
    expect(productToken(POSTER)).toBe('poster')
    expect(productToken(prod({ id: 'p', project_id: 'x', kind: 'grant', kind_label: 'Grant application' }))).toBe('grant-application')
  })
})
