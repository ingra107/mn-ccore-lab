// Predicate to filter QA test fixtures from production-facing surfaces.
// Toggle off via Settings → Show debug/test items (localStorage `showDebugItems=true`).

const HIDDEN_TITLE_PATTERNS = [
  /^test_delete_/i,
  /^deep-audit-sync-/i,
  /___cli_edit$/i,
]

function debugItemsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('showDebugItems') === 'true'
  } catch {
    return false
  }
}

export function isProductionVisible(title: string | null | undefined): boolean {
  if (debugItemsEnabled()) return true
  if (!title) return true
  return !HIDDEN_TITLE_PATTERNS.some((re) => re.test(title))
}

export function isProductionVisibleActivity(activity: {
  title?: string | null
  description?: string | null
}): boolean {
  if (debugItemsEnabled()) return true
  return isProductionVisible(activity.title) && isProductionVisible(activity.description)
}
