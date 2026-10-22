// shared/userPrefKeys.ts -- the ONE list of view preferences that follow a
// person to every device (user_prefs, schema-v143; PB backlog #911). Imported
// by BOTH the API (api/routes/userPrefs.ts refuses an unlisted key with 400)
// and the UI (src/hooks/useUserPref.ts takes a `UserPrefKey`, so an unlisted
// key does not compile), the way shared/taskKinds.ts is shared.
//
// Nick, 2026-07-23: signed in should mean an identical view on both laptops.
//
// Each family declares how two devices' values combine the one time they meet
// (the first load after this shipped, when a browser's old localStorage value
// is seeded):
//   scalar  the server's value wins when it has one; the device's is dropped.
//           A view setting is one choice, and the server already holds the
//           person's latest. (Visible cards and pinned cards are scalars too:
//           a card hidden on one laptop must stay hidden, which a union would
//           undo.)
//   set     the two lists are unioned by `identity`, so a saved view made on
//           either laptop survives.
//
// Device-local on purpose, so absent here and unable to sync:
//   mn-ccore-theme / mn-ccore-dark-mode (useDarkMode)  follows each machine's OS
//   density (DensityToggle)                            a screen-size choice
//   mn-ccore-sidebar-collapsed (PortalLayout)          window-width ergonomics
//   ideas-view, calendar-dense-week, collapsible-*     page-local fold/layout toggles
//   pulse-paused, showDebugItems                       per-browser debug switches
//   mnccore-dashboard-clicks                           per-browser usage telemetry
// Adding one later is a row here plus a useUserPref call; no migration.

export type UserPrefMerge = 'scalar' | 'set'

export interface UserPrefFamily {
  /** The whole key, or (with `param`) the prefix before one name segment. */
  readonly key: string
  readonly param: boolean
  readonly merge: UserPrefMerge
  /** For a set: the field naming an item (absent = the item itself). */
  readonly identity?: string
}

export const USER_PREF_FAMILIES = [
  // Lab preferences: the staleness thresholds every stale chip reads.
  { key: 'labprefs', param: false, merge: 'scalar' },
  { key: 'today.defaultView', param: false, merge: 'scalar' },
  { key: 'today.dueWindow', param: false, merge: 'scalar' },
  // savedViews.<page>: the Saved views menu on each page.
  { key: 'savedViews.', param: true, merge: 'set', identity: 'id' },
  // tableConfig.<tableId>: sort, column widths and order, filters.
  { key: 'tableConfig.', param: true, merge: 'scalar' },
  // Lab overview: which cards show, which are pinned, the tab, each grid section's layout.
  { key: 'dashboard.cards', param: false, merge: 'scalar' },
  { key: 'dashboard.pinned', param: false, merge: 'scalar' },
  { key: 'dashboard.tab', param: false, merge: 'scalar' },
  { key: 'dashboard.layout.', param: true, merge: 'scalar' },
] as const satisfies readonly UserPrefFamily[]

type Family = (typeof USER_PREF_FAMILIES)[number]
type KeyOf<F> = F extends { key: infer K extends string; param: true }
  ? `${K}${string}`
  : F extends { key: infer K extends string }
    ? K
    : never

/** A key that may sync. A device-local key is not a member, so it cannot be passed. */
export type UserPrefKey = KeyOf<Family>

/** The name segment of a parameterised key: a page, table or grid section id. */
const PARAM = /^[A-Za-z0-9_-]{1,64}$/

/** Largest value_json the route stores (a Lab overview layout is ~5 KB). */
export const USER_PREF_MAX_BYTES = 32 * 1024

/** The family a key belongs to, or null when the key may not sync. */
export function userPrefFamily(key: string): UserPrefFamily | null {
  for (const f of USER_PREF_FAMILIES as readonly UserPrefFamily[]) {
    if (!f.param && key === f.key) return f
    if (f.param && key.startsWith(f.key) && PARAM.test(key.slice(f.key.length))) return f
  }
  return null
}

/** True when the key is on the list (the route's refusal test). */
export function isUserPrefKey(key: string): key is UserPrefKey {
  return userPrefFamily(key) !== null
}
