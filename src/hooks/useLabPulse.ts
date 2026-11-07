import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import type { PubsPulse, SpeedPulse, EngagementPulse } from '../lib/labPulse'

// Lab pulse reads three PI-only routes (api/routes/pi-dashboard.ts answers a
// member 403). The hooks refuse to fire for a non-PI instead of every caller
// remembering to, the way usePBSessionStats does: isPi starts false until
// /api/auth hydrates, so a PI's queries start a moment later.

function usePulseQuery<T>(key: string) {
  const enabled = useAuth().user.isPi
  return useQuery({
    queryKey: ['lab-pulse', key],
    enabled,
    queryFn: async () => {
      const res = await fetch(`/api/analytics/${key}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return ((await res.json()) as { data: T }).data
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    // Year-scale aggregates (6K rows a read, PB #9033): fresh on their own
    // staleTime, not re-run on every write anywhere in the lab.
    meta: { labChangeRefetch: false },
  })
}

export const usePubsPulse = () => usePulseQuery<PubsPulse>('mentee-velocity')
export const useSpeedPulse = () => usePulseQuery<SpeedPulse>('response-time')
export const useEngagementPulse = () => usePulseQuery<EngagementPulse>('team-engagement')
