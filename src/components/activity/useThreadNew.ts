// useThreadNew -- the "New" tag on a collapsed thread, and the read-marker.
//
// New = the thread's newest reply is by someone else AND newer than the viewer's
// server-side entity_seen.last_seen_at for the entity (the API sends it as
// `seen_at` on /api/seen/unseen, snapshotted the first time it arrives because
// the page marks the entity seen on open and would clear it a moment later).
// A per-browser marker (localStorage, written when the thread is opened by the
// summary row OR the Reply button) refines it: once you have read up to the
// newest reply here, the tag stays off even though the server's marker is
// entity-wide. Entities the viewer never opened have no seen_at, so no New.

import { useState } from 'react'
import { useUnseenActivity } from '../../hooks/useEntitySeen'
import type { ActivityEntryItemRow } from './activityRender'

const KEY = (rootId: string) => `thread-seen:${rootId}`

function readLocal(rootId: string): string | null {
  try { return localStorage.getItem(KEY(rootId)) } catch { return null }
}
function writeLocal(rootId: string, ts: string): void {
  try { localStorage.setItem(KEY(rootId), ts) } catch { /* storage off: New just stays */ }
}

export function useThreadNew(root: ActivityEntryItemRow, viewerSlug: string) {
  const { data: unseen } = useUnseenActivity()
  const bucket = root.entity_type === 'task' ? unseen?.tasks
    : root.entity_type === 'day' ? unseen?.days
    : root.entity_type === 'project' ? unseen?.projects
    : root.entity_type === 'meeting' ? unseen?.meetings
    : undefined
  const [snap, setSnap] = useState<{ seenAt: string | null } | null>(null)
  if (snap === null && unseen) setSnap({ seenAt: bucket?.get(root.entity_id)?.seen_at ?? null })
  const [local, setLocal] = useState<string | null>(() => readLocal(root.id))

  const last = root.last_reply_at ?? null
  const byOther = !!root.last_reply_actor && root.last_reply_actor !== viewerSlug
  const serverNew = !!last && byOther && !!snap?.seenAt && last > snap.seenAt
  const hasNew = serverNew && !(local && last && local >= last)

  /** Record that the thread was read up to its newest reply (or `newest` if a loaded reply is newer). */
  const markRead = (newest?: string | null) => {
    const ts = [last, newest].filter((t): t is string => !!t).sort().pop()
    if (!ts) return
    writeLocal(root.id, ts)
    setLocal(ts)
  }
  return { hasNew, markRead }
}
