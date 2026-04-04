import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { TaskRow } from '../../lib/api'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { AlertTriangle, GripVertical } from 'lucide-react'
import { CardSkeleton } from '../../components/LoadingSkeleton'
import { usePBCommandCenter, useDispatchPending } from '../../hooks/useApiData'
import {
  usePBCapture, useUpdateTaskStatus,
  useSaveDailyPlan, useReorderPlan, useSaveReflection, useStartPomodoro,
  useSendDispatch,
} from '../../hooks/useMutations'
import PlannerHeader from '../../components/pb-sector/PlannerHeader'
import StarTaskSlot from '../../components/pb-sector/StarTaskSlot'
import FocusTaskSlot from '../../components/pb-sector/FocusTaskSlot'
import QuickWinsList from '../../components/pb-sector/QuickWinsList'
import ReflectionPanel from '../../components/pb-sector/ReflectionPanel'
import TaskSearchDropdown from '../../components/pb-sector/TaskSearchDropdown'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import DispatchBadge from '../../components/pb-sector/DispatchBadge'
import LandscapeSidebar from '../../components/pb-sector/LandscapeSidebar'
import { getDailyQuote } from '../../data/daily-quotes'

// ── Helpers ────────────────────────────────────────────────

function resolveTaskById(allTasks: any[], id: string): any | null {
  return allTasks.find((t: any) => t.id === id) || null
}

function parseJsonArray(val: string | null): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

// ── Main Component ────────────────────────────────────────

export default function PBSector() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const { data, isLoading } = usePBCommandCenter(selectedDate)
  const capture = usePBCapture()
  const completeTask = useUpdateTaskStatus()
  const savePlan = useSaveDailyPlan()
  const reorderPlan = useReorderPlan()
  const saveReflection = useSaveReflection()
  const startPomodoro = useStartPomodoro()
  const sendDispatch = useSendDispatch()
  const { data: dispatchData } = useDispatchPending()

  const [captureText, setCaptureText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchSlot, setSearchSlot] = useState<'star' | 'focus' | 'quick_win'>('focus')
  const [activeTask, setActiveTask] = useState<any>(null)
  const [detailTask, setDetailTask] = useState<TaskRow | null>(null)
  const captureInputRef = useRef<HTMLInputElement>(null)

  // C key → focus capture bar (when no input focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return
        e.preventDefault()
        captureInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // ── Derived state ───────────────────────────────────────

  const allTasks = useMemo(() => {
    if (!data) return []
    const { focusNow, today, thisWeek, backlog } = data.sections
    return [...focusNow, ...today, ...thisWeek, ...backlog]
  }, [data])

  const plan = data?.dailyPlan
  const starTaskId = plan?.star_task_id || null
  const focusTaskIds = useMemo(() => parseJsonArray(plan?.focus_task_ids ?? null), [plan])
  const quickWinIds = useMemo(() => parseJsonArray(plan?.quick_win_ids ?? null), [plan])

  const starTask = useMemo(() => starTaskId ? resolveTaskById(allTasks, starTaskId) : null, [allTasks, starTaskId])
  const focusTasks = useMemo(() => focusTaskIds.map(id => resolveTaskById(allTasks, id)).filter(Boolean), [allTasks, focusTaskIds])
  const quickWinTasks = useMemo(() => quickWinIds.map(id => resolveTaskById(allTasks, id)).filter(Boolean), [allTasks, quickWinIds])

  // All task IDs currently in the plan
  const plannedIds = useMemo(() => {
    const s = new Set<string>()
    if (starTaskId) s.add(starTaskId)
    focusTaskIds.forEach(id => s.add(id))
    quickWinIds.forEach(id => s.add(id))
    return s
  }, [starTaskId, focusTaskIds, quickWinIds])

  // Pomodoro data per task
  const pomodoroData = useMemo(() => {
    const map: Record<string, { completed: number; active: boolean }> = {}
    for (const s of (data?.pomodoroSessions || [])) {
      if (!map[s.task_id]) map[s.task_id] = { completed: 0, active: false }
      if (s.completed) map[s.task_id].completed++
      else map[s.task_id].active = true
    }
    return map
  }, [data])

  // Smart suggestions (from API)
  const suggestions = data?.suggestions

  // Calendar events for today
  const todayEvents = useMemo(() => {
    if (!data?.meetings) return []
    return data.meetings.map((m: any) => ({
      id: m.id,
      date: m.date,
      title: m.title,
      type: 'meeting' as const,
      meta: m,
    }))
  }, [data])

  // Daily quote (deterministic per day)
  const quote = useMemo(() => getDailyQuote(selectedDate), [selectedDate])

  // Carry-forward suggestions (from API for non-today dates)
  const carryForward = data?.carryForward

  // Use carry-forward as suggestions when no plan exists yet
  const starSuggestionWithCarry = useMemo(() => {
    if (starTask) return null
    // Carry-forward takes priority over algorithm suggestions
    if (carryForward?.starTask && !plannedIds.has(carryForward.starTask.id)) {
      return { ...carryForward.starTask, _isCarried: true }
    }
    if (!suggestions?.starCandidates?.length) return null
    return suggestions.starCandidates.find((t: any) => !plannedIds.has(t.id)) || null
  }, [starTask, carryForward, suggestions, plannedIds])

  const focusSuggestionsWithCarry = useMemo(() => {
    const slotsNeeded = 3 - focusTasks.length
    if (slotsNeeded <= 0) return []
    // Carry-forward first, then algorithm
    const carried = (carryForward?.focusTasks || [])
      .filter((t: any) => !plannedIds.has(t.id) && t.id !== starSuggestionWithCarry?.id)
      .map((t: any) => ({ ...t, _isCarried: true }))
    const algoSuggestions = (suggestions?.focusCandidates || [])
      .filter((t: any) => !plannedIds.has(t.id) && t.id !== starSuggestionWithCarry?.id && !carried.some((c: any) => c.id === t.id))
    return [...carried, ...algoSuggestions].slice(0, slotsNeeded)
  }, [carryForward, suggestions, focusTasks.length, plannedIds, starSuggestionWithCarry])

  // ── Handlers ────────────────────────────────────────────

  const today = data?.today || new Date().toISOString().split('T')[0]

  const handleSavePlan = useCallback((updates: Record<string, any>) => {
    savePlan.mutate({ plan_date: selectedDate, ...updates })
  }, [savePlan, selectedDate])

  const handleComplete = useCallback((id: string) => {
    completeTask.mutate({ id, status: 'done' })
  }, [completeTask])

  const handleCapture = useCallback(() => {
    if (!captureText.trim()) return
    const isIdea = captureText.startsWith('idea:')
    capture.mutate({
      text: isIdea ? captureText.slice(5).trim() : captureText.trim(),
      type: isIdea ? 'idea' : 'task',
    })
    setCaptureText('')
  }, [capture, captureText])

  const handleClickTitle = useCallback((task: any) => {
    setDetailTask(task as TaskRow)
  }, [])

  const handleStartPomo = useCallback((taskId: string) => {
    // Determine which slot this task is in
    const slotType = taskId === starTaskId ? 'star'
      : focusTaskIds.includes(taskId) ? 'focus'
      : 'quick_win'
    startPomodoro.mutate({ task_id: taskId, plan_date: selectedDate, slot_type: slotType })
  }, [startPomodoro, selectedDate, starTaskId, focusTaskIds])

  const handleAddToSlot = useCallback((task: any) => {
    if (searchSlot === 'star') {
      handleSavePlan({ star_task_id: task.id })
    } else if (searchSlot === 'focus') {
      const newFocus = [...focusTaskIds, task.id].slice(0, 3)
      handleSavePlan({ focus_task_ids: newFocus })
    } else {
      handleSavePlan({ quick_win_ids: [...quickWinIds, task.id] })
    }
  }, [searchSlot, focusTaskIds, quickWinIds, handleSavePlan])

  const openSearch = useCallback((slot: 'star' | 'focus' | 'quick_win') => {
    setSearchSlot(slot)
    setSearchOpen(true)
  }, [])

  // ── Drag & Drop ─────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task
    if (task) setActiveTask(task)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current
    const overData = over.data.current
    if (!activeData) return

    const taskId = active.id as string
    const fromSlot = activeData.slotType as string
    const toSlot = overData?.slotType as string || overData?.type === 'slot' ? (over.id as string).replace('-slot', '') : fromSlot

    // Reorder within same slot
    if (fromSlot === toSlot && fromSlot === 'focus') {
      const oldIndex = focusTaskIds.indexOf(taskId)
      const overTaskId = over.id as string
      const newIndex = focusTaskIds.indexOf(overTaskId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(focusTaskIds, oldIndex, newIndex)
        reorderPlan.mutate({ plan_date: selectedDate, slot_type: 'focus', task_ids: reordered })
      }
    } else if (fromSlot === toSlot && fromSlot === 'quick_win') {
      const oldIndex = quickWinIds.indexOf(taskId)
      const overTaskId = over.id as string
      const newIndex = quickWinIds.indexOf(overTaskId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(quickWinIds, oldIndex, newIndex)
        reorderPlan.mutate({ plan_date: selectedDate, slot_type: 'quick_win', task_ids: reordered })
      }
    }
    // Cross-slot: drop on star slot
    else if (toSlot === 'star' || over.id === 'star-slot') {
      const oldStar = starTaskId
      // Remove from source
      const newFocus = focusTaskIds.filter(id => id !== taskId)
      const newQuick = quickWinIds.filter(id => id !== taskId)
      // If old star exists, demote to focus #1
      if (oldStar && oldStar !== taskId) {
        newFocus.unshift(oldStar)
        if (newFocus.length > 3) newQuick.unshift(newFocus.pop()!)
      }
      handleSavePlan({ star_task_id: taskId, focus_task_ids: newFocus, quick_win_ids: newQuick })
    }
    // Cross-slot: drop on focus
    else if (toSlot === 'focus' || over.id === 'focus-slot') {
      if (focusTasks.length >= 3 && fromSlot !== 'focus') return // Full
      let newStar = starTaskId
      const newFocus = focusTaskIds.filter(id => id !== taskId)
      const newQuick = quickWinIds.filter(id => id !== taskId)
      if (fromSlot === 'star') newStar = null
      newFocus.push(taskId)
      handleSavePlan({ star_task_id: newStar, focus_task_ids: newFocus.slice(0, 3), quick_win_ids: newQuick })
    }
    // Cross-slot: drop on quick wins
    else if (toSlot === 'quick_win' || over.id === 'quick-win-slot') {
      let newStar = starTaskId
      const newFocus = focusTaskIds.filter(id => id !== taskId)
      const newQuick = quickWinIds.filter(id => id !== taskId)
      if (fromSlot === 'star') newStar = null
      newQuick.push(taskId)
      handleSavePlan({ star_task_id: newStar, focus_task_ids: newFocus, quick_win_ids: newQuick })
    }
  }, [focusTaskIds, quickWinIds, starTaskId, focusTasks.length, selectedDate, reorderPlan, handleSavePlan])

  // ── Loading / Error states ──────────────────────────────

  if (isLoading) return <CardSkeleton count={4} />

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle size={24} style={{ color: 'var(--maroon)', opacity: 0.5 }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>Could not load planner data.</span>
        </div>
      </div>
    )
  }

  const { greeting, mode, stats } = data

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <PlannerHeader
        greeting={greeting}
        mode={mode}
        today={today}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        stats={stats}
        intention={plan?.intention ?? null}
        gratitude={plan?.gratitude ?? null}
        onSaveIntention={(text) => handleSavePlan({ intention: text })}
        onSaveGratitude={(text) => handleSavePlan({ gratitude: text })}
        quote={quote}
        dispatchSlot={
          <DispatchBadge
            items={dispatchData?.items || []}
            count={dispatchData?.count || 0}
            onSend={() => sendDispatch.mutate()}
            isSending={sendDispatch.isPending}
          />
        }
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left Column — Planner Slots */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-6">
            <StarTaskSlot
              task={starTask}
              pomodorosCompleted={starTask ? (pomodoroData[starTask.id]?.completed || 0) : 0}
              pomodoroActive={starTask ? (pomodoroData[starTask.id]?.active || false) : false}
              onComplete={handleComplete}
              onStartPomo={handleStartPomo}
              onClickTitle={handleClickTitle}
              onAddClick={() => openSearch('star')}
              suggestion={starSuggestionWithCarry}
              onAcceptSuggestion={(task) => handleSavePlan({ star_task_id: task.id })}
            />

            <FocusTaskSlot
              tasks={focusTasks}
              pomodoroData={pomodoroData}
              onComplete={handleComplete}
              onStartPomo={handleStartPomo}
              onClickTitle={handleClickTitle}
              onAddClick={() => openSearch('focus')}
              suggestions={focusSuggestionsWithCarry}
              onAcceptSuggestion={(task) => {
                const newFocus = [...focusTaskIds, task.id].slice(0, 3)
                handleSavePlan({ focus_task_ids: newFocus })
              }}
            />

            <QuickWinsList
              tasks={quickWinTasks}
              onComplete={handleComplete}
              onClickTitle={handleClickTitle}
              onAddClick={() => openSearch('quick_win')}
            />
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeTask && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg"
                style={{ background: 'var(--cream)', border: '2px solid var(--gold)', maxWidth: 400 }}
              >
                <GripVertical size={14} style={{ color: 'var(--gold)', opacity: 0.5 }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>
                  {activeTask.title || activeTask.description}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* Right Column — Landscape Sidebar */}
        <LandscapeSidebar
          mode={mode}
          events={todayEvents}
          milestones={data.milestones || []}
          commitments={data.commitments || []}
          projects={data.projects || []}
          stats={stats}
          recentlyCompleted={data.sections.recentlyCompleted || []}
          meetings={data.meetings || []}
          selectedDate={selectedDate}
          today={today}
        />
      </div>

      {/* Quick Capture */}
      <div className="mt-10 mb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={captureInputRef}
              type="text"
              placeholder="Capture anything — task, idea, or note..."
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCapture() }}
              className="w-full px-4 py-3 rounded-xl text-sm transition-all"
              style={{
                fontFamily: 'var(--font-body)',
                border: '1px solid var(--border-light)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                outline: 'none',
                boxShadow: '0 0 0 0px rgba(45,138,138,0)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(45,138,138,0.12)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = '0 0 0 0px rgba(45,138,138,0)' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2" style={{
              fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--slate)', opacity: 0.35,
            }}>
              <kbd className="px-1.5 py-0.5 rounded" style={{ border: '1px solid var(--border-light)', fontSize: '9px' }}>C</kbd>
              Enter to capture
            </span>
          </div>
        </div>
      </div>

      {/* Reflection */}
      <ReflectionPanel
        reflection={data.dailyReflection || null}
        onSave={(reflData) => saveReflection.mutate({ plan_date: selectedDate, ...reflData })}
      />

      {/* Task Search Dropdown */}
      <TaskSearchDropdown
        tasks={allTasks}
        excludeIds={plannedIds}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleAddToSlot}
        slotLabel={searchSlot === 'star' ? 'Star Task' : searchSlot === 'focus' ? 'Focus Tasks' : 'Quick Wins'}
      />

      {/* Task Detail Slide-over */}
      <TaskDetailPanel
        task={detailTask}
        onClose={() => setDetailTask(null)}
      />
    </div>
  )
}
