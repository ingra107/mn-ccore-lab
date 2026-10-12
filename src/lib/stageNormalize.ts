/**
 * Project-stage normalization. The Hub canonical 7-stage ladder is:
 *   idea → data_collection → analysis → writing → review → revisions → published
 *
 * brain.db (and historical Hub data) uses granular sub-stages like
 * "submitted" / "under_review" / "accepted" that don't appear in the
 * canonical strip. Mapping them onto the closest strip stage means every
 * "stage indicator" UI (strip, dot, mini-pipeline) lights up correctly
 * without needing a 9-stage strip.
 *
 * Revisions added 2026-04-23 per GH #26 — papers in revise-and-resubmit
 * are conceptually distinct from first-submission review and from accepted.
 *
 * Originally inlined in ProjectDetail.tsx for P2-R2-14 — lifted to shared
 * util so Projects.tsx, TrajectoryPage.tsx, and any future stage-rendering
 * surface can use the same mapping.
 *
 * CANONICAL_STAGES normalized to lowercase 2026-05-14 for D1 parity.
 * STAGE_ALIASES maps old Title Case values (and historical strings) to the
 * new lowercase canonical values.
 */
const CANONICAL_STAGES = [
  'idea',
  'data_collection',
  'analysis',
  'writing',
  'review',
  'revisions',
  'published',
] as const

type CanonicalStage = typeof CANONICAL_STAGES[number]

const STAGE_ALIASES: Record<string, CanonicalStage> = {
  // Old Title Case values (pre 2026-05-14) → new lowercase canonical
  Idea: 'idea',
  'Data Collection': 'data_collection',
  'Data Analysis': 'analysis',
  Analysis: 'analysis',
  Writing: 'writing',
  Review: 'review',
  Submitted: 'review',
  'Under Review': 'review',
  Revisions: 'revisions',
  'Revise and Resubmit': 'revisions',
  'Revise & Resubmit': 'revisions',
  'R&R': 'revisions',
  'In Revisions': 'revisions',
  'In Revision': 'revisions',
  Accepted: 'published',
  Published: 'published',
  // Lowercase API aliases
  data_analysis: 'analysis',
  submitted: 'review',
  accepted: 'published',
}

export function normalizeStage(stage: string | null | undefined): CanonicalStage | '' {
  if (!stage) return ''
  if (STAGE_ALIASES[stage]) return STAGE_ALIASES[stage]
  if ((CANONICAL_STAGES as readonly string[]).includes(stage)) return stage as CanonicalStage
  return ''
}

// ── Canonical display color, keyed by the canonical lowercase stage ──
// A project's stage is its products' (contract phase step 1, 2026-10-12): the
// manuscript-ladder readers that remain (Narratives, Trajectory, the pipeline
// board) normalize a manuscript PRODUCT's rung through here. The project-stage
// half (stageLabel, stageIndex, stageRampStep, toApiStage) went with the
// project stage; product labels come from product_stages.
// Colors reuse the WCAG-AA-pinned set from taskConstants.ts STAGE_COLORS
// (audited 2026-04-18) — keep them in sync.
const CANONICAL_STAGE_COLORS: Record<CanonicalStage, string> = {
  idea: '#8591a0',
  data_collection: 'var(--stage-data-collection)',
  analysis: '#4db5b0',
  writing: '#dcb355',
  review: '#d65c66',
  revisions: '#d65c66',
  published: '#4ecd77',
}

// WCAG-AA-pinned stage color for any raw stage value. Falls back to --slate.
export function stageColor(stage: string | null | undefined): string {
  const normalized = normalizeStage(stage)
  if (!normalized) return 'var(--slate)'
  return CANONICAL_STAGE_COLORS[normalized]
}
