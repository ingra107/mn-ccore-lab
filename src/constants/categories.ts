// src/constants/categories.ts
// Canonical project-category options — single source of truth.
//
// The API allowlist is the 3-bucket canonical set MNCCORE / CLIF / Peripheral
// Brain (api/routes/projects.ts; CLAUDE.md shared-field registry, 2026-05-08
// three-bucket decision). The legacy 4-bucket tokens (clif/lab/nate/mentee) are
// RETIRED — writing them 400s and silently reverts the optimistic edit (S3).
//
// Labels + colors mirror the inline options already used across Projects.tsx /
// ManuscriptsPage / CreateProjectModal. Those sites should migrate to this
// constant piecemeal; new consumers import from here, never re-inline.

export interface CategoryOption {
  value: string
  label: string
  color: string
}

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'MNCCORE', label: 'MN-CCORE', color: 'var(--teal)' },
  { value: 'CLIF', label: 'CLIF', color: 'var(--maroon)' },
  { value: 'Peripheral Brain', label: 'Peripheral Brain', color: 'var(--slate)' },
]
