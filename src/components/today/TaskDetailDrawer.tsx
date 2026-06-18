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
import SmartCompose from '../SmartCompose'
import { useUpdateTask, useToggleSubtask } from '../../hooks/useMutations'
import { useAutoAcknowledge } from '../../hooks/useAutoAcknowledge'
import { useUndoToast } from '../UndoToast'
import { LinkRow, type TaskLink } from './primitives'
import { WorkflowSection } from '../tasks/detail/FieldControls'
import type { WorkflowFields } from '../tasks/detail/FieldControls'
import { TaskInlineFieldRow } from '../tasks/detail/FieldControls'
import { TaskActivityFeed } from '../tasks/detail/TaskActivityFeed'
import TaskDetailPanel from '../tasks/TaskDetailPanel'
import {
  ACCENT_TEAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PANEL_BG,
  TODAY_MOVE_OPTIONS, withAlpha,
} from './constants'
import { isTaskDone } from '../../lib/taskGrouping'
import { STATUS_OPTIONS } from '../../lib/taskConstants'
import { stripMeetingMarker } from '../../lib/textUtils'
import { Button } from '../ui/Button'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

export function TaskDetailDrawer({ task, project, state }: { task: TaskRow; project: { name: string; slug: string } | null; state: TodayStateApi }) {
  const isPlanned = !!state.planned[task.id]
  const isNow = state.rightNow === task.id
  // Slack-style seen (Nick 2026-06-11): expanding the drawer acknowledges the
  // assignment silently when the viewer is the assignee.
  useAutoAcknowledge(task)
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  const linkSet: TaskLink[] = []
  if (task.key_link_1) linkSet.push({ url: task.key_link_1, desc: task.key_link_1_desc })
  if (task.key_link_2) linkSet.push({ url: task.key_link_2, desc: task.key_link_2_desc })
  if (task.key_link_3) linkSet.push({ url: task.key_link_3, desc: task.key_link_3_desc })
  const subtasks = detail?.subtasks ?? []
  const blocks = detail?.blocks ?? []

  // Next step: first open subtask (Option 1 per design doc B).
  const nextStep = subtasks.find((s) => s.completed !== 1) ?? null
  const isDone = isTaskDone(task)

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
    <div onClick={(e) => e.stopPropagation()} style={{ padding: '14px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {!isDone && (
          <button onClick={() => state.markDone(task.id)} style={{ padding: '6px 12px', background: 'transparent', color: ACCENT_GREEN, border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>✓ Complete</button>
        )}
        {!isNow && !isDone && (
          <Button
            variant="gold"
            size="sm"
            onClick={() => state.promote(task.id)}
            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-sm)' }}
          >▶ Work on this now</Button>
        )}
        {!isPlanned && !isNow && !isDone && (
          <Button
            variant="ghost-gold"
            size="sm"
            onClick={() => state.planAt(task.id, 'strip')}
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)' }}
          >📌 Plan for today</Button>
        )}
        {isPlanned && !isNow && (
          <button onClick={() => state.unplan(task.id)} style={{ padding: '6px 12px', background: 'transparent', color: INK_MUTED, border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Unplan</button>
        )}
        <div ref={moveRef} style={{ position: 'relative' }}>
          <button onClick={() => setMoveOpen((o) => !o)} title="Move to a different group (writes group_override)" style={{ padding: '6px 12px', background: moveOpen ? withAlpha(ACCENT_TEAL, 20) : 'transparent', color: moveOpen ? ACCENT_TEAL : INK, border: `1px solid ${moveOpen ? ACCENT_TEAL : 'transparent'}`, borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Move →</button>
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

      {/* SmartCompose — directly under action bar; @me lock toggle */}
      <SmartCompose taskId={task.id} placeholder="Note or @hermes…" showMeLock showHermesToggle bare alwaysShowToolbar />

      {/* Activity peek — 3 entries newest-first; "view all →" opens full editor */}
      <div style={{ marginTop: 14 }}>
        <TaskActivityFeed taskId={task.id} peekCount={3} hidePills avatarSize="xs" />
        <button
          onClick={() => setFullEditorTask(task)}
          style={{ fontSize: 10, color: ACCENT_TEAL, background: 'transparent', border: 'none', padding: '3px 0', cursor: 'pointer', fontFamily: 'inherit' }}
        >view all →</button>
      </div>

      {/* Next step — first open subtask */}
      {nextStep && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: 10, color: INK_DIM, flexShrink: 0, paddingTop: 1 }}>Next step</span>
          <button
            onClick={() => toggleSubtask.mutate(nextStep.id, {
              onSettled: () => queryClient.invalidateQueries({ queryKey: ['task-detail', task.id] }),
            })}
            style={{ fontSize: 12, color: INK, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', lineHeight: 1.4 }}
          >☐ {nextStep.title}</button>
        </div>
      )}

      {/* Description — static context below the live feed; ghost opener when empty.
          stripMeetingMarker removes the machine dedup token [meeting:cal-...:hash]
          from display; stored value stays intact. */}
      {task.description ? (
        <div style={{ marginTop: 12, marginBottom: 4 }}>
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
          >{stripMeetingMarker(task.description)}</div>
          {!descExpanded && (
            <button
              onClick={() => setDescExpanded(true)}
              style={{ fontSize: 11, color: INK_DIM, background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit' }}
            >more</button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setFullEditorTask(task)}
          style={{ display: 'block', marginTop: 8, fontSize: 11, color: INK_DIM, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontStyle: 'italic' }}
        >Add description…</button>
      )}

      {/* Inline field row: Status · Priority · Project · Due — canonical GhostSelect (A1: below fold) */}
      <TaskInlineFieldRow
        status={task.status}
        priority={task.priority}
        projectId={task.project_id}
        dueDate={task.due_date}
        onUpdate={(fields) => {
          const prev = task.status
          updateTask.mutate({ id: task.id, fields })
          // Show undo toast for status changes, mirroring useTaskFieldEditors.
          // (The mutation now derives `completed` from `status` automatically
          // so the optimistic cache stays consistent — see useUpdateTask.onMutate.)
          if ('status' in fields && typeof fields.status === 'string' && fields.status !== prev) {
            const label = STATUS_OPTIONS.find(o => o.value === fields.status)?.label ?? String(fields.status)
            undoToast.showUndo(`Status → ${label}`, () =>
              updateTask.mutate({ id: task.id, fields: { status: prev } })
            )
          }
        }}
        onOpenEditor={() => setFullEditorTask(task)}
        style={{ marginTop: 14 }}
      />

      {/* Subtasks + Blocks (A1: below fold) */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, color: INK_DIM, marginBottom: 6 }}>Subtasks</div>
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
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, color: INK_DIM, marginBottom: 8 }}>Workflow</div>
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
