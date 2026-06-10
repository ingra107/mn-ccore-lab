// useOpenParam — shared deep-link consumer primitive (S1, 2026-06-09).
//
// Generators across the app emit deep-links that carry a target id in a search
// param (e.g. `/portal/my-tasks?open=<taskId>`, `/portal/projects/<slug>?openTask=<id>`,
// `/portal/decisions?open=<id>`). Before this hook there were SIX generators and
// ZERO consumers — every search→task / ⌘K→task / copy-link / context-menu link
// silently dead-ended. This hook is the one consumer primitive every surface
// adopts.
//
// Contract:
//   - Reads `key` from the URL search params.
//   - Waits until `ready` (the target collection has loaded) so it doesn't fire
//     against an empty cache on first render and lose the link.
//   - Fires `onOpen(id)` exactly ONCE per distinct param value.
//   - Strips the param immediately after consuming (replace, not push) so a
//     back-nav doesn't re-trigger the open and the URL stays clean.
//
// Usage:
//   useOpenParam('open', (id) => setDrawer(id), { ready: !tasksQuery.isLoading })
//
// If `onOpen` should only run when the target actually exists in the data, pass
// a `ready` that already accounts for that (or have onOpen no-op on a miss) —
// the param is stripped regardless once consumed so a stale id can't wedge the
// URL forever.

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

interface UseOpenParamOptions {
  /**
   * Gate consumption until the target data is available. Defaults to true
   * (consume on first render). Pass `!query.isLoading` so the open fires once
   * the collection that contains the target has resolved.
   */
  ready?: boolean
}

export function useOpenParam(
  key: string,
  onOpen: (id: string) => void,
  options: UseOpenParamOptions = {},
) {
  const { ready = true } = options
  const [searchParams, setSearchParams] = useSearchParams()
  // Track the last value we consumed so we only fire once per distinct id even
  // across re-renders before the strip lands.
  const consumedRef = useRef<string | null>(null)
  // Keep the latest onOpen without making it a dependency (callers often pass an
  // inline closure).
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    if (!ready) return
    const value = searchParams.get(key)
    if (!value) return
    if (consumedRef.current === value) return
    consumedRef.current = value
    onOpenRef.current(value)
    // Strip the consumed param; preserve every other param.
    const next = new URLSearchParams(searchParams)
    next.delete(key)
    setSearchParams(next, { replace: true })
  }, [ready, key, searchParams, setSearchParams])
}
