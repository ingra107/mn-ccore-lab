import { useCallback, useEffect, useState } from 'react'

/**
 * T-29 Lab Preferences — per-user thresholds for staleness / "Needs your
 * attention" surfaces. Stored in localStorage (not D1) since these are
 * individual triage preferences, not shared lab config.
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

const LS_KEY = 'mnccore.labprefs.v1'
const DEFAULTS: LabPrefs = {
  manuscriptsReviewDays: 7,
  manuscriptsStaleDays: 30,
  taskStaleDays: 10,
  projectStaleDays: 30,
}

function readPrefs(): LabPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<LabPrefs>
    return {
      manuscriptsReviewDays: clampInt(parsed.manuscriptsReviewDays, DEFAULTS.manuscriptsReviewDays),
      manuscriptsStaleDays: clampInt(parsed.manuscriptsStaleDays, DEFAULTS.manuscriptsStaleDays),
      taskStaleDays: clampInt(parsed.taskStaleDays, DEFAULTS.taskStaleDays),
      projectStaleDays: clampInt(parsed.projectStaleDays, DEFAULTS.projectStaleDays),
    }
  } catch {
    return DEFAULTS
  }
}

function clampInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  if (Number.isNaN(n) || n < 0) return fallback
  return Math.min(365, Math.floor(n))
}

export function useLabPrefs() {
  const [prefs, setPrefs] = useState<LabPrefs>(() => readPrefs())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) setPrefs(readPrefs()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((patch: Partial<LabPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      next.manuscriptsReviewDays = clampInt(next.manuscriptsReviewDays, DEFAULTS.manuscriptsReviewDays)
      next.manuscriptsStaleDays = clampInt(next.manuscriptsStaleDays, DEFAULTS.manuscriptsStaleDays)
      next.taskStaleDays = clampInt(next.taskStaleDays, DEFAULTS.taskStaleDays)
      next.projectStaleDays = clampInt(next.projectStaleDays, DEFAULTS.projectStaleDays)
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* unavailable */ }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    try { localStorage.removeItem(LS_KEY) } catch { /* unavailable */ }
    setPrefs(DEFAULTS)
  }, [])

  return { prefs, update, reset, defaults: DEFAULTS }
}
