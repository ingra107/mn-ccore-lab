import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PartySocket from 'partysocket'

// WebSocket host for Durable Object
const WS_HOST = import.meta.env.VITE_WS_HOST || 'hub-realtime.nicholas-ingraham.workers.dev'

export function useRealtimeSync() {
  const queryClient = useQueryClient()
  const lastVersionRef = useRef<string>('0')

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== '_version',
    })
  }

  // Phase 2: WebSocket via Durable Object (instant, ~1s)
  useEffect(() => {
    if (!WS_HOST) return // DO not configured yet — fallback to polling

    const ws = new PartySocket({
      host: WS_HOST,
      room: 'mnccore',
      party: 'notification-hub',
    })

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type) {
          queryClient.invalidateQueries({ queryKey: [data.type] })
        } else {
          invalidateAll()
        }
      } catch {
        invalidateAll()
      }
    })

    return () => ws.close()
  }, [queryClient])

  // Phase 1: Polling — /api/version is cheap; 15s gives acceptable cross-tab
  // latency without thrashing. Deep-audit Suite 7 confirmed tab-to-tab edits
  // weren't propagating through the WS path in <20s: the DO service binding
  // (NOTIFICATION_HUB) isn't wired in wrangler.toml, so api/lib/notify.ts
  // early-returns. Until that binding ships, polling is the real sync path.
  //
  // refetchIntervalInBackground: true is required — React Query's default
  // pauses the polling interval when the tab isn't focused. Real users
  // park the Hub in background tabs between focus events; without this
  // flag they wouldn't see any teammate's edit until they refocused.
  // Deep-audit Suite 7 uncovered this (Playwright's headless contexts
  // are also "unfocused" so polling stayed silent in testing too).
  const { data } = useQuery({
    queryKey: ['_version'],
    queryFn: async () => {
      const res = await fetch('/api/version')
      const json = await res.json() as { version: string }
      return json.version
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  })

  useEffect(() => {
    if (data && data !== lastVersionRef.current && lastVersionRef.current !== '0') {
      invalidateAll()
    }
    if (data) {
      lastVersionRef.current = data
    }
  }, [data, queryClient])

  // BroadcastChannel: instant same-device tab sync
  useEffect(() => {
    const bc = new BroadcastChannel('mnccore-sync')
    bc.onmessage = () => invalidateAll()
    return () => bc.close()
  }, [queryClient])
}

