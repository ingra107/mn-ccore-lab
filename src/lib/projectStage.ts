// A project's stage, read from its products (contract phase step 1, PB
// Scratch/plans/2026-10-12-contract-phase-retire-project-stage.md).
//
// projects.stage is being retired; the browser never reads it (rowToProject
// drops it). The rulings:
//   - compact displays (search, palette, hover card, sidebar, member lists)
//     show the HOME product's kind and stage, plus "+N" for the others;
//   - full project views show product chips, or one ladder for one product
//     (Projects.tsx / ProjectDetail already do, from the products read);
//   - rollups count PRODUCTS by kind and stage (the Worker's PRODUCT_STAGE_COUNTS_SQL;
//     the UI draws them from the rows it returns, never from a client recount);
//   - "finished" is status done, or every live product on a terminal rung.
// The Worker joins the home product onto every browser project read
// (api/lib/project-home.ts); this file is the one place the UI turns that
// into words, so the compact surfaces cannot drift apart.

import type { Project } from '../data/types'

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

/** "Grant application · Submitted" / "Writing" for a rollup row. */
export function stageCountLabel(r: Pick<ProductStageCount, 'kind' | 'kind_label' | 'stage_label'>): string {
  return r.kind === 'manuscript' ? r.stage_label : `${r.kind_label} · ${r.stage_label}`
}
