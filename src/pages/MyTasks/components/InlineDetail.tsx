// InlineDetail — task detail panel that expands inline within Columns + Lanes
// views. Action bar (Work / Plan today / Move → / Snooze / Archive) +
// description blurb + meta line + SmartCompose input. Per CD spec: action
// bar mirrors the TaskDetailDrawer on TodayPage, so behaviour is consistent
// across surfaces.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useEffect, useCallback, useRef } from 'react'
import SmartCompose from '../../../components/SmartCompose'
import { useUpdateTask } from '../../../hooks/useMutations'
import { useUndoToast } from '../../../components/UndoToast'
import {
  ACCENT_GOLD, ACCENT_TEAL,
  INK, INK_DIM, PAGE_BG, PANEL_BG,
  STATUS_LABEL, STATUS_COLOR,
  MOVE_OPTIONS,
  readTodayState, writeTodayState,
} from '../constants'
import type { TaskRow } from '../../../lib/api'

export function InlineDetail({ task, projectName }: { task: TaskRow; projectName?: string | null }) {
  // Real handlers (no longer decorative). Reach for mutations directly so the
  // component is self-contained and the parent doesn't need to drill props.
  const updateTask = useUpdateTask()
  const undoToast = useUndoToast()
  const snap = readTodayState()
  const isPromoted = snap.rightNow === task.id
  const isPlanned = !!snap.planned?.[task.id]
  const [moveOpen, setMoveOpen] = useState(false)
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
    const due = tomorrow.toISOString().split('T')[0]
    updateTask.mutate({ id: task.id, fields: { due_date: due } }, {
      onSuccess: () => undoToast.showSuccess('Snoozed +1 day'),
    })
  }, [task.id, updateTask, undoToast])

  const archive = useCallback(() => {
    if (!window.confirm('Archive this task? It will be soft-deleted.')) return
    updateTask.mutate({ id: task.id, fields: { status: 'done', completed: 1 } }, {
      onSuccess: () => undoToast.showSuccess('Archived'),
    })
  }, [task.id, updateTask, undoToast])

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
          <button onClick={() => setMoveOpen((o) => !o)} title="Move to a different group (changes priority to match)" style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: `1px solid ${moveOpen ? ACCENT_TEAL : 'rgba(255,255,255,0.1)'}`, background: moveOpen ? ACCENT_TEAL + '20' : 'transparent', color: moveOpen ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: 'pointer' }}>Move →</button>
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
        <button onClick={archive} title="Soft-delete this task" disabled={updateTask.isPending} style={{ padding: '4px 10px', fontSize: 10.5, borderRadius: 4, border: 'none', background: 'transparent', color: INK_DIM, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer' }}>Archive</button>
      </div>
      <div style={{ fontSize: 10.5, color: INK_DIM, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span><span style={{ opacity: 0.6 }}>updated</span> {task.updated_at?.slice(0, 10) ?? '—'}</span>
        <span><span style={{ opacity: 0.6 }}>status</span> <span style={{ color: STATUS_COLOR[task.status] }}>{STATUS_LABEL[task.status] ?? task.status}</span></span>
        {projectName && <span><span style={{ opacity: 0.6 }}>project</span> {projectName}</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <SmartCompose taskId={task.id} placeholder="Add a note or @hermes…" />
      </div>
    </div>
  )
}
