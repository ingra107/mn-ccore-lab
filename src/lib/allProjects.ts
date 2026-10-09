// allProjects.ts -- the site admin's "Show all projects" state (#145).
//
// Projects work like Slack channels: you see a project only if you are on it,
// Nick included. The one exception is a switch on the Projects page, Nick only,
// off on every page load, for cleaning out projects of people who left. The
// Worker enforces it (api/lib/viewer-db.ts, header X-Hub-All-Projects); this
// module only remembers the switch and sends the header.
//
// State is a module variable, never localStorage or sessionStorage: a reload
// is a fresh page, so the switch is off, and it can never become a default.
//
// The header goes on through ONE wrapper around window.fetch, installed once in
// main.tsx. About 120 call sites use fetch directly, so a per-call or
// fetchApi-only change would leave most requests unfiltered while the banner
// says "unfiltered". A server that is not told (or a user who is not the admin)
// ignores the header.

import { useSyncExternalStore } from 'react'

export const ALL_PROJECTS_HEADER = 'X-Hub-All-Projects'

let on = false
const listeners = new Set<() => void>()

export function getAllProjectsOn(): boolean {
  return on
}

export function setAllProjectsOn(next: boolean): void {
  if (next === on) return
  on = next
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** React view of the switch. */
export function useAllProjectsOn(): boolean {
  return useSyncExternalStore(subscribe, getAllProjectsOn, () => false)
}

function isSameOriginApi(input: RequestInfo | URL): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    const u = new URL(raw, window.location.origin)
    return u.origin === window.location.origin && u.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

let installed = false

/** Wrap window.fetch once so every same-origin /api/ request carries the
 *  header while the switch is on. Safe to call twice. */
export function installAllProjectsFetch(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!on || !isSameOriginApi(input)) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(ALL_PROJECTS_HEADER, '1')
    return original(input, { ...init, headers })
  }
}
