import { useQuery } from '@tanstack/react-query'
import type { ProductStageCount } from '../lib/projectStage'

// GET /api/analytics/pi-dashboard: the Lab overview's one read for commitments,
// grants, trainee pubs, publications per year and the products-by-stage rollup.
// The route is open to every signed-in member; the per-person engagement list
// and the days-to-done figures come back empty for a non-PI (api/routes/pi-dashboard.ts),
// so a block that shows them gates on isPi itself.

export interface PIDashboardData {
  commitments: { total: number; completed: number; overdue: number }
  responseMetrics: {
    median_days: number
    median_days_recent: number
    median_days_prior: number
    trend: 'improving' | 'slowing' | 'stable' | 'insufficient_data'
    total_tasks: number
  }
  menteeVelocity: Array<{ slug: string; name: string; pub_count: number; rate: number; first_year: number | null }>
  grantPipeline: { total: number; pending: number; active: number; active_funding: number }
  teamEngagement: Array<{ slug: string; actions: number; comments: number; updates: number; completions: number; score: number }>
  pubsByQuarter: Array<{ year: number; quarter?: string; count: number }>
  grantsFunnel: { submitted: number; active: number }
  /** Live products of ACTIVE projects, by kind and stage, on the viewer's own
   *  project handle: the one scope every products-by-stage bar uses. */
  productsByStage: ProductStageCount[]
}

export function usePIDashboard(enabled = true) {
  return useQuery({
    queryKey: ['pi-dashboard'],
    enabled,
    queryFn: async () => {
      const res = await fetch('/api/analytics/pi-dashboard')
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`) as Error & { status: number }
        err.status = res.status
        throw err
      }
      const json = await res.json() as { data: PIDashboardData }
      return json.data
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
