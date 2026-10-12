// Products inside a project (schema-v124/v125; plan step 8).
//
// A project is the umbrella; a product is one deliverable inside it, with its
// own kind and a stage from that kind's ladder. Reads come from
// GET /api/projects/:slug/products (members of the project); writes go through
// POST /api/mutations (PI only: the Worker gates that endpoint, so team members
// see products but the controls are drawn for the PI alone).
//
// Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

import { fetchApi } from './api'
import { nowInstant } from './time'

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

// ── ids ─────────────────────────────────────────────────────

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A 26-character Crockford ULID: 10 time characters, 16 random. Product ids
 *  are `prd_<ULID>`, mutation ids `mut_<ULID>`. */
export function ulid(now: number = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let rand = ''
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32]
  return time + rand
}

// ── writes: POST /api/mutations ─────────────────────────────

interface MutationEnvelope {
  mutation_id: string
  origin_machine: string
  table: 'products'
  op: 'insert' | 'update'
  record_id: string
  base_seq: null
  base_row_hash: null
  patch?: Record<string, unknown>
  payload?: Record<string, unknown>
  client_ts: string
  issued_at: string
}

// `hub_ui:` marks a write made from the Hub's own screens; the Worker skips the
// PB-only blind-overwrite check for that prefix.
const ORIGIN = 'hub_ui:project-products'

function envelope(
  op: 'insert' | 'update',
  recordId: string,
  body: { patch?: Record<string, unknown>; payload?: Record<string, unknown> },
): MutationEnvelope {
  const now = nowInstant()
  return {
    mutation_id: `mut_${ulid()}`,
    origin_machine: ORIGIN,
    table: 'products',
    op,
    record_id: recordId,
    base_seq: null,
    base_row_hash: null,
    client_ts: now,
    issued_at: now,
    ...body,
  }
}

interface MutationResponse {
  results?: { status: string; reason?: string; code?: string }[]
}

/** Send one mutation and throw the Worker's own refusal text if it did not land. */
async function send(m: MutationEnvelope): Promise<void> {
  const resp = (await fetchApi<unknown>('/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: [m] }),
  })) as unknown as MutationResponse
  const r = resp.results?.[0]
  if (!r || (r.status !== 'accepted' && r.status !== 'merged_clean')) {
    throw new Error(r?.reason ?? r?.code ?? `mutation ${r?.status ?? 'not answered'}`)
  }
}

export function setProductStage(productId: string, stage: string): Promise<void> {
  return send(envelope('update', productId, { patch: { stage } }))
}

/** Marking a product home hands the marker over: schema-v125's
 *  trg_products_home_handoff demotes the old home in the same statement. */
export function setProductHome(productId: string): Promise<void> {
  return send(envelope('update', productId, { patch: { is_home: 1 } }))
}

export interface NewProductInput {
  projectId: string
  kind: string
  stage: string
  name: string
  /** Same-project parent: the new product "grew from" it (an abstract becomes
   *  a manuscript, an A0 is resubmitted as an A1). */
  growsFrom?: Pick<ProductRow, 'id' | 'lineage_rank'> | null
}

export function addProduct(input: NewProductInput): Promise<void> {
  const name = input.name.trim()
  const payload: Record<string, unknown> = {
    project_id: input.projectId,
    kind: input.kind,
    stage: input.stage,
    is_home: 0,
  }
  if (name) {
    payload.title = name
    payload.short_name = name
  }
  if (input.growsFrom) {
    payload.grew_from_id = input.growsFrom.id
    payload.grew_from_rank = input.growsFrom.lineage_rank
    payload.lineage_rank = input.growsFrom.lineage_rank + 1
  }
  return send(envelope('insert', `prd_${ulid()}`, { payload }))
}
