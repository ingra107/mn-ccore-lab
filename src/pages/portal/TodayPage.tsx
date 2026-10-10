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
import { useTasks, useProjects, useMeetingsApi, useExpiringRegulatory, useUserCalendarEvents, usePBSessionStats, useTodayMentees } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { useLabPrefs } from '../../hooks/useLabPrefs'
import { useMarkSeen } from '../../hooks/useEntitySeen'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { MNCCORE_PROCESS_URI, MNCCORE_QUICKCHAT_URI } from '../../lib/urlClassify'
import { usePageMeta } from '../../hooks/usePageMeta'
import { Button } from '../../components/ui/Button'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { CardCheck } from '../../components/tasks/TaskCardRow'
import { useTodayView } from '../../hooks/useTodayView'
import { AgendaListView } from '../../components/today/AgendaListView'
import { useTodayState } from '../../hooks/useTodayState'
import { civilDaysOverdue, civilDaysUntil } from '../../lib/dateUtils'
import { daysSince } from '../../lib/taskGrouping'
import {
  GROUP_ORDER,
  INK, INK_MUTED, PAGE_BG,
  todayKey, formatTodayDate,
  meetingToEvent, meetingCardFields, projectCalendarEventToDay, isToday,
  matchMeetingRecord, normalizeMeetingTitle,
  getGroupForTask, isTaskDone,
  type GroupKey, type TodayEvent, type DailyCounts,
} from '../../components/today/constants'
import { StatLine } from '../../components/today/StatLine'
import { ProfileSetupPrompt } from '../../components/today/ProfileSetupPrompt'
import { parseDbUtc } from '../../lib/time'
import { TodayHeader } from '../../components/today/TodayHeader'
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
import { QuestionsCard } from '../../components/tasks/QuestionsCard'
import { QueryErrorNote } from '../../components/QueryErrorNote'
import type { TaskRow } from '../../lib/api'
import { isApprovalPending, isApprovalTriaged, isQuestionTask, isQuestionWaiting, civilDatePlusDays } from '../../lib/taskGrouping'
import { isStalledProject, projectMovedAt } from '../../lib/taskConstants'
import { useTodayDueWindow, DUE_WINDOW_OPTIONS, dueWindowDays } from '../../hooks/useTodayDueWindow'
import { isMilestone } from '../../../shared/taskKinds'
import { Brain, Diamond, MessageSquare, Settings } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { SegmentedToggle } from '../../components/ui/SegmentedToggle'

const SHOW_MILESTONES_KEY = 'hub-today-show-milestones'

export default function TodayPage() {
  usePageMeta('Today · MN-CCORE', 'Operating-day landing — what to work on, who you\'re meeting, what\'s overdue.')
  const { user } = useAuth()
  const { launch: launchProcess } = useProtocolLaunch()
  const userSlug = user?.slug ?? ''
  const { prefs } = useLabPrefs()
  // autoScroll handled by dnd-kit DndContext (enabled by default via PointerSensor)
  // — replaced useDragAutoScroll() which listened on 'dragover' (HTML5; now dead).

  // Backlog #1039: retry:false matches the sibling useProjects() call right
  // below, which already opts out of react-query's default 3-retry
  // exponential backoff. Without this, tasksQuery alone can hold isLoading
  // (and so <TableSkeleton />, below) true on any transient /api/tasks
  // failure before falling through to the isError screen -- the query-core
  // retry math alone is ~7s (1s+2s+4s), and reproducing a forced /api/tasks
  // failure live against the pre-fix build measured ~12.9s wall-clock to
  // the error screen (page nav/hydration adds on top of the retry math).
  // With retry:false the same forced failure fails on the first attempt.
  // 2026-10-08: no slug yet -> no query at all. The old `: undefined` fallback
  // fired an UNSCOPED /api/tasks read (every member's tasks) until the slug
  // arrived; `enabled` makes that request impossible to build.
  const tasksQuery = useTasks({ assignee: userSlug }, { retry: false, enabled: !!userSlug })
  const menteesQuery = useTodayMentees()
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
  // "Needs you" questions (kind='question', schema v111) are surfaced in
  // QuestionsCard, above PendingMeetingsCard — same double-render guard.
  const questionTasks: TaskRow[] = useMemo(
    () => (tasksQuery.data ?? []).filter(isQuestionWaiting),
    [tasksQuery.data],
  )
  // #97: ANSWERED approvals (accepted/declined) drop out entirely — they are
  // triage artifacts, not work. See isApprovalTriaged for why this is filtered
  // on the answer rather than on status. Questions are excluded outright
  // (isQuestionTask, not just isQuestionWaiting) — an answered-but-not-yet-
  // closed question is still not an ordinary task.
  const tasks: TaskRow[] = useMemo(
    () => (tasksQuery.data ?? []).filter(
      (t) => t.completed === 0 && t.status !== 'done'
        && !isApprovalPending(t) && !isApprovalTriaged(t) && !isQuestionTask(t),
    ),
    [tasksQuery.data],
  )

  // Tasks completed *today* per the cache — the source of truth across every
  // surface (and this page's own optimistic completion). isToday() resolves the
  // (UTC) completed_at to the local calendar date; a bare .slice(0,10) compares
  // the UTC date and drops evening completions in Central time.
  const doneTodayDetail = useMemo(
    // Same rows the linked My Tasks "Done today" list shows: answered approvals
    // and answered questions are triage artifacts, not work (MyTasks drops them
    // the same way), so they are not counted or listed here either.
    () => (tasksQuery.data ?? []).filter(
      (t) => t.completed === 1 && isToday(t.completed_at)
        && !isApprovalPending(t) && !isApprovalTriaged(t) && !isQuestionTask(t),
    ),
    [tasksQuery.data],
  )
  const completedTodayIds = useMemo(() => doneTodayDetail.map((t) => t.id), [doneTodayDetail])

  // "done this week" — from the retired My Hub header (2026-10-09). Same week
  // My Hub counted (Sunday start, local time) and the same exclusions as
  // "done" above: answered approvals and questions are triage, not work.
  const doneThisWeek = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    return (tasksQuery.data ?? []).filter(
      (t) => t.completed === 1 && !!t.completed_at && parseDbUtc(t.completed_at) >= weekStart
        && !isApprovalPending(t) && !isApprovalTriaged(t) && !isQuestionTask(t),
    ).length
  }, [tasksQuery.data])

  const projectsByPid = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; category?: string | null; lastActivity?: string | null; primary_folder?: string | null }>()
    for (const p of projectsQuery.data ?? []) {
      // Short name everywhere on Today (Nick: display short names): short_name,
      // then the full title, then the slug. This map feeds every project link
      // on a card, so it was the biggest of the five long-name leaks.
      const entry = { name: p.short_name || p.title || p.slug, slug: p.slug, category: p.category ?? null, lastActivity: p.lastActivity ?? null, primary_folder: p.primary_folder ?? null }
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
  // Milestones on/off (Nick 2026-09-17: "we need a filter to turn off
  // milestones"). Per-viewer convenience, so localStorage; default on.
  const [showMilestones, setShowMilestones] = useState<boolean>(() => {
    try { return localStorage.getItem(SHOW_MILESTONES_KEY) !== 'off' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem(SHOW_MILESTONES_KEY, showMilestones ? 'on' : 'off') } catch { /* unavailable */ }
  }, [showMilestones])

  const visibleTasks = useMemo(() => {
    const days = dueWindowDays(dueWindow)
    const edge = days === null ? null : civilDatePlusDays(todayKey(), days)
    return tasks.filter((t) => {
      // A milestone is the horizon itself (Nick 2026-09-16: always show) —
      // a grant date six weeks out must not vanish behind a 7d window — unless
      // the milestones toggle is off.
      if (isMilestone(t)) return showMilestones
      if (edge === null) return true
      if (state.planned[t.id]) return true
      const due = t.due_date?.slice(0, 10)
      return !!due && due <= edge
    })
  }, [tasks, dueWindow, state.planned, showMilestones])

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
      // isStalledProject is the SAME predicate the Projects page's
      // ?filter=stalled list uses, so this count and the list it links to agree.
      .filter((p) => isStalledProject(p, prefs.projectStaleDays))
      .map((p) => ({ name: p.short_name || p.title || p.slug, slug: p.slug, days: daysSince(projectMovedAt(p)) }))
      .sort((a, b) => b.days - a.days)
  }, [projectsQuery.data, prefs.projectStaleDays])

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
      // Short title: the next-action cue on the rail shows short names too.
      if (!existing || aDue < eDue) nextByProject.set(t.project_id, { title: t.short_title || t.title, due: t.due_date ?? null })
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
          name: p.short_name || p.title || p.slug,
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
  // sync staleness, mentees. Mentees come from GET /api/today/mentees: the
  // viewer's own mentees (a director's research team; none for anyone else),
  // each with the due date of their soonest open task; — if none. It was a
  // filter over the viewer's OWN task list, so it could never match a mentee.
  const focusMin = useMemo(() => {
    // Non-PI: usePBSessionStats never fires (PI-only endpoint), so there is
    // no focus reading to show -- null hides the tile rather than faking 0.
    if (!user.isPi) return null
    const today = todayKey()
    const perDay = sessionStatsQuery.data?.per_day ?? []
    const todayRow = perDay.find((d) => d.day === today)
    return todayRow?.total_minutes ?? 0
  }, [sessionStatsQuery.data, user.isPi])
  const mentees = useMemo(() => {
    return (menteesQuery.data ?? []).map((m) => {
      let next = '—'
      if (m.next_due) {
        const days = civilDaysUntil(m.next_due)
        next = days < 0 ? `${civilDaysOverdue(m.next_due)}d overdue` : days === 0 ? 'today' : `${days}d`
      }
      return { name: m.name, next }
    })
  }, [menteesQuery.data])

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
      // The card fields (faces, project, action count) follow the matched
      // meeting either way; they gate nothing.
      const row = rawMeetings.find((m) => m.id === match.id)
      const card = row ? meetingCardFields(row) : {}
      // #550: a match with no notes yet stays undecorated (7b5188de — the
      // native untimed row below keeps the live jot), but flag it so
      // MeetingRow can stop claiming "no meeting record" when one exists.
      // matchedMeetingId rides along so the Prep pill links to the existing
      // page instead of offering to create a second one. It deliberately does
      // NOT set meetingId — that field still gates the jot/unseen behavior
      // #550 left on the native row.
      if (!match.notes) return { ...e, ...card, hasUndebriefedMatch: true, matchedMeetingId: match.id }
      matchedMeetingIds.add(match.id)
      return { ...e, ...card, meetingId: match.id, meetingNotes: match.notes }
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
    // The number matches the list its link opens: the Meetings page's meeting
    // records for today (calendar-only events are on the Today section below).
    meetings: (meetingsQuery.data ?? []).filter((m) => isToday(m.date)).length,
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
  // every other page; the cards/panels carry their own surfaces.
  //
  // `.tk` scopes the Today skin (three stepped surfaces: page < panel < card; see
  // index.css "Today skin"). Layout order, top to bottom (Nick 2026-10-09):
  // title, Needs you, meeting triage, stat line, how-to hint, compose.
  return (
    <div className="b2-grid tk" style={{ color: 'var(--sk-t1)', fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', minHeight: '100%' }}>
      <style>{`
        @keyframes b2pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
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
        .b2-main { padding: 28px 32px 40px 0; min-width: 0; }
        /* Rail: its own column beside main, panels stacked with 14px between. */
        .b2-rail { padding: 28px 0 28px 24px; min-width: 0; border-left: 1px solid var(--sk-line); }
        @media (max-width: 639px) {
          .b2-grid { padding-left: 12px; padding-right: 12px; }
        }
        @media (min-width: 640px) {
          .b2-grid { padding-left: 2rem; padding-right: 2rem; }
        }
        @media (min-width: 1024px) {
          .b2-grid { padding-left: 3rem; padding-right: 3rem; }
        }
        @media (max-width: 1024px) {
          .b2-grid { grid-template-columns: 1fr; }
          .b2-main { padding: 20px 0; }
          .b2-rail { padding: 16px 0 32px; border-left: none; border-top: 1px solid var(--sk-line); }
        }
      `}</style>

      <main className="b2-main">
        {/* Title row. N1.21 — flexWrap + nowrap date: at 375 the date used to wrap
            into a 3-line sliver squeezed beside the H1; now it drops as one unit.
            The heartbeat squiggle and the year in the date are gone (decoration,
            not data). */}
        <div className="tk-titlerow">
          <h1>Today</h1>
          <span className="tk-date">{formatTodayDate().replace(/,\s*\d{4}$/, '')}</span>
          <div style={{ flex: 1 }} />
          {/* PI-only: run /process on THIS machine via the mnccore:// local
              protocol (fire-and-forget). No server route — purely a
              local-protocol trigger. */}
          {user.isPi && (
            <>
              {/* PomodoroControl: calls localhost:5555 directly from the browser.
                  Laptop-only by design — phone can't reach localhost. CORS is
                  handled server-side (flask-cors). Graceful if server is off. */}
              <PomodoroControl />
              {/* G1-A1: verb-only Quick Chat button — fires mnccore://quickchat which
                  runs Quick_Chat_seeded.bat (loads today's context on startup).
                  Computer-origin only; no launch_log row, no backend. */}
              <button
                type="button"
                onClick={() => launchProcess(MNCCORE_QUICKCHAT_URI, {
                  successMessage: 'Launching Quick Chat on this machine…',
                  copyMessage: 'Launching Quick Chat on this machine…',
                })}
                title="Open Quick Chat on this machine"
                aria-label="Open Quick Chat on this machine"
                className="tk-btn"
              >
                <MessageSquare {...ICON_PROPS} size={13} aria-hidden />Quick Chat
              </button>
              <button
                type="button"
                onClick={() => launchProcess(MNCCORE_PROCESS_URI, {
                  successMessage: 'Launching /process on this machine…',
                  copyMessage: 'Launching /process on this machine…',
                })}
                title="Run /process on this machine"
                className="tk-btn"
              >
                <Settings {...ICON_PROPS} size={13} aria-hidden />Process
              </button>
            </>
          )}
        </div>

        {/* "Needs you" questions — a process is waiting on Nick's answer. Shown
            above PendingMeetingsCard: an unanswered question blocks something,
            a captured meeting is merely awaiting triage. Both are the warm gold
            attention card and sit FIRST, ahead of the stat line. */}
        <QuestionsCard tasks={questionTasks} band={false} />

        {/* Pending meetings triage card. Disappears automatically once all
            pending meetings are accepted or declined. */}
        <PendingMeetingsCard tasks={pendingMeetingTasks} band={false} />

        {/* First login: until the profile has a title, bio and photo,
            a snoozable "Set up your profile" (replaces My Hub's checklist). */}
        <ProfileSetupPrompt />

        <StatLine counts={counts} doneThisWeek={doneThisWeek} />

        {/* N1.21 — flex-start keeps the dismiss × anchored to the first line
            instead of floating detached mid-text when the hint wraps. */}
        {!howToDismissed && (
          <div className="tk-hint">
            <span>
              Click a task to expand · pin or drag the grip to plan · click a meeting for notes.
            </span>
            <button
              type="button"
              onClick={dismissHowTo}
              aria-label="Dismiss tip"
              // Backlog #1037: padding 2px 6px measured ~20x22px, under the
              // WCAG 2.2 SC 2.5.8 24x24 CSS-px floor -- this is a standalone
              // icon button (no larger click surface around it, unlike the
              // CollapseChevron glyphs whose whole header row is the real
              // target). 5px/8px (in .tk-hint button) brings it to ~26x26.
            >
              ×
            </button>
          </div>
        )}

        <div className="tk-compose">
          <Brain {...ICON_PROPS} size={16} aria-hidden style={{ color: 'var(--sk-t3)', flexShrink: 0 }} />
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

        {/* Planned-for-today sits ABOVE the day view (Nick 2026-08-03).
            It used to render between the timeline and the task groups, i.e.
            immediately adjacent to the unplanned pool it was drawn from — so on
            a light day the same two or three tasks appeared twice, inches apart.
            The render in the task groups below is deliberate and stays: it is
            the reliable place to UNPLAN a task and bring it back. Separating the
            two by the whole day view tests whether proximity, not duplication,
            was the actual problem.

            TIMELINE MODE ONLY. AgendaListView derives its own strip tasks and
            renders them with PlannedTaskRow — including the × unplan button — so
            mounting this in Agenda mode put a strip task on screen THREE times
            (here, in the agenda body, and in the task pool). */}
        {todayView === 'timeline' && (
          <PlannedTodaySection
            stripTasks={stripTasks}
            state={state}
            projectsByPid={projectsByPid}
          />
        )}

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
          <section data-b2-agenda className="tk-panel tk-blk">
            {/* Header with toggle — the same TodayHeader the Timeline mounts, so
                the collapse affordance is identical in both views. */}
            <TodayHeader
              open={timelineOpen}
              onToggleOpen={() => setTimelineOpen((o) => !o)}
              eventCount={todaysMeetings.filter((e) => !dismissedEventIds[e.id]).length}
              activeView={todayView}
              onToggleView={setTodayView}
              hiddenCount={Object.keys(dismissedEventIds).length}
              onRestore={onRestoreAllDismissed}
            />
            {timelineOpen && (
              <AgendaListView
                events={todaysMeetings}
                tomorrowEvents={tomorrowMeetings}
                tasks={tasks}
                state={state}
                projectsByPid={projectsByPid}
                dismissedIds={dismissedEventIds}
                onDismiss={onDismissEvent}
              />
            )}
          </section>
        )}

        {/* #105: heading no longer claims "All" — the pool is now what the due
            window admits, and the window picker sits next to the claim it makes. */}
        <div className="tk-ph" style={{ marginTop: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sk-t1)', margin: 0, whiteSpace: 'nowrap' }}>Tasks</h2>
          {/* The ONE locked toggle anatomy — never re-mint the inline pill group
              (docs/design-system.md; ui/SegmentedToggle.tsx). skin="tk" draws it
              as the Today tray. The labels are self-evident, so per the tooltip
              doctrine they carry none. */}
          <SegmentedToggle
            options={DUE_WINDOW_OPTIONS}
            value={dueWindow}
            onChange={setDueWindow}
            accent="teal"
            size="sm"
            skin="tk"
            ariaLabel="Show tasks due within"
          />
          <button
            type="button"
            onClick={() => setShowMilestones((v) => !v)}
            aria-pressed={showMilestones}
            aria-label="Show milestones"
            className="tk-pill tk-btnp tip planned-chip"
            data-tip={showMilestones ? 'Hide milestone rules' : 'Show milestone rules'}
            style={showMilestones ? { color: 'var(--sk-gold)' } : undefined}
          >
            <Diamond {...ICON_PROPS} size={11} />
            Milestones
          </button>
          {hiddenByWindow > 0 && (
            <button
              type="button"
              onClick={() => setDueWindow('all')}
              data-tip="Show every open task again"
              className="tk-further"
            >
              {hiddenByWindow} further out →
            </button>
          )}
          <span className="tk-hintx today-section-hint">click to expand · pin or drag the grip to plan</span>
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

        <section data-b2-completed className="tk-panel tk-blk">
          <div {...collapseToggleProps(completedOpen, () => setCompletedOpen(!completedOpen), 'Completed today')} className="tk-ph tk-clk">
            <div className="tk-ctog">
              <CollapseChevron open={completedOpen} />
              <h3>Completed today</h3>
              <span className="tk-cnt">{doneTodayDetail.length + localDoneIds.length}</span>
            </div>
          </div>
          {completedOpen && (
            <div>
              {doneTodayDetail.map((t) => (
                <div key={t.id} className="tk-crow">
                  <CardCheck done onToggle={() => state.uncheck(t.id)} />
                  <span>{t.short_title || t.title}</span>
                </div>
              ))}
              {localDoneIds.map((id) => {
                const t = (tasksQuery.data ?? []).find((x) => x.id === id)
                if (!t) return null
                return (
                  <div key={id} className="tk-crow">
                    <CardCheck done onToggle={() => state.uncheck(id)} />
                    <span>{t.short_title || t.title}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
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
