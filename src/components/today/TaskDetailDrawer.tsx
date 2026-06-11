// TaskDetailDrawer — inline expand drawer for tasks on TodayPage.
// Shown when the user clicks a task row body (CD spec: "click expands, doesn't
// promote"). Action bar with ▶ Work / 📌 Plan / Move → / Unplan; SmartCompose
// directly under action bar; full-width activity feed under composer; chips +
// subtasks/blocks/workflow below the feed.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_TaskDetail). Same Move→
// popover wiring as UnifiedMyTasks InlineDetail (writes group_override on tasks).

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTaskDetail } from '../../hooks/useApiData'
import ReactionBar from '../ReactionBar'
import SmartCompose from '../SmartCompose'
import { useUpdateTask, useToggleSubtask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { LinkRow } from './primitives'
import { WorkflowSection } from '../tasks/detail/FieldControls'
import type { WorkflowFields } from '../tasks/detail/FieldControls'
import { TaskQuickEditChips } from '../tasks/TaskQuickEditChips'
import TaskDetailPanel from '../tasks/TaskDetailPanel'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PAGE_BG, PANEL_BG,
  TODAY_MOVE_OPTIONS, withAlpha, type LinkKind,
} from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

export function TaskDetailDrawer({ task, project, state }: { task: TaskRow; project: { name: string; slug: string } | null; state: TodayStateApi }) {
  const isPlanned = !!state.planned[task.id]
  const isNow = state.rightNow === task.id
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  const linkSet: LinkKind[] = []
  if (task.key_link_1) linkSet.push('folder')
  if (task.key_link_2) linkSet.push('claude')
  if (task.key_link_3) linkSet.push('brief')
  const subtasks = detail?.subtasks ?? []
  const updates = detail?.updates ?? []
  const blocks = detail?.blocks ?? []

  // Next step: first open subtask (Option 1 per design doc B).
  const nextStep = subtasks.find((s) => s.completed !== 1) ?? null

  // Move → popover wiring (parity with UnifiedMyTasks).
  const updateTask = useUpdateTask()
  const undoToast = useUndoToast()
  const [fullEditorTask, setFullEditorTask] = useState<TaskRow | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)

  // Subtask toggle — TP-03. The drawer's subtasks come from useTaskDetail
  // (`['task-detail', taskId]`), not the `['subtasks', taskId]` cache that
  // useToggleSubtask invalidates. Invalidate task-detail too so the UI flips.
  const toggleSubtask = useToggleSubtask(task.id)
  const queryClient = useQueryClient()
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moveOpen) return
    const close = (e: MouseEvent) => { if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moveOpen])
  const moveToGroup = useCallback((opt: typeof TODAY_MOVE_OPTIONS[number]) => {
    updateTask.mutate({ id: task.id, fields: { group_override: opt.key } }, {
      onSuccess: () => { undoToast.showSuccess(`Moved to ${opt.label}`); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])
  const resetGroup = useCallback(() => {
    updateTask.mutate({ id: task.id, fields: { group_override: null } }, {
      onSuccess: () => { undoToast.showSuccess('Reset to auto-classify'); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])

  // Workflow fields — v55 (waiting_on, next_checkin_date, promised_to, promise_date).
  // Distinct from HandoffSection (to_slug + ack). Each field saves individually on blur.
  const workflowFields: WorkflowFields = {
    waiting_on: task.waiting_on ?? null,
    next_checkin_date: task.next_checkin_date ?? null,
    promised_to: task.promised_to ?? null,
    promise_date: task.promise_date ?? null,
  }
  const saveWorkflowField = useCallback((patch: Partial<WorkflowFields>) => {
    updateTask.mutate({ id: task.id, fields: patch as Record<string, unknown> })
  }, [task.id, updateTask])

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ padding: '14px 16px 16px', background: 'rgba(0,0,0,0.20)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {!isNow && (
          <button onClick={() => state.promote(task.id)} style={{ padding: '6px 12px', background: ACCENT_GOLD, color: PAGE_BG, border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>▶ Work on this now</button>
        )}
        {!isPlanned && !isNow && (
          <button onClick={() => state.planAt(task.id, 'strip')} style={{ padding: '6px 12px', background: 'rgba(201,168,76,0.08)', color: ACCENT_GOLD, border: '1px solid rgba(201,168,76,0.30)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>📌 Plan for today</button>
        )}
        {isPlanned && !isNow && (
          <button onClick={() => state.unplan(task.id)} style={{ padding: '6px 12px', background: 'transparent', color: INK_MUTED, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Unplan</button>
        )}
        <div ref={moveRef} style={{ position: 'relative' }}>
          <button onClick={() => setMoveOpen((o) => !o)} title="Move to a different group (writes group_override)" style={{ padding: '6px 12px', background: moveOpen ? withAlpha(ACCENT_TEAL, 20) : 'transparent', color: moveOpen ? ACCENT_TEAL : INK, border: `1px solid ${moveOpen ? ACCENT_TEAL : 'rgba(255,255,255,0.14)'}`, borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Move →</button>
          {moveOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radius-sm)', zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              {TODAY_MOVE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => moveToGroup(opt)}
                  disabled={updateTask.isPending}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: task.group_override === opt.key ? withAlpha(ACCENT_TEAL, 15) : 'transparent', border: 'none', color: task.group_override === opt.key ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer' }}
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
        <LinkRow links={linkSet} />
        {project && <span style={{ marginLeft: 'auto', fontSize: 11, color: INK_DIM }}>{project.name}</span>}
      </div>

      {/* Description — clamped to ~3 lines with "more" expander (C) */}
      {task.description && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 12,
              color: INK_MUTED,
              lineHeight: 1.55,
              ...(descExpanded ? {} : {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
                overflow: 'hidden',
              }),
            }}
          >{task.description}</div>
          {!descExpanded && task.description.length > 0 && (
            <button
              onClick={() => setDescExpanded(true)}
              style={{ fontSize: 11, color: INK_DIM, background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit' }}
            >more</button>
          )}
        </div>
      )}

      {/* SmartCompose — directly under action bar (A1) with @me lock toggle */}
      <SmartCompose taskId={task.id} placeholder="Add a note, or @hermes for AI…" showMeLock bare />

      {/* Next step — first open subtask (B: replaces "Why this matters" callout) */}
      {nextStep && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, flexShrink: 0, paddingTop: 1 }}>Next step</span>
          <button
            onClick={() => toggleSubtask.mutate(nextStep.id, {
              onSettled: () => queryClient.invalidateQueries({ queryKey: ['task-detail', task.id] }),
            })}
            style={{ fontSize: 12, color: INK, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', lineHeight: 1.4 }}
          >☐ {nextStep.title}</button>
        </div>
      )}

      {/* Activity feed — full-width, newest-first, directly under composer (A1) */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Activity</div>
        {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
        {!detailQuery.isLoading && updates.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>No updates logged.</div>}
        {updates.slice(0, 8).map((u, i) => {
          const isHermes = u.who === 'claude-ai' || u.who === 'hermes'
          const isMe = u.who === 'nick-ingraham' || u.who === 'nick'
          const color = isHermes ? ACCENT_GOLD : isMe ? ACCENT_TEAL : INK_MUTED
          return (
            <div key={u.id ?? i} style={{ padding: '6px 0', borderBottom: i < updates.length - 1 && i < 7 ? '1px dashed rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: '0.04em' }}>{isHermes ? 'Hermes' : u.who}</span>
                <span style={{ fontSize: 10, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{u.when?.slice(0, 16) ?? ''}</span>
              </div>
              <div style={{ fontSize: 12, color: INK, lineHeight: 1.45 }}>{u.text}</div>
              {u.kind === 'note' && u.id && (
                <div style={{ marginTop: 4 }}>
                  <ReactionBar targetType="task_update" targetId={u.id} compact />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick-edit chips: Status / Priority / Due / Project + open-full-editor (A1: below fold) */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <TaskQuickEditChips
          task={task}
          updateTask={updateTask}
          undoToast={undoToast}
          onOpenFullEditor={() => setFullEditorTask(task)}
        />
      </div>

      {/* Subtasks + Blocks (A1: below fold) */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Subtasks</div>
        {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
        {!detailQuery.isLoading && subtasks.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>None yet.</div>}
        {subtasks.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 6, padding: '3px 0', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={s.completed === 1}
              onChange={() => toggleSubtask.mutate(s.id, {
                onSettled: () => queryClient.invalidateQueries({ queryKey: ['task-detail', task.id] }),
              })}
              style={{ marginTop: 2, accentColor: ACCENT_GREEN, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: s.completed === 1 ? INK_DIM : INK, textDecoration: s.completed === 1 ? 'line-through' : 'none', lineHeight: 1.4 }}>{s.title}</span>
          </div>
        ))}
        {blocks.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_ORANGE, marginBottom: 4 }}>Blocks</div>
            {blocks.map((b) => (
              <div key={b.id} style={{ fontSize: 11, color: INK, padding: '2px 0' }}>↳ {b.title}</div>
            ))}
          </div>
        )}
      </div>

      {/* Workflow fields — v55 (waiting_on / next_checkin_date / promised_to / promise_date) */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 8 }}>Workflow</div>
        <WorkflowSection fields={workflowFields} onChange={saveWorkflowField} />
      </div>

      {/* Full editor panel — mounted locally; TaskDetailPanel handles backdrop,
          Escape, focus-trap, and close-on-click-outside itself (Rule 18). */}
      {fullEditorTask && (
        <TaskDetailPanel
          task={fullEditorTask}
          onClose={() => setFullEditorTask(null)}
        />
      )}
    </div>
  )
}
