import { useCallback, useEffect, useState } from 'react'

/**
 * T-29 Lab Preferences — per-user thresholds for "Needs your attention"
 * groupings on the Manuscripts page. Stored in localStorage (not D1) since
 * these are individual triage preferences, not shared lab config.
 *
 * Defaults from the spec ¶2: review=7d, stale=30d.
 */
export interface LabPrefs {
  manuscriptsReviewDays: number
  manuscriptsStaleDays: number
}

const LS_KEY = 'mnccore.labprefs.v1'
const DEFAULTS: LabPrefs = { manuscriptsReviewDays: 7, manuscriptsStaleDays: 30 }

function readPrefs(): LabPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<LabPrefs>
    return {
      manuscriptsReviewDays: clampInt(parsed.manuscriptsReviewDays, DEFAULTS.manuscriptsReviewDays),
      manuscriptsStaleDays: clampInt(parsed.manuscriptsStaleDays, DEFAULTS.manuscriptsStaleDays),
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
