// Predicate to filter QA test fixtures from production-facing surfaces.
// Toggle off via Settings → Show debug/test items (localStorage `showDebugItems=true`).

const HIDDEN_TITLE_PATTERNS = [
  /^test_delete_/i,
  /^deep-audit-sync-/i,
  /___cli_edit$/i,
  /^test\s*q\b/i,
  /^test$/i,
  /^test\s+(question|decision|item|task)\b/i,
  /^@claude\s+hi$/i,
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

// Activity rows carry the related entity's title inside free-text
// descriptions (e.g. "Nick created task: test q"). Strict prefix matching
// misses those — so for activity we also do a substring contains check
// against a short allow-list of known fixture phrases.
const HIDDEN_ACTIVITY_SUBSTRINGS = [
  'test_delete_',
  'deep-audit-sync-',
  '___cli_edit',
  ': test q',
  ': test$',
  '@claude hi',
  'test decision',
]

export function isProductionVisibleActivity(activity: {
  title?: string | null
  description?: string | null
}): boolean {
  if (debugItemsEnabled()) return true
  if (!isProductionVisible(activity.title)) return false
  if (!isProductionVisible(activity.description)) return false
  const haystack = (activity.description || '').toLowerCase()
  return !HIDDEN_ACTIVITY_SUBSTRINGS.some(s => haystack.includes(s.replace('$', '').toLowerCase()))
}
