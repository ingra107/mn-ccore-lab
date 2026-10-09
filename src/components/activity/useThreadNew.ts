// useThreadNew -- the "New" tag on a collapsed thread, and the read-marker.
//
// New = the thread's newest reply is by someone else AND newer than the viewer's
// server-side entity_seen.last_seen_at for the entity (the API sends it as
// `seen_at` on /api/seen/unseen, snapshotted the first time it arrives because
// the page marks the entity seen on open and would clear it a moment later).
// A per-thread read marker refines it: once you have read up to the newest
// reply, the tag stays off even though the entity marker is entity-wide.
// Entities the viewer never opened have no seen_at, so no New.
//
// The per-thread marker is SERVER-side since schema-v122 (activity_thread_seen,
// GET/POST /api/thread-seen), so reading a thread on the laptop clears its New
// on the phone too (Nick, 2026-10-09). It replaced a localStorage marker that
// stayed on the device that wrote it.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUnseenActivity } from '../../hooks/useEntitySeen'
import type { ActivityEntryItemRow } from './activityRender'

const THREAD_SEEN_KEY = ['thread-seen'] as const

/** root_id -> the newest reply timestamp the viewer has read, from the server. */
export function useThreadSeenMap() {
  return useQuery<Map<string, string>>({
    queryKey: THREAD_SEEN_KEY,
    queryFn: async () => {
      const res = await fetch('/api/thread-seen')
      if (!res.ok) return new Map()
      const json = await res.json() as { data?: { root_id: string; read_up_to: string }[] }
      return new Map((json.data ?? []).map((r) => [r.root_id, r.read_up_to]))
    },
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function useThreadNew(root: ActivityEntryItemRow, viewerSlug: string) {
  const { data: unseen } = useUnseenActivity()
  const { data: marks } = useThreadSeenMap()
  const queryClient = useQueryClient()
  const bucket = root.entity_type === 'task' ? unseen?.tasks
    : root.entity_type === 'day' ? unseen?.days
    : root.entity_type === 'project' ? unseen?.projects
    : root.entity_type === 'meeting' ? unseen?.meetings
    : undefined
  const [snap, setSnap] = useState<{ seenAt: string | null } | null>(null)
  if (snap === null && unseen) setSnap({ seenAt: bucket?.get(root.entity_id)?.seen_at ?? null })

  const last = root.last_reply_at ?? null
  const readUpTo = marks?.get(root.id) ?? null
  // last_reply_at/actor come from the server already excluding the Hermes
  // "Thinking..." placeholder and using answered_at for Hermes replies.
  const byOther = !!root.last_reply_actor && root.last_reply_actor !== viewerSlug
  const serverNew = !!last && byOther && !!snap?.seenAt && last > snap.seenAt
  const hasNew = serverNew && !(readUpTo && last && readUpTo >= last)

  /** Record that the thread was read up to its newest reply (or `newest` if a loaded reply is newer). */
  const markRead = (newest?: string | null) => {
    const ts = [last, newest].filter((t): t is string => !!t).sort().pop()
    if (!ts || (readUpTo && readUpTo >= ts)) return
    // Show it read at once; the server keeps the later of the two if another
    // device got there first.
    queryClient.setQueryData<Map<string, string>>(THREAD_SEEN_KEY, (prev) => new Map(prev ?? []).set(root.id, ts))
    void fetch('/api/thread-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root_id: root.id, read_up_to: ts }),
    }).catch(() => { /* offline: the tag reappears on the next refetch, nothing is lost */ })
  }
  return { hasNew, markRead }
}
