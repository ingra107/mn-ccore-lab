import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, UserCheck, Flag, Trash2, X, AlertTriangle, CalendarDays, ListChecks } from 'lucide-react'
import { getAllMembers, directors } from '../../data/team'
import type { TaskRow } from '../../lib/api'
import { ICON_PROPS } from '../../lib/iconProps'
import { DELETE_ARM_WINDOW_MS } from '../../lib/uiTiming'
import { Button } from '../ui/Button'
import InlineDatePicker from '../InlineDatePicker'

interface BulkActionToolbarProps {
  selectedIds: Set<string>
  selectedTasks: TaskRow[]
  onClear: () => void
  onBulkAction: (action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'due' | 'status', value?: string) => void
  isUpdating: boolean
}

const priorityOptions = [
  { value: 'urgent', label: 'Urgent', color: 'var(--job-stale)' },
  { value: 'high', label: 'High', color: 'var(--job-stale)' },
  { value: 'medium', label: 'Medium', color: 'var(--sk-t2)' },
  { value: 'low', label: 'Low', color: 'var(--slate)' },
]

const statusOptions = [
  { value: 'todo', label: 'To Do', color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--job-accent)' },
  { value: 'waiting_external', label: 'Waiting External', color: 'var(--st-waiting)' },
  { value: 'blocked', label: 'Blocked', color: 'var(--st-blocked)' },
  { value: 'done', label: 'Done', color: 'var(--st-done)' },
]

export default function BulkActionToolbar({ selectedIds, selectedTasks, onClear, onBulkAction, isUpdating }: BulkActionToolbarProps) {
  const [showAssign, setShowAssign] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  // Bulk delete stays two-step: the server delete HARD-deletes each task's
  // comments, notifications and subtasks, and restore cannot bring them back,
  // so one-click + Undo would show an Undo that loses data. The armed state
  // disarms itself after 5s (it used to hold forever) and says what it will do.
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  useEffect(() => {
    if (!deleteConfirm) return
    const t = setTimeout(() => setDeleteConfirm(false), DELETE_ARM_WINDOW_MS)
    return () => clearTimeout(t)
  }, [deleteConfirm])

  const count = selectedIds.size
  const allCompleted = selectedTasks.length > 0 && selectedTasks.every((t) => t.completed)

  const allMembers = [...directors.map((d) => ({ name: d.name, initials: d.initials, slug: d.slug })), ...getAllMembers().map((m) => ({ name: m.name, initials: m.initials, slug: m.slug || '' }))]

  const closeDropdowns = () => {
    setShowAssign(false)
    setShowPriority(false)
    setShowStatus(false)
    setDeleteConfirm(false)
  }

  const buttonStyle = (active = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--sk-line2)',
    background: active ? 'color-mix(in srgb, var(--sk-t1) 16%, transparent)' : 'var(--hover-medium)',
    color: 'var(--sk-t1)',
    fontSize: 13,
    fontWeight: 'var(--label-weight)',
    cursor: isUpdating ? 'not-allowed' : 'pointer',
    opacity: isUpdating ? 0.85 : 1,
    transition: 'background 150ms',
  })

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: count >= 1 ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)',
        maxWidth: 'calc(100vw - 2rem)',
        zIndex: 'var(--z-dropdown)',
        background: 'var(--sk-card)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--job-accent)',
        padding: 'var(--sp-sm) var(--sp-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-md)',
        flexWrap: 'wrap',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-elevated)',
        opacity: count >= 1 ? 1 : 0,
        pointerEvents: count >= 1 ? 'auto' : 'none',
        transition: 'opacity 150ms var(--ease-out), transform 150ms var(--ease-out)',
      }}
    >
          {/* Count + clear */}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--job-accent)',
              whiteSpace: 'nowrap',
            }}
          >
            {count} selected
          </span>
          <Button size="icon"
            onClick={() => { closeDropdowns(); onClear() }}
            aria-label="Clear selection"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--sk-line2)',
              background: 'var(--hover-medium)',
              color: 'var(--sk-t2)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <X {...ICON_PROPS} size={12} />
          </Button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--sk-line2)' }} />

          {/* Complete / Uncomplete */}
          <button
            onClick={() => {
              closeDropdowns()
              onBulkAction(allCompleted ? 'uncomplete' : 'complete')
            }}
            disabled={isUpdating}
            style={{
              ...buttonStyle(),
              color: allCompleted ? 'var(--sk-t2)' : 'var(--job-accent)',
            }}
          >
            {allCompleted ? <Circle {...ICON_PROPS} size={14} /> : <CheckCircle2 {...ICON_PROPS} size={14} />}
            {allCompleted ? 'Reopen' : 'Complete'}
          </button>

          {/* Status */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowAssign(false)
                setShowPriority(false)
                setDeleteConfirm(false)
                setShowStatus(!showStatus)
              }}
              disabled={isUpdating}
              style={buttonStyle(showStatus)}
            >
              <ListChecks {...ICON_PROPS} size={14} />
              Status
            </button>

            {showStatus && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 'var(--sp-sm)',
                  background: 'var(--sk-card)',
                  border: '1px solid var(--sk-line2)',
                  borderRadius: 'var(--radius-xl)',
                  padding: 6,
                  minWidth: 140,
                  boxShadow: 'var(--shadow-menu)',
                }}
              >
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onBulkAction('status', opt.value)
                      setShowStatus(false)
                    }}
                    className="transition-colors hover:bg-[var(--hover-medium)]"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sk-t1)',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 'var(--radius-circle)',
                        background: opt.color,
                        flexShrink: 0,
                      }}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reassign */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowPriority(false)
                setShowStatus(false)
                setDeleteConfirm(false)
                setShowAssign(!showAssign)
              }}
              disabled={isUpdating}
              style={buttonStyle(showAssign)}
            >
              <UserCheck {...ICON_PROPS} size={14} />
              Reassign
            </button>

            {showAssign && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 'var(--sp-sm)',
                  background: 'var(--sk-card)',
                  border: '1px solid var(--sk-line2)',
                  borderRadius: 'var(--radius-xl)',
                  padding: 6,
                  minWidth: 180,
                  maxHeight: 260,
                  overflowY: 'auto',
                  boxShadow: 'var(--shadow-menu)',
                }}
              >
                {allMembers.filter((m) => m.slug).map((member) => (
                  <button
                    key={member.slug}
                    onClick={() => {
                      onBulkAction('assign', member.slug)
                      setShowAssign(false)
                    }}
                    className="transition-colors hover:bg-[var(--hover-medium)]"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sk-t1)',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 'var(--radius-md)',
                        background: 'color-mix(in srgb, var(--sk-t1) 8%, transparent)',
                        color: 'var(--sk-t2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {member.initials}
                    </span>
                    {member.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Priority */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowAssign(false)
                setShowStatus(false)
                setDeleteConfirm(false)
                setShowPriority(!showPriority)
              }}
              disabled={isUpdating}
              style={buttonStyle(showPriority)}
            >
              <Flag {...ICON_PROPS} size={14} />
              Priority
            </button>

            {showPriority && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 'var(--sp-sm)',
                  background: 'var(--sk-card)',
                  border: '1px solid var(--sk-line2)',
                  borderRadius: 'var(--radius-xl)',
                  padding: 6,
                  minWidth: 140,
                  boxShadow: 'var(--shadow-menu)',
                }}
              >
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onBulkAction('priority', opt.value)
                      setShowPriority(false)
                    }}
                    className="transition-colors hover:bg-[var(--hover-medium)]"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sk-t1)',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 'var(--radius-circle)',
                        background: opt.color,
                        flexShrink: 0,
                      }}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Due date: the shared picker (presets, cumulative +7d, month grid,
              Clear), not a fixed +1 day (#148's class). 'due' carries the
              date, '' clears it. */}
          <span className="bulk-date-host" onMouseDown={closeDropdowns}>
            <InlineDatePicker
              value={(() => {
                const dues = new Set(selectedTasks.map(t => t.due_date ?? null))
                return dues.size === 1 ? [...dues][0] : null
              })()}
              onChange={(d) => onBulkAction('due', d ?? '')}
              display={
                <span style={{ ...buttonStyle(), color: 'var(--sk-t2)' }}>
                  <CalendarDays {...ICON_PROPS} size={14} />
                  Due date
                </span>
              }
            />
          </span>

          {/* Delete */}
          <button
            onClick={() => {
              if (deleteConfirm) {
                onBulkAction('delete')
                setDeleteConfirm(false)
              } else {
                setShowAssign(false)
                setShowPriority(false)
                setShowStatus(false)
                setDeleteConfirm(true)
              }
            }}
            disabled={isUpdating}
            style={{
              ...buttonStyle(deleteConfirm),
              color: 'var(--job-danger)',
              borderColor: deleteConfirm ? 'var(--job-danger)' : 'var(--sk-line2)',
            }}
          >
            {deleteConfirm ? <AlertTriangle {...ICON_PROPS} size={14} /> : <Trash2 {...ICON_PROPS} size={14} />}
            {deleteConfirm ? `Delete ${count}?` : 'Delete'}
          </button>
    </div>
  )
}