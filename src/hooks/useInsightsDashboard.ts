import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import type { ProductStageCount } from '../lib/projectStage'

// GET /api/insights/dashboard[?week=YYYY-Www]: stalled projects, the PI's
// metrics, the this-week workload heatmap, the velocity scatter and the stalled
// registry. PI-only (the route answers a member 403), so the hook does not fire
// for a non-PI and a block asks `forbidden` to tell a 403 from a real failure.

export interface InsightsDashboardData {
  week: string
  metrics: {
    // Each metric carries an 8-week trailing sparkline (oldest first); flat for
    // snapshot-only metrics where history cannot be rebuilt.
    stalledProjects: { count: number; deltaWoW: number; sparkline?: number[] }
    tasksPerPerson: { avg: number; total: number; distribution: { slug: string; count: number }[]; sparkline?: number[] }
    manuscriptsInRevision: { count: number; awaitingReplyOver7d: number; sparkline?: number[] }
    grantsInPipeline: { count: number; daysToNextDeadline: number | null; sparkline?: number[] }
  }
  workloadHeatmap: { slug: string; days: { mon: number; tue: number; wed: number; thu: number; fri: number } }[]
  pipelineFunnel: ProductStageCount[]
  velocityScatter: { slug: string; title: string; daysSinceUpdate: number; openTasks: number; isOutlier: boolean }[]
  stalledRegistry: { slug: string; title: string; daysIdle: number; openTasks: number }[]
}

/** The query key the Refresh action invalidates. */
export const insightsKey = (apiWeek: string | undefined) => ['insights', 'operational', apiWeek ?? 'current'] as const

/** `apiWeek` is the `?week=` to ask for, or undefined for the current week. */
export function useInsightsDashboard(apiWeek: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: insightsKey(apiWeek),
    enabled: user.isPi,
    queryFn: async () => {
      const url = apiWeek ? `/api/insights/dashboard?week=${encodeURIComponent(apiWeek)}` : '/api/insights/dashboard'
      const res = await fetch(url)
      if (res.status === 403) {
        const err = new Error('PI-only') as Error & { status: number }
        err.status = 403
        throw err
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { data: InsightsDashboardData }
      return body.data
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function isForbidden(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 403
}
