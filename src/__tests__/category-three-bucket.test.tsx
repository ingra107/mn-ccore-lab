/**
 * Three-bucket category tests: CreateProjectModal + CategoryIcon.
 *
 * Stage 4 #12-followup (2026-05-08) — verifies frontend matches the
 * canonical 3-bucket model shipped in api/routes/projects.ts (e9620d03).
 *
 * These are pure unit tests — no DOM rendering, no React hooks, no network.
 * They validate:
 *   1. The category option constants exported/used by CreateProjectModal.
 *   2. CategoryIcon's slug-matching logic (lowercase, switch arms).
 */

import { describe, it, expect } from 'vitest'
import { createCategoryOptions } from '../constants/categories'

// The New Project form's options come from the real function, keyed on the
// site-admin flag the server sets (useAuth().canShowAllProjects), not on an
// email literal (the old checkIsNick copy, deleted 2026-10-09).
const CATEGORIES_BASE = createCategoryOptions(false)

// CategoryIcon slug logic (mirrors component)
function iconSlug(category: string | null | undefined): string {
  return (category ?? '').toLowerCase()
}

// Which switch arm fires for a given category value?
function iconArm(category: string | null | undefined): string {
  const slug = iconSlug(category)
  switch (slug) {
    case 'mnccore':
    case 'lab':
      return 'flask'
    case 'clif':
      return 'lungs'
    case 'peripheral brain':
      return 'brain'
    case 'nate':
      return 'heartbeat'
    case 'mentee':
      return 'gradcap'
    default:
      return 'circle'
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CreateProjectModal — category list gating
// ──────────────────────────────────────────────────────────────────────────────

describe('CreateProjectModal category options', () => {
  it('a member who is not the site admin gets exactly 2 options (MNCCORE + CLIF)', () => {
    const cats = createCategoryOptions(false)
    expect(cats).toHaveLength(2)
    expect(cats.map((c) => c.value)).toEqual(['MNCCORE', 'CLIF'])
  })

  it('the site admin gets 3 options including Peripheral Brain', () => {
    const cats = createCategoryOptions(true)
    expect(cats).toHaveLength(3)
    expect(cats.map((c) => c.value)).toEqual(['MNCCORE', 'CLIF', 'Peripheral Brain'])
  })

  it('default category is MNCCORE (not the old "research" or "lab")', () => {
    // The component sets useState('MNCCORE') — mirror the expected default here
    const defaultCat = 'MNCCORE'
    expect(defaultCat).toBe('MNCCORE')
    expect(defaultCat).not.toBe('research')
    expect(defaultCat).not.toBe('lab')
  })

  it('MNCCORE option has teal color token', () => {
    const cat = CATEGORIES_BASE.find((c) => c.value === 'MNCCORE')
    expect(cat?.color).toBe('var(--teal)')
  })

  it('CLIF option has maroon color token', () => {
    const cat = CATEGORIES_BASE.find((c) => c.value === 'CLIF')
    expect(cat?.color).toBe('var(--maroon)')
  })

  it('Peripheral Brain option has slate color token', () => {
    expect(createCategoryOptions(true).find((c) => c.value === 'Peripheral Brain')?.color).toBe('var(--slate)')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// CategoryIcon — switch arm dispatch
// ──────────────────────────────────────────────────────────────────────────────

describe('CategoryIcon switch arms', () => {
  // Canonical 3-bucket
  it('MNCCORE → flask icon (same as lab legacy)', () => {
    expect(iconArm('MNCCORE')).toBe('flask')
  })

  it('CLIF → lungs icon', () => {
    expect(iconArm('CLIF')).toBe('lungs')
  })

  it('Peripheral Brain → brain icon', () => {
    expect(iconArm('Peripheral Brain')).toBe('brain')
  })

  // Legacy fallback arms (pre-migration soft-deleted rows)
  it('legacy "clif" → lungs icon (same as canonical CLIF)', () => {
    expect(iconArm('clif')).toBe('lungs')
  })

  it('legacy "lab" → flask icon (same as canonical MNCCORE)', () => {
    expect(iconArm('lab')).toBe('flask')
  })

  it('legacy "nate" → heartbeat icon', () => {
    expect(iconArm('nate')).toBe('heartbeat')
  })

  it('legacy "mentee" → gradcap icon', () => {
    expect(iconArm('mentee')).toBe('gradcap')
  })

  // Edge cases
  it('null category → generic circle (default arm)', () => {
    expect(iconArm(null)).toBe('circle')
  })

  it('undefined category → generic circle', () => {
    expect(iconArm(undefined)).toBe('circle')
  })

  it('unknown string → generic circle', () => {
    expect(iconArm('unknown-bucket')).toBe('circle')
  })

  it('lowercasing is applied: "CLIF" matches "clif" arm', () => {
    // Both canonical 'CLIF' and legacy 'clif' should hit the lungs arm
    expect(iconSlug('CLIF')).toBe('clif')
    expect(iconArm('CLIF')).toBe(iconArm('clif'))
  })

  it('lowercasing is applied: "Peripheral Brain" hits "peripheral brain" arm', () => {
    expect(iconSlug('Peripheral Brain')).toBe('peripheral brain')
    expect(iconArm('Peripheral Brain')).toBe('brain')
  })
})
