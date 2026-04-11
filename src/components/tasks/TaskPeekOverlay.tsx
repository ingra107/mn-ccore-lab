import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { X, CheckCircle2, Circle, AlertTriangle, Clock } from 'lucide-react'
import Avatar from '../Avatar'
import HoverCard from '../HoverCard'
import type { HoverCardData } from '../HoverCard'
import { useHoverCard } from '../../hooks/useHoverCard'
import { getPersonInfo, getMemberBySlug, directors } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'
import { formatBrandName } from '../BrandName'
import type { TaskRow } from '../../lib/api'

interface Props {
  task: TaskRow | null
  onClose: () => void
}

const statusConfig: Record<string, { label: string; icon: typeof Circle; color: string; bg: string }> = {
  todo: { label: 'To Do', icon: Circle, color: 'var(--slate)', bg: 'rgba(100,116,139,0.1)' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'var(--teal)', bg: 'rgba(45,138,138,0.1)' },
  done: { label: 'Done', icon: CheckCircle2, color: 'var(--green)', bg: 'rgba(34,197,94,0.1)' },
  blocked: { label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122,0,25,0.1)' },
}

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: 'var(--maroon)', bg: 'rgba(122,0,25,0.1)' },
  high: { label: 'High', color: 'var(--orange)', bg: 'rgba(194,65,12,0.1)' },
  medium: { label: 'Medium', color: 'var(--gold)', bg: 'rgba(201,168,76,0.1)' },
  low: { label: 'Low', color: 'var(--slate)', bg: 'rgba(100,116,139,0.1)' },
}

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--slate)',
  opacity: 'var(--ink-label)' as unknown as number,
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--ice)',
  border: '1px solid var(--border)',
  fontSize: '10px',
}

export default function TaskPeekOverlay({ task, onClose }: Props) {
  const previousFocus = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const assigneeHover = useHoverCard()

  // Build member HoverCard data for assignee
  const assigneeData: HoverCardData | null = (() => {
    if (!task?.assignee) return null
    const p = getPersonInfo(task.assignee)
    const dir = directors.find(d => d.slug === task.assignee)
    const member = getMemberBySlug(task.assignee)
    return {
      type: 'member' as const,
      name: p.name,
      role: dir?.role || member?.role,
      photoUrl: p.photoUrl,
      initials: p.initials,
    }
  })()

  // Focus management (no scroll lock — list must remain scrollable behind peek)
  useEffect(() => {
    if (!task) return

    previousFocus.current = document.activeElement as HTMLElement
    // Don't steal focus — let the task list retain focus for J/K navigation
    return () => {
      previousFocus.current?.focus()
    }
  }, [task])

  // Keyboard handler — only Escape closes peek (Space is handled by parent hook)
  useEffect(() => {
    if (!task) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [task, onClose])

  const overlay = (
    <AnimatePresence>
      {task && (() => {
        const status = statusConfig[task.status] || statusConfig.todo
        const priority = priorityConfig[task.priority] || priorityConfig.medium
        const StatusIcon = status.icon
        const person = getPersonInfo(task.assignee)
        const isOverdue = task.due_date && !task.completed && new Date(task.due_date + 'T23:59:59') < new Date()
        const isDone = task.status === 'done'
        const displayText = task.title || task.description

        return (
          <motion.div
            key="peek-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 'var(--z-toast)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              background: 'rgba(15,25,35,0.2)',
              pointerEvents: 'auto',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose()
            }}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="false"
              aria-label={`Task preview: ${displayText}`}
              tabIndex={-1}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
              className="peek-dialog"
              style={{
                width: 400,
                maxWidth: 'calc(100vw - 2rem)',
                marginTop: '80px',
                marginRight: '24px',
                borderRadius: 'var(--radius-xl)',
                background: 'var(--cream)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-elevated)',
                outline: 'none',
                overflow: 'hidden',
                maxHeight: 'calc(100vh - 120px)',
                overflowY: 'auto',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Status pill */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--label-size)',
                      fontWeight: 600,
                      color: status.color,
                      background: status.bg,
                    }}
                  >
                    <StatusIcon size={12} />
                    {status.label}
                  </span>

                  {/* Priority badge */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--label-size)',
                      fontWeight: 'var(--label-weight)',
                      color: priority.color,
                      opacity: 0.7,
                      background: priority.bg,
                    }}
                  >
                    {priority.label}
                  </span>
                </div>

                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--slate)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Close preview"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '16px 18px 14px' }}>
                {/* Main text */}
                <p
                  style={{
                    fontSize: '15px',
                    lineHeight: 1.5,
                    color: 'var(--ink)',
                    margin: 0,
                    textDecoration: isDone ? 'line-through' : 'none',
                    opacity: isDone ? 0.6 : 1,
                  }}
                >
                  {formatBrandName(displayText)}
                </p>

                {/* Description if title exists separately */}
                {task.title && task.description && task.title !== task.description && (
                  <p
                    style={{
                      fontSize: 'var(--value-size)',
                      lineHeight: 1.5,
                      color: 'var(--slate)',
                      margin: '8px 0 0',
                    }}
                  >
                    {formatBrandName(task.description)}
                  </p>
                )}

                {/* Metadata grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px 24px',
                    marginTop: 18,
                    paddingTop: 14,
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Assignee */}
                  <div>
                    <span className="peek-label" style={labelStyle}>Assignee</span>
                    <div
                      ref={assigneeHover.triggerRef as React.RefObject<HTMLDivElement>}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'default' }}
                      onMouseEnter={assigneeData ? assigneeHover.handlers.onMouseEnter : undefined}
                      onMouseLeave={assigneeData ? assigneeHover.handlers.onMouseLeave : undefined}
                    >
                      <Avatar
                        name={person.name}
                        initials={person.initials}
                        photoUrl={person.photoUrl}
                        size="sm"
                        variant="ice"
                        className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]"
                      />
                      <span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)' }}>
                        {person.name}
                      </span>
                      {assigneeData && (
                        <HoverCard
                          data={assigneeData}
                          isVisible={assigneeHover.isVisible}
                          position={assigneeHover.position}
                          cardRef={assigneeHover.cardRef}
                          cardHandlers={assigneeHover.cardHandlers}
                        />
                      )}
                    </div>
                  </div>

                  {/* Due date */}
                  <div>
                    <span className="peek-label" style={labelStyle}>Due Date</span>
                    <div style={{ marginTop: 4 }}>
                      {task.due_date ? (
                        <span
                          style={{
                            fontSize: 'var(--value-size)',
                            color: isOverdue ? 'var(--maroon)' : 'var(--ink)',
                            fontWeight: isOverdue ? 600 : 400,
                          }}
                        >
                          {isOverdue ? 'Overdue — ' : ''}{formatShortDate(task.due_date)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                          None
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Meeting link */}
                  {task.meeting_id && (
                    <div>
                      <span className="peek-label" style={labelStyle}>Meeting</span>
                      <div style={{ marginTop: 4 }}>
                        <Link
                          to={`/portal/meetings/${task.meeting_id}`}
                          style={{
                            fontSize: 'var(--value-size)',
                            color: 'var(--teal)',
                            textDecoration: 'none',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {task.meeting_title
                            ? formatBrandName(task.meeting_title.split(':')[0])
                            : 'View Meeting'}
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Project link */}
                  {task.project_id && (
                    <div>
                      <span className="peek-label" style={labelStyle}>Project</span>
                      <div style={{ marginTop: 4 }}>
                        <Link
                          to={`/portal/projects/${task.project_id}`}
                          style={{
                            fontSize: 'var(--value-size)',
                            color: 'var(--gold)',
                            textDecoration: 'none',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {task.project_id}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer hint */}
              <div
                style={{
                  padding: '10px 18px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span style={{ ...labelStyle, opacity: 0.4 }}>
                  <kbd className="peek-kbd" style={kbdStyle}>Esc</kbd>
                  {' or '}
                  <kbd className="peek-kbd" style={kbdStyle}>Space</kbd>
                  {' to close  '}
                  <kbd className="peek-kbd" style={kbdStyle}>J</kbd>
                  {'/'}
                  <kbd className="peek-kbd" style={kbdStyle}>K</kbd>
                  {' to navigate'}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )
      })()}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}
