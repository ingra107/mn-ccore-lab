/**
 * useLabHealthSignals — aggregates signals for the Lab Health composite score.
 *
 * Signals sourced from existing API hooks so we piggyback on queries the
 * Dashboard already issues (no extra network round-trips in practice).
 *
 * Manuscripts live on the `projects` table with a non-Published `stage`; a
 * "stalled" manuscript is one whose `stage_updated_at` / `updated_at` is
 * older than 30 days (matches the Manuscripts page definition).
 */
import { useMemo } from 'react'
import {
  useTasks,
  useProjects,
  useGrants,
  useExpiringRegulatory,
  useMenteeMilestones,
} from './useApiData'
import { isOverdue } from '../lib/dateUtils'
import type { TaskRow, MenteeMilestoneRow } from '../lib/api'
import type { Project, Grant } from '../data/types'

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

  const { data: tasks, isLoading: tasksLoading } = useTasks(undefined, { enabled })
  const { data: projects, isLoading: projectsLoading } = useProjects(undefined, { enabled })
  const { data: grants, isLoading: grantsLoading } = useGrants()
  const { data: regulatory, isLoading: regLoading } = useExpiringRegulatory(60)
  const { data: mentees, isLoading: menteesLoading } = useMenteeMilestones()

  return useMemo(() => {
    // Deliberately live — recomputes whenever any query result changes, and
    // every downstream check (overdue/stalled/expiring) should track real
    // time rather than freeze at mount.
    // eslint-disable-next-line react-hooks/purity -- see comment above
    const now = Date.now()

    const overdueCount = (tasks ?? []).filter((t: TaskRow) => !t.completed && isOverdue(t.due_date, t.status)).length

    const stalledManuscriptCount = (projects ?? []).filter((p: Project) => {
      if (!p.stage || p.stage === 'published') return false
      // Only count research-output stages, not all projects
      const manuscriptStages = ['idea', 'data_collection', 'analysis', 'data_analysis', 'writing', 'submitted', 'review']
      if (!manuscriptStages.includes(p.stage)) return false
      return daysInStage(p) > STALLED_THRESHOLD_DAYS
    }).length

    const stalledMenteeCount = (mentees ?? []).filter((m: MenteeMilestoneRow) => {
      if (!m.due_date) return false
      if (m.status === 'completed' || m.status === 'done') return false
      const d = new Date(m.due_date).getTime()
      return !isNaN(d) && d < now
    }).length

    // Grants whose period end lands within the next 60 days.
    const grantDeadlineCount = (grants ?? []).filter((g: Grant) => {
      const deadline = g.end_date
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

    const loading = tasksLoading || projectsLoading || grantsLoading || regLoading || menteesLoading

    return {
      overdueCount,
      regulatoryExpiringCount,
      stalledManuscriptCount,
      stalledMenteeCount,
      grantDeadlineCount,
      inactive,
      loading,
    }
  }, [tasks, projects, grants, regulatory, mentees, tasksLoading, projectsLoading, grantsLoading, regLoading, menteesLoading])
}
