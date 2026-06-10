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

export function stageIndex(stage: string | null | undefined): number {
  const normalized = normalizeStage(stage)
  if (!normalized) return -1
  return CANONICAL_STAGES.indexOf(normalized)
}

// UI → API stage value. The API (api/routes/projects.ts PROJECT_STAGE_VALUES)
// only accepts brain.db's canonical 7-stage vocabulary, which uses
// "Data Analysis" / "Submitted" / "Accepted" where the UI strip shows
// "Analysis" / "Review". Without this map, clicking "Analysis" or "Review"
// in any stage picker sends an invalid value, the API returns 400, and the
// optimistic update reverts silently (issue #19 reported 2026-04-21).
const UI_TO_API_STAGE: Record<string, string> = {
  // Title Case UI values (legacy, pre 2026-05-14)
  Analysis: 'data_analysis',
  Review: 'submitted',
  Idea: 'idea',
  'Data Collection': 'data_collection',
  Writing: 'writing',
  Revisions: 'revisions',
  Published: 'published',
  Accepted: 'accepted',
  // Lowercase canonical UI values (post 2026-05-14, D1 parity)
  analysis: 'data_analysis',
  review: 'submitted',
}

type ApiStage = 'idea' | 'data_collection' | 'data_analysis' | 'writing' | 'submitted' | 'revisions' | 'accepted' | 'published'

export function toApiStage(uiStage: string): ApiStage {
  return (UI_TO_API_STAGE[uiStage] ?? uiStage) as ApiStage
}

// ── Canonical display: label + color, keyed by the canonical lowercase stage ──
// Any surface that renders a stage indicator should normalizeStage() the raw
// value (API lowercase OR legacy Title Case) and then look up here, so label
// text and dot/strip colors stay consistent across ProjectDetail / Narratives /
// Trajectory / Analytics etc. Colors reuse the WCAG-AA-pinned set from
// taskConstants.ts STAGE_COLORS (audited 2026-04-18) — keep them in sync.
const CANONICAL_STAGE_LABELS: Record<CanonicalStage, string> = {
  idea: 'Idea',
  data_collection: 'Data Collection',
  analysis: 'Analysis',
  writing: 'Writing',
  review: 'Review',
  revisions: 'Revisions',
  published: 'Published',
}

const CANONICAL_STAGE_COLORS: Record<CanonicalStage, string> = {
  idea: '#8591a0',
  data_collection: 'var(--stage-data-collection)',
  analysis: '#4db5b0',
  writing: '#dcb355',
  review: '#d65c66',
  revisions: '#d65c66',
  published: '#4ecd77',
}

// Human-readable stage label for any raw stage value (API lowercase or legacy
// Title Case). Falls back to the raw string if it can't be normalized.
export function stageLabel(stage: string | null | undefined): string {
  const normalized = normalizeStage(stage)
  if (!normalized) return stage ?? ''
  return CANONICAL_STAGE_LABELS[normalized]
}

// WCAG-AA-pinned stage color for any raw stage value. Falls back to --slate.
export function stageColor(stage: string | null | undefined): string {
  const normalized = normalizeStage(stage)
  if (!normalized) return 'var(--slate)'
  return CANONICAL_STAGE_COLORS[normalized]
}
