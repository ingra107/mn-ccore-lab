// TaskDetailDrawer — inline expand drawer for tasks on TodayPage.
// Shown when the user clicks a task row body. Segmented action bar (Plan /
// Set section / Due / Full editor) then a Links block; SmartCompose directly under action bar;
// full-width activity feed under composer; chips + subtasks/blocks/workflow
// below the feed.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_TaskDetail). Same Move→
// popover wiring as UnifiedMyTasks InlineDetail (writes group_override on tasks).

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isFromMeeting } from '../../lib/meetingOrigin'
import { MeetingOriginTag } from '../tasks/MeetingOriginTag'
import { useTaskDetail, useTaskLinks } from '../../hooks/useApiData'
import SmartCompose from '../SmartCompose'
import { useUpdateTask, useToggleSubtask } from '../../hooks/useMutations'
import { useTaskViewTracking } from '../../hooks/useTaskViewTracking'
import { useUndoToast } from '../UndoToast'

import { WorkflowSection } from '../tasks/detail/FieldControls'
import type { WorkflowFields } from '../tasks/detail/FieldControls'
import { TaskInlineFieldRow, DueInlineSelect } from '../tasks/detail/FieldControls'
import { ActivityPeek } from './ActivityPeek'
import TaskDetailPanel from '../tasks/TaskDetailPanel'
import { LinkCards } from './LinkCards'
import { Pin, Rows3, Maximize2, ChevronDown } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { isOverdue } from '../../lib/dateUtils'
import { taskOwnOverflowLinks } from '../../lib/taskLinkOverflow'
import {
  ACCENT_TEAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PANEL_BG,
  TODAY_MOVE_OPTIONS, withAlpha,
} from './constants'
import { fmtDuration } from './utils'
import { isTaskDone } from '../../lib/taskGrouping'
import { STATUS_OPTIONS } from '../../lib/taskConstants'
import { stripMeetingMarker } from '../../lib/textUtils'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

// ── helpers ───────────────────────────────────────────────────────────────

const DURATION_MIN = 15
const DURATION_MAX = 480
const DURATION_STEP = 15

// `project` is still accepted (the row adapter passes it) but no longer used in
// the drawer — #93 removed the duplicate WorkOnActions launch (it lives in the
// task row's title area). Kept in the prop type for caller compatibility.
export function TaskDetailDrawer({ task, project, state }: { task: TaskRow; project?: { name: string; slug: string; primary_folder?: string | null } | null; state: TodayStateApi }) {
  const isPlanned = !!state.planned[task.id]
  // Slack-style seen (Nick 2026-06-11): expanding the drawer acknowledges the
  // assignment silently when the viewer is the assignee.
  useTaskViewTracking(task)
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  const { data: linksData } = useTaskLinks(task.id)
  const projectLinks = linksData?.projectLinks ?? []
  // Task-own stored links beyond the 3 key_link_* slots (#910). The collapsed
  // row header shows the 3 slot icons; without this, a 4th+ typed link had no
  // render path in the drawer and looked never-saved.
  const overflowLinks = taskOwnOverflowLinks(linksData?.links, [
    task.key_link_1, task.key_link_2, task.key_link_3,
  ])
  const subtasks = detail?.subtasks ?? []
  const blocks = detail?.blocks ?? []

  // Next step: first open subtask (Option 1 per design doc B).
  const nextStep = subtasks.find((s) => s.completed !== 1) ?? null
  const isDone = isTaskDone(task)
  const dueOverdue = !isDone && isOverdue(task.due_date, task.status)

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

  // Duration stepper — local display value initialised from task.estimated_minutes.
  // Default 30 is READ-TIME only: we only write to Hub when the user actually
  // clicks − or + (never on open).
  const [durationMins, setDurationMins] = useState<number>(task.estimated_minutes ?? 30)
  const adjustDuration = useCallback((delta: number) => {
    setDurationMins((prev) => {
      const next = Math.max(DURATION_MIN, Math.min(DURATION_MAX, prev + delta))
      if (next !== prev) {
        updateTask.mutate({ id: task.id, fields: { estimated_minutes: next } })
      }
      return next
    })
  }, [task.id, updateTask])

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

  // #93 (Nick 2026-06-24 + codex consult): tighter top padding (was 20px) so the
  // drawer hugs the row instead of opening with a gap.
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ padding: '10px 18px 16px', borderTop: '1px solid var(--border-subtle)' }}>
      {/* Action row — ONE quiet segmented control (Today round 2, 2026-10-09):
          Plan / Set section / Due / Full editor share a hairline-outlined
          capsule with hairline dividers, t2 text, t3 icons. Overdue keeps red
          text only; Plan turns teal while the task is planned.
          Still de-duplicated (#93): no "Complete" (the row's box does that) and
          no WorkOnActions (folder / Work on live in the card's right column).
          Links follow as their own left-aligned block. */}
      <div className="tk-segc" role="group" aria-label="Task actions">
        {(isPlanned || !isDone) && (
          <button
            type="button"
            className={`tk-si${isPlanned ? ' tk-planned-on' : ''}`}
            onClick={() => (isPlanned ? state.unplan(task.id) : state.planAt(task.id, 'strip'))}
            title={isPlanned ? 'Planned for today. Click to unplan' : 'Plan this task for today'}
          >
            <Pin {...ICON_PROPS} size={13} />{isPlanned ? 'Unplan' : 'Plan for today'}
          </button>
        )}
        <div ref={moveRef} style={{ position: 'relative' }}>
          {/* #93: "Move →" renamed "Set section" — it re-buckets the task into a
              Today section (Deep work / Priorities / Quick / …) via group_override,
              NOT moving it between projects. */}
          <button
            type="button"
            className={`tk-si${moveOpen ? ' tk-open' : ''}`}
            onClick={() => setMoveOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={moveOpen}
            title="Set which Today section this task lives in (Deep work / Priorities / Quick / …)"
          >
            <Rows3 {...ICON_PROPS} size={13} />Set section<ChevronDown {...ICON_PROPS} size={11} />
          </button>
          {moveOpen && (
            <div role="menu" aria-label="Set section" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, background: PANEL_BG, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              {TODAY_MOVE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  role="menuitem"
                  onClick={() => moveToGroup(opt)}
                  disabled={updateTask.isPending}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: task.group_override === opt.key ? withAlpha(ACCENT_TEAL, 15) : 'transparent', border: 'none', color: task.group_override === opt.key ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer' }}
                >{opt.label}{task.group_override === opt.key ? ' ✓' : ''}</button>
              ))}
              {task.group_override && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <button
                    role="menuitem"
                    onClick={resetGroup}
                    disabled={updateTask.isPending}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: 'transparent', border: 'none', color: INK_DIM, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer', fontStyle: 'italic' }}
                  >↺ Reset to auto-classify</button>
                </>
              )}
            </div>
          )}
        </div>
        {/* #143 (Nick 2026-10-08): Due date sits right after "Set section", before
            "Full editor" - the field he changes most. Removed from the Status
            row below (hideDue) so it shows once. */}
        <div className="tk-segdue" data-overdue={dueOverdue ? '' : undefined}>
          <DueInlineSelect
            value={task.due_date || ''}
            onChange={(v) => updateTask.mutate({ id: task.id, fields: { due_date: v || null } })}
            done={isDone}
          />
        </div>
        {/* #93: explicit Full editor entry (the drawer previously only reached it
            via "view all →" / the empty-description opener). */}
        <button type="button" className="tk-si" onClick={() => setFullEditorTask(task)} title="Open the full task editor">
          <Maximize2 {...ICON_PROPS} size={13} />Full editor
        </button>
      </div>

      {/* Links — task-own overflow (#910) first, then inherited project links. */}
      <LinkCards links={[...overflowLinks, ...projectLinks]} />

      {/* SmartCompose — directly under action bar; @me lock toggle */}
      <SmartCompose
        taskId={task.id}
        placeholder="Note or @hermes…"
        showMeLock
        showHermesToggle
        alwaysShowToolbar
        launchContext={{ projectSlug: project?.slug ?? task.project_id ?? null, primaryFolder: project?.primary_folder ?? null }}
      />

      {/* Activity peek — 3 entries newest-first; "view all →" opens full editor */}
      <div style={{ marginTop: 14 }}>
        <ActivityPeek taskId={task.id} count={3} onViewAll={() => setFullEditorTask(task)} />
      </div>

      {/* #108: meeting provenance, with room for the name and the link. The row
          above carries only a bare icon (a labelled chip there made every
          meeting-derived task a line taller); this is where it gets stated.
          Links only when the meetings join resolved — see lib/meetingOrigin. */}
      {isFromMeeting(task) && (
        <div style={{ marginTop: 12, fontSize: 11, color: INK_DIM }}>
          <MeetingOriginTag task={task} color={ACCENT_TEAL} />
        </div>
      )}

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

      {/* 2-column top-aligned layout (2026-06-22 polish):
          LEFT: status pills → Duration → Subtasks (stacked, full height)
          RIGHT: Workflow pulled to TOP — starts at the same edge as status pills.
          Both columns begin at the same vertical position; content fills down
          naturally → minimal bottom negative space without feeling cluttered.
          Flex-wrap: stacks to 1 column on narrow drawers (<~416px).
          TaskDetailPanel (full editor) is NOT affected. */}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        {/* LEFT column: Status/meta pills → Duration → Subtasks */}
        <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Status · Priority · Project · Due — wraps within the column */}
          <TaskInlineFieldRow
            status={task.status}
            priority={task.priority}
            kind={task.kind}
            projectId={task.project_id}
            dueDate={task.due_date}
            hideDue
            onUpdate={(fields) => {
              const prev = task.status
              updateTask.mutate({ id: task.id, fields })
              if ('status' in fields && typeof fields.status === 'string' && fields.status !== prev) {
                const label = STATUS_OPTIONS.find(o => o.value === fields.status)?.label ?? String(fields.status)
                undoToast.showUndo(`Status → ${label}`, () =>
                  updateTask.mutate({ id: task.id, fields: { status: prev } })
                )
              }
            }}
            onOpenEditor={() => setFullEditorTask(task)}
          />

          {/* Duration stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="tk-lbl" style={{ minWidth: 52, margin: 0 }}>Duration</span>
            <button
              onClick={() => adjustDuration(-DURATION_STEP)}
              disabled={durationMins <= DURATION_MIN}
              aria-label="Decrease duration by 15 minutes"
              className="hov-bg" style={{ '--hov-bg': 'var(--hover-subtle)', width: 22, height: 22, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', borderRadius: 6, color: durationMins <= DURATION_MIN ? INK_DIM : INK, cursor: durationMins <= DURATION_MIN ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13, lineHeight: 1, opacity: durationMins <= DURATION_MIN ? 0.35 : 0.8 } as React.CSSProperties}
            >−</button>
            <span style={{ fontSize: 11, color: INK, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'center' }}>{fmtDuration(durationMins)}</span>
            <button
              onClick={() => adjustDuration(DURATION_STEP)}
              disabled={durationMins >= DURATION_MAX}
              aria-label="Increase duration by 15 minutes"
              className="hov-bg" style={{ '--hov-bg': 'var(--hover-subtle)', width: 22, height: 22, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', borderRadius: 6, color: durationMins >= DURATION_MAX ? INK_DIM : INK, cursor: durationMins >= DURATION_MAX ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13, lineHeight: 1, opacity: durationMins >= DURATION_MAX ? 0.35 : 0.8 } as React.CSSProperties}
            >+</button>
          </div>

          {/* Subtasks + Blocks */}
          <div>
            <div className="tk-lbl">Subtasks</div>
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
        </div>

        {/* RIGHT column: Workflow — top-aligned with left col's status pills.
            compact=true: smaller input height + font, de-emphasised. */}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div className="tk-lbl" style={{ marginBottom: 8 }}>Workflow</div>
          <WorkflowSection fields={workflowFields} onChange={saveWorkflowField} compact />
        </div>
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
