// useMailWatch -- the mail watcher's snapshot for Nick's Today rail (schema-v151).
//
// GET /api/mail-watch/snapshot is Nick-only on the server (403 for anyone
// else); the query runs only for the site admin, so no member's tab asks.
// The snapshot always carries its freshness: the card never draws mail
// without saying how old it is.

import { useQuery } from '@tanstack/react-query'

export type MailFreshnessState = 'current' | 'partial' | 'late' | 'down' | 'off_hours' | 'never'

export interface MailWatchSnapshot {
  freshness: {
    state: MailFreshnessState
    last_checked_at: string | null
    last_complete_at: string | null
    missed_since: string | null
    next_slot_at: string | null
    threads: number
    unchecked: number
  }
  alert_error: string | null
  threads: Array<{
    thread_id: string
    gmail_url: string
    tasks: Array<{ id: string; title: string; status: string | null }>
    observed_at: string | null
    ball: 'nick' | 'them' | 'unknown'
    last_from: string | null
    last_at: string | null
    excerpt: string | null
  }>
}

export function useMailWatch(enabled: boolean) {
  return useQuery<MailWatchSnapshot | null>({
    queryKey: ['mail-watch-snapshot'],
    queryFn: async () => {
      const res = await fetch('/api/mail-watch/snapshot')
      if (!res.ok) throw new Error(`mail-watch snapshot ${res.status}`)
      return await res.json() as MailWatchSnapshot
    },
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
