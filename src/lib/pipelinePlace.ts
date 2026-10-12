// Where a project sits on the Projects pipeline board. The board's columns are
// the manuscript ladder; the stage a project files under is the one its list
// cell shows (Projects.tsx listStageOf): the home product's stage when the home
// is a manuscript, the project's own stage when it has no product yet.
// Anything without a column is counted apart, never filed under a stale
// projects.stage and never silently dropped.

import type { Project } from '../data/types'
import { homeOf, type ProductRow } from './products'
import { normalizeStage } from './stageNormalize'

export type OffBoard = 'other_ladder' | 'no_stage' | 'off_board'
/** A column, or why there is none:
 *    other_ladder: the home is another kind (a grant, an award), or 2+
 *                  products and no home
 *    no_stage:     no product, and no project stage either
 *    off_board:    a stage the board has no column for */
export type PipelinePlace = { stage: string } | { off: OffBoard }

export function pipelinePlaceOf(
  p: Pick<Project, 'stage'>, products: ProductRow[] | undefined, columns: readonly string[],
): PipelinePlace {
  const home = homeOf(products)
  let stage: string
  if (home) {
    if (home.kind !== 'manuscript') return { off: 'other_ladder' }
    stage = normalizeStage(home.stage)
  } else if (products && products.length > 1) {
    return { off: 'other_ladder' }
  } else {
    if (!p.stage) return { off: 'no_stage' }
    // rowToProject() normalizes project.stage at ingress (Hub #361a).
    stage = p.stage
  }
  return columns.includes(stage) ? { stage } : { off: 'off_board' }
}

/** The board's "not on a column" note, one clause per reason that has any. */
export function pipelineOffNote(counts: Record<OffBoard, number>): string | null {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const parts: string[] = []
  if (counts.other_ladder) parts.push(`${n(counts.other_ladder, 'project is', 'projects are')} on another ladder (a grant, an award, several products)`)
  if (counts.no_stage) parts.push(`${n(counts.no_stage, 'project has', 'projects have')} no stage yet`)
  if (counts.off_board) parts.push(`${n(counts.off_board, 'project has', 'projects have')} a stage with no column here`)
  if (parts.length === 0) return null
  return `${parts.join('; ')}. The list view shows them.`
}
