// InlineDetail — task detail panel that expands inline within Columns + Lanes
// views. Action bar (Work / Plan today / Move → / Snooze / Archive) +
// SmartCompose directly under action bar + 3-entry newest-first activity peek +
// meta line. Per CD spec: action bar mirrors the TaskDetailDrawer on TodayPage,
// so behaviour is consistent across surfaces.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useEffect, useCallback, useRef } from 'react'
import SmartCompose from '../../../components/SmartCompose'
import { useUpdateTask, useBulkUpdateTasks, useToggleSubtask } from '../../../hooks/useMutations'
import { useTaskDetail } from '../../../hooks/useApiData'
import { useQueryClient } from '@tanstack/react-query'
import { useAutoAcknowledge } from '../../../hooks/useAutoAcknowledge'
import { useUndoToast } from '../../../components/UndoToast'
import { localDateKey } from '../../../lib/dateUtils'
import { TaskActivityFeed } from '../../../components/tasks/detail/TaskActivityFeed'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_GREEN,
  INK, INK_DIM, PAGE_BG, PANEL_BG,
  MOVE_OPTIONS,
  isTaskDone,
} from '../constants'
import { useTodayPlan } from '../../../lib/todayPlan'
import { todayKey } from '../../../lib/taskGrouping'
import { withAlpha } from '../../../lib/taskGrouping'
import type { TaskRow } from '../../../lib/api'
import GhostSelect from '../../../components/ui/GhostSelect'
import { ProjectInlineGhostSelect, DueInlineSelect } from '../../../components/tasks/detail/FieldControls'
import TaskDetailPanel from '../../../components/tasks/TaskDetailPanel'

// Muted color for feed items (not in the re-exported constants set).
const INK_MUTED = 'rgba(226,232,240,0.70)'

export function InlineDetail({ task, projectName, onOpenEditor }: { task: TaskRow; projectName?: string | null; onOpenEditor?: () => void }) {
  // Real handlers (no longer decorative). Reach for mutations directly so the
  // component is self-contained and the parent doesn't need to drill props.
  const updateTask = useUpdateTask()
  const bulkUpdate = useBulkUpdateTasks()
  const undoToast = useUndoToast()
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  const nextStep = detail?.subtasks?.find((s) => s.completed !== 1) ?? null
  const toggleSubtask = useToggleSubtask(task.id)
  const queryClient = useQueryClient()
  const plan = useTodayPlan()
  // Slack-style seen (Nick 2026-06-11): expanding the row acknowledges the
  // assignment silently when the viewer is the assignee.
  useAutoAcknowledge(task)
  // Workstream B (schema v75): promoted / planned derive from the SYNCED task
  // columns on THIS row (planned_for == today), not the retired today_state_* LS.
  const plannedToday = !!task.planned_for && task.planned_for.slice(0, 10) === todayKey()
  const isPromoted = plannedToday && task.plan_slot === 'right_now'
  const isPlanned = plannedToday
  const [moveOpen, setMoveOpen] = useState(false)
  const [fullEditorTask, setFullEditorTask] = useState<TaskRow | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moveOpen) return
    const close = (e: MouseEvent) => { if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moveOpen])

  const moveToGroup = useCallback((opt: typeof MOVE_OPTIONS[number]) => {
    updateTask.mutate({ id: task.id, fields: { group_override: opt.key } }, {
      onSuccess: () => { undoToast.showSuccess(`Moved to ${opt.label}`); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])
  const resetGroup = useCallback(() => {
    updateTask.mutate({ id: task.id, fields: { group_override: null } }, {
      onSuccess: () => { undoToast.showSuccess('Reset to auto-classify'); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])

  const promote = useCallback(() => {
    // PATCHes the synced columns (right_now singleton enforced via the cache);
    // tasks=[] → useTodayPlan scans the ['tasks'] cache for the prior right_now.
    plan.promoteToRightNow(task.id, [])
    undoToast.showSuccess('Promoted to Right Now on Today')
  }, [task.id, plan, undoToast])

  const planToday = useCallback(() => {
    plan.planTask(task.id, 'strip')
    undoToast.showSuccess('Planned for today')
  }, [task.id, plan, undoToast])

  const snooze = useCallback(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const due = localDateKey(tomorrow)
    updateTask.mutate({ id: task.id, fields: { due_date: due } }, {
      onSuccess: () => undoToast.showSuccess('Snoozed +1 day'),
    })
  }, [task.id, updateTask, undoToast])

  // MT-02 — Archive must SOFT-DELETE (set deleted_at), not flip to done.
  // The bulk-archive path on this page already does the right thing via
  // bulkUpdate({ action: 'delete' }); the single-row path used to write
  // status:'done', completed:1 — same word, different state transition.
  // Match the bulk path so confirm copy ("they'll be soft-deleted") matches.
  const archive = useCallback(() => {
    if (!window.confirm('Archive this task? It will be soft-deleted.')) return
    bulkUpdate.mutate({ ids: [task.id], action: 'delete' }, {
      onSuccess: () => undoToast.showSuccess('Archived'),
    })
  }, [task.id, bulkUpdate, undoToast])

  // MT-10 — single-row Complete button. Without it the only completion path
  // was select-then-bulk (3 clicks for what should be 1).
  const complete = useCallback(() => {
    if (isTaskDone(task)) return
    bulkUpdate.mutate({ ids: [task.id], action: 'complete' }, {
      onSuccess: () => undoToast.showSuccess('Completed'),
    })
  }, [task.id, task.completed, task.status, bulkUpdate, undoToast])
  const isCompleted = isTaskDone(task)

  // "view all →" opens the full editor via the prop path that already exists
  // in MyTasksRow → InlineDetail chain (opens TaskDetailPanel, Rule 71).
  const handleViewAll = useCallback(() => {
    if (onOpenEditor) onOpenEditor()
    else setFullEditorTask(task)
  }, [onOpenEditor, task])

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10 }}>

      {/* Description — clamped to ~3 lines with "more" expander (C) */}
      {task.description && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 11,
              color: INK_MUTED,
              lineHeight: 1.5,
              ...(descExpanded ? {} : {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
                overflow: 'hidden',
              }),
            }}
          >{task.description}</div>
          {!descExpanded && (
            <button
              onClick={() => setDescExpanded(true)}
              style={{ fontSize: 10, color: INK_DIM, background: 'transparent', border: 'none', padding: '1px 0', cursor: 'pointer', fontFamily: 'inherit' }}
            >more</button>
          )}
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', position: 'relative' }}>
        {!isPromoted && (
          <button onClick={promote} title="Promote to Right Now on Today" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 'var(--radius-sm)', border: 'none', background: ACCENT_GOLD, color: PAGE_BG, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>▶ Work on this</button>
        )}
        {!isPlanned && (
          <button onClick={planToday} title="Add to today's planned strip" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}>📌 Plan today</button>
        )}
        <div ref={moveRef} style={{ position: 'relative' }}>
          <button onClick={() => setMoveOpen((o) => !o)} title="Move to a different group (changes priority to match)" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 'var(--radius-sm)', border: `1px solid ${moveOpen ? ACCENT_TEAL : 'transparent'}`, background: moveOpen ? withAlpha(ACCENT_TEAL, 13) : 'transparent', color: moveOpen ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: 'pointer' }}>Move →</button>
          {moveOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radius-sm)', zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              {MOVE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => moveToGroup(opt)}
                  disabled={updateTask.isPending}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: task.group_override === opt.key ? 'rgba(92,188,180,0.15)' : 'transparent', border: 'none', color: task.group_override === opt.key ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer' }}
                >{opt.label}{task.group_override === opt.key ? ' ✓' : ''}</button>
              ))}
              {task.group_override && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <button
                    onClick={resetGroup}
                    disabled={updateTask.isPending}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: 'transparent', border: 'none', color: INK_DIM, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer', fontStyle: 'italic' }}
                  >↺ Reset to auto-classify</button>
                </>
              )}
            </div>
          )}
        </div>
        <button onClick={snooze} title="Push due date +1 day" disabled={updateTask.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer', opacity: updateTask.isPending ? 0.5 : 1 }}>Snooze +1d</button>
        {!isCompleted && (
          <button onClick={complete} title="Mark complete" disabled={bulkUpdate.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: ACCENT_GREEN, fontFamily: 'inherit', cursor: bulkUpdate.isPending ? 'wait' : 'pointer', opacity: bulkUpdate.isPending ? 0.5 : 1 }}>✓ Complete</button>
        )}
        <button onClick={archive} title="Soft-delete this task" disabled={bulkUpdate.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: INK_DIM, fontFamily: 'inherit', cursor: bulkUpdate.isPending ? 'wait' : 'pointer' }}>Archive</button>
      </div>

      {/* SmartCompose — directly under action bar (A2) with @me lock toggle */}
      <div style={{ marginBottom: 10 }}>
        <SmartCompose taskId={task.id} placeholder="Add a note or @hermes…" showMeLock showHermesToggle bare alwaysShowToolbar />
      </div>

      {/* Next step — first open subtask, silent when none */}
      {nextStep && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: 10, color: INK_DIM, flexShrink: 0, paddingTop: 1 }}>Next step</span>
          <button
            onClick={() => toggleSubtask.mutate(nextStep.id, {
              onSettled: () => queryClient.invalidateQueries({ queryKey: ['task-detail', task.id] }),
            })}
            style={{ fontSize: 12, color: INK, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', lineHeight: 1.4 }}
          >☐ {nextStep.title}</button>
        </div>
      )}

      {/* Activity peek — 3-entry newest-first; "view all →" opens full editor */}
      <div style={{ marginBottom: 10, paddingTop: 8 }}>
        <TaskActivityFeed taskId={task.id} peekCount={3} hidePills avatarSize="xs" />
        <button
          onClick={handleViewAll}
          style={{ fontSize: 10, color: ACCENT_TEAL, background: 'transparent', border: 'none', padding: '3px 0', cursor: 'pointer', fontFamily: 'inherit' }}
        >view all →</button>
      </div>

      {/* Inline field row: Status · Priority · Project · Due — canonical GhostSelect */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 4, padding: '8px 0 4px' }} onClick={(e) => e.stopPropagation()}>
        <GhostSelect
          aria-label="Status"
          value={task.status}
          onChange={(v) => updateTask.mutate({ id: task.id, fields: { status: v } })}
          options={[
            { value: 'todo', label: 'To Do' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'waiting_external', label: 'Waiting (Ext.)' },
            { value: 'blocked', label: 'Blocked' },
            { value: 'done', label: 'Done' },
          ]}
        />
        <GhostSelect
          aria-label="Priority"
          value={task.priority || 'medium'}
          onChange={(v) => updateTask.mutate({ id: task.id, fields: { priority: v } })}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' },
          ]}
        />
        <ProjectInlineGhostSelect
          value={task.project_id || ''}
          onChange={(v) => updateTask.mutate({ id: task.id, fields: { project_id: v || null } })}
        />
        <DueInlineSelect
          value={task.due_date || ''}
          onChange={(v) => updateTask.mutate({ id: task.id, fields: { due_date: v || null } })}
        />
        <button
          onClick={(e) => { e.stopPropagation(); setFullEditorTask(task) }}
          title="Open full task editor"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11, fontFamily: 'inherit', fontWeight: 500, color: 'var(--teal)', background: 'transparent', border: 'none', borderRadius: 999, cursor: 'pointer', marginLeft: 'auto' }}
        >Open full editor</button>
      </div>

      {/* Full editor panel — TaskDetailPanel handles its own backdrop, Escape,
          focus-trap, and close-on-click-outside (Rule 18). */}
      {fullEditorTask && (
        <TaskDetailPanel
          task={fullEditorTask}
          onClose={() => setFullEditorTask(null)}
        />
      )}
    </div>
  )
}
