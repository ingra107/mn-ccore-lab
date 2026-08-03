// lazyRoute — code-split a route or heavy component so that a STALE CHUNK
// heals itself instead of dead-ending in an error boundary.
//
// The failure it exists for (2026-08-03, reported by Nick):
//
//   Failed to fetch dynamically imported module:
//   https://mn-ccore-lab.pages.dev/assets/ProjectDetail-CtV-H_BT.js
//
// A tab left open across a deploy is running build A. Vite names every chunk
// by content hash, and a Pages deploy replaces the whole asset set, so build
// A's chunk filenames stop existing. The first time that tab visits a route it
// has not loaded yet, the dynamic import 404s. Worse: Pages answers a missing
// asset with the SPA fallback — `200 text/html` — so the browser is handed an
// HTML document where it asked for a module, and the import rejects.
//
// React's lazy() CACHES the rejected promise. That is why the error boundary's
// "Try Again" button could never work for this class: re-rendering replays the
// same settled rejection. Only a document reload can fix it, so that is what
// this does — once, then it gets out of the way.
//
// Note there is no `vite:preloadError` listener here. That event only fires for
// <link rel="modulepreload"> failures, and vite.config.ts sets
// `build.modulePreload: false`, so it can never fire in this app. The import
// rejection below is the only signal that exists.

import { lazy } from 'react'
import type { ComponentType } from 'react'

const RELOAD_KEY = 'mnccore:stale-chunk-reload'

// One reload per episode. If the reload did NOT fix it, the failure is a real
// bug (a genuinely broken chunk, an offline network) and a second reload would
// just start a loop — so inside this window we let the error boundary render.
// Past the window we treat it as a fresh episode, because a later deploy is a
// new stale-chunk event and deserves its own recovery.
const RELOAD_WINDOW_MS = 30_000

// Chrome:  "Failed to fetch dynamically imported module: <url>"
// Firefox: "error loading dynamically imported module"
// Safari:  "Importing a module script failed."
const STALE_CHUNK_MESSAGE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i

export function isStaleChunkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return STALE_CHUNK_MESSAGE.test(message)
}

/** Pure half of the guard, so the reload policy is testable without a DOM. */
export function shouldReload(now: number, lastReloadAt: string | null): boolean {
  if (lastReloadAt === null) return true
  const previous = Number(lastReloadAt)
  if (!Number.isFinite(previous)) return true
  return now - previous > RELOAD_WINDOW_MS
}

/**
 * Reload the document to pick up the current build. Returns whether a reload
 * was actually started, so the caller knows whether to swallow the error or
 * let it reach the boundary.
 */
export function recoverFromStaleChunk(): boolean {
  let lastReloadAt: string | null = null
  try {
    lastReloadAt = sessionStorage.getItem(RELOAD_KEY)
  } catch {
    // Storage is unavailable (private mode, blocked cookies). Fall through
    // with lastReloadAt = null: one reload attempt is still better than a
    // guaranteed dead end, and without storage we cannot do better than that.
  }

  if (!shouldReload(Date.now(), lastReloadAt)) return false

  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Same as above — proceed without the loop guard rather than not recover.
  }
  window.location.reload()
  return true
}

/**
 * Drop-in replacement for React.lazy for every route and code-split component.
 * Enforced by ESLint: bare `lazy(` is banned outside this file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRoute<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      if (isStaleChunkError(err) && recoverFromStaleChunk()) {
        // The reload is in flight. Return a promise that never settles so React
        // keeps showing the Suspense fallback for the few milliseconds until the
        // document is replaced, rather than flashing an error screen.
        return new Promise<{ default: T }>(() => {})
      }
      throw err
    }),
  )
}
