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
// 📂▶ Work = open project folder / launch Claude Code.

import { useState, useMemo, useCallback } from 'react'
import { useTasks, useProjects, useMeetingsApi, useExpiringRegulatory, useUserCalendarEvents, usePBSessionStats } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { MNCCORE_PROCESS_URI } from '../../lib/urlClassify'
import { emailToSlug } from '../../lib/emailSlug'
import { usePageMeta } from '../../hooks/usePageMeta'
import HeartbeatLine from '../../components/HeartbeatLine'
import { Button } from '../../components/ui/Button'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { DoneBox } from '../../components/tasks/TaskRow'
import { useTodayView } from '../../hooks/useTodayView'
import { AgendaListView } from '../../components/today/AgendaListView'
import { researchTeam } from '../../data/team'
import { useTodayState } from '../../hooks/useTodayState'
import { useDragAutoScroll } from '../../hooks/useDragAutoScroll'
import {
  GROUP_ORDER,
  ACCENT_GOLD, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PAGE_BG,
  todayKey, daysSince, formatTodayDate,
  meetingToEvent, calendarEventToTodayEvent, isToday, hoursSinceLastSync,
  getGroupForTask, isTaskDone,
  type GroupKey, type TodayEvent, type DailyCounts,
} from '../../components/today/constants'
import { PillStrip } from '../../components/today/PillStrip'
import { Timeline } from '../../components/today/Timeline'
import { PlannedTodaySection } from '../../components/today/PlannedTodaySection'
import { TaskGroup } from '../../components/today/TaskGroup'
import { MorningThoughtCompose } from '../../components/today/MorningThoughtCompose'
import { HermesSuggestsCard } from '../../components/today/rail/HermesSuggestsCard'
import { NeedsAttentionCard } from '../../components/today/rail/NeedsAttentionCard'
import { ProjectsCard } from '../../components/today/rail/ProjectsCard'
import { PulseCard } from '../../components/today/rail/PulseCard'
import type { TaskRow } from '../../lib/api'
import { withAlpha } from '../../lib/taskGrouping'

export default function TodayPage() {
  usePageMeta('Today · MN-CCORE', 'Operating-day landing — what to work on, who you\'re meeting, what\'s overdue.')
  const { user } = useAuth()
  const { launch: launchProcess } = useProtocolLaunch()
  const userSlug = emailToSlug(user?.email)
  // Native HTML5 drag can't scroll the window; without this a below-fold task
  // can't be dragged up to the timeline drop zones. Drag = plan into a slot;
  // the 📌 row button is the no-drag path. (Today drag-to-plan fix, 2026-06-04.)
  useDragAutoScroll()

  const tasksQuery = useTasks(userSlug ? { assignee: userSlug } : undefined)
  const projectsQuery = useProjects()
  const meetingsQuery = useMeetingsApi()
  const regulatoryQuery = useExpiringRegulatory(60)
  const calendarEventsQuery = useUserCalendarEvents()
  // TP-16 (D19): focusMin reads from real PB pomodoro sessions instead of
  // the prior fake `plannedIds × 30` math. Returns 0 if no sessions today.
  const sessionStatsQuery = usePBSessionStats()

  const tasks: TaskRow[] = useMemo(() => (tasksQuery.data ?? []).filter((t) => t.completed === 0 && t.status !== 'done'), [tasksQuery.data])

  // Tasks completed *today* per the cache — the source of truth across every
  // surface (and this page's own optimistic completion). isToday() resolves the
  // (UTC) completed_at to the local calendar date; a bare .slice(0,10) compares
  // the UTC date and drops evening completions in Central time.
  const doneTodayDetail = useMemo(
    () => (tasksQuery.data ?? []).filter((t) => t.completed === 1 && isToday(t.completed_at)),
    [tasksQuery.data],
  )
  const completedTodayIds = useMemo(() => doneTodayDetail.map((t) => t.id), [doneTodayDetail])

  const projectsByPid = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; category?: string | null; lastActivity?: string | null; primary_folder?: string | null }>()
    for (const p of projectsQuery.data ?? []) {
      const entry = { name: p.title ?? p.slug, slug: p.slug, category: p.category ?? null, lastActivity: p.lastActivity ?? null, primary_folder: p.primary_folder ?? null }
      m.set(p.slug, entry)
    }
    return m
  }, [projectsQuery.data])

  const allTaskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  // Workstream B (schema v75): the plan is now SYNCED task columns; useTodayState
  // derives planned from these rows (planned_for/plan_slot/plan_rank) and
  // PATCHes the task on plan/promote/unplan. Pass the open-task rows (a planned
  // task is never done, so the open list is the right derivation source).
  const state = useTodayState(tasks, completedTodayIds)

  // Local done flags that are genuine completions for the "Completed today"
  // surface: NOT already counted by the cache (doneTodayDetail) and whose task
  // has left the open list. Excluding still-open tasks drops a stale flag from a
  // cross-surface reopen and the one-render optimistic flash, so neither is
  // double-counted nor shown twice. Source of truth stays the cache.
  const localDoneIds = useMemo(() => {
    const confirmed = new Set(completedTodayIds)
    const open = new Set(allTaskIds)
    return Object.keys(state.done).filter((id) => state.done[id] && !confirmed.has(id) && !open.has(id))
  }, [state.done, completedTodayIds, allTaskIds])
  // expandedId/onExpand removed from TodayPage (Item 2 fix, 2026-06-22):
  // each surface (Timeline, PlannedTodaySection, AgendaListView, TaskGroup)
  // now owns its own expand state so clicking one instance never expands the
  // same task rendered on a different surface.

  // Lifted dismiss state (#170) — shared across Timeline↔Agenda so toggling
  // views does not reset dismissed meetings.
  const [dismissedEventIds, setDismissedEventIds] = useState<Record<string, boolean>>({})
  const onDismissEvent = useCallback((id: string) => setDismissedEventIds((s) => ({ ...s, [id]: true })), [])
  const onRestoreAllDismissed = useCallback(() => setDismissedEventIds({}), [])

  // Phase 2: Timeline⇄Agenda view toggle. Ephemeral session view + persisted
  // default. The toggle buttons live in the Timeline section header.
  const { view: todayView, setView: setTodayView } = useTodayView()


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
      .filter((p) => p.status === 'active')
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
    // TP-19 (D21): "relevant today" = project has tasks due today/overdue
    // OR a planned-today task OR last activity within 7 days.
    const today = todayKey()
    const sevenDaysAgoMs = Date.now() - 7 * 86400000
    const relevantSlugs = new Set<string>()
    for (const t of allTasks) {
      if (isTaskDone(t)) continue
      if (!t.project_id) continue
      if (userSlug && t.assignee !== userSlug) continue
      const existing = nextByProject.get(t.project_id)
      const aDue = t.due_date ?? '9999-12-31'
      const eDue = existing?.due ?? '9999-12-31'
      if (!existing || aDue < eDue) nextByProject.set(t.project_id, { title: t.title, due: t.due_date ?? null })
      // Relevance signal A: due today OR overdue.
      if (t.due_date && t.due_date.slice(0, 10) <= today) relevantSlugs.add(t.project_id)
      // Relevance signal B: planned-today (covers strip and between-N slots).
      if (state.planned[t.id]) relevantSlugs.add(t.project_id)
    }
    return all
      .filter((p) => p.status === 'active')
      .map((p) => {
        const next = nextByProject.get(p.slug)
        // Relevance signal C: lastActivity within 7d.
        if (p.lastActivity) {
          const t = new Date(p.lastActivity).getTime()
          if (!isNaN(t) && t >= sevenDaysAgoMs) relevantSlugs.add(p.slug)
        }
        return {
          slug: p.slug,
          name: p.title ?? p.slug,
          nextAction: next ? next.title.slice(0, 80) : null,
          relevantToday: relevantSlugs.has(p.slug),
        }
      })
  }, [projectsQuery.data, tasksQuery.data, userSlug, state])

  const milestones = useMemo(() => {
    const reg = regulatoryQuery.data ?? []
    return reg.map((r: any) => ({ title: r.name ?? r.title ?? 'Regulatory item', days: r.days_until_expiry ?? 0 })).filter((m: { days: number }) => m.days > 0).sort((a: { days: number }, b: { days: number }) => a.days - b.days).slice(0, 5)
  }, [regulatoryQuery.data])

  // Pulse: real focus minutes from PB pomodoro sessions today (D19),
  // sync staleness, mentees. Mentees = researchTeam slugs (Coordinators /
  // Fellows / Students / Analysts). Each mentee's "next" is the soonest
  // due_date among their assigned tasks; — if none.
  const focusMin = useMemo(() => {
    const today = todayKey()
    const perDay = sessionStatsQuery.data?.per_day ?? []
    const todayRow = perDay.find((d) => d.day === today)
    return todayRow?.total_minutes ?? 0
  }, [sessionStatsQuery.data])
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

  // Today events. Merge team meetings (D1 `meetings` table — date-only, no
  // time) with the user's personal iCal feed events (timed). Sort so timed
  // events appear in chronological order and untimed meetings sink to the
  // top as the "all day" band.
  const todaysMeetings: TodayEvent[] = useMemo(() => {
    const meetings = (meetingsQuery.data ?? []).filter((m) => isToday(m.date)).map(meetingToEvent)
    const personal = (calendarEventsQuery.data ?? [])
      .filter((e) => isToday(e.startAt))
      .map(calendarEventToTodayEvent)
    // Personal events with a real time go after untimed meetings, sorted
    // by start. Untimed events keep insertion order (D1 returns by date).
    // Sort by startMin (wall-clock minutes, numeric) — NOT a.time.localeCompare
    // which gives wrong order for AM/PM strings ("9:30 AM" > "12:00 PM"
    // lexicographically because "9" > "1").
    const timed = personal.filter((e) => e.time !== '—' && e.time !== 'all day')
    const untimed = personal.filter((e) => e.time === '—' || e.time === 'all day')
    timed.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0))
    return [...untimed, ...meetings, ...timed]
  }, [meetingsQuery.data, calendarEventsQuery.data])

  // Tomorrow events — shown in Agenda mode's Tomorrow section so Nick can
  // scan ahead without switching views. Only personal iCal events have time;
  // D1 meetings are date-only so there's no reliable "tomorrow" D1 query here.
  const tomorrowMeetings: TodayEvent[] = useMemo(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    const isTomorrow = (isoDate: string | null | undefined): boolean => {
      if (!isoDate) return false
      if (!isoDate.includes('T')) return isoDate.slice(0, 10) === tomorrowKey
      const d = new Date(isoDate)
      if (isNaN(d.getTime())) return false
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return local === tomorrowKey
    }
    return (calendarEventsQuery.data ?? [])
      .filter((e) => isTomorrow(e.startAt))
      .map(calendarEventToTodayEvent)
  }, [calendarEventsQuery.data])

  // Strip tasks: planned with slot==='strip'. Between-N tasks stay inside the
  // Timeline drop zones where they render contextually.
  const stripTasks = state.plannedIds()
    .filter((id) => state.planned[id]?.slot === 'strip')
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is TaskRow => !!t)

  // Pill counts. Cache-confirmed completions + deduped local-only completions.
  const doneTodayCount = doneTodayDetail.length + localDoneIds.length
  const counts: DailyCounts = {
    overdue: overdueTasks.length,
    stalled: stalledProjects.length,
    planned: state.plannedIds().length,
    meetings: todaysMeetings.length,
    doneToday: doneTodayCount,
  }

  const isLoading = tasksQuery.isLoading || projectsQuery.isLoading
  const isError = tasksQuery.isError || projectsQuery.isError
  const [completedOpen, setCompletedOpen] = useState(false)
  // S20: the how-to micro-copy under the H1 is now a one-time dismissible hint
  // (was permanent above-the-fold clutter). The same instructions also sit
  // contextually next to "All today's tasks", so dismissing loses nothing.
  const [howToDismissed, setHowToDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem('mnccore-today-howto-dismissed') === '1' } catch { return false }
  })
  const dismissHowTo = useCallback(() => {
    setHowToDismissed(true)
    try { localStorage.setItem('mnccore-today-howto-dismissed', '1') } catch { /* ok */ }
  }, [])

  if (isError) {
    return (
      <div style={{ background: PAGE_BG, color: INK, fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--task-ink)', marginBottom: 8 }}>Could not load Today</h2>
          <p style={{ fontSize: 13, color: INK_MUTED, marginBottom: 20 }}>
            There was a problem fetching your tasks or projects. Check your connection and try again.
          </p>
          <Button
            variant="primary"
            onClick={() => { tasksQuery.refetch(); projectsQuery.refetch() }}
            style={{ padding: '8px 20px', borderRadius: 'var(--radius-lg)', fontSize: '13px', fontWeight: 500 }}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // P1-1 (Nick 2026-06-10): Today shares the universal anchored band + left edge.
  // The grid is centered on --content-band with the same responsive padding as
  // .content-container (data pages), so the main column's left edge lands at the
  // same pixel as Projects/Manuscripts/Grants. Main maps to --col-main, rail to
  // --col-rail. No page-wide bg tint — Today sits on the global page bg like
  // every other page (fix: "background color around the entire page"); only
  // cards/panels carry their own surface.
  return (
    <div className="b2-grid" style={{ color: 'var(--task-ink)', fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', minHeight: '100%' }}>
      <style>{`
        @keyframes b2pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        /* Hover tints: rgba lifts in dark mode, darken in light mode.
           Both schemes get a 4% overlay against their respective bg. */
        .b2-proj:hover { background: rgba(127,127,127,0.06); }
        .b2-proj-link:hover { color: var(--task-accent-teal) !important; opacity: 1 !important; text-decoration: underline; }
        /* Centered band (P1-1): identical to .content-container so the left
           edge matches the data pages exactly. main = --col-main, rail =
           --col-rail. Below 1024 the rail stacks under main. */
        .b2-grid {
          display: grid;
          grid-template-columns: minmax(0, var(--col-main)) var(--col-rail);
          max-width: var(--content-band);
          margin-left: auto; margin-right: auto;
          padding-left: 1.5rem; padding-right: 1.5rem;
        }
        .b2-main { padding: 28px 32px 28px 0; min-width: 0; }
        /* Rail is a recessed panel beside the main column. No page-wide tint;
           it carries its own subtle surface so it reads as a distinct rail. */
        .b2-rail { padding: 28px 0 28px 24px; overflow-y: auto; border-left: 1px solid var(--border-subtle); }
        @media (min-width: 640px) {
          .b2-grid { padding-left: 2rem; padding-right: 2rem; }
        }
        @media (min-width: 1024px) {
          .b2-grid { padding-left: 3rem; padding-right: 3rem; }
        }
        @media (max-width: 1024px) {
          .b2-grid { grid-template-columns: 1fr; }
          .b2-main { padding: 20px 0; border-bottom: 1px solid var(--border-subtle); }
          .b2-rail { padding: 16px 0 0; border-left: none; }
        }
      `}</style>

      <main className="b2-main">
        {/* N1.21 — flexWrap + nowrap date: at 375 the date used to wrap into a
            3-line sliver squeezed beside the H1; now it drops as one unit. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.03em', margin: 0 }}>Today</h1>
          <HeartbeatLine width={60} height={14} color={ACCENT_GOLD} variant="static" />
          <span style={{ fontSize: 13, color: INK_MUTED, whiteSpace: 'nowrap' }}>{formatTodayDate()}</span>
          <div style={{ flex: 1 }} />
          {/* PI-only: run /process on THIS machine via the mnccore:// local
              protocol (fire-and-forget). Gold = user-driven action (Rule 59).
              No server route — purely a local-protocol trigger. */}
          {user.isPi && (
            <button
              type="button"
              onClick={() => launchProcess(MNCCORE_PROCESS_URI, {
                successMessage: 'Launching /process on this machine…',
                copyMessage: 'Launching /process on this machine…',
              })}
              title="Run /process on this machine"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'center',
                background: withAlpha(ACCENT_GOLD, 12), border: `1px solid ${withAlpha(ACCENT_GOLD, 35)}`,
                color: ACCENT_GOLD, borderRadius: 6, padding: '5px 11px',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
              }}
            >
              ⚙ Process
            </button>
          )}
        </div>
        {/* N1.21 — flex-start keeps the dismiss × anchored to the first line
            instead of floating detached mid-text when the hint wraps. */}
        {!howToDismissed && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: INK_DIM, marginBottom: 16 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              Click a task to expand · 📌 or drag ⋮⋮ to plan · click a meeting for notes.
            </span>
            <button
              type="button"
              onClick={dismissHowTo}
              aria-label="Dismiss tip"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: INK_DIM, fontSize: 16, lineHeight: 1, padding: '2px 6px', flexShrink: 0, opacity: 0.85 }}
            >
              ×
            </button>
          </div>
        )}

        <PillStrip counts={counts} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 14, marginTop: 2 }}>🧠</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <MorningThoughtCompose />
          </div>
        </div>

        {/* Today view: Timeline (drag-to-plan) or Agenda (linear scan).
            The toggle lives in the Timeline section header; AgendaListView
            renders its own header-less version when view === 'agenda'. */}
        {todayView === 'timeline' ? (
          <Timeline
            events={todaysMeetings}
            tasks={tasks}
            state={state}
            projectsByPid={projectsByPid}
            activeView={todayView}
            onToggleView={setTodayView}
            dismissedIds={dismissedEventIds}
            onDismiss={onDismissEvent}
            onRestoreDismissed={onRestoreAllDismissed}
          />
        ) : (
          <section data-b2-agenda style={{ marginBottom: 24 }}>
            {/* Header with toggle — mirrors Timeline header for consistent affordance */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>Today</h2>
              <div
                role="group"
                aria-label="Today view"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  border: `1px solid ${withAlpha(ACCENT_GOLD, 22)}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {(['timeline', 'agenda'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setTodayView(v)}
                    aria-pressed={todayView === v}
                    title={v === 'timeline' ? 'Timeline — drag tasks into gaps' : 'Agenda — scan your day'}
                    style={{
                      background: todayView === v ? withAlpha(ACCENT_GOLD, 15) : 'transparent',
                      border: 'none',
                      color: todayView === v ? ACCENT_GOLD : INK_DIM,
                      fontSize: 11,
                      fontWeight: todayView === v ? 600 : 400,
                      cursor: 'pointer',
                      padding: '3px 9px',
                      letterSpacing: '0.02em',
                      transition: 'all 120ms',
                      lineHeight: 1.5,
                    }}
                  >
                    {v === 'timeline' ? 'Timeline' : 'Agenda'}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: INK_DIM }}>scan your day · click to open · × to hide</span>
            </div>
            <AgendaListView
              events={todaysMeetings}
              tomorrowEvents={tomorrowMeetings}
              tasks={tasks}
              state={state}
              projectsByPid={projectsByPid}
              dismissedIds={dismissedEventIds}
              onDismiss={onDismissEvent}
              onRestoreDismissed={onRestoreAllDismissed}
            />
          </section>
        )}

        <PlannedTodaySection
          stripTasks={stripTasks}
          state={state}
          projectsByPid={projectsByPid}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>📋 All today's tasks</h2>
          <span className="today-section-hint" style={{ fontSize: 12, color: INK_DIM }}>click to expand · 📌 or drag ⋮⋮ to plan</span>
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
            />
          ))
        )}

        <div data-b2-completed style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
          <div onClick={() => setCompletedOpen(!completedOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: ACCENT_GREEN }}>✓</span>
            <span style={{ fontSize: 11, color: INK_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
              Completed today ({doneTodayDetail.length + localDoneIds.length})
            </span>
            <span style={{ color: INK_DIM }}>{completedOpen ? '▾' : '▸'}</span>
          </div>
          {completedOpen && (
            <div style={{ marginTop: 12, paddingLeft: 20 }}>
              {doneTodayDetail.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', paddingLeft: 12 }}>
                  <DoneBox done onToggle={() => state.uncheck(t.id)} />
                  <span style={{ fontSize: 12, color: INK_MUTED, textDecoration: 'line-through' }}>{t.short_title || t.title}</span>
                </div>
              ))}
              {localDoneIds.map((id) => {
                const t = (tasksQuery.data ?? []).find((x) => x.id === id)
                if (!t) return null
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', paddingLeft: 12 }}>
                    <DoneBox done onToggle={() => state.uncheck(id)} />
                    <span style={{ fontSize: 12, color: INK_MUTED, textDecoration: 'line-through' }}>{t.short_title || t.title}</span>
                  </div>
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
