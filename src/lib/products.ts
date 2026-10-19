// Products inside a project (schema-v124/v125; plan step 8).
//
// A project is the umbrella; a product is one deliverable inside it, with its
// own kind and a stage from that kind's ladder. Reads come from
// GET /api/projects/:slug/products and writes go to POST
// /api/projects/:slug/products; both are open to the project's members (Nick,
// 2026-10-12: "Yes, members of that project") and to no one else.
//
// Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

import type { Project } from '../data/types'
import { fetchApi } from './api'
import { projectShortLabel } from './displayNames'

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
  /** The product's own text, under the project description (schema-v131). */
  description?: string | null
  /** When it happened or will: 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' (schema-v135). */
  event_date?: string | null
  /** Nick's place on the byline (schema-v135): first, co_first, middle, senior, investigator. */
  nick_author_position?: string | null
  /** What Nick did at the event (schema-v135): presenter, moderator. */
  nick_event_role?: string | null
  /** The row version the Worker uses for compare-and-swap. */
  seq: number
  created_at: string
  updated_at: string
}

/** The two vocabularies for Nick's part in a product (schema-v135 tables);
 *  the Worker sends them with every product read. */
export interface ProductRoles {
  author_positions: { position: string; label: string; sort_order: number }[]
  event_roles: { role: string; label: string; sort_order: number }[]
}

export const NO_ROLES: ProductRoles = { author_positions: [], event_roles: [] }

export interface ProjectProducts {
  products: ProductRow[]
  kinds: ProductKind[]
  roles?: ProductRoles
}

// ── when it happened, and Nick's part (schema-v135) ────────

/** The kinds whose date is when they HAPPENED: a talk given, an abstract
 *  presented, a session moderated (schema-v141). Their card shows that date,
 *  never "Due" (Nick 2026-10-12: a delivered talk should not read "Due Feb 11"). */
export const EVENT_KINDS: readonly string[] = ['talk', 'abstract', 'session_moderator']

/** The date facts a product card shows. An event date is shown as written
 *  (`formatEvent` keeps a month a month); due and deadline dates go through
 *  `formatDue`, as they always have. For a talk or an
 *  abstract, "Due" shows only while it is still ahead (not on a terminal
 *  rung); a delivered one with a day left in due_date (a row the v135
 *  backfill has not reached) shows that day as its date, without "Due". */
export function productDateFacts(
  p: Pick<ProductRow, 'kind' | 'stage_is_terminal' | 'due_date' | 'deadline' | 'event_date'>,
  formatEvent: (iso: string) => string,
  formatDue: (iso: string) => string,
): string[] {
  const out: string[] = []
  const eventKind = EVENT_KINDS.includes(p.kind)
  const happened = eventKind && p.stage_is_terminal === 1
  const when = p.event_date || (happened ? p.due_date : null)
  if (when) out.push(formatEvent(when))
  if (p.due_date && !happened) out.push(`Due ${formatDue(p.due_date)}`)
  if (p.deadline && !happened) out.push(`Deadline ${formatDue(p.deadline)}`)
  return out
}

/** "First author, presenter", "Presenter", "Senior author", or null. */
export function nickRoleLabel(
  p: Pick<ProductRow, 'nick_author_position' | 'nick_event_role'>, roles: ProductRoles,
): string | null {
  const pos = p.nick_author_position
    ? roles.author_positions.find((r) => r.position === p.nick_author_position)?.label ?? p.nick_author_position
    : null
  const role = p.nick_event_role
    ? roles.event_roles.find((r) => r.role === p.nick_event_role)?.label ?? p.nick_event_role
    : null
  if (pos && role) return `${pos}, ${role.toLowerCase()}`
  return pos ?? role
}

/** The Manuscripts page's role filter (Nick 2026-10-12: presenter, first,
 *  senior, middle). "First" includes co-first. */
export const ROLE_FILTERS: readonly { value: string; label: string }[] = [
  { value: 'presenter', label: 'Presenter' },
  { value: 'first', label: 'First' },
  { value: 'senior', label: 'Senior' },
  { value: 'middle', label: 'Middle' },
]

export function matchesRoleFilter(
  p: Pick<ProductRow, 'nick_author_position' | 'nick_event_role'>, filter: string,
): boolean {
  switch (filter) {
    case '': return true
    case 'presenter': return p.nick_event_role === 'presenter'
    case 'first': return p.nick_author_position === 'first' || p.nick_author_position === 'co_first'
    default: return p.nick_author_position === filter
  }
}

/** The Manuscripts page's kind-tab order: the kinds stay in the order they
 *  came (the grouped All list draws one section per run of a kind), and
 *  inside a kind the newest event comes first. A product with no event date
 *  keeps its place after the dated ones, in the order it came (Array.sort is
 *  stable). An ISO prefix sorts as text: '2019' < '2019-05' < '2019-05-03'. */
export function byEventDateDesc<T extends { product: Pick<ProductRow, 'kind' | 'event_date'> }>(rows: readonly T[]): T[] {
  const kindOrder = new Map<string, number>()
  for (const r of rows) if (!kindOrder.has(r.product.kind)) kindOrder.set(r.product.kind, kindOrder.size)
  return [...rows].sort((a, b) => {
    const k = kindOrder.get(a.product.kind)! - kindOrder.get(b.product.kind)!
    if (k !== 0) return k
    const x = a.product.event_date ?? ''
    const y = b.product.event_date ?? ''
    if (x === y) return 0
    if (!x) return 1
    if (!y) return -1
    return x < y ? 1 : -1
  })
}

/** Why a typed event date would be refused, or null: 'YYYY', 'YYYY-MM' or
 *  'YYYY-MM-DD' with a real month and day. The Worker (eventDateRefusal) and
 *  schema-v135's CHECK are the rule; this only says it before the write.
 *  Empty is allowed: it clears the date. */
export function eventDateInputError(v: string): string | null {
  if (v === '') return null
  if (/^\d{4}$/.test(v)) return null
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v)
  if (!m) return 'Use YYYY, YYYY-MM or YYYY-MM-DD.'
  const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? null : 'That is not a date on the calendar.'
}

/** The fields the product detail edits through the member route's 'terms'
 *  action. Empty clears. */
export interface EventFields {
  event_date: string | null
  nick_author_position: string | null
  nick_event_role: string | null
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
  kind: string
  stage: string
  stage_label: string
  /** 1 when the stage is its ladder's terminal rung (Published, Funded, ...). */
  stage_is_terminal: number
  seq: number
  is_home: number
}

/** #129: a stage write that published a paper -- a MANUSCRIPT product landing
 *  on its ladder's terminal rung. The one condition useSetProductStage uses to
 *  offer "Is this the paper?"; any other kind's last rung (Funded, Presented,
 *  Closed) is not a paper. */
export function publishedAPaper(w: Pick<WrittenProduct, 'kind' | 'stage_is_terminal'>): boolean {
  return w.kind === 'manuscript' && w.stage_is_terminal === 1
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

// ── product-scoped items: files, revisions, activity (schema-v131) ───────

/** Project-wide items carry no product_id. Nick, 2026-10-12: "Project-wide,
 *  shown everywhere": an untagged item shows under All AND under every product
 *  (marked "project"); a tagged item shows under its product and under All. */
export interface ProductTagged { product_id?: string | null }

/** Under a product chip: that product's own items first, then the project-wide
 *  ones ("if there's anything that are product specific, they should be at the
 *  top"); items of other products drop out. Each group keeps the tab's order.
 *  Under All (no product): every item, in the tab's own order. */
export function scopeByProduct<T extends ProductTagged>(
  items: readonly T[], productId: string | null, liveProducts?: readonly ProductRow[],
): T[] {
  if (!productId) return [...items]
  // A tag on a product that is no longer live (tombstoned) reads as project-wide,
  // so its items never vanish under every chip.
  const live = liveProducts ? new Set(liveProducts.map((p) => p.id)) : null
  const wideItem = (i: T) => !i.product_id || (live !== null && !live.has(i.product_id))
  const own = items.filter((i) => i.product_id === productId && !wideItem(i))
  const wide = items.filter(wideItem)
  return [...own, ...wide]
}

/** What the marker on an item says: the product's name, or "project" for a
 *  project-wide item. A project with fewer than 2 products has nothing to tell apart. */
export function itemMarker(
  productId: string | null | undefined, products: readonly ProductRow[],
): string | null {
  if (products.length < 2) return null
  if (!productId) return 'project'
  const p = products.find((x) => x.id === productId)
  return p ? productLabel(p) : 'project'
}

// ── re-tag and describe: POST /api/projects/:slug/products ────

export type TaggableItem = 'file' | 'revision' | 'activity'

export async function tagItem(slug: string, item: TaggableItem, id: string, productId: string | null): Promise<void> {
  await fetchApi<unknown>(`/api/projects/${encodeURIComponent(slug)}/products`, {
    method: 'POST',
    body: JSON.stringify({ action: 'tag', item, id, product_id: productId }),
  })
}

export function describeProduct(slug: string, productId: string, description: string): Promise<WrittenProduct> {
  return write(slug, { action: 'describe', product_id: productId, description })
}

/** Set a product's event date and Nick's role (schema-v135) through the
 *  'terms' action. `seen` (the seq and the values this screen showed) makes
 *  it a compare-and-swap: a stale tab is refused, never overwrites. */
export async function setProductEvent(
  slug: string, productId: string, fields: Partial<EventFields>,
  seen: { seq: number; values: Partial<EventFields> },
): Promise<WrittenProduct & Partial<EventFields>> {
  const resp = (await fetchApi<unknown>(`/api/projects/${encodeURIComponent(slug)}/products`, {
    method: 'POST',
    body: JSON.stringify({ action: 'terms', product_id: productId, fields, base_seq: seen.seq, from: seen.values }),
  })) as unknown as { product?: WrittenProduct & Partial<EventFields> }
  if (!resp?.product) throw new Error('the Worker answered without the product')
  return resp.product
}

// ── the list views (Projects, Manuscripts) ──────────────────

/** GET /api/projects/products: every visible project's products. */
export interface ProductsByProject {
  byProject: Record<string, ProductRow[]>
  kinds: ProductKind[]
  roles?: ProductRoles
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

// ── the Manuscripts page's kind tabs ───────────────────────

/** A row of the Manuscripts page's kind tabs: one product and its project. */
export interface KindRow {
  product: ProductRow
  project: Project
}

/** Every product of the given kinds whose project is on screen, in kind order
 *  (the Worker sends kinds by sort_order), then project name, then lineage. */
export function productsOfKinds(
  byProject: ProductsByProject['byProject'], projects: readonly Project[], kinds: readonly string[],
): KindRow[] {
  const want = new Set(kinds)
  const order = new Map(kinds.map((k, i) => [k, i]))
  const out: KindRow[] = []
  for (const project of projects) {
    for (const product of byProject[project.id ?? ''] ?? []) {
      if (want.has(product.kind)) out.push({ product, project })
    }
  }
  const name = (p: Project) => projectShortLabel(p).toLowerCase()
  return out.sort((a, b) =>
    (order.get(a.product.kind)! - order.get(b.product.kind)!)
    || name(a.project).localeCompare(name(b.project))
    || (a.product.lineage_rank ?? 0) - (b.product.lineage_rank ?? 0)
    || productLabel(a.product).localeCompare(productLabel(b.product)))
}

/** The product kinds the Manuscripts page shows (Nick 2026-10-12: "we can keep
 *  grants separate ... manuscripts page will have the abstract and such").
 *  A talk (schema-v132) sits beside abstracts, its own tab: both are things
 *  you present. A moderated session (schema-v141) gets its own tab after
 *  Talks: Nick 2026-10-19, "it needs to be a separate moderator thing".
 *  Grant applications, awards and honors live on /portal/grants; trial ops
 *  and infrastructure have no list page. */
export const MANUSCRIPTS_PAGE_KINDS: readonly string[] = ['manuscript', 'abstract', 'talk', 'session_moderator']

/** The Manuscripts page's tabs: manuscript always (the default), each other
 *  page kind that has a visible product, in the kinds' sort_order with their
 *  plural label, then All when there is more than one. */
export function manuscriptsPageTabs(
  kinds: readonly ProductKind[], byProject: ProductsByProject['byProject'],
): { value: string; label: string }[] {
  const present = new Set<string>()
  for (const list of Object.values(byProject)) for (const pr of list) present.add(pr.kind)
  const tabs = kinds
    .filter((k) => k.kind === 'manuscript' || (MANUSCRIPTS_PAGE_KINDS.includes(k.kind) && present.has(k.kind)))
    .map((k) => ({ value: k.kind, label: k.plural_label }))
  if (tabs.length > 1) tabs.push({ value: 'all', label: 'All' })
  return tabs
}

/** The kinds a Manuscripts-page tab lists: All is the page kinds, never more. */
export function kindsForManuscriptsTab(tab: string, kinds: readonly ProductKind[]): string[] {
  if (tab === 'all') return kinds.map((k) => k.kind).filter((k) => MANUSCRIPTS_PAGE_KINDS.includes(k))
  return MANUSCRIPTS_PAGE_KINDS.includes(tab) ? [tab] : []
}
