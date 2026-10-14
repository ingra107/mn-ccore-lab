/**
 * useLabHealthSignals — aggregates signals for the Lab Health composite score.
 *
 * Signals sourced from existing API hooks so we piggyback on queries the
 * Dashboard already issues (no extra network round-trips in practice).
 *
 * A manuscript is a PRODUCT (kind manuscript, schema-v124), not a project
 * stage (contract phase step 1: rollups count products). A "stalled"
 * manuscript is one still before submission whose rung was entered more than
 * 30 days ago (its own stage_entered_at; matches the Manuscripts page).
 */
import { useMemo } from 'react'
import {
  useRecentTasks,
  useExpiringRegulatory,
  useMenteeMilestones,
} from './useApiData'
import { isOverdueWork } from '../lib/taskStats'
import type { TaskRow, MenteeMilestoneRow } from '../lib/api'
import { useAllProjectProducts } from './useProjectProducts'
import { useGrantProducts } from './useGrantProducts'
import type { GrantProduct } from '../lib/grants'

const STALLED_THRESHOLD_DAYS = 30

function daysInStage(p: { stage_entered_at?: string | null; stage_updated_at?: string | null; updated_at?: string | null; created_at?: string | null }): number {
  const ref = p.stage_entered_at ?? p.stage_updated_at ?? p.updated_at ?? p.created_at
  if (!ref) return 0
  const then = new Date(ref).getTime()
  if (isNaN(then)) return 0
  return Math.floor((Date.now() - then) / 86_400_000)
}

interface LabHealthSignals {
  overdueCount: number
  regulatoryExpiringCount: number
  stalledManuscriptCount: number
  stalledMenteeCount: number
  grantDeadlineCount: number
  inactive: boolean
  loading: boolean
}

export function useLabHealthSignals(options?: { enabled?: boolean }): LabHealthSignals {
  const enabled = options?.enabled ?? true

  const { data: tasks, isLoading: tasksLoading } = useRecentTasks(undefined, { enabled })
  const { data: productData, isLoading: productsLoading } = useAllProjectProducts()
  const { data: grantData, isLoading: grantsLoading } = useGrantProducts()
  const grants = grantData?.data
  const { data: regulatory, isLoading: regLoading } = useExpiringRegulatory(60)
  const { data: mentees, isLoading: menteesLoading } = useMenteeMilestones()

  return useMemo(() => {
    // Deliberately live — recomputes whenever any query result changes, and
    // every downstream check (overdue/stalled/expiring) should track real
    // time rather than freeze at mount.
    // eslint-disable-next-line react-hooks/purity -- see comment above
    const now = Date.now()

    const overdueCount = (tasks ?? []).filter((t: TaskRow) => isOverdueWork(t)).length

    // Manuscript products of the viewer's live projects (the bulk read's
    // scope), on a rung the team still drives (revisions and accepted wait on
    // a journal and never counted).
    const workingRungs = new Set(['idea', 'data_collection', 'data_analysis', 'writing', 'submitted'])
    const stalledManuscriptCount = Object.values(productData?.byProject ?? {})
      .flatMap((rows) => rows ?? [])
      .filter((r) => r.kind === 'manuscript' && workingRungs.has(r.stage) && daysInStage(r) > STALLED_THRESHOLD_DAYS)
      .length

    const stalledMenteeCount = (mentees ?? []).filter((m: MenteeMilestoneRow) => {
      if (!m.due_date) return false
      if (m.status === 'completed' || m.status === 'done') return false
      const d = new Date(m.due_date).getTime()
      return !isNaN(d) && d < now
    }).length

    // Grants with a date inside the next 60 days: an award's period end, an
    // application's submission due date.
    const grantDeadlineCount = (grants ?? []).filter((g: GrantProduct) => {
      if (g.bucket === 'ended') return false
      const deadline = g.kind === 'award' ? g.period_end : g.deadline
      if (!deadline) return false
      const d = new Date(deadline).getTime()
      if (isNaN(d)) return false
      const diffDays = (d - now) / 86_400_000
      return diffDays >= 0 && diffDays < 60
    }).length

    const regulatoryExpiringCount = Array.isArray(regulatory) ? regulatory.length : 0

    // Inactivity: if we have no tasks updated within the last 3 days across the team,
    // flag it. This is a cheap proxy — proper activity_log analysis can come later.
    const threeDaysAgo = now - 3 * 86_400_000
    const recentTaskUpdate = (tasks ?? []).some((t: TaskRow) => {
      const u = t.updated_at || t.created_at
      if (!u) return false
      const d = new Date(u).getTime()
      return !isNaN(d) && d >= threeDaysAgo
    })
    const inactive = (tasks?.length ?? 0) > 0 && !recentTaskUpdate

    const loading = tasksLoading || productsLoading || grantsLoading || regLoading || menteesLoading

    return {
      overdueCount,
      regulatoryExpiringCount,
      stalledManuscriptCount,
      stalledMenteeCount,
      grantDeadlineCount,
      inactive,
      loading,
    }
  }, [tasks, productData, grants, regulatory, mentees, tasksLoading, productsLoading, grantsLoading, regLoading, menteesLoading])
}
