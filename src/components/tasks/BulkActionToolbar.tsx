import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, UserCheck, Flag, Trash2, X, AlertTriangle, AlarmClock } from 'lucide-react'
import { getAllMembers, directors } from '../../data/team'
import type { TaskRow } from '../../lib/api'

interface BulkActionToolbarProps {
  selectedIds: Set<string>
  selectedTasks: TaskRow[]
  onClear: () => void
  onBulkAction: (action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'snooze', value?: string) => void
  isUpdating: boolean
}

const priorityOptions = [
  { value: 'urgent', label: 'Urgent', color: '#7a0019' },
  { value: 'high', label: 'High', color: '#dc2626' },
  { value: 'medium', label: 'Medium', color: '#c9a84c' },
  { value: 'low', label: 'Low', color: '#64748b' },
]

export default function BulkActionToolbar({ selectedIds, selectedTasks, onClear, onBulkAction, isUpdating }: BulkActionToolbarProps) {
  const [showAssign, setShowAssign] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const count = selectedIds.size
  const allCompleted = selectedTasks.length > 0 && selectedTasks.every((t) => t.completed)

  const allMembers = [...directors.map((d) => ({ name: d.name, initials: d.initials, slug: d.slug })), ...getAllMembers().map((m) => ({ name: m.name, initials: m.initials, slug: m.slug || '' }))]

  const closeDropdowns = () => {
    setShowAssign(false)
    setShowPriority(false)
    setDeleteConfirm(false)
  }

  const buttonStyle = (active = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
    color: 'white',
    fontSize: 13,
    fontWeight: 500,
    cursor: isUpdating ? 'not-allowed' : 'pointer',
    opacity: isUpdating ? 0.5 : 1,
    transition: 'background 150ms',
  })

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100vw - 2rem)',
            zIndex: 50,
            background: 'var(--ink)',
            borderRadius: 14,
            border: '1px solid var(--gold)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* Count + clear */}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--gold)',
              whiteSpace: 'nowrap',
            }}
          >
            {count} selected
          </span>
          <button
            onClick={() => { closeDropdowns(); onClear() }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <X size={12} />
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

          {/* Complete / Uncomplete */}
          <button
            onClick={() => {
              closeDropdowns()
              onBulkAction(allCompleted ? 'uncomplete' : 'complete')
            }}
            disabled={isUpdating}
            style={{
              ...buttonStyle(),
              color: allCompleted ? 'rgba(255,255,255,0.8)' : 'var(--teal)',
            }}
          >
            {allCompleted ? <Circle size={14} /> : <CheckCircle2 size={14} />}
            {allCompleted ? 'Reopen' : 'Complete'}
          </button>

          {/* Reassign */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowPriority(false)
                setDeleteConfirm(false)
                setShowAssign(!showAssign)
              }}
              disabled={isUpdating}
              style={buttonStyle(showAssign)}
            >
              <UserCheck size={14} />
              Reassign
            </button>

            {showAssign && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 8,
                  background: 'var(--ink)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  padding: 6,
                  minWidth: 180,
                  maxHeight: 260,
                  overflowY: 'auto',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {allMembers.filter((m) => m.slug).map((member) => (
                  <button
                    key={member.slug}
                    onClick={() => {
                      onBulkAction('assign', member.slug)
                      setShowAssign(false)
                    }}
                    className="transition-colors hover:bg-[rgba(255,255,255,0.08)]"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: 'white',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: 'rgba(201,168,76,0.15)',
                        color: 'var(--gold)',
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
                setDeleteConfirm(false)
                setShowPriority(!showPriority)
              }}
              disabled={isUpdating}
              style={buttonStyle(showPriority)}
            >
              <Flag size={14} />
              Priority
            </button>

            {showPriority && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 8,
                  background: 'var(--ink)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  padding: 6,
                  minWidth: 140,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onBulkAction('priority', opt.value)
                      setShowPriority(false)
                    }}
                    className="transition-colors hover:bg-[rgba(255,255,255,0.08)]"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: 'white',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
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

          {/* Snooze (+1 day) */}
          {selectedTasks.some(t => t.due_date) && (
            <button
              onClick={() => {
                closeDropdowns()
                onBulkAction('snooze', '1')
              }}
              disabled={isUpdating}
              style={{
                ...buttonStyle(),
                color: 'var(--gold)',
              }}
            >
              <AlarmClock size={14} />
              +1 day
            </button>
          )}

          {/* Delete */}
          <button
            onClick={() => {
              if (deleteConfirm) {
                onBulkAction('delete')
                setDeleteConfirm(false)
              } else {
                setShowAssign(false)
                setShowPriority(false)
                setDeleteConfirm(true)
              }
            }}
            disabled={isUpdating}
            style={{
              ...buttonStyle(deleteConfirm),
              color: 'var(--maroon)',
              borderColor: deleteConfirm ? 'var(--maroon)' : 'rgba(255,255,255,0.1)',
            }}
          >
            {deleteConfirm ? <AlertTriangle size={14} /> : <Trash2 size={14} />}
            {deleteConfirm ? 'Confirm?' : 'Delete'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
