// Free windows: the gap windows a timed task block can legally land in, and the
// resolver that picks a landing spot across them (cross-gap drag).
// Used by useTaskBlockDrag (block move) and TimelineGrid (passes the windows).

import type { PlannedSlot } from './constants'

// ── Free-window type ─────────────────────────────────────────────────────────
// A gap window that a task block can legally land in (cross-gap drag).
export interface FreeWindow {
  startMin: number
  endMin: number
  slot: PlannedSlot
}

// ── Cross-gap position resolver ──────────────────────────────────────────────
// Given a raw minute value (after applying deltaY), find the best legal landing
// position across ALL free windows for the day.
//
// Rules:
//   1. rawMin inside a free window → clamp to [w.startMin, w.endMin - dur].
//   2. rawMin inside a meeting (between two windows) → nearest window by edge distance.
//   3. Before all windows → clamp to first window start.
//   4. After all windows → clamp to last window endMin - dur.
//
// Returns { slot, clampedMin } or null when freeWindows is empty.
export function resolveAcrossGaps(
  rawMin: number,
  dur: number,
  freeWindows: FreeWindow[],
): { slot: PlannedSlot; clampedMin: number } | null {
  if (freeWindows.length === 0) return null

  // 1. rawMin inside a free window
  for (const w of freeWindows) {
    if (rawMin >= w.startMin && rawMin < w.endMin) {
      const clamped = Math.max(w.startMin, Math.min(w.endMin - dur, rawMin))
      return { slot: w.slot, clampedMin: clamped }
    }
  }

  // 2–4. rawMin in a meeting or outside all windows — find nearest window by edge
  let bestWindow = freeWindows[0]
  let bestDist = Infinity
  for (const w of freeWindows) {
    const distToStart = Math.abs(rawMin - w.startMin)
    const distToEnd = Math.abs(rawMin - (w.endMin - dur))
    const dist = Math.min(distToStart, distToEnd)
    if (dist < bestDist) {
      bestDist = dist
      bestWindow = w
    }
  }
  const clamped = Math.max(bestWindow.startMin, Math.min(bestWindow.endMin - dur, rawMin))
  return { slot: bestWindow.slot, clampedMin: clamped }
}

