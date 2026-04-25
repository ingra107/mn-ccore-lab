// TodayPage — top-level page that composes the Today landing surface (B2).
// Per HANDOFF §2: this file is just the page shell — data wiring, layout
// scaffold, derived counts. The actual UI sits in src/components/today/.
//
// Routes:
//   /portal/dashboard   → this page
//   /portal/overview    → old card-grid Dashboard renamed Lab Overview
//
// Design language: dark-first, gold/teal/coral accents with assigned meaning
// (CLAUDE.md Rule 59). Click body = expand drawer; drag handle = plan;
// explicit ▶ button = promote (Rule 58).

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTasks, useProjects, useMeetingsApi, useExpiringRegulatory } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { usePageMeta } from '../../hooks/usePageMeta'
import HeartbeatLine from '../../components/HeartbeatLine'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { researchTeam } from '../../data/team'
import { useTodayState } from '../../hooks/useTodayState'
import {
  GROUP_ORDER,
  ACCENT_GOLD, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PAGE_BG, PANEL_BG,
  todayKey, daysSince, formatTodayDate,
  meetingToEvent, isToday, hoursSinceLastSync,
  getGroupForTask,
  type GroupKey, type TodayEvent, type DailyCounts,
} from '../../components/today/constants'
import { PillStrip } from '../../components/today/PillStrip'
import { RightNow } from '../../components/today/RightNowCard'
import { Timeline } from '../../components/today/Timeline'
import { TaskGroup } from '../../components/today/TaskGroup'
import { HermesSuggestsCard } from '../../components/today/rail/HermesSuggestsCard'
import { NeedsAttentionCard } from '../../components/today/rail/NeedsAttentionCard'
import { ProjectsCard } from '../../components/today/rail/ProjectsCard'
import { PulseCard } from '../../components/today/rail/PulseCard'
import type { TaskRow } from '../../lib/api'

export default function TodayPage() {
  usePageMeta('Today · MN-CCORE', 'Operating-day landing — what to work on, who you\'re meeting, what\'s overdue.')
  const { user } = useAuth()
  const userSlug = emailToSlug(user?.email)

  const tasksQuery = useTasks(userSlug ? { assignee: userSlug } : undefined)
  const projectsQuery = useProjects()
  const meetingsQuery = useMeetingsApi()
  const regulatoryQuery = useExpiringRegulatory(60)

  const tasks: TaskRow[] = useMemo(() => (tasksQuery.data ?? []).filter((t) => t.completed === 0 && t.status !== 'done'), [tasksQuery.data])

  const projectsByPid = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; category?: string | null; lastActivity?: string | null }>()
    for (const p of projectsQuery.data ?? []) {
      const entry = { name: p.title ?? p.slug, slug: p.slug, category: p.category ?? null, lastActivity: p.lastActivity ?? null }
      m.set(p.slug, entry)
    }
    return m
  }, [projectsQuery.data])

  const allTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const state = useTodayState(allTaskIds)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])

  // Auto-promote first relevant task on first load when nothing planned and
  // nothing in Right Now. Fixes empty-hero discoverability (eval Issue 2).
  // Picks: longest-overdue → urgent → high → first task. Runs once per
  // task-list change; user's explicit unplan keeps Right Now empty.
  const autoPromotedRef = useRef(false)
  useEffect(() => {
    if (autoPromotedRef.current) return
    if (state.rightNow) { autoPromotedRef.current = true; return }
    if (state.plannedIds().length > 0) { autoPromotedRef.current = true; return }
    if (tasks.length === 0) return
    const today = todayKey()
    const overdue = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    const candidate = overdue[0]
      ?? tasks.find((t) => t.priority === 'urgent')
      ?? tasks.find((t) => t.priority === 'high')
      ?? tasks[0]
    if (candidate) {
      state.promote(candidate.id)
      autoPromotedRef.current = true
    }
  }, [tasks, state])

  // Group bucketing.
  const grouped = useMemo(() => {
    const g: Record<GroupKey, TaskRow[]> = { deep: [], priorities: [], quick: [], pb: [], etl: [] }
    for (const t of tasks) {
      const key = getGroupForTask(t, projectsByPid)
      g[key].push(t)
    }
    return g
  }, [tasks, projectsByPid])

  // Derived counts.
  const overdueTasks = useMemo(() => {
    const today = todayKey()
    return tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today)
  }, [tasks])

  const stalledProjects = useMemo(() => {
    const all = projectsQuery.data ?? []
    return all
      .filter((p) => p.status === 'Active')
      .map((p) => ({ name: p.title ?? p.slug, days: daysSince(p.lastActivity) }))
      .filter((p) => p.days >= 10 && p.days < Infinity)
      .sort((a, b) => b.days - a.days)
  }, [projectsQuery.data])

  const projectsForRail = useMemo(() => {
    const all = projectsQuery.data ?? []
    const allTasks = tasksQuery.data ?? []
    // Per-project: soonest-due open task assigned to current user, used as
    // the "next action" cue. No dedicated column on projects, so derive.
    const nextByProject = new Map<string, { title: string; due: string | null }>()
    for (const t of allTasks) {
      if (t.completed === 1 || t.status === 'done') continue
      if (!t.project_id) continue
      if (userSlug && t.assignee !== userSlug) continue
      const existing = nextByProject.get(t.project_id)
      const aDue = t.due_date ?? '9999-12-31'
      const eDue = existing?.due ?? '9999-12-31'
      if (!existing || aDue < eDue) nextByProject.set(t.project_id, { title: t.title, due: t.due_date ?? null })
    }
    return all
      .filter((p) => p.status === 'Active')
      .map((p) => {
        const next = nextByProject.get(p.slug)
        return { slug: p.slug, name: p.title ?? p.slug, nextAction: next ? next.title.slice(0, 80) : null }
      })
  }, [projectsQuery.data, tasksQuery.data, userSlug])

  const milestones = useMemo(() => {
    const reg = regulatoryQuery.data ?? []
    return reg.map((r: any) => ({ title: r.name ?? r.title ?? 'Regulatory item', days: r.days_until_expiry ?? 0 })).filter((m: { days: number }) => m.days > 0).sort((a: { days: number }, b: { days: number }) => a.days - b.days).slice(0, 5)
  }, [regulatoryQuery.data])

  // Pulse: focus minutes proxy (planned tasks × 30min average), sync staleness, mentees.
  // Mentees = researchTeam slugs (Coordinators / Fellows / Students / Analysts).
  // Each mentee's "next" is the soonest due_date among their assigned tasks; — if none.
  const focusMin = useMemo(() => state.plannedIds().length * 30, [state])
  const syncHours = useMemo(() => hoursSinceLastSync(), [])
  const mentees = useMemo(() => {
    const allTasks = tasksQuery.data ?? []
    return researchTeam.map((m) => {
      const theirs = allTasks.filter((t) => t.assignee === m.slug && t.completed === 0 && t.due_date)
      const soonest = theirs.map((t) => t.due_date as string).sort()[0]
      let next = '—'
      if (soonest) {
        const days = Math.round((new Date(soonest + 'T12:00:00').getTime() - Date.now()) / 86400000)
        next = days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'today' : `${days}d`
      }
      return { name: m.name, next }
    })
  }, [tasksQuery.data])

  // Today events.
  const todaysMeetings: TodayEvent[] = useMemo(() => {
    const all = meetingsQuery.data ?? []
    return all.filter((m) => isToday(m.date)).map(meetingToEvent)
  }, [meetingsQuery.data])

  // Right Now lookup.
  const rightNowTask = state.rightNow ? tasks.find((t) => t.id === state.rightNow) ?? null : null
  const rightNowProject = rightNowTask?.project_id ? projectsByPid.get(rightNowTask.project_id) ?? null : null
  const queueTasks = state.plannedIds()
    .filter((id) => id !== state.rightNow)
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is TaskRow => !!t)
    .map((t) => ({ id: t.id, title: t.title }))

  // Pill counts.
  const today = todayKey()
  const doneTodayCount = tasks.filter((t) => state.done[t.id]).length
    + (tasksQuery.data ?? []).filter((t) => t.completed === 1 && t.completed_at?.slice(0, 10) === today).length
  const counts: DailyCounts = {
    overdue: overdueTasks.length,
    stalled: stalledProjects.length,
    planned: state.plannedIds().length,
    meetings: todaysMeetings.length,
    doneToday: doneTodayCount,
  }

  const isLoading = tasksQuery.isLoading || projectsQuery.isLoading
  const doneTodayDetail = (tasksQuery.data ?? []).filter((t) => t.completed === 1 && t.completed_at?.slice(0, 10) === today)
  const [completedOpen, setCompletedOpen] = useState(false)

  return (
    <div className="b2-grid" style={{ background: PAGE_BG, color: INK, fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', minHeight: '100%' }}>
      <style>{`
        @keyframes b2pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .b2-proj:hover { background: rgba(255,255,255,0.04); }
        .b2-proj-link:hover { color: #5cbcb4 !important; opacity: 1 !important; text-decoration: underline; }
        /* Desktop: 1fr main + 340px right rail. Mobile: stack with rail
           below main (rail collapses to 220px tall horizontal scroll
           cards). 1024 breakpoint matches the data-page tablet
           breakpoint per the columnar table density rules. */
        .b2-grid { display: grid; grid-template-columns: 1fr 340px; }
        .b2-main { padding: 28px 32px; border-right: 1px solid rgba(255,255,255,0.06); min-width: 0; }
        .b2-rail { padding: 28px 20px; background: #0a0f15; overflow-y: auto; }
        @media (max-width: 1024px) {
          .b2-grid { grid-template-columns: 1fr; }
          .b2-main { padding: 20px 16px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .b2-rail { padding: 16px; }
        }
      `}</style>

      <main className="b2-main">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: '#fff', letterSpacing: '-0.03em', margin: 0 }}>Today</h1>
          <HeartbeatLine width={60} height={14} color={ACCENT_GOLD} variant="static" />
          <span style={{ fontSize: 13, color: INK_MUTED }}>{formatTodayDate()}</span>
        </div>
        <div style={{ fontSize: 13, color: INK_DIM, marginBottom: 16 }}>
          Click a task to expand · drag ⋮⋮ to plan · click a meeting for notes.
        </div>

        <PillStrip counts={counts} />

        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: PANEL_BG, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 14 }}>🧠</span>
          <input
            placeholder="Morning thought, quick capture, or @hermes to delegate…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: INK, outline: 'none', fontFamily: 'inherit' }}
          />
          <kbd style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: 10, padding: '2px 6px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: INK_DIM }}>⌘ ⏎</kbd>
        </div>

        <RightNow task={rightNowTask} project={rightNowProject ? { name: rightNowProject.name, slug: rightNowProject.slug } : null} queueTasks={queueTasks} state={state} />

        <Timeline
          events={todaysMeetings}
          tasks={tasks}
          state={state}
          projectsByPid={projectsByPid}
          expandedId={expandedId}
          onExpand={onExpand}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>📋 All today's tasks</h2>
          <span style={{ fontSize: 12, color: INK_DIM }}>click to expand · ⋮⋮ to plan · ▶ to promote</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : (
          GROUP_ORDER.map((gkey) => (
            <TaskGroup
              key={gkey}
              gkey={gkey}
              tasks={grouped[gkey]}
              projectsByPid={projectsByPid}
              state={state}
              expandedId={expandedId}
              onExpand={onExpand}
            />
          ))
        )}

        <div data-b2-completed style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
          <div onClick={() => setCompletedOpen(!completedOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: ACCENT_GREEN }}>✓</span>
            <span style={{ fontSize: 11, color: INK_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
              Completed today ({doneTodayDetail.length + Object.values(state.done).filter(Boolean).length})
            </span>
            <span style={{ color: INK_DIM }}>{completedOpen ? '▾' : '▸'}</span>
          </div>
          {completedOpen && (
            <div style={{ marginTop: 12, paddingLeft: 20 }}>
              {doneTodayDetail.map((t) => (
                <div key={t.id} style={{ fontSize: 12, color: INK_MUTED, padding: '2px 0', paddingLeft: 12, textDecoration: 'line-through' }}>{t.title}</div>
              ))}
              {Object.keys(state.done).filter((id) => state.done[id]).map((id) => {
                const t = tasks.find((x) => x.id === id) ?? (tasksQuery.data ?? []).find((x) => x.id === id)
                if (!t) return null
                return (
                  <div key={id} style={{ fontSize: 12, color: INK_MUTED, padding: '2px 0', paddingLeft: 12, textDecoration: 'line-through' }}>{t.title}</div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      <aside className="b2-rail">
        <HermesSuggestsCard overdueTasks={overdueTasks} stalledProjects={stalledProjects} menteesWithDue={mentees} />
        <NeedsAttentionCard overdueTasks={overdueTasks} stalledProjects={stalledProjects} />
        <ProjectsCard projects={projectsForRail} />
        <PulseCard focusMin={focusMin} syncHours={syncHours} milestones={milestones} mentees={mentees} />
      </aside>
    </div>
  )
}
