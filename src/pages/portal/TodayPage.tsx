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

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTasks, useProjects, useMeetingsApi, useExpiringRegulatory, useUserCalendarEvents, usePBSessionStats } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { useMarkSeen } from '../../hooks/useEntitySeen'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { MNCCORE_PROCESS_URI, MNCCORE_QUICKCHAT_URI } from '../../lib/urlClassify'
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
import {
  GROUP_ORDER,
  ACCENT_GOLD, ACCENT_GREEN, ACCENT_TEAL,
  INK, INK_MUTED, INK_DIM, PAGE_BG,
  todayKey, daysSince, formatTodayDate,
  meetingToEvent, projectCalendarEventToDay, isToday,
  matchMeetingRecord, normalizeMeetingTitle,
  getGroupForTask, isTaskDone,
  type GroupKey, type TodayEvent, type DailyCounts,
} from '../../components/today/constants'
import { PillStrip } from '../../components/today/PillStrip'
import { Timeline } from '../../components/today/Timeline'
import { CollapseChevron } from '../../components/today/SectionCollapseToggle'
import { collapseToggleProps } from '../../components/today/collapseToggleProps'
import { TodayDndContext } from '../../components/today/TodayDndContext'
import { PlannedTodaySection } from '../../components/today/PlannedTodaySection'
import { TaskGroup } from '../../components/today/TaskGroup'
import { MorningThoughtCompose } from '../../components/today/MorningThoughtCompose'
import { DayActivityFeed } from '../../components/today/DayActivityFeed'
import { PomodoroControl } from '../../components/today/PomodoroControl'
import { HermesSuggestsCard } from '../../components/today/rail/HermesSuggestsCard'
import { NeedsAttentionCard } from '../../components/today/rail/NeedsAttentionCard'
import { ProjectsCard } from '../../components/today/rail/ProjectsCard'
import { PulseCard } from '../../components/today/rail/PulseCard'
import { PendingMeetingsCard } from '../../components/tasks/PendingMeetingsCard'
import { QueryErrorNote } from '../../components/QueryErrorNote'
import type { TaskRow } from '../../lib/api'
import { withAlpha, isApprovalPending, isApprovalTriaged, civilDatePlusDays } from '../../lib/taskGrouping'
import { useTodayDueWindow, DUE_WINDOW_OPTIONS } from '../../hooks/useTodayDueWindow'

export default function TodayPage() {
  usePageMeta('Today · MN-CCORE', 'Operating-day landing — what to work on, who you\'re meeting, what\'s overdue.')
  const { user } = useAuth()
  const { launch: launchProcess } = useProtocolLaunch()
  const userSlug = emailToSlug(user?.email)
  // autoScroll handled by dnd-kit DndContext (enabled by default via PointerSensor)
  // — replaced useDragAutoScroll() which listened on 'dragover' (HTML5; now dead).

  const tasksQuery = useTasks(userSlug ? { assignee: userSlug } : undefined)
  const projectsQuery = useProjects()
  const meetingsQuery = useMeetingsApi()
  const regulatoryQuery = useExpiringRegulatory(60)
  const calendarEventsQuery = useUserCalendarEvents()
  // TP-16 (D19): focusMin reads from real PB pomodoro sessions instead of
  // the prior fake `plannedIds × 30` math. Returns 0 if no sessions today.
  const sessionStatsQuery = usePBSessionStats()

  // §9.5.1 (Phase 9): mark the day itself seen when Today opens — mirrors
  // ProjectDetail/MeetingDetail marking their own entity seen on mount.
  // Drains the Sidebar's Today nav badge (unseen private Hermes answers on
  // today's Today-bar thread, entity_type='day', CLAUDE.md Rule 80).
  const markSeen = useMarkSeen()
  useEffect(() => { markSeen('day', todayKey()) }, [markSeen])

  // Pending meeting-approval tasks are surfaced in PendingMeetingsCard (above the task groups)
  // and excluded from the regular task groups to prevent double-render.
  const pendingMeetingTasks: TaskRow[] = useMemo(
    () => (tasksQuery.data ?? []).filter(isApprovalPending),
    [tasksQuery.data],
  )
  // #97: ANSWERED approvals (accepted/declined) drop out entirely — they are
  // triage artifacts, not work. See isApprovalTriaged for why this is filtered
  // on the answer rather than on status.
  const tasks: TaskRow[] = useMemo(
    () => (tasksQuery.data ?? []).filter(
      (t) => t.completed === 0 && t.status !== 'done'
        && !isApprovalPending(t) && !isApprovalTriaged(t),
    ),
    [tasksQuery.data],
  )

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


  // #105: how far ahead the TASK POOL reaches. A view preference, not task state.
  const { dueWindow, setDueWindow } = useTodayDueWindow()

  // The task pool shown under the heading below.
  //
  // ⚠️ This is deliberately a SEPARATE array from `tasks`, and only the grouped
  // list consumes it. `useTodayState`, Timeline, Agenda, PlannedTodaySection and
  // the overdue rail must keep receiving the FULL open set — the day plan is
  // synced task state derived from those rows (Rule 63b), so filtering the base
  // array would make a planned task whose due date falls outside the window
  // vanish from its own saved slot.
  //
  // A task is in the pool when it is planned for today (an explicit choice always
  // outranks a date filter), or its due date is on/before the window edge.
  // Overdue tasks pass because their date is before the edge; undated tasks
  // appear only under "All".
  const visibleTasks = useMemo(() => {
    if (dueWindow === 'all') return tasks
    const edge = civilDatePlusDays(todayKey(), dueWindow)
    return tasks.filter((t) => {
      if (state.planned[t.id]) return true
      const due = t.due_date?.slice(0, 10)
      return !!due && due <= edge
    })
  }, [tasks, dueWindow, state.planned])

  const hiddenByWindow = tasks.length - visibleTasks.length

  // Group bucketing.
  const grouped = useMemo(() => {
    const g: Record<GroupKey, TaskRow[]> = { deep: [], priorities: [], quick: [], pb: [], etl: [] }
    for (const t of visibleTasks) {
      const key = getGroupForTask(t, projectsByPid)
      g[key].push(t)
    }
    return g
  }, [visibleTasks, projectsByPid])

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
    // eslint-disable-next-line react-hooks/purity -- deliberate snapshot at memoize time, recomputes with projectsQuery.data/tasksQuery.data
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
    // Field-name fix: the API (api/routes/regulatory.ts) only ever returns
    // `title`/`days_remaining` — never `name`/`days_until_expiry`. The old
    // field names meant `days` was always 0, so the `days > 0` filter below
    // silently dropped every item; this widget never showed a milestone.
    return reg
      .map((r: { title: string; days_remaining: number }) => ({ title: r.title ?? 'Regulatory item', days: r.days_remaining ?? 0 }))
      .filter((m: { days: number }) => m.days > 0)
      .sort((a: { days: number }, b: { days: number }) => a.days - b.days)
      .slice(0, 5)
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
  const mentees = useMemo(() => {
    const allTasks = tasksQuery.data ?? []
    return researchTeam.map((m) => {
      const theirs = allTasks.filter((t) => t.assignee === m.slug && t.completed === 0 && t.due_date)
      const soonest = theirs.map((t) => t.due_date as string).sort()[0]
      let next = '—'
      if (soonest) {
        // eslint-disable-next-line react-hooks/purity -- deliberate snapshot at memoize time, recomputes with tasksQuery.data
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
    const rawMeetings = (meetingsQuery.data ?? []).filter((m) => isToday(m.date))
    const meetings = rawMeetings.map(meetingToEvent)
    // #107: project every returned event onto today rather than filtering on
    // its START. An event that began yesterday and ends this morning belongs on
    // today; a start-date filter dropped it entirely.
    const personal = (calendarEventsQuery.data ?? [])
      .map((e) => projectCalendarEventToDay(e, todayKey()))
      .filter((e): e is TodayEvent => e !== null)

    // T13: bridge personal-calendar rows to their D1 meeting record (same
    // day + normalized title). Merge ONLY once the meeting has debrief notes:
    // the decorated cal- row shows read-only notes + deep link, so it can
    // replace the native row. A matched meeting WITHOUT notes keeps its
    // native untimed row — that row carries the live jot textarea
    // (MeetingNotesAutoSave), and the cal- row's textarea is disabled by
    // isCalEvent; merging early would silently kill in-meeting jotting.
    const matchedMeetingIds = new Set<string>()
    const decoratedPersonal = personal.map((e) => {
      const match = matchMeetingRecord(e, rawMeetings, normalizeMeetingTitle)
      if (!match) return e
      // #550: a match with no notes yet stays undecorated (7b5188de — the
      // native untimed row below keeps the live jot), but flag it so
      // MeetingRow can stop claiming "no meeting record" when one exists.
      if (!match.notes) return { ...e, hasUndebriefedMatch: true }
      matchedMeetingIds.add(match.id)
      return { ...e, meetingId: match.id, meetingNotes: match.notes }
    })
    const dedupedMeetings = meetings.filter((m) => !matchedMeetingIds.has(m.id))

    // Personal events with a real time go after untimed meetings, sorted
    // by start. Untimed events keep insertion order (D1 returns by date).
    // Sort by startMin (wall-clock minutes, numeric) — NOT a.time.localeCompare
    // which gives wrong order for AM/PM strings ("9:30 AM" > "12:00 PM"
    // lexicographically because "9" > "1").
    const timed = decoratedPersonal.filter((e) => e.time !== '—' && e.time !== 'all day')
    const untimed = decoratedPersonal.filter((e) => e.time === '—' || e.time === 'all day')
    timed.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0))
    return [...untimed, ...dedupedMeetings, ...timed]
  }, [meetingsQuery.data, calendarEventsQuery.data])

  // Tomorrow events — shown in Agenda mode's Tomorrow section so Nick can
  // scan ahead without switching views. Only personal iCal events have time;
  // D1 meetings are date-only so there's no reliable "tomorrow" D1 query here.
  const tomorrowMeetings: TodayEvent[] = useMemo(() => {
    // #107: same projection as today. The old start-only filter also meant an
    // event running from tonight into tomorrow never appeared in the Tomorrow
    // preview, because it "starts" today.
    const tomorrowKey = civilDatePlusDays(todayKey(), 1)
    return (calendarEventsQuery.data ?? [])
      .map((e) => projectCalendarEventToDay(e, tomorrowKey))
      .filter((e): e is TodayEvent => e !== null)
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
  // Section collapse state — session-only (no localStorage), every section
  // starts expanded on every load per Nick's ask. timelineOpen is shared by
  // both the Timeline and Agenda-mode headers so the "Today" section stays
  // rolled up (or open) across a view-toggle switch.
  const [timelineOpen, setTimelineOpen] = useState(true)
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
            <>
              {/* PomodoroControl: calls localhost:5555 directly from the browser.
                  Laptop-only by design — phone can't reach localhost. CORS is
                  handled server-side (flask-cors). Graceful if server is off. */}
              <PomodoroControl />
              {/* G1-A1: verb-only Quick Chat button — fires mnccore://quickchat which
                  runs Quick_Chat_seeded.bat (loads today's context on startup).
                  Computer-origin only; no launch_log row, no backend. Rule 59 gold. */}
              <button
                type="button"
                onClick={() => launchProcess(MNCCORE_QUICKCHAT_URI, {
                  successMessage: 'Launching Quick Chat on this machine…',
                  copyMessage: 'Launching Quick Chat on this machine…',
                })}
                title="Open Quick Chat on this machine"
                aria-label="Open Quick Chat on this machine"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'center',
                  background: withAlpha(ACCENT_GOLD, 12), border: `1px solid ${withAlpha(ACCENT_GOLD, 35)}`,
                  color: ACCENT_GOLD, borderRadius: 6, padding: '5px 11px',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                }}
              >
                💬 Quick Chat
              </button>
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
            </>
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

        {/* Pending meetings triage card — shown before the pill strip so captured
            meetings requiring a decision are the first thing Nick sees. Disappears
            automatically once all pending meetings are accepted or declined. */}
        <PendingMeetingsCard tasks={pendingMeetingTasks} />

        <PillStrip counts={counts} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 14, marginTop: 2 }}>🧠</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <MorningThoughtCompose />
          </div>
        </div>

        {/* Today's conversations — @hermes asks become real threads you can reply
            to (Hermes wave Phase 3). Replaces the flat daily_thought reply cards. */}
        <DayActivityFeed dateKey={todayKey()} />

        {/* #495/#507: these queries used to swallow fetch failures as empty
            data, so a backend outage rendered identically to "nothing due
            today" — zero signal (masked the 2026-07-06 calendar outage for
            a month in the calendar hook alone). Surface each here, subtle
            and non-blocking, above whichever of Timeline/Agenda is active. */}
        {calendarEventsQuery.isError && (
          <QueryErrorNote label="calendar" onRetry={() => calendarEventsQuery.refetch()} />
        )}
        {meetingsQuery.isError && (
          <QueryErrorNote label="meetings" onRetry={() => meetingsQuery.refetch()} />
        )}
        {regulatoryQuery.isError && (
          <QueryErrorNote label="regulatory deadlines" onRetry={() => regulatoryQuery.refetch()} />
        )}
        {sessionStatsQuery.isError && (
          <QueryErrorNote label="session stats" onRetry={() => sessionStatsQuery.refetch()} />
        )}

        {/* TodayDndContext: single DndContext spanning Timeline (droppables = gaps)
            + PlannedTodaySection + TaskGroup (draggables = task rows).
            GH#150: replaces both HTML5 DnD (list→gap) and raw pointer events (block move). */}
        <TodayDndContext state={state} tasks={tasks}>

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
            open={timelineOpen}
            onToggleOpen={() => setTimelineOpen((o) => !o)}
          />
        ) : (
          <section data-b2-agenda style={{ marginBottom: 24 }}>
            {/* Header with toggle — mirrors Timeline header for consistent affordance.
                Only the icon+title+chevron are the collapse-click target — the
                view-toggle group and hint are siblings, not descendants, so their
                clicks never reach the collapse handler. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                {...collapseToggleProps(timelineOpen, () => setTimelineOpen((o) => !o), 'Today section')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 16 }}>📅</span>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>Today</h2>
                <CollapseChevron open={timelineOpen} color={ACCENT_GOLD} />
              </div>
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
            {timelineOpen && (
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
            )}
          </section>
        )}

        <PlannedTodaySection
          stripTasks={stripTasks}
          state={state}
          projectsByPid={projectsByPid}
        />

        {/* #105: heading no longer claims "All" — the pool is now what the due
            window admits, and the window picker sits next to the claim it makes. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 8, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>📋 Tasks</h2>
          <div
            role="group"
            aria-label="Show tasks due within"
            style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${withAlpha(ACCENT_TEAL, 22)}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}
          >
            {DUE_WINDOW_OPTIONS.map((o) => (
              <button
                key={String(o.value)}
                onClick={() => setDueWindow(o.value)}
                aria-pressed={dueWindow === o.value}
                data-tip={o.hint}
                style={{
                  background: dueWindow === o.value ? withAlpha(ACCENT_TEAL, 18) : 'transparent',
                  border: 'none',
                  color: dueWindow === o.value ? ACCENT_TEAL : INK_DIM,
                  fontSize: 11,
                  fontWeight: dueWindow === o.value ? 600 : 400,
                  cursor: 'pointer',
                  padding: '3px 9px',
                  letterSpacing: '0.02em',
                  transition: 'all 120ms',
                  lineHeight: 1.5,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          {hiddenByWindow > 0 && (
            <button
              onClick={() => setDueWindow('all')}
              data-tip="Show every open task again"
              style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 11, cursor: 'pointer', padding: 0 }}
            >
              {hiddenByWindow} further out →
            </button>
          )}
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

        </TodayDndContext>

        <div data-b2-completed style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
          <div
            {...collapseToggleProps(completedOpen, () => setCompletedOpen(!completedOpen), 'Completed today')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}
          >
            <span style={{ fontSize: 12, color: ACCENT_GREEN }}>✓</span>
            <span style={{ fontSize: 11, color: INK_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
              Completed today ({doneTodayDetail.length + localDoneIds.length})
            </span>
            <CollapseChevron open={completedOpen} />
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
        <PulseCard focusMin={focusMin} milestones={milestones} mentees={mentees} />
      </aside>
    </div>
  )
}
