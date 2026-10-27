// usePulse -- the What's new / Lab pulse payload (#156) for the top-bar pill.
// One GET per five minutes and on window focus, NOT on every lab write
// (src/lib/realtimeRefetch.ts); never rides /api/version,
// which is edge-cached and must not carry per-user data (Rule 25).
import { useQuery } from '@tanstack/react-query'
import type { PulsePayload } from '../../shared/pulse'
import { weekStartIso } from '../lib/pulsePill'

export const PULSE_QUERY_KEY = ['pulse'] as const

export function usePulse() {
  return useQuery<PulsePayload>({
    queryKey: PULSE_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(`/api/pulse?week_start=${encodeURIComponent(weekStartIso(new Date()))}`)
      if (!res.ok) throw new Error(`pulse ${res.status}`)
      return ((await res.json()) as { data: PulsePayload }).data
    },
    staleTime: 5 * 60_000,
    // Lab-wide and in every tab: not refetched on every write in the lab.
    meta: { labChangeRefetch: false },
    refetchOnWindowFocus: true,
    retry: false,
  })
}
