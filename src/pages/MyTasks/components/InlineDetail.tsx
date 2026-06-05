// InlineDetail — task detail panel that expands inline within Columns + Lanes
// views. Action bar (Work / Plan today / Move → / Snooze / Archive) +
// description blurb + meta line + SmartCompose input. Per CD spec: action
// bar mirrors the TaskDetailDrawer on TodayPage, so behaviour is consistent
// across surfaces.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useEffect, useCallback, useRef } from 'react'
import SmartCompose from '../../../components/SmartCompose'
import { useUpdateTask, useBulkUpdateTasks } from '../../../hooks/useMutations'
import { useUndoToast } from '../../../components/UndoToast'
import { localDateKey } from '../../../lib/dateUtils'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_GREEN,
  INK, INK_DIM, PAGE_BG, PANEL_BG,
  MOVE_OPTIONS,
  readTodayState, writeTodayState, isTaskDone,
} from '../constants'
import { withAlpha } from '../../../lib/taskGrouping'
import type { TaskRow } from '../../../lib/api'
import { TaskQuickEditChips } from '../../../components/tasks/TaskQuickEditChips'
import TaskDetailPanel from '../../../components/tasks/TaskDetailPanel'

export function InlineDetail({ task, projectName }: { task: TaskRow; projectName?: string | null }) {
  // Real handlers (no longer decorative). Reach for mutations directly so the
  // component is self-contained and the parent doesn't need to drill props.
  const updateTask = useUpdateTask()
  const bulkUpdate = useBulkUpdateTasks()
  const undoToast = useUndoToast()
  const snap = readTodayState()
  const isPromoted = snap.rightNow === task.id
  const isPlanned = !!snap.planned?.[task.id]
  const [moveOpen, setMoveOpen] = useState(false)
  const [fullEditorTask, setFullEditorTask] = useState<TaskRow | null>(null)
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
    const s = readTodayState()
    s.rightNow = task.id
    s.planned = s.planned ?? {}
    if (!s.planned[task.id]) s.planned[task.id] = { slot: 'strip' }
    writeTodayState(s)
    undoToast.showSuccess('Promoted to Right Now on Today')
  }, [task.id, undoToast])

  const planToday = useCallback(() => {
    const s = readTodayState()
    s.planned = s.planned ?? {}
    s.planned[task.id] = { slot: 'strip' }
    writeTodayState(s)
    undoToast.showSuccess('Planned for today')
  }, [task.id, undoToast])

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

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
      {task.description && (
        <div style={{ fontSize: 11, color: ACCENT_GOLD, marginBottom: 8, fontStyle: 'italic', padding: '6px 10px', background: 'rgba(201,168,76,0.05)', borderLeft: `2px solid ${ACCENT_GOLD}`, borderRadius: 3 }}>
          💡 {task.description.split('\n')[0].slice(0, 220)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', position: 'relative' }}>
        {!isPromoted && (
          <button onClick={promote} title="Promote to Right Now on Today" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: `1px solid ${ACCENT_GOLD}`, background: ACCENT_GOLD, color: PAGE_BG, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>▶ Work on this</button>
        )}
        {!isPlanned && (
          <button onClick={planToday} title="Add to today's planned strip" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}>📌 Plan today</button>
        )}
        <div ref={moveRef} style={{ position: 'relative' }}>
          <button onClick={() => setMoveOpen((o) => !o)} title="Move to a different group (changes priority to match)" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: `1px solid ${moveOpen ? ACCENT_TEAL : 'rgba(255,255,255,0.1)'}`, background: moveOpen ? withAlpha(ACCENT_TEAL, 13) : 'transparent', color: moveOpen ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: 'pointer' }}>Move →</button>
          {moveOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
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
        <button onClick={snooze} title="Push due date +1 day" disabled={updateTask.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer', opacity: updateTask.isPending ? 0.5 : 1 }}>Snooze +1d</button>
        {!isCompleted && (
          <button onClick={complete} title="Mark complete" disabled={bulkUpdate.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: `1px solid ${withAlpha(ACCENT_GREEN, 33)}`, background: 'transparent', color: ACCENT_GREEN, fontFamily: 'inherit', cursor: bulkUpdate.isPending ? 'wait' : 'pointer', opacity: bulkUpdate.isPending ? 0.5 : 1 }}>✓ Complete</button>
        )}
        <button onClick={archive} title="Soft-delete this task" disabled={bulkUpdate.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: 'none', background: 'transparent', color: INK_DIM, fontFamily: 'inherit', cursor: bulkUpdate.isPending ? 'wait' : 'pointer' }}>Archive</button>
      </div>
      {/* Quick-edit chips: Status / Priority / Due / Project + open-full-editor */}
      <TaskQuickEditChips
        task={task}
        updateTask={updateTask}
        undoToast={undoToast}
        onOpenFullEditor={() => setFullEditorTask(task)}
      />

      <div style={{ marginTop: 8 }}>
        <SmartCompose taskId={task.id} placeholder="Add a note or @hermes…" />
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
