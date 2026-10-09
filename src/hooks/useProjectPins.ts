// useProjectPins -- the signed-in person's pinned projects, stored on the
// server (GET/POST/DELETE /api/pins, api/routes/pins.ts), so a pin follows the
// person to every device (Nick, 2026-10-09). Read by the sidebar's "My
// projects" list and written by the Projects page star.
//
// Pins used to live in this browser's localStorage under 'pinned-projects'
// (a JSON array of slugs). The first time the server list loads, each of
// those slugs is posted once and the key is removed, so nobody loses a pin in
// the move. A slug the server refuses (a project this person cannot see, or
// one since deleted) is dropped with the key: there is nothing to pin.
//
// Not to be confused with useWatchlist (localStorage 'mnccore-watchlist-v1',
// the WatchButton): that is a separate, browser-local feature.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'

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
  const res = await fetch('/api/pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  })
  return res.ok
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
    void Promise.all(todo.map((s) => postPin(s).catch(() => false))).then(() => {
      // The key goes once every post has answered, accepted or refused; a
      // refused slug names nothing this person can pin.
      try { localStorage.removeItem(LEGACY_PINS_KEY) } catch { /* storage off */ }
      if (todo.length > 0) void queryClient.invalidateQueries({ queryKey: PINS_KEY })
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
