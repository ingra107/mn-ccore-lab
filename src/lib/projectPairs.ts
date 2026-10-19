// Project ~ Product pairs (Nick, 2026-10-12: "it's basically a project product
// pair that you associate tasks with").
//
// A task carries project_id AND product_id (schema-v124; the v125 home rule
// fills product_id when it is NULL). Wherever a task's project is chosen, a
// project with 2+ live products offers one option per product, "Project ~
// Product"; a project with one product offers just the project. Picking a pair
// sets both ids. Picking a single-product project leaves product_id to the home
// rule. Wherever a task's project is shown, a project with 2+ products shows
// "Project ~ Product".

import { projectShortLabel } from './displayNames'
import { productKindLabel, type ProductRow } from './products'

export interface PairProject {
  /** proj_* PK: the key of the bulk product read. */
  id?: string | null
  slug: string
  title: string
  short_name?: string | null
}

export interface PairOption {
  /** `slug` for a project, `slug::prd_id` for a pair. */
  value: string
  label: string
  slug: string
  productId: string | null
}

const SEP = '::'

export function encodePair(slug: string, productId?: string | null): string {
  return productId ? `${slug}${SEP}${productId}` : slug
}

export function decodePair(value: string): { project_id: string | null; product_id: string | null } {
  if (!value) return { project_id: null, product_id: null }
  const i = value.indexOf(SEP)
  if (i < 0) return { project_id: value, product_id: null }
  return { project_id: value.slice(0, i), product_id: value.slice(i + SEP.length) }
}

/** The fields a pick writes: both ids for a pair, project only otherwise. */
export function pairFields(value: string): Record<string, unknown> {
  const d = decodePair(value)
  return d.product_id ? { project_id: d.project_id, product_id: d.product_id } : { project_id: d.project_id }
}

type ByProject = Record<string, ProductRow[]>

function liveProducts(p: PairProject, byProject: ByProject): ProductRow[] {
  return (p.id ? byProject[p.id] : undefined) ?? []
}

/** One option per project, or one per (project, product) when the project has
 *  2+ live products. Products keep the Worker's order (home first). */
export function buildPairOptions(projects: readonly PairProject[], byProject: ByProject): PairOption[] {
  const out: PairOption[] = []
  for (const p of projects) {
    if (!p.slug) continue
    const name = projectShortLabel(p)
    const prods = liveProducts(p, byProject)
    if (prods.length < 2) {
      out.push({ value: p.slug, label: name, slug: p.slug, productId: null })
      continue
    }
    for (const pr of prods) {
      out.push({ value: encodePair(p.slug, pr.id), label: `${name} ~ ${productKindLabel(pr)}`, slug: p.slug, productId: pr.id })
    }
  }
  return out
}

/** The picker value that stands for a task's (project, product). A task on a
 *  multi-product project whose product_id is NULL (no home) has no pair: its
 *  value stays the bare slug, and the picker adds a fallback option for it. */
export function pairValueFor(
  slug: string | null | undefined, productId: string | null | undefined,
  projects: readonly PairProject[], byProject: ByProject,
): string {
  if (!slug) return ''
  const p = projects.find((x) => x.slug === slug)
  if (!p) return slug
  const prods = liveProducts(p, byProject)
  if (prods.length >= 2 && productId && prods.some((x) => x.id === productId)) return encodePair(slug, productId)
  return slug
}

/** The name a task row shows: "Project ~ Product" for a project with 2+
 *  products, the project name alone otherwise. */
export function pairLabelFor(
  baseName: string, slug: string | null | undefined, productId: string | null | undefined,
  projects: readonly PairProject[], byProject: ByProject,
): string {
  if (!slug) return baseName
  const p = projects.find((x) => x.slug === slug)
  if (!p) return baseName
  const prods = liveProducts(p, byProject)
  if (prods.length < 2) return baseName
  // No product (or one that is no longer live): a project-wide task.
  const pr = productId ? prods.find((x) => x.id === productId) : undefined
  return pr ? `${baseName} ~ ${productKindLabel(pr)}` : `${baseName} ~ project`
}

/** Options for a select: the pair options, plus a fallback for a current value
 *  that is not one of them (a multi-product project with no product on the task). */
export function withCurrent(
  options: PairOption[], current: string, projects: readonly PairProject[],
): PairOption[] {
  if (!current || options.some((o) => o.value === current)) return options
  const p = projects.find((x) => x.slug === current)
  return [...options, { value: current, label: p ? projectShortLabel(p) : current, slug: current, productId: null }]
}
