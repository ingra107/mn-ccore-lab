import type { Layout, Layouts } from 'react-grid-layout'

// Breakpoints are measured against the grid CONTAINER width (not window),
// because react-grid-layout's WidthProvider sizes against the inner element.
// At a 1440px window with a 250px sidebar the content area is ~1000px.
export const DASHBOARD_GRID_BREAKPOINTS = { lg: 960, md: 720, sm: 480, xs: 0 } as const
export const DASHBOARD_GRID_COLS = { lg: 4, md: 3, sm: 2, xs: 1 } as const
export const DASHBOARD_GRID_ROW_HEIGHT = { lg: 260, md: 220, sm: 200, xs: 180 } as const

type Breakpoint = keyof typeof DASHBOARD_GRID_COLS

export interface GridCard {
  id: string
  /** Optional default width (grid cols). Defaults to 1. */
  defaultW?: number
  /** Optional default height (rows). Defaults to 1. */
  defaultH?: number
}

const LAYOUT_STORAGE_PREFIX = 'mnccore-dashboard-layouts-v1'

function storageKey(section: string, userSlug: string | undefined) {
  return `${LAYOUT_STORAGE_PREFIX}:${userSlug || 'anon'}:${section}`
}

export function loadSavedLayouts(section: string, userSlug: string | undefined): Layouts | null {
  try {
    const raw = localStorage.getItem(storageKey(section, userSlug))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Layouts
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
  let rowHeight = 1
  for (const card of cards) {
    const w = Math.min(card.defaultW ?? 1, cols)
    const h = card.defaultH ?? 1
    if (x + w > cols) {
      x = 0
      y += rowHeight
      rowHeight = 1
    }
    out.push({ i: card.id, x, y, w, h, minW: 1, minH: 1, maxW: cols, maxH: 4 })
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
