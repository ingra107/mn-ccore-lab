// A project's stage, read from its products (contract phase step 1, PB
// Scratch/plans/2026-10-12-contract-phase-retire-project-stage.md).
//
// projects.stage is being retired; the browser never reads it (rowToProject
// drops it). The rulings:
//   - compact displays (search, palette, hover card, sidebar, member lists)
//     show the HOME product's kind and stage, plus "+N" for the others;
//   - full project views show product chips, or one ladder for one product
//     (Projects.tsx / ProjectDetail already do, from the products read);
//   - rollups count PRODUCTS by kind and stage (productStageCounts);
//   - "finished" is status done, or every live product on a terminal rung.
// The Worker joins the home product onto every browser project read
// (api/lib/project-home.ts); this file is the one place the UI turns that
// into words, so the compact surfaces cannot drift apart.

import type { Project } from '../data/types'
import type { ProductKind, ProductRow } from './products'

type HomeFields = Pick<Project, 'home_kind' | 'home_kind_label' | 'home_stage' | 'home_stage_label' | 'product_count'>

/** How many products past the home: the "+N". */
export function moreProducts(p: Pick<Project, 'product_count'>): number {
  return Math.max(0, Number(p.product_count ?? 0) - 1)
}

/** The home product's stage in words: "Writing" for a manuscript, "Grant
 *  application · Submitted" for any other kind, "" when there is no home. */
export function homeStageText(p: HomeFields): string {
  if (!p.home_kind || !p.home_stage) return ''
  const stage = p.home_stage_label || p.home_stage
  return p.home_kind === 'manuscript' ? stage : `${p.home_kind_label || p.home_kind} · ${stage}`
}

/** The compact label: the home's stage plus "+N". "" when there is no home. */
export function compactStageLabel(p: HomeFields): string {
  const base = homeStageText(p)
  if (!base) return ''
  const more = moreProducts(p)
  return more > 0 ? `${base} +${more}` : base
}

// "Finished" (status done, or every live product terminal) is
// isProjectFinished in taskConstants.ts, reading product_count and
// product_open_count from the same read.

/** A rollup row: live products of one kind at one stage. */
export interface ProductStageCount {
  kind: string
  kind_label: string
  stage: string
  stage_label: string
  ordinal: number
  is_terminal: number
  count: number
}

/** Products counted by kind and stage, in kind-table then ladder order.
 *  `include` narrows by the owning project (e.g. active projects only). */
export function productStageCounts(
  byProject: Record<string, ProductRow[] | undefined>,
  include: (projectId: string) => boolean = () => true,
): ProductStageCount[] {
  const map = new Map<string, ProductStageCount & { kind_sort: number }>()
  for (const [projectId, products] of Object.entries(byProject)) {
    if (!include(projectId)) continue
    for (const r of products ?? []) {
      const key = `${r.kind}:${r.stage}`
      const cur = map.get(key)
      if (cur) cur.count += 1
      else map.set(key, {
        kind: r.kind, kind_label: r.kind_label, stage: r.stage, stage_label: r.stage_label,
        ordinal: r.stage_ordinal, is_terminal: r.stage_is_terminal, count: 1, kind_sort: r.kind_sort ?? 0,
      })
    }
  }
  return [...map.values()]
    .sort((a, b) => a.kind_sort - b.kind_sort || a.kind.localeCompare(b.kind) || a.ordinal - b.ordinal)
    .map(({ kind_sort: _ks, ...row }) => { void _ks; return row })
}

/** "Grant application · Submitted" / "Writing" for a rollup row. */
export function stageCountLabel(r: Pick<ProductStageCount, 'kind' | 'kind_label' | 'stage_label'>): string {
  return r.kind === 'manuscript' ? r.stage_label : `${r.kind_label} · ${r.stage_label}`
}

/** Where a rung sits on its own kind's ladder, 0 (first) to 1 (last): the
 *  teal ramp's step for a rollup bar, so brightness carries ladder order for
 *  every kind, not only the manuscript words. */
export function ladderRampStep(kinds: readonly ProductKind[], kind: string, stage: string): number {
  const ladder = kinds.find((k) => k.kind === kind)?.stages ?? []
  const i = ladder.findIndex((s) => s.stage === stage)
  return i < 0 || ladder.length < 2 ? 0 : i / (ladder.length - 1)
}
