import { useCallback } from 'react'
import { useUserPref } from './useUserPref'

/**
 * T-29 Lab Preferences — per-person thresholds for staleness / "Needs your
 * attention" surfaces. Individual triage preferences, not shared lab config,
 * so each person has their own; stored on the server (pref 'labprefs',
 * useUserPref) so they are the same on every device the person signs in on
 * (PB #911: these change WHAT is flagged stale).
 *
 * P2-9 (2026-06-09) — ONE staleness mechanism. "Stale" everywhere means
 * days-since-meaningful-movement, but with sensible per-domain default
 * thresholds (Nick decision #4): task ~10d, manuscript ~30d, project ~30d.
 * Every stale chip / filter / sort reads these; Projects "needs attention"
 * staleness reconciles to projectStaleDays (its health score may keep other
 * inputs, but its STALENESS input uses this shared threshold).
 *
 * Defaults: manuscriptReview=7d, manuscriptStale=30d, taskStale=10d, projectStale=30d.
 */
export interface LabPrefs {
  manuscriptsReviewDays: number
  manuscriptsStaleDays: number
  taskStaleDays: number
  projectStaleDays: number
}

const DEFAULTS: LabPrefs = {
  manuscriptsReviewDays: 7,
  manuscriptsStaleDays: 30,
  taskStaleDays: 10,
  projectStaleDays: 30,
}

function clampInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  if (Number.isNaN(n) || n < 0) return fallback
  return Math.min(365, Math.floor(n))
}

/** A stored value (any shape, any build) as well-formed prefs. */
function validate(stored: unknown): LabPrefs {
  const p = (stored && typeof stored === 'object' ? stored : {}) as Partial<LabPrefs>
  return {
    manuscriptsReviewDays: clampInt(p.manuscriptsReviewDays, DEFAULTS.manuscriptsReviewDays),
    manuscriptsStaleDays: clampInt(p.manuscriptsStaleDays, DEFAULTS.manuscriptsStaleDays),
    taskStaleDays: clampInt(p.taskStaleDays, DEFAULTS.taskStaleDays),
    projectStaleDays: clampInt(p.projectStaleDays, DEFAULTS.projectStaleDays),
  }
}

export function useLabPrefs() {
  const [prefs, setPrefs, reset] = useUserPref<LabPrefs>('labprefs', DEFAULTS, validate)

  const update = useCallback((patch: Partial<LabPrefs>) => {
    setPrefs((prev) => validate({ ...prev, ...patch }))
  }, [setPrefs])

  return { prefs, update, reset, defaults: DEFAULTS }
}
