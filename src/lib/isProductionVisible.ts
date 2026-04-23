// Predicate to filter QA test fixtures from production-facing surfaces.
// Toggle off via Settings → Show debug/test items (localStorage `showDebugItems=true`).

// Leading underscore is optional: matches both `test_delete_...` AND
// `_TEST_DELETE_...` (the seed-script variant). Prior regex with no
// `_?` missed the uppercase-leading-underscore form, which is what
// Round 4 surfaced on Ask the Lab / Decisions / Meeting Prep.
const HIDDEN_TITLE_PATTERNS = [
  /^_?test_delete_/i,
  /^deep-audit-/i,
  /___cli_edit$/i,
  /^test\s*q\b/i,
  /^test$/i,
  /^test\s+(question|decision|item|task)\b/i,
  /^@claude\s+hi$/i,
]

// Cache the localStorage read — this predicate is called per-row across
// 600+ tasks on hot filter paths (Dashboard, ActivityPage, Personal).
// localStorage.getItem is ~1µs but the reads add up and also invalidate
// some browser caches. We refresh on 'storage' events so the Settings
// toggle still works cross-tab.
let cachedDebugEnabled: boolean | null = null
function readDebugFromStorage(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('showDebugItems') === 'true'
  } catch {
    return false
  }
}
function debugItemsEnabled(): boolean {
  if (cachedDebugEnabled === null) {
    cachedDebugEnabled = readDebugFromStorage()
    if (typeof window !== 'undefined') {
      // Cross-tab sync: another tab toggles the setting -> invalidate.
      window.addEventListener('storage', (e) => {
        if (e.key === 'showDebugItems') cachedDebugEnabled = e.newValue === 'true'
      })
      // Same-tab toggle from Settings dispatches a custom event.
      window.addEventListener('showDebugItems-changed', () => {
        cachedDebugEnabled = readDebugFromStorage()
      })
    }
  }
  return cachedDebugEnabled
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
  '_test_delete_',      // matches `_TEST_DELETE_...` after toLowerCase()
  'deep-audit-',        // broader than -sync- to cover -probe- too
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
