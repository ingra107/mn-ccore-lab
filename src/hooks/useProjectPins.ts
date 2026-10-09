// useProjectPins -- the signed-in person's pinned projects, stored on the
// server (GET/POST/DELETE /api/pins, api/routes/pins.ts), so a pin follows the
// person to every device (Nick, 2026-10-09). Read by the sidebar's "My
// projects" list and written by the Projects page star.
//
// Pins used to live in this browser's localStorage under 'pinned-projects'
// (a JSON array of slugs). The first time the server list loads, each of
// those slugs is posted once. A slug is done when the server answers 2xx or
// 404 (a project this person cannot see, or one since deleted: nothing to
// pin). A network failure, 401/403 or 5xx is not an answer about the pin, so
// that slug stays in the key and the next load retries it (lib/pinImport.ts).
// The key is removed only when nothing is left to retry.
//
// Not to be confused with useWatchlist (localStorage 'mnccore-watchlist-v1',
// the WatchButton): that is a separate, browser-local feature.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { unsettledPins } from '../lib/pinImport'

export const LEGACY_PINS_KEY = 'pinned-projects'
const PINS_KEY = ['project-pins'] as const

export interface ProjectPin {
  project_id: string
  slug: string | null
  pinned_at: string | null
}

async function fetchPins(): Promise<ProjectPin[]> {
  const res = await fetch('/api/pins')
  if (!res.ok) throw new Error(`fetch failed: ${res.status} /api/pins`)
  const body = await res.json() as { data?: ProjectPin[] }
  return body.data ?? []
}

async function postPin(project: string): Promise<boolean> {
  const status = await postPinStatus(project)
  return status !== null && status >= 200 && status < 300
}

/** The HTTP status of a pin POST, or null when the request never got an answer. */
async function postPinStatus(project: string): Promise<number | null> {
  try {
    const res = await fetch('/api/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
    })
    return res.status
  } catch {
    return null
  }
}

async function deletePin(project: string): Promise<boolean> {
  const res = await fetch(`/api/pins/${encodeURIComponent(project)}`, { method: 'DELETE' })
  return res.ok
}

/** The slugs in the old localStorage key, or [] when there are none. */
export function readLegacyPins(): string[] {
  try {
    const raw = localStorage.getItem(LEGACY_PINS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string' && s.length > 0) : []
  } catch {
    return []
  }
}

export function useProjectPins() {
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const enabled = isAuthenticated && !!user?.slug && user.isMember !== false
  const query = useQuery({
    queryKey: PINS_KEY,
    queryFn: fetchPins,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // One-time import of the localStorage pins, after the server list loads.
  const imported = useRef(false)
  useEffect(() => {
    if (imported.current || !query.isSuccess) return
    imported.current = true
    const legacy = readLegacyPins()
    if (legacy.length === 0) {
      try { localStorage.removeItem(LEGACY_PINS_KEY) } catch { /* storage off: nothing to clear */ }
      return
    }
    const have = new Set((query.data ?? []).flatMap((p) => [p.slug, p.project_id]))
    const todo = legacy.filter((s) => !have.has(s))
    void Promise.all(todo.map(postPinStatus)).then((statuses) => {
      const retry = unsettledPins(todo, statuses)
      try {
        if (retry.length === 0) localStorage.removeItem(LEGACY_PINS_KEY)
        else localStorage.setItem(LEGACY_PINS_KEY, JSON.stringify(retry))
      } catch { /* storage off */ }
      if (todo.length > retry.length) void queryClient.invalidateQueries({ queryKey: PINS_KEY })
    })
  }, [query.isSuccess, query.data, queryClient])

  const toggle = useMutation({
    mutationFn: async ({ slug, pin }: { slug: string; pin: boolean }) => {
      const ok = pin ? await postPin(slug) : await deletePin(slug)
      if (!ok) throw new Error(pin ? 'Could not pin the project' : 'Could not unpin the project')
    },
    onMutate: async ({ slug, pin }) => {
      await queryClient.cancelQueries({ queryKey: PINS_KEY })
      const prev = queryClient.getQueryData<ProjectPin[]>(PINS_KEY)
      queryClient.setQueryData<ProjectPin[]>(PINS_KEY, (old = []) => (pin
        ? (old.some((p) => p.slug === slug) ? old : [...old, { project_id: slug, slug, pinned_at: null }])
        : old.filter((p) => p.slug !== slug && p.project_id !== slug)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(PINS_KEY, ctx.prev)
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: PINS_KEY }) },
  })

  const pinnedSlugs = useMemo(
    () => new Set((query.data ?? []).map((p) => p.slug).filter((s): s is string => !!s)),
    [query.data],
  )
  const togglePin = useCallback((slug: string) => {
    toggle.mutate({ slug, pin: !pinnedSlugs.has(slug) })
  }, [toggle, pinnedSlugs])

  return { pins: query.data ?? [], pinnedSlugs, togglePin, isLoading: query.isLoading, isError: query.isError }
}
