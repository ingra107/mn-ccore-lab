// useUserPref -- a view preference that follows the signed-in person to every
// device (PB backlog #911). Nick, 2026-07-23: signed in should mean an
// identical view on both laptops.
//
// The value lives on the server (GET/PUT/DELETE /api/user-prefs, table
// user_prefs, schema-v143). Which keys exist is shared/userPrefKeys.ts: the
// hook takes a `UserPrefKey`, so a device-local setting (theme, density, fold
// state) cannot be passed here at all.
//
// One store for every key, one GET per page load (every key at once), and a
// refetch when the window regains focus: switch laptops and the view catches
// up. A write updates the screen at once and reaches the server 300 ms after
// the last change to that key (a column drag is many changes, one PUT). A
// refused or failed write puts the last server value back and says so on the
// console; nothing is kept that the server did not take.
//
// localStorage is only a cache here (`mnccore.pref.<key>`): the last server
// snapshot, read before the GET answers and when it fails (offline). Signed
// out, writes stay in that cache.
//
// Seeding the old per-device keys (the first load after this shipped). Every
// pref used to live in its own localStorage key (LEGACY_SOURCES below). Until
// the server confirms it holds them, those values show as they always did.
// After the first successful GET, once per page load:
//   - the server has no row: the device's value is PUT;
//   - a `set` family (saved views): the two lists are unioned by identity and
//     PUT when the device added anything;
//   - a `scalar` and the server has a row: the server wins, the device value
//     is dropped (the server holds the person's latest choice).
// An old key is removed only when its PUT settles (2xx, or a 404 that will
// never change: lib/pinImport.ts's rule, reused). A network failure, 401/403
// or 5xx keeps it for the next load to retry.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAuth } from './useAuth'
import { userPrefFamily, type UserPrefKey, type UserPrefFamily } from '../../shared/userPrefKeys'
import { pinPostSettled } from '../lib/pinImport'
import { scaleLegacyLayouts } from '../lib/dashboardLayout'
import type { Layouts } from 'react-grid-layout'

const CACHE_PREFIX = 'mnccore.pref.'
const PUT_DEBOUNCE_MS = 300

/** local: not signed in (cache only). loading: first GET out. ready: server read. offline: GET failed. */
export type UserPrefsStatus = 'local' | 'loading' | 'ready' | 'offline'

// ── the old per-device keys ──────────────────────────────────────────────

interface LegacySource {
  /** The pref key this old localStorage key seeds, or null when it is not one of ours. */
  match: (lsKey: string, slug: string | null) => string | null
  decode: (raw: string) => unknown
}

const asJson = (raw: string) => JSON.parse(raw) as unknown
const asText = (raw: string) => raw

const exact = (ls: string, key: string, decode: (raw: string) => unknown): LegacySource =>
  ({ match: (k) => (k === ls ? key : null), decode })
const prefixed = (ls: string, key: string, decode: (raw: string) => unknown): LegacySource =>
  ({ match: (k) => (k.startsWith(ls) && k.length > ls.length ? key + k.slice(ls.length) : null), decode })
// mnccore-dashboard-layouts-v{1,2}:<slug>:<section>, the signed-in person's only.
const layout = (version: 'v1' | 'v2', decode: (raw: string) => unknown): LegacySource => ({
  match: (k, slug) => {
    const m = /^mnccore-dashboard-layouts-(v[12]):([^:]+):([^:]+)$/.exec(k)
    return m && m[1] === version && slug && m[2] === slug ? `dashboard.layout.${m[3]}` : null
  },
  decode,
})

/** Order matters: an earlier source for the same pref wins (v2 layouts over v1). */
export const LEGACY_SOURCES: readonly LegacySource[] = [
  exact('mnccore.labprefs.v1', 'labprefs', asJson),
  prefixed('mnccore.savedViews.v1.', 'savedViews.', asJson),
  exact('mnccore.today.defaultView', 'today.defaultView', asText),
  exact('mnccore.today.dueWindow', 'today.dueWindow', asText),
  prefixed('table-config-', 'tableConfig.', asJson),
  exact('mnccore-dashboard-cards', 'dashboard.cards', asJson),
  exact('mnccore-dashboard-pinned', 'dashboard.pinned', asJson),
  exact('mnccore-dashboard-tab', 'dashboard.tab', asText),
  layout('v2', asJson),
  layout('v1', (raw) => scaleLegacyLayouts(JSON.parse(raw) as Layouts)),
]

/**
 * The Lab overview's per-browser "defaults version" (Dashboard.tsx, retired
 * with this hook). A browser still below 4 held cards and pins that the old
 * code would have wiped on its next load, so they are not seeded.
 */
const DASHBOARD_VERSION_KEY = 'mnccore-dashboard-version'
const DASHBOARD_DEFAULTS_VERSION = 4

export interface LegacyEntry {
  key: string
  value: unknown
  /** Every old localStorage key that seeds this pref (removed when it settles). */
  lsKeys: string[]
}

/** The old keys present in `storage` that seed a listed pref, grouped by pref. */
export function readLegacy(storage: Storage, slug: string | null): LegacyEntry[] {
  const out = new Map<string, LegacyEntry>()
  const names: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k) names.push(k)
  }
  const staleDashboard = (() => {
    const v = storage.getItem(DASHBOARD_VERSION_KEY)
    return v !== null && Number(v) < DASHBOARD_DEFAULTS_VERSION
  })()
  for (const src of LEGACY_SOURCES) {
    for (const lsKey of names) {
      const key = src.match(lsKey, slug)
      if (!key || !userPrefFamily(key)) continue
      const entry = out.get(key)
      if (entry) { entry.lsKeys.push(lsKey); continue }
      let value: unknown
      try { value = src.decode(storage.getItem(lsKey) ?? '') } catch { value = undefined }
      if (staleDashboard && (key === 'dashboard.cards' || key === 'dashboard.pinned')) value = undefined
      // undefined = unreadable: nothing to seed, and the key is dropped below.
      out.set(key, { key, value, lsKeys: [lsKey] })
    }
  }
  return [...out.values()]
}

const identityOf = (family: UserPrefFamily) => (item: unknown): string =>
  family.identity && item && typeof item === 'object'
    ? String((item as Record<string, unknown>)[family.identity])
    : JSON.stringify(item)

export interface SeedStep {
  key: string
  lsKeys: string[]
  /** The value to PUT, or absent when the old keys are simply dropped. */
  put?: unknown
}

/**
 * What the first load does with each old key, given what the server holds.
 * Pure: the store runs the PUTs and removals.
 */
export function planSeed(legacy: readonly LegacyEntry[], server: ReadonlyMap<string, unknown>): SeedStep[] {
  return legacy.map(({ key, value, lsKeys }) => {
    const family = userPrefFamily(key)
    if (!family || value === undefined) return { key, lsKeys }
    if (!server.has(key)) return { key, lsKeys, put: value }
    if (family.merge === 'scalar') return { key, lsKeys }
    const have = server.get(key)
    if (!Array.isArray(have) || !Array.isArray(value)) return { key, lsKeys }
    const id = identityOf(family)
    const seen = new Set(have.map(id))
    const added = value.filter((item) => !seen.has(id(item)))
    return added.length > 0 ? { key, lsKeys, put: [...have, ...added] } : { key, lsKeys }
  })
}

// ── the store ────────────────────────────────────────────────────────────

const values = new Map<string, unknown>()     // what the screen shows
const confirmed = new Map<string, unknown>()  // what the server last said
const provisional = new Set<string>()         // shown from an old key, not yet on the server
const touchedAt = new Map<string, number>()   // tick of the last local write per key
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
let tick = 0
let status: UserPrefsStatus = 'local'
let slug: string | null = null
let initialised = false
let inflight: Promise<void> | null = null
let seeded = false
let focusBound = false

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function notify() { for (const l of listeners) l() }

function writeCache(key: string, value: unknown) {
  const s = storage()
  if (!s) return
  try {
    if (value === undefined) s.removeItem(CACHE_PREFIX + key)
    else s.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch { /* quota or storage off: the server copy is the one that matters */ }
}

function init() {
  if (initialised) return
  initialised = true
  const s = storage()
  if (!s) return
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i)
    if (!k?.startsWith(CACHE_PREFIX)) continue
    const key = k.slice(CACHE_PREFIX.length)
    if (!userPrefFamily(key)) continue
    try { values.set(key, JSON.parse(s.getItem(k) ?? 'null')) } catch { /* unreadable cache entry: ignored */ }
  }
  showLegacy(s)
}

/** Old keys the cache does not cover show as they always did, until seeded. */
function showLegacy(s: Storage) {
  for (const e of readLegacy(s, slug)) {
    if (e.value === undefined || values.has(e.key)) continue
    values.set(e.key, e.value)
    provisional.add(e.key)
  }
}

async function load(): Promise<void> {
  if (inflight) return inflight
  const startTick = tick
  inflight = (async () => {
    try {
      const res = await fetch('/api/user-prefs')
      if (!res.ok) throw new Error(`GET /api/user-prefs answered ${res.status}`)
      const body = await res.json() as { data?: Array<{ key: string; value: unknown }> }
      const server = new Map((body.data ?? []).map((r) => [r.key, r.value] as const))
      const changedSince = (k: string) => (touchedAt.get(k) ?? -1) > startTick || timers.has(k)
      for (const [k, v] of server) {
        confirmed.set(k, v)
        if (changedSince(k)) continue
        values.set(k, v)
        provisional.delete(k)
        writeCache(k, v)
      }
      for (const k of [...values.keys()]) {
        if (server.has(k) || changedSince(k) || provisional.has(k)) continue
        values.delete(k)
        confirmed.delete(k)
        writeCache(k, undefined)
      }
      status = 'ready'
      notify()
      if (!seeded) {
        seeded = true
        void seed(server)
      }
    } catch (e) {
      if (status !== 'ready') status = 'offline'
      console.warn('[user-prefs] could not read preferences from the server; showing this device\'s copy', e)
      notify()
    } finally {
      inflight = null
    }
  })()
  return inflight
}

async function seed(server: ReadonlyMap<string, unknown>) {
  const s = storage()
  if (!s) return
  const drop = (lsKeys: string[]) => { for (const k of lsKeys) { try { s.removeItem(k) } catch { /* storage off */ } } }
  for (const step of planSeed(readLegacy(s, slug), server)) {
    if (step.put === undefined || (touchedAt.get(step.key) ?? -1) >= 0) {
      // Server wins, the old value is unreadable, or the person already
      // changed this pref on this page load: the old key has nothing to add.
      if (provisional.delete(step.key) && !server.has(step.key) && !timers.has(step.key)) {
        values.delete(step.key)
        notify()
      }
      drop(step.lsKeys)
      continue
    }
    let statusCode: number | null = null
    let stored: unknown
    try {
      const res = await fetch(`/api/user-prefs/${encodeURIComponent(step.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: step.put }),
      })
      statusCode = res.status
      if (res.ok) stored = ((await res.json()) as { data?: { value?: unknown } }).data?.value
    } catch { statusCode = null }
    if (statusCode !== null && statusCode >= 200 && statusCode < 300) {
      confirmed.set(step.key, stored)
      provisional.delete(step.key)
      if (!timers.has(step.key)) { values.set(step.key, stored); writeCache(step.key, stored) }
      notify()
    }
    if (pinPostSettled(statusCode)) drop(step.lsKeys)
    else console.warn(`[user-prefs] could not copy this device's ${step.key} to the server (${statusCode ?? 'network'}); retrying on the next load`)
  }
  // The version flag has no pref of its own: it goes once the cards and pins it guarded are gone.
  if (s.getItem('mnccore-dashboard-cards') === null && s.getItem('mnccore-dashboard-pinned') === null) drop([DASHBOARD_VERSION_KEY])
}

function flush(key: string) {
  timers.delete(key)
  const value = values.get(key)
  const url = `/api/user-prefs/${encodeURIComponent(key)}`
  // keepalive: a write flushed as the page closes still reaches the server.
  const req = value === undefined
    ? fetch(url, { method: 'DELETE', keepalive: true })
    : fetch(url, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) })
  void req.then(async (res) => {
    if (!res.ok) throw new Error(`${res.status}`)
    const stored = value === undefined ? undefined : ((await res.json()) as { data?: { value?: unknown } }).data?.value
    if (stored === undefined) confirmed.delete(key)
    else confirmed.set(key, stored)
    provisional.delete(key)
  }).catch((e) => {
    console.warn(`[user-prefs] the server did not take ${key}; putting back its last saved value`, e)
    if (timers.has(key)) return // a newer change is queued; it will be sent instead
    const back = confirmed.get(key)
    if (back === undefined) values.delete(key)
    else values.set(key, back)
    writeCache(key, back)
    notify()
  })
}

// ── the public surface ───────────────────────────────────────────────────

/** Turn server sync on for the signed-in person (idempotent). */
export function enableUserPrefSync(personSlug: string) {
  init()
  if (slug !== personSlug) {
    slug = personSlug
    const s = storage()
    if (s) showLegacy(s)
  }
  if (status === 'local') {
    status = 'loading'
    notify()
    void load()
  }
  if (!focusBound && typeof window !== 'undefined') {
    focusBound = true
    window.addEventListener('focus', () => { if (status !== 'local') void load() })
    // A change still inside its 300 ms wait is sent now, not lost with the page.
    window.addEventListener('pagehide', () => {
      for (const [key, t] of [...timers]) { clearTimeout(t); flush(key) }
    })
  }
}

/** The stored value of a pref (undefined = never set: use the default). Synchronous. */
export function readUserPref(key: UserPrefKey): unknown {
  init()
  return values.get(key)
}

/** Set a pref's whole value (undefined = back to the default). */
export function writeUserPref(key: UserPrefKey, value: unknown) {
  init()
  tick += 1
  touchedAt.set(key, tick)
  if (value === undefined) values.delete(key)
  else values.set(key, value)
  provisional.delete(key)
  writeCache(key, value)
  notify()
  if (status === 'local') return
  const t = timers.get(key)
  if (t) clearTimeout(t)
  timers.set(key, setTimeout(() => flush(key), PUT_DEBOUNCE_MS))
}

export function userPrefsStatus(): UserPrefsStatus { return status }

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function useSyncEnabled() {
  const { user, isAuthenticated } = useAuth()
  const personSlug = isAuthenticated && user?.slug && user.isMember !== false ? user.slug : null
  useEffect(() => { if (personSlug) enableUserPrefSync(personSlug) }, [personSlug])
}

/** 'loading' until the first server read answers (then 'ready' or 'offline'); 'local' signed out. */
export function useUserPrefsStatus(): UserPrefsStatus {
  useSyncEnabled()
  return useSyncExternalStore(subscribe, userPrefsStatus, userPrefsStatus)
}

/**
 * `[value, set, reset]` for one pref. `fallback` must be referentially stable
 * (a module constant or a memo); `validate` turns a stored value (possibly
 * from an older build) into a well-formed one.
 */
export function useUserPref<T>(
  key: UserPrefKey,
  fallback: T,
  validate?: (stored: unknown) => T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  useSyncEnabled()
  const raw = useSyncExternalStore(subscribe, () => readUserPref(key), () => undefined)
  const value = useMemo(
    () => (raw === undefined ? fallback : validate ? validate(raw) : (raw as T)),
    [raw, fallback, validate],
  )
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const stored = readUserPref(key)
    const prev = stored === undefined ? fallback : validate ? validate(stored) : (stored as T)
    const out = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
    writeUserPref(key, out)
  }, [key, fallback, validate])
  const reset = useCallback(() => writeUserPref(key, undefined), [key])
  return [value, set, reset]
}

/** Test seam only: forget everything this module holds. */
export function _resetUserPrefsForTests() {
  values.clear(); confirmed.clear(); provisional.clear(); touchedAt.clear()
  for (const t of timers.values()) clearTimeout(t)
  timers.clear(); listeners.clear()
  tick = 0; status = 'local'; slug = null; initialised = false; inflight = null; seeded = false
}
