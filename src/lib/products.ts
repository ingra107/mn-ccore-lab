// Products inside a project (schema-v124/v125; plan step 8).
//
// A project is the umbrella; a product is one deliverable inside it, with its
// own kind and a stage from that kind's ladder. Reads come from
// GET /api/projects/:slug/products and writes go to POST
// /api/projects/:slug/products; both are open to the project's members (Nick,
// 2026-10-12: "Yes, members of that project") and to no one else.
//
// Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

import { fetchApi } from './api'

export interface ProductStage {
  stage: string
  label: string
  ordinal: number
  is_terminal: number
}

export interface ProductKind {
  kind: string
  label: string
  plural_label: string
  has_page: number
  can_fund: number
  sort_order: number
  stages: ProductStage[]
}

export interface ProductRow {
  id: string
  project_id: string
  kind: string
  kind_label: string
  /** The kind's place in the kind table (list sort); the reads send it. */
  kind_sort?: number
  stage: string
  stage_label: string
  stage_ordinal: number
  stage_is_terminal: number
  title: string | null
  short_name: string | null
  waiting_on: string | null
  venue: string | null
  due_date: string | null
  deadline: string | null
  folder: string | null
  repo_url: string | null
  stage_entered_at: string | null
  stage_notes: string | null
  sort_order: number
  is_home: number
  lineage_rank: number
  grew_from_id: string | null
  /** The row version the Worker uses for compare-and-swap. */
  seq: number
  created_at: string
  updated_at: string
}

export interface ProjectProducts {
  products: ProductRow[]
  kinds: ProductKind[]
}

/** The name shown for a product: short name, else title, else its kind
 *  ("Manuscript"). Never an id. */
export function productLabel(p: Pick<ProductRow, 'short_name' | 'title' | 'kind_label'>): string {
  return p.short_name?.trim() || p.title?.trim() || p.kind_label
}

/** Chips for 2+ products, a ladder for one (Nick, bracket 2026-10-11). */
export function productViewMode(count: number): 'ladder' | 'chips' {
  return count > 1 ? 'chips' : 'ladder'
}

/** Products in tab order: home first, then sort_order, then id. The Worker
 *  already sends this order; sorting here keeps an optimistic edit stable. */
export function sortProducts(products: readonly ProductRow[]): ProductRow[] {
  return [...products].sort(
    (a, b) => b.is_home - a.is_home || a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  )
}

/** The grouped "All" list: one section per kind, in the kind table's order,
 *  products inside a section in tab order. A kind with no product has no section. */
export function groupByKind(
  products: readonly ProductRow[],
  kinds: readonly ProductKind[],
): { kind: ProductKind | null; kind_key: string; label: string; products: ProductRow[] }[] {
  const byKind = new Map<string, ProductRow[]>()
  for (const p of sortProducts(products)) {
    const list = byKind.get(p.kind) ?? []
    list.push(p)
    byKind.set(p.kind, list)
  }
  const out: { kind: ProductKind | null; kind_key: string; label: string; products: ProductRow[] }[] = []
  for (const k of kinds) {
    const list = byKind.get(k.kind)
    if (!list) continue
    out.push({ kind: k, kind_key: k.kind, label: list.length > 1 ? k.plural_label : k.label, products: list })
    byKind.delete(k.kind)
  }
  // A product whose kind is not in the (live) kind list still shows.
  for (const [key, list] of byKind) {
    out.push({ kind: null, kind_key: key, label: list[0].kind_label, products: list })
  }
  return out
}

export function ladderFor(kinds: readonly ProductKind[], kind: string): ProductStage[] {
  return kinds.find((k) => k.kind === kind)?.stages ?? []
}

/** The manuscript ladder for when the product read fails, so the Manuscripts
 *  page can still show each project's own stage (read-only) instead of an
 *  empty shelf. It is projects.stage's value set: schema-v124 seeds the
 *  manuscript product_stages from it, and products.project-ui.test.ts pins
 *  the two equal on the Worker side. */
export const MANUSCRIPT_LADDER_FALLBACK: readonly ProductStage[] = [
  { stage: 'idea', label: 'Idea', ordinal: 10, is_terminal: 0 },
  { stage: 'data_collection', label: 'Data collection', ordinal: 20, is_terminal: 0 },
  { stage: 'data_analysis', label: 'Data analysis', ordinal: 30, is_terminal: 0 },
  { stage: 'writing', label: 'Writing', ordinal: 40, is_terminal: 0 },
  { stage: 'submitted', label: 'Submitted', ordinal: 50, is_terminal: 0 },
  { stage: 'revisions', label: 'Revisions', ordinal: 60, is_terminal: 0 },
  { stage: 'accepted', label: 'Accepted', ordinal: 70, is_terminal: 0 },
  { stage: 'published', label: 'Published', ordinal: 80, is_terminal: 1 },
]

// ── writes: POST /api/projects/:slug/products ───────────────

/** What the Worker answers for a write: the product as it now stands. */
export interface WrittenProduct {
  id: string
  stage: string
  stage_label: string
  seq: number
  is_home: number
}

async function write(slug: string, body: Record<string, unknown>): Promise<WrittenProduct> {
  const resp = (await fetchApi<unknown>(`/api/projects/${encodeURIComponent(slug)}/products`, {
    method: 'POST',
    body: JSON.stringify(body),
  })) as unknown as { product?: WrittenProduct }
  if (!resp?.product) throw new Error('the Worker answered without the product')
  return resp.product
}

/** Set a product's stage. `seen` (the seq and stage this screen showed) makes
 *  it a compare-and-swap: if the product moved since, the Worker refuses and
 *  nothing is overwritten. */
export function setProductStage(
  slug: string, productId: string, stage: string, seen?: { seq: number; stage: string },
): Promise<WrittenProduct> {
  return write(slug, {
    action: 'stage', product_id: productId, stage,
    ...(seen ? { base_seq: seen.seq, from_stage: seen.stage } : {}),
  })
}

/** Marking a product home hands the marker over: schema-v125's
 *  trg_products_home_handoff demotes the old home in the same statement. */
export function setProductHome(slug: string, productId: string): Promise<WrittenProduct> {
  return write(slug, { action: 'home', product_id: productId })
}

export interface NewProductInput {
  kind: string
  stage: string
  name: string
  /** Same-project parent: the new product "grew from" it (an abstract becomes
   *  a manuscript, an A0 is resubmitted as an A1). The Worker derives ranks. */
  growsFromId?: string | null
}

export function addProduct(slug: string, input: NewProductInput): Promise<WrittenProduct> {
  return write(slug, {
    action: 'add', kind: input.kind, stage: input.stage, name: input.name.trim(),
    ...(input.growsFromId ? { grew_from_id: input.growsFromId } : {}),
  })
}

// ── the list views (Projects, Manuscripts) ──────────────────

/** GET /api/projects/products: every visible project's products. */
export interface ProductsByProject {
  byProject: Record<string, ProductRow[]>
  kinds: ProductKind[]
}

/** The product a list row speaks for: the live home, else the only product,
 *  else none (the same rule the v125 triggers use for a task's product). */
export function homeOf(products: readonly ProductRow[] | undefined): ProductRow | null {
  if (!products || products.length === 0) return null
  return products.find((p) => p.is_home === 1) ?? (products.length === 1 ? products[0] : null)
}

/** The Projects list stage cell: chips for 2+ products, a ladder for one
 *  (Nick, bracket 2026-10-11), nothing when the project has none. */
export function listStageView(products: readonly ProductRow[] | undefined): 'none' | 'ladder' | 'chips' {
  const n = products?.length ?? 0
  return n === 0 ? 'none' : productViewMode(n)
}
