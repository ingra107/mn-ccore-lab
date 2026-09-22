import type { Layout, Layouts } from 'react-grid-layout'

// Breakpoints are measured against the grid CONTAINER width (not window),
// because react-grid-layout's WidthProvider sizes against the inner element.
// At a 1440px window with a 250px sidebar the content area is ~1000px.
export const DASHBOARD_GRID_BREAKPOINTS = { lg: 960, md: 720, sm: 480, xs: 0 } as const

// One old card cell is GRID_SCALE x GRID_SCALE cells now (Nick 2026-09-17,
// #134: "2-3x more granularity to the grid that you can snap to"). Splitting
// both axes by 3 keeps the geometry identical -- a 3x3 card occupies exactly
// the width and height the old 1x1 card did, because the two margins the split
// introduces are subtracted from the row height below -- while giving the
// resize handle 10 width steps per row instead of 4. Cards can never get
// SMALLER than they could before: minW/minH are pinned at GRID_SCALE.
export const GRID_SCALE = 3

export const DASHBOARD_GRID_COLS = { lg: 12, md: 9, sm: 6, xs: 3 } as const

// rowHeight must satisfy `GRID_SCALE * rh + (GRID_SCALE - 1) * marginY` = the
// old row height, so an unresized dashboard renders pixel-identical.
// marginY is 20 (DashboardGrid's `margin` prop).
export const DASHBOARD_GRID_ROW_HEIGHT = {
  lg: (260 - 40) / 3,
  md: (220 - 40) / 3,
  sm: (200 - 40) / 3,
  xs: (180 - 40) / 3,
} as const

type Breakpoint = keyof typeof DASHBOARD_GRID_COLS

export interface GridCard {
  id: string
  /** Optional default width, in OLD whole-card units. Defaults to 1. */
  defaultW?: number
  /** Optional default height, in OLD whole-card units. Defaults to 1. */
  defaultH?: number
}

const LAYOUT_STORAGE_PREFIX = 'mnccore-dashboard-layouts-v2'
const LEGACY_STORAGE_PREFIX = 'mnccore-dashboard-layouts-v1'

function keyFor(prefix: string, section: string, userSlug: string | undefined) {
  return `${prefix}:${userSlug || 'anon'}:${section}`
}

function storageKey(section: string, userSlug: string | undefined) {
  return keyFor(LAYOUT_STORAGE_PREFIX, section, userSlug)
}

function legacyStorageKey(section: string, userSlug: string | undefined) {
  return keyFor(LEGACY_STORAGE_PREFIX, section, userSlug)
}

/**
 * Multiply a v1 (whole-card) layout up into v2 cells. A dashboard Nick already
 * arranged keeps its arrangement across the split instead of reflowing.
 */
function scaleLegacyLayouts(saved: Layouts): Layouts {
  const out: Layouts = {}
  ;(Object.keys(saved) as Breakpoint[]).forEach(bp => {
    const cols = DASHBOARD_GRID_COLS[bp]
    if (!cols) return
    out[bp] = (saved[bp] ?? []).map(l => ({
      ...l,
      x: l.x * GRID_SCALE,
      y: l.y * GRID_SCALE,
      w: Math.min(l.w * GRID_SCALE, cols),
      h: l.h * GRID_SCALE,
      minW: GRID_SCALE,
      minH: GRID_SCALE,
      maxW: cols,
      maxH: 4 * GRID_SCALE,
    }))
  })
  return out
}

function parseLayouts(raw: string | null): Layouts | null {
  if (!raw) return null
  const parsed = JSON.parse(raw)
  return parsed && typeof parsed === 'object' ? (parsed as Layouts) : null
}

export function loadSavedLayouts(section: string, userSlug: string | undefined): Layouts | null {
  try {
    const current = parseLayouts(localStorage.getItem(storageKey(section, userSlug)))
    if (current) return current
    const legacy = parseLayouts(localStorage.getItem(legacyStorageKey(section, userSlug)))
    return legacy ? scaleLegacyLayouts(legacy) : null
  } catch {
    /* fall through to null */
  }
  return null
}

export function saveLayouts(section: string, userSlug: string | undefined, layouts: Layouts) {
  try {
    localStorage.setItem(storageKey(section, userSlug), JSON.stringify(layouts))
  } catch {
    /* ignore quota errors */
  }
}

export function resetLayouts(section: string, userSlug: string | undefined) {
  try {
    localStorage.removeItem(storageKey(section, userSlug))
    localStorage.removeItem(legacyStorageKey(section, userSlug))
  } catch {
    /* ignore */
  }
}

/**
 * Flow cards left-to-right across the given column count, wrapping rows.
 * Returns a Layout[] suitable for a single breakpoint.
 */
function flowLayout(cards: GridCard[], cols: number): Layout[] {
  const out: Layout[] = []
  let x = 0
  let y = 0
  let rowHeight = GRID_SCALE
  for (const card of cards) {
    const w = Math.min((card.defaultW ?? 1) * GRID_SCALE, cols)
    const h = (card.defaultH ?? 1) * GRID_SCALE
    if (x + w > cols) {
      x = 0
      y += rowHeight
      rowHeight = GRID_SCALE
    }
    out.push({
      i: card.id, x, y, w, h,
      minW: GRID_SCALE, minH: GRID_SCALE,
      maxW: cols, maxH: 4 * GRID_SCALE,
    })
    x += w
    rowHeight = Math.max(rowHeight, h)
  }
  return out
}

/** Build a full Layouts object (all breakpoints) from a card list. */
export function buildDefaultLayouts(cards: GridCard[]): Layouts {
  const layouts: Layouts = {}
  ;(Object.keys(DASHBOARD_GRID_COLS) as Breakpoint[]).forEach(bp => {
    layouts[bp] = flowLayout(cards, DASHBOARD_GRID_COLS[bp])
  })
  return layouts
}

/**
 * Merge saved layouts with a fresh default for any cards the user has added
 * since they last saved. Drops entries for cards that no longer exist.
 */
export function reconcileLayouts(cards: GridCard[], saved: Layouts | null): Layouts {
  const defaults = buildDefaultLayouts(cards)
  if (!saved) return defaults
  const cardIds = new Set(cards.map(c => c.id))
  const merged: Layouts = {}
  ;(Object.keys(DASHBOARD_GRID_COLS) as Breakpoint[]).forEach(bp => {
    const savedBp = saved[bp] ?? []
    const defaultBp = defaults[bp] ?? []
    const kept = savedBp.filter(l => cardIds.has(l.i))
    const keptIds = new Set(kept.map(l => l.i))
    const appended = defaultBp
      .filter(l => !keptIds.has(l.i))
      .map(l => {
        // Place new cards below existing ones so they don't overlap
        const maxY = kept.reduce((m, c) => Math.max(m, c.y + c.h), 0)
        return { ...l, y: l.y + maxY }
      })
    merged[bp] = [...kept, ...appended]
  })
  return merged
}
