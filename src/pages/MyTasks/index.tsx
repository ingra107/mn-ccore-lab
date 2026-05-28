// UnifiedMyTasks — My Tasks Round 2 parent: shared state + composition only.
//
// Three views (Columns / Lanes / List) share ONE toolbar (CLAUDE.md Rule 60):
// - Columns: Kanban — all 5 task groups side-by-side, inline expand within card
// - Lanes:   Stacked — focus one group, peek at others, inline expand below row
// - List:    Power mode — dense table, j/k/e/x keyboard nav, side drawer
//
// View picker lives far-left of the filter row (CD called this out — not a
// sidebar, not a tab, not a top-right toggle). Persists to localStorage.mt_view.

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
import {
  todayKey, readPlannedToday,
  type ViewMode, type GroupKey, type QuickViewKey, type FilterState, type FilterOption,
} from './constants'
import { localDateKey } from '../../lib/dateUtils'

export default function UnifiedMyTasks() {
  usePageMeta('My Tasks · MN-CCORE', 'Library / workbench for triage, filtering, and bulk actions across all your tasks.')
  const { user } = useAuth()
  const userSlug = emailToSlug(user?.email)

  const tasksQuery = useTasks(userSlug ? { assignee: userSlug } : undefined)
  const projectsQuery = useProjects()

  // URL-backed state so DD-2 saved views can capture/restore via the
  // SavedViewsMenu. View persists to localStorage too (per CD memory)
  // so first-load picks up last shape even if URL is bare.
  const [searchParams, setSearchParams] = useSearchParams()

  const initialView: ViewMode = (() => {
    const fromUrl = searchParams.get('view') as ViewMode | null
    if (fromUrl === 'columns' || fromUrl === 'lanes' || fromUrl === 'list') return fromUrl
    try { return (window.localStorage.getItem('mt_view') as ViewMode) || 'columns' } catch { return 'columns' }
  })()
  const [view, setView] = useState<ViewMode>(initialView)
  useEffect(() => {
    try { window.localStorage.setItem('mt_view', view) } catch { /* ignore */ }
  }, [view])

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
    if (view !== 'columns') next.set('view', view)
    if (filter.priority) next.set('priority', filter.priority)
    if (filter.project) next.set('project', filter.project)
    if (filter.mentee) next.set('mentee', filter.mentee)
    if (filter.group) next.set('group', filter.group)
    if (!filter.hideCompleted) next.set('hideCompleted', '0')
    // Avoid spamming history: replace, not push.
    setSearchParams(next, { replace: true })
  }, [search, quickView, view, filter, setSearchParams])

  const currentQuery = searchParams.toString()
  const applyView = useCallback((q: string) => {
    const p = new URLSearchParams(q)
    setSearch(p.get('q') ?? '')
    setQuickView((p.get('filter') as QuickViewKey | null) ?? 'all')
    const v = p.get('view') as ViewMode | null
    if (v === 'columns' || v === 'lanes' || v === 'list') setView(v)
    else setView('columns')
    setFilter({
      priority: p.get('priority'),
      project: p.get('project'),
      mentee: p.get('mentee'),
      group: (p.get('group') as GroupKey | null) ?? null,
      hideCompleted: p.get('hideCompleted') !== '0',
    })
  }, [])

  // Re-read planned set on each render so /portal/dashboard updates flow through.
  const plannedSet = useMemo(() => readPlannedToday(), [tasksQuery.data])

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
    // Writes to today_state localStorage so TodayPage picks them up.
    const key = `today_state_${todayKey()}`
    let snap: { rightNow?: string | null; planned?: Record<string, { slot: string }>; done?: Record<string, boolean> } = {}
    try { snap = JSON.parse(window.localStorage.getItem(key) || '{}') } catch { /* ignore */ }
    snap.planned = snap.planned ?? {}
    for (const id of selected) snap.planned[id] = { slot: 'strip' }
    try { window.localStorage.setItem(key, JSON.stringify(snap)) } catch { /* ignore */ }
    undoToast.showSuccess(`Planned ${selected.size} task${selected.size === 1 ? '' : 's'} for today`)
    clearSelection()
  }, [selected, clearSelection, undoToast])

  const onBulkSnoozeDay = useCallback(() => {
    // No batch due_date action; loop via single-task updates.
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const due = localDateKey(tomorrow)
    const ids = [...selected]
    Promise.all(ids.map((id) => updateTask.mutateAsync({ id, fields: { due_date: due } })))
      .then(() => { undoToast.showSuccess(`Snoozed ${ids.length} task${ids.length === 1 ? '' : 's'} +1d`); clearSelection() })
      .catch((err) => { console.error('Snooze failed:', err); alert('Snooze failed') })
  }, [selected, updateTask, clearSelection, undoToast])

  const onBulkComplete = useCallback(() => {
    const ids = [...selected]
    bulkUpdate.mutate({ ids, action: 'complete' }, {
      onSuccess: () => { undoToast.showSuccess(`Completed ${ids.length} task${ids.length === 1 ? '' : 's'}`); clearSelection() },
    })
  }, [selected, bulkUpdate, clearSelection, undoToast])

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--task-page-bg)', color: 'var(--task-ink)', fontFamily: 'var(--font-sans), \'DM Sans\', system-ui, sans-serif', overflow: 'hidden' }}>
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
            <div style={{ padding: 24 }}><TableSkeleton /></div>
          ) : view === 'columns' ? (
            <ColumnsView filtered={filtered} byGroup={byGroup} selected={selected} toggleSelect={toggleSelect} expanded={expanded} setExpanded={setExpanded} projectsByPid={projectsByPid} plannedSet={plannedSet} filterGroup={filter.group} />
          ) : view === 'lanes' ? (
            <LanesView byGroup={byGroup} selected={selected} toggleSelect={toggleSelect} expanded={expanded} setExpanded={setExpanded} projectsByPid={projectsByPid} plannedSet={plannedSet} filterGroup={filter.group} />
          ) : (
            <ListView filtered={filtered} selected={selected} toggleSelect={toggleSelect} setSelected={setSelected} setDrawer={setDrawer} projectsByPid={projectsByPid} projectOptions={projectOptions} plannedSet={plannedSet} />
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
