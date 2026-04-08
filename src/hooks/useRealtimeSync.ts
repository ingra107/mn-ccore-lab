import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PartySocket from 'partysocket'

// WebSocket host for Durable Object — set after deploying hub-realtime Worker
const WS_HOST = import.meta.env.VITE_WS_HOST || ''

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

  // Phase 1: Polling fallback (60s with WS, 10s without)
  const { data } = useQuery({
    queryKey: ['_version'],
    queryFn: async () => {
      const res = await fetch('/api/version')
      const json = await res.json() as { version: string }
      return json.version
    },
    refetchInterval: WS_HOST ? 60_000 : 10_000,
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

/** Call after local mutations to notify other tabs instantly */
export function notifyLocalTabs() {
  try {
    const bc = new BroadcastChannel('mnccore-sync')
    bc.postMessage('changed')
    bc.close()
  } catch { /* BroadcastChannel not supported */ }
}
