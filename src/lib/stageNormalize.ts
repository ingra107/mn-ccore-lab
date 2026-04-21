/**
 * Project-stage normalization. The Hub canonical 6-stage ladder is:
 *   Idea → Data Collection → Analysis → Writing → Review → Published
 *
 * brain.db (and historical Hub data) uses granular sub-stages like
 * "Submitted" / "Under Review" / "Accepted" that don't appear in the
 * canonical strip. Mapping them onto the closest strip stage means every
 * "stage indicator" UI (strip, dot, mini-pipeline) lights up correctly
 * without needing a 9-stage strip.
 *
 * Originally inlined in ProjectDetail.tsx for P2-R2-14 — lifted to shared
 * util so Projects.tsx, TrajectoryPage.tsx, and any future stage-rendering
 * surface can use the same mapping.
 */
export const CANONICAL_STAGES = [
  'Idea',
  'Data Collection',
  'Analysis',
  'Writing',
  'Review',
  'Published',
] as const

export type CanonicalStage = typeof CANONICAL_STAGES[number]

const STAGE_ALIASES: Record<string, CanonicalStage> = {
  Submitted: 'Review',
  'Under Review': 'Review',
  Accepted: 'Published',
}

export function normalizeStage(stage: string | null | undefined): CanonicalStage | '' {
  if (!stage) return ''
  if (STAGE_ALIASES[stage]) return STAGE_ALIASES[stage]
  if ((CANONICAL_STAGES as readonly string[]).includes(stage)) return stage as CanonicalStage
  return ''
}

export function stageIndex(stage: string | null | undefined): number {
  const normalized = normalizeStage(stage)
  if (!normalized) return -1
  return CANONICAL_STAGES.indexOf(normalized)
}
