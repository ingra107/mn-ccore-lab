// TaskQuickEditChips — compact quick-edit row used by TaskDetailDrawer (Today)
// and InlineDetail (MyTasks Columns/Lanes).
//
// Each field renders as a single-chip button (current value + ▾ affordance).
// Clicking the Status or Priority chip toggles a small portal-positioned popover
// showing the full StatusSelect / PrioritySelect control — avoids the overflow
// risk that the full pill-row / 2-col-grid would cause in a narrow drawer.
// DateInput and ProjectSelect already use createPortal internally and are used
// directly.
//
// The parent passes its existing `updateTask` and `undoToast` hook instances to
// avoid double mutation tracking (see S1 scope doc §5).

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Link2 } from 'lucide-react'
import {
  StatusSelect,
  PrioritySelect,
  DateInput,
  ProjectSelect,
} from './detail/FieldControls'
import { useUpdateTaskStatus } from '../../hooks/useMutations'
import type { useUpdateTask } from '../../hooks/useMutations'
import type { useUndoToast } from '../UndoToast'
import type { TaskRow } from '../../lib/api'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../lib/taskConstants'
import { formatShortDate } from '../../lib/dateUtils'

// ── Types ──────────────────────────────────────────────────

export interface TaskQuickEditChipsProps {
  task: TaskRow
  /** Parent's existing useUpdateTask() instance — passed in to avoid
   *  creating a duplicate mutation tracker inside this component. */
  updateTask: ReturnType<typeof useUpdateTask>
  /** Parent's existing useUndoToast() instance. */
  undoToast: ReturnType<typeof useUndoToast>
  /** When provided, renders "Open full editor →" button. */
  onOpenFullEditor?: () => void
  /** When provided, renders "+ Link" button. Falls back to onOpenFullEditor
   *  (opens the panel which shows KeyLinksEditor on the Overview tab). */
  onAddLink?: () => void
}

// ── Chip popover helper ────────────────────────────────────

/** A compact chip button that shows current value + ▾. On click, renders
 *  `children` in a portal-positioned popover. */
function ChipPopover({
  label,
  color,
  children,
  chipStyle,
}: {
  label: string
  color: string
  children: React.ReactNode
  chipStyle?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePos = useCallback(() => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        !btnRef.current?.contains(t) &&
        !popRef.current?.contains(t)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, updatePos])

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          fontSize: 11,
          fontFamily: 'inherit',
          fontWeight: 500,
          color,
          background: `color-mix(in srgb, ${color} ${open ? 13 : 9}%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} ${open ? 100 : 28}%, transparent)`,
          borderRadius: 999,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          ...chipStyle,
        }}
        title={`Edit ${label}`}
      >
        {label}
        <svg width="9" height="9" viewBox="0 0 12 12" style={{ opacity: 0.7, flexShrink: 0 }}>
          <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu, 0 4px 16px rgba(0,0,0,0.35))',
            padding: '10px 12px',
            minWidth: 200,
            maxWidth: 320,
          }}
        >
          <div onClick={() => setOpen(false)}>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── TaskQuickEditChips ─────────────────────────────────────

export function TaskQuickEditChips({
  task,
  updateTask,
  undoToast,
  onOpenFullEditor,
  onAddLink,
}: TaskQuickEditChipsProps) {
  // useUpdateTaskStatus for the undo pattern (mirrors TaskDetailPanel.handleStatusChange).
  const updateStatus = useUpdateTaskStatus()

  // ── Status chip ──
  const statusOpt = STATUS_OPTIONS.find((s) => s.value === task.status)
  const statusLabel = statusOpt?.label ?? task.status
  const statusColor = statusOpt?.color ?? 'var(--slate)'

  const handleStatusChange = useCallback((newStatus: string) => {
    if (newStatus === task.status) return
    const prev = task.status
    updateStatus.mutate({ id: task.id, status: newStatus })
    const labels: Record<string, string> = {
      todo: 'To Do',
      in_progress: 'In Progress',
      done: 'Done',
      blocked: 'Blocked',
      waiting_external: 'Waiting (External)',
    }
    undoToast.showUndo(
      `Status → ${labels[newStatus] ?? newStatus}`,
      () => updateStatus.mutate({ id: task.id, status: prev }),
    )
  }, [task.id, task.status, updateStatus, undoToast])

  // ── Priority chip ──
  const priorityOpt = PRIORITY_OPTIONS.find((p) => p.value === task.priority)
  const priorityLabel = priorityOpt?.label ?? task.priority
  const priorityColor = priorityOpt?.color ?? 'var(--slate)'

  const handlePriorityChange = useCallback((newPriority: string) => {
    if (newPriority === task.priority) return
    const prev = task.priority
    updateTask.mutate({ id: task.id, fields: { priority: newPriority } }, {
      onSuccess: () => {
        undoToast.showUndo(
          `Priority → ${newPriority}`,
          () => updateTask.mutate({ id: task.id, fields: { priority: prev } }),
        )
      },
    })
  }, [task.id, task.priority, updateTask, undoToast])

  // ── Due date handler ──
  const handleDueChange = useCallback((newDate: string) => {
    const prev = task.due_date ?? ''
    updateTask.mutate({ id: task.id, fields: { due_date: newDate || null } }, {
      onSuccess: () => {
        if (newDate) {
          undoToast.showUndo(
            `Due → ${formatShortDate(newDate)}`,
            () => updateTask.mutate({ id: task.id, fields: { due_date: prev || null } }),
          )
        } else {
          undoToast.showSuccess('Due date cleared')
        }
      },
    })
  }, [task.id, task.due_date, updateTask, undoToast])

  // ── Project chip ──
  // task.project_id is a slug string on read (API resolves numeric IDs to slugs).
  const handleProjectChange = useCallback((newSlug: string) => {
    const prev = task.project_id ?? ''
    updateTask.mutate({ id: task.id, fields: { project_id: newSlug || null } }, {
      onSuccess: () => {
        undoToast.showUndo(
          newSlug ? `Project updated` : 'Project removed',
          () => updateTask.mutate({ id: task.id, fields: { project_id: prev || null } }),
        )
      },
    })
  }, [task.id, task.project_id, updateTask, undoToast])

  // ── Link affordance ──
  const handleAddLink = useCallback(() => {
    if (onAddLink) {
      onAddLink()
    } else if (onOpenFullEditor) {
      // Fall back: open the full editor (which shows KeyLinksEditor on Overview tab)
      onOpenFullEditor()
    }
  }, [onAddLink, onOpenFullEditor])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        padding: '8px 0 4px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Status chip */}
      <ChipPopover label={statusLabel} color={statusColor}>
        <StatusSelect value={task.status} onChange={handleStatusChange} />
      </ChipPopover>

      {/* Priority chip */}
      <ChipPopover label={priorityLabel} color={priorityColor}>
        <PrioritySelect value={task.priority} onChange={handlePriorityChange} />
      </ChipPopover>

      {/* Due chip — DateInput/InlineDatePicker already manages its own popover via
          createPortal, so we don't wrap it in ChipPopover (that would produce a
          popover-inside-popover where nothing closes the outer after date selection).
          Instead we render DateInput directly; InlineDatePicker's own trigger button
          provides the chip affordance. */}
      <div style={{ flexShrink: 0 }}>
        <DateInput value={task.due_date ?? ''} onChange={handleDueChange} />
      </div>

      {/* Project chip — ProjectSelect uses createPortal internally */}
      <div style={{ flexShrink: 0 }}>
        <ProjectSelect value={task.project_id ?? ''} onChange={handleProjectChange} />
      </div>

      {/* + Link affordance */}
      <button
        onClick={(e) => { e.stopPropagation(); handleAddLink() }}
        title="Add key link (opens in full editor)"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          fontSize: 11,
          fontFamily: 'inherit',
          fontWeight: 500,
          color: 'var(--slate)',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          borderRadius: 999,
          cursor: 'pointer',
          opacity: 0.7,
        }}
      >
        <Link2 size={10} strokeWidth={1.5} absoluteStrokeWidth />
        + Link
      </button>

      {/* Open full editor → */}
      {onOpenFullEditor && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenFullEditor() }}
          title="Open full task editor"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: 'inherit',
            fontWeight: 500,
            color: 'var(--teal)',
            background: 'transparent',
            border: 'none',
            borderRadius: 999,
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          <ExternalLink size={11} strokeWidth={1.5} absoluteStrokeWidth />
          Open full editor
        </button>
      )}
    </div>
  )
}
