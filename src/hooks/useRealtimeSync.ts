import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRealtimeBus } from '../lib/realtimeBus'
import { LAB_REFETCH_WINDOW_MS, coalesceCalls, refetchesOnLabChange } from '../lib/realtimeRefetch'

export function useRealtimeSync() {
  const queryClient = useQueryClient()
  const lastVersionRef = useRef<string>('0')

  // useCallback so this has a stable identity across renders — otherwise
  // every effect below that references it would need to re-subscribe on
  // every render just because a new function was created.
  const coalesced = useMemo(() => coalesceCalls(() => {
    queryClient.invalidateQueries({
      predicate: refetchesOnLabChange,
    })
  }, LAB_REFETCH_WINDOW_MS), [queryClient])
  const invalidateAll = useCallback(() => coalesced.call(), [coalesced])
  useEffect(() => () => coalesced.cancel(), [coalesced])
  // One write reaches this tab twice: the socket at once, then the version poll
  // up to 25 s later. Prod, 3 days to 2026-11-06: 830 version bumps, ~1,570 task
  // list reads. The socket having spoken since the last version change means the
  // poll's change is already refetched (PB #9033). A socket that is down never
  // sets this, so the poll still carries every change on its own.
  const socketSpokeRef = useRef(false)

  // Phase 2: WebSocket via Durable Object (instant, ~1s). Shares the single
  // realtimeBus socket with presence/typing/intent hooks.
  useEffect(() => {
    const bus = getRealtimeBus()
    const stop = bus.subscribe((data) => {
      const msg = data as { type?: string }
      if (msg && typeof msg === 'object' && msg.type) {
        // Ignore presence/typing/intent chatter — those don't invalidate
        // query cache.
        const ignore = ['presence-ping', 'presence-leave', 'typing-start', 'typing-stop', 'intent', 'intent-leave']
        if (ignore.includes(msg.type)) return
        // 'data' is the all-invalidate sentinel broadcast by notifyClients().
        // invalidateQueries({queryKey:['data']}) matched no real query key;
        // call with no filter instead so every cache entry is refreshed.
        if (msg.type === 'data') {
          socketSpokeRef.current = true
          invalidateAll()
        } else {
          queryClient.invalidateQueries({ queryKey: [msg.type] })
        }
      } else {
        invalidateAll()
      }
    })
    return stop
  }, [queryClient, invalidateAll])

  // Phase 1: Polling — /api/version is cheap; 15s gives acceptable cross-tab
  // latency without thrashing. NOTIFICATION_HUB is wired in wrangler.toml
  // (binding present since Phase 2); both WS push and polling are active.
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
      if (socketSpokeRef.current) socketSpokeRef.current = false
      else invalidateAll()
    }
    if (data) {
      lastVersionRef.current = data
    }
  }, [data, queryClient, invalidateAll])

  // BroadcastChannel: instant same-device tab sync
  useEffect(() => {
    const bc = new BroadcastChannel('mnccore-sync')
    bc.onmessage = () => invalidateAll()
    return () => bc.close()
  }, [queryClient, invalidateAll])
}

