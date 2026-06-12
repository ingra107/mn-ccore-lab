// UnifiedMyTasks — My Tasks Round 2 parent: shared state + composition only.
//
// Three views (Columns / Lanes / List) share ONE toolbar (CLAUDE.md Rule 60):
// - Columns: Kanban — all 5 task groups side-by-side, inline expand within card
// - Lanes:   Stacked — focus one group, peek at others, inline expand below row
// - List:    Power mode — dense table, j/k/e/x keyboard nav, side drawer
//
// View picker lives far-left of the filter row (CD called this out — not a
// sidebar, not a tab, not a top-right toggle). Order List | Lanes | Columns;
// bare arrival defaults to List (Nick 2026-06-10); URL ?view= deep-links win.

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTasks, useProjects } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { researchTeam } from '../../data/team'
import { usePageMeta } from '../../hooks/usePageMeta'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { useBulkUpdateTasks, useUpdateTask, useCreateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../../components/UndoToast'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import CreateTaskModal from '../../components/tasks/CreateTaskModal'
import { TopBar } from './components/TopBar'
import { BulkBar } from './components/BulkBar'
import { ColumnsView } from './views/ColumnsView'
import { LanesView } from './views/LanesView'
import { ListView } from './views/ListView'
import { useTaskFilter } from './hooks/useTaskFilter'
import { useSelection } from './hooks/useSelection'
import { useOpenParam } from '../../hooks/useOpenParam'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  readPlannedToday, isTaskDone,
  type ViewMode, type GroupKey, type QuickViewKey, type FilterState, type FilterOption,
} from './constants'
import { localDateKey } from '../../lib/dateUtils'
import { useTodayPlan } from '../../lib/todayPlan'
import type { TaskRow } from '../../lib/api'

export default function UnifiedMyTasks() {
  usePageMeta('My Tasks · MN-CCORE', 'Library / workbench for triage, filtering, and bulk actions across all your tasks.')
  const { user } = useAuth()
  const userSlug = emailToSlug(user?.email)

  const tasksQuery = useTasks(userSlug ? { assignee: userSlug } : undefined)
  const projectsQuery = useProjects()

  // URL-backed state so DD-2 saved views can capture/restore via the
  // SavedViewsMenu. Bare arrival ALWAYS opens List (Nick 2026-06-10: "List as
  // default when I come to the page") — URL `?view=` deep-links and saved
  // views still win; the old localStorage.mt_view read is gone so a stale
  // persisted choice can't override the cold-load default.
  const [searchParams, setSearchParams] = useSearchParams()

  const initialView: ViewMode = (() => {
    const fromUrl = searchParams.get('view') as ViewMode | null
    if (fromUrl === 'columns' || fromUrl === 'lanes' || fromUrl === 'list') return fromUrl
    return 'list'
  })()
  const [view, setView] = useState<ViewMode>(initialView)

  // N1.14 — Columns is desktop kanban (5 fixed-width columns = ~1360px of
  // blind horizontal panning at phone widths). Below 768 it renders as List
  // with a one-line notice; the picker state is preserved so rotating a
  // tablet or widening the window restores Columns.
  const isPhone = useIsMobile(768)
  const effectiveView: ViewMode = isPhone && view === 'columns' ? 'list' : view

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [filter, setFilter] = useState<FilterState>({
    priority: searchParams.get('priority'),
    project: searchParams.get('project'),
    // MT-15 — restore mentee from URL like every other filter so saved
    // views with a mentee param survive a reload. Was hardcoded to null.
    mentee: searchParams.get('mentee'),
    group: (searchParams.get('group') as GroupKey | null) ?? null,
    hideCompleted: searchParams.get('hideCompleted') !== '0',
  })
  const [quickView, setQuickView] = useState<QuickViewKey>(
    (searchParams.get('filter') as QuickViewKey | null) ?? 'all'
  )
  const { selected, setSelected, toggleSelect, clearSelection } = useSelection()
  const [drawer, setDrawer] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Round-trip state into the URL so SavedViewsMenu's `currentQuery` capture
  // and restore round-trip is just URLSearchParams stringification.
  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (quickView !== 'all') next.set('filter', quickView)
    if (view !== 'list') next.set('view', view)
    if (filter.priority) next.set('priority', filter.priority)
    if (filter.project) next.set('project', filter.project)
    if (filter.mentee) next.set('mentee', filter.mentee)
    if (filter.group) next.set('group', filter.group)
    if (!filter.hideCompleted) next.set('hideCompleted', '0')
    // S1: carry a not-yet-consumed `open` deep-link param through this sync so
    // useOpenParam can still see it. Without this the sync would strip `open`
    // on first render before the consumer fires.
    const openParam = searchParams.get('open')
    if (openParam) next.set('open', openParam)
    // Same carry-through for the `create=true` deep-link (⌘K "Create Task",
    // Today/My-Hub quick actions, the `c` shortcut). Without it this state→URL
    // sync strips `create` before the consumer below opens the modal — the
    // class bug that left ⌘K → Create Task dead-ending on My Tasks.
    const createParam = searchParams.get('create')
    if (createParam) next.set('create', createParam)
    // Avoid spamming history: replace, not push.
    setSearchParams(next, { replace: true })
    // searchParams intentionally omitted from deps: this effect mirrors local
    // state INTO the URL; reading the live `open` value each run suffices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, quickView, view, filter, setSearchParams])

  // S1: consume `?open=<taskId>` deep-links (search results, ⌘K palette pick,
  // Copy-task-link, context-menu open-in-new-tab). Open the detail drawer for
  // that task once the task collection has loaded, then strip the param.
  useOpenParam('open', (id) => setDrawer(id), { ready: !tasksQuery.isLoading })

  const currentQuery = searchParams.toString()
  const applyView = useCallback((q: string) => {
    const p = new URLSearchParams(q)
    setSearch(p.get('q') ?? '')
    setQuickView((p.get('filter') as QuickViewKey | null) ?? 'all')
    const v = p.get('view') as ViewMode | null
    if (v === 'columns' || v === 'lanes' || v === 'list') setView(v)
    else setView('list')
    setFilter({
      priority: p.get('priority'),
      project: p.get('project'),
      mentee: p.get('mentee'),
      group: (p.get('group') as GroupKey | null) ?? null,
      hideCompleted: p.get('hideCompleted') !== '0',
    })
  }, [])

  // Re-read planned set on each render so /portal/dashboard updates flow through.
  // Workstream B (schema v75): planned-today derives from the SYNCED task columns
  // (planned_for == today), not the retired today_state_* localStorage blob.
  const plannedSet = useMemo(() => readPlannedToday(tasksQuery.data ?? []), [tasksQuery.data])
  const plan = useTodayPlan()

  const projectsByPid = useMemo(() => {
    const m = new Map<string, { name: string; slug: string; category?: string | null }>()
    for (const p of projectsQuery.data ?? []) {
      m.set(p.slug, { name: p.title ?? p.slug, slug: p.slug, category: p.category ?? null })
    }
    return m
  }, [projectsQuery.data])

  const projectOptions: FilterOption[] = useMemo(() => (
    (projectsQuery.data ?? []).map((p) => ({ v: p.slug, l: p.title ?? p.slug }))
  ), [projectsQuery.data])

  const allTasks = tasksQuery.data ?? []

  const { filtered, byGroup } = useTaskFilter({
    allTasks, filter, search, quickView, plannedSet, projectsByPid,
  })

  const drawerTask = drawer ? allTasks.find((t) => t.id === drawer) ?? null : null

  // Prev/next navigation across the filtered list (Alt+Up/Down inside the
  // panel). Closes MT-26.
  const drawerIndex = drawer ? filtered.findIndex((t) => t.id === drawer) : -1
  const onPrevTask = drawerIndex > 0
    ? () => setDrawer(filtered[drawerIndex - 1].id)
    : undefined
  const onNextTask = drawerIndex >= 0 && drawerIndex < filtered.length - 1
    ? () => setDrawer(filtered[drawerIndex + 1].id)
    : undefined

  // ── Bulk actions wired to real API ─────────────────────────
  const bulkUpdate = useBulkUpdateTasks()
  const updateTask = useUpdateTask()
  const undoToast = useUndoToast()

  // ── Create task ─────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  // Consume `?create=true` deep-links (⌘K "Create Task", Today/My-Hub quick
  // actions, the `c` keyboard shortcut). Opens the CreateTaskModal then strips
  // the param. This is the consumer half of the create=true class — UnifiedMyTasks
  // is the live /portal/my-tasks page (the legacy portal/MyTasks.tsx had a
  // consumer but is only mounted at /portal/my-tasks-legacy). `ready` is true
  // immediately — the modal doesn't depend on the task collection being loaded.
  useOpenParam('create', () => setShowCreate(true))
  const createTask = useCreateTask()
  const handleCreate = useCallback((task: {
    title: string
    description: string
    assignee: string
    project_id?: string
    due_date?: string
    priority?: string
  }) => {
    createTask.mutate(task, {
      onSuccess: () => undoToast.showSuccess('Task created'),
    })
    setShowCreate(false)
  }, [createTask, undoToast])

  const onBulkPlanToday = useCallback(() => {
    // Workstream B (schema v75): plan-for-today PATCHes the synced task columns
    // (planned_for/plan_slot/plan_rank) via the shared todayPlan primitive — no
    // more today_state_* localStorage. TodayPage derives the plan from the same
    // columns, so the two surfaces stay in sync across devices + team members.
    const all = tasksQuery.data ?? []
    for (const id of selected) plan.planTask(id, 'strip', all)
    undoToast.showSuccess(`Planned ${selected.size} task${selected.size === 1 ? '' : 's'} for today`)
    clearSelection()
  }, [selected, clearSelection, undoToast, plan, tasksQuery.data])

  const onBulkSnoozeDay = useCallback(() => {
    // No batch due_date action; loop via single-task updates.
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const due = localDateKey(tomorrow)
    const ids = [...selected]
    Promise.all(ids.map((id) => updateTask.mutateAsync({ id, fields: { due_date: due } })))
      .then(() => { undoToast.showSuccess(`Snoozed ${ids.length} task${ids.length === 1 ? '' : 's'} +1d`); clearSelection() })
      .catch((err) => { console.error('Snooze failed:', err); undoToast.showSuccess('Snooze failed — please try again.') })
  }, [selected, updateTask, clearSelection, undoToast])

  const onBulkComplete = useCallback(() => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'complete' }, {
      onSuccess: () => { undoToast.showSuccess(`Completed ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  // Single-row complete toggle for the shared Done square (handoff §0 rule 2 —
  // the square completes on every surface). Complete uses the same bulk
  // 'complete' path as InlineDetail + the bulk bar; un-complete reopens via a
  // direct status/completed write (there is no bulk 'uncomplete' action).
  const onToggleComplete = useCallback((task: TaskRow) => {
    const isDone = isTaskDone(task)
    if (isDone) {
      updateTask.mutate({ id: task.id, fields: { status: 'todo', completed: 0 } }, {
        onSuccess: () => undoToast.showSuccess('Marked not done'),
      })
    } else {
      bulkUpdate.mutate({ ids: [task.id], action: 'complete' }, {
        onSuccess: () => undoToast.showSuccess('Completed'),
      })
    }
  }, [updateTask, bulkUpdate, undoToast])

  const onBulkArchive = useCallback(() => {
    if (!window.confirm(`Archive ${selected.size} task${selected.size === 1 ? '' : 's'}? They'll be soft-deleted.`)) return
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'delete' }, {
      onSuccess: () => { undoToast.showSuccess(`Archived ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  const onBulkReassign = useCallback((slug: string) => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'assign', value: slug }, {
      onSuccess: () => { undoToast.showSuccess(`Reassigned ${ids.length} task${ids.length === 1 ? '' : 's'} → ${slug}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  const onBulkPriority = useCallback((priority: string) => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'priority', value: priority }, {
      onSuccess: () => { undoToast.showSuccess(`Set priority → ${priority} for ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  const onBulkStatus = useCallback((status: string) => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'status', value: status }, {
      onSuccess: () => { undoToast.showSuccess(`Set status → ${status} for ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

  // Assignee options for bulk Reassign picker — directors + research team + faculty.
  // Uses the same researchTeam used for the Mentee filter.
  const assigneeOptions = useMemo(() => {
    const all: Array<{ slug: string; name: string }> = []
    all.push({ slug: 'nick-ingraham', name: 'Nick Ingraham' })
    all.push({ slug: 'nida-mohamud', name: 'Nida Mohamud' })
    for (const m of researchTeam) if (m.slug) all.push({ slug: m.slug, name: m.name })
    return all
  }, [])

  const isLoading = tasksQuery.isLoading || projectsQuery.isLoading

  return (
    /* P1-1 + fix (Nick 2026-06-10): no page-wide bg tint — My Tasks sits on the
       global page bg like every other page ("background color around the entire
       page"). The toolbar + views band-center their content via .mt-band so the
       primary column's left edge matches the data pages. Cards/rows keep their
       own surfaces. */
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', color: 'var(--task-ink)', fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', overflow: 'hidden' }}>
      <TopBar
        view={view} setView={setView}
        search={search} setSearch={setSearch}
        filter={filter} setFilter={setFilter}
        quickView={quickView} setQuickView={setQuickView}
        taskCount={filtered.length}
        projectOptions={projectOptions}
        currentQuery={currentQuery}
        onApplyView={applyView}
        onCreateTask={() => setShowCreate(true)}
      />
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onClear={clearSelection}
          onPlanToday={onBulkPlanToday}
          onSnoozeDay={onBulkSnoozeDay}
          onComplete={onBulkComplete}
          onArchive={onBulkArchive}
          onReassign={onBulkReassign}
          onPriority={onBulkPriority}
          onStatus={onBulkStatus}
          assigneeOptions={assigneeOptions}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {isLoading ? (
            <div className="mt-band" style={{ paddingTop: 24, paddingBottom: 24 }}><div style={{ maxWidth: 'var(--col-main)' }}><TableSkeleton /></div></div>
          ) : effectiveView === 'columns' ? (
            <ColumnsView filtered={filtered} byGroup={byGroup} selected={selected} toggleSelect={toggleSelect} onToggleComplete={onToggleComplete} onOpenEditor={setDrawer} expanded={expanded} setExpanded={setExpanded} projectsByPid={projectsByPid} plannedSet={plannedSet} filterGroup={filter.group} />
          ) : effectiveView === 'lanes' ? (
            <LanesView byGroup={byGroup} selected={selected} toggleSelect={toggleSelect} onToggleComplete={onToggleComplete} onOpenEditor={setDrawer} expanded={expanded} setExpanded={setExpanded} projectsByPid={projectsByPid} plannedSet={plannedSet} filterGroup={filter.group} />
          ) : (
            <>
              {view === 'columns' && (
                <div className="mt-band" style={{ paddingTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.85 }}>Columns is a desktop view — showing List on this screen.</span>
                </div>
              )}
              <ListView filtered={filtered} selected={selected} toggleSelect={toggleSelect} setSelected={setSelected} setDrawer={setDrawer} projectsByPid={projectsByPid} projectOptions={projectOptions} plannedSet={plannedSet} />
            </>
          )}
        </div>
      </div>
      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
      {drawerTask && (
        <TaskDetailPanel
          task={drawerTask}
          onClose={() => setDrawer(null)}
          onPrev={onPrevTask}
          onNext={onNextTask}
        />
      )}
    </div>
  )
}
