// PendingMeetingsCard — dedicated triage surface for captured meetings awaiting Accept/Decline.
//
// Nick's ask: "it can't just be a task with a checkbox, needs to be an accept/decline mechanism."
// Mounted at the TOP of My Tasks and Today, above all regular task groups.
// Pending meeting tasks are EXCLUDED from the regular task list to prevent double-render.
//
// Mutation path: mutateTask({ id, fields: { approval_status: 'accepted' | 'declined' } })
// Undo path: showUndo() reverts to 'pending' — identical to the old TaskCard inline buttons.
//
// Renders null when tasks is empty (no card appears when nothing is pending).

import { CalendarClock, Check, X } from 'lucide-react'
import { useUpdateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import type { TaskRow } from '../../lib/api'

/** Strip the "Meeting: … [pending approval]" wrapper the approval task name
 *  carries, so the card shows the bare meeting title (mirrors the Telegram side). */
function cleanMeetingTitle(name: string): string {
  return name
    .replace(/^Meeting:\s*/, '')
    .replace(/\s*\[pending approval\]\s*$/, '')
    .trim()
}

/** Returns a compact relative time string for when the meeting was captured. */
function capturedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const mins = Math.round(ms / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(ms / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(ms / 86400000)
  return `${days}d ago`
}

interface PendingMeetingsCardProps {
  tasks: TaskRow[]
}

export function PendingMeetingsCard({ tasks }: PendingMeetingsCardProps) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()

  if (tasks.length === 0) return null

  return (
    <div className="mt-band" style={{ paddingTop: 12, paddingBottom: 0 }}>
      <div style={{
        background: 'var(--cream)',
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--task-accent-teal)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 8,
        overflow: 'hidden',
      }}>
        {/* Card header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <CalendarClock
            size={13}
            strokeWidth={1.75}
            style={{ color: 'var(--task-accent-teal)', flexShrink: 0 }}
          />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: 'var(--task-accent-teal)',
          }}>
            Pending meetings
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            background: 'var(--task-accent-teal)',
            color: '#fff',
            borderRadius: 'var(--radius-full)',
            minWidth: 18,
            height: 18,
            padding: '0 6px',
            lineHeight: 1,
          }}>
            {tasks.length}
          </span>
        </div>

        {/* Meeting rows */}
        {tasks.map((task, i) => (
          <div
            key={task.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              borderBottom: i < tasks.length - 1 ? '1px solid var(--border-subtle)' : undefined,
            }}
          >
            {/* Title + captured timestamp */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--task-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {/* meeting_title is the raw capture title; fall back to the task
                    name with the "Meeting: … [pending approval]" wrapper stripped */}
                {task.meeting_title || cleanMeetingTitle(task.title)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                Captured {capturedAgo(task.created_at)}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                data-testid="pm-accept"
                onClick={(e) => {
                  e.stopPropagation()
                  mutateTask({ id: task.id, fields: { approval_status: 'accepted' } })
                  showUndo(
                    'Meeting accepted — digest queued',
                    () => mutateTask({ id: task.id, fields: { approval_status: 'pending' } }),
                  )
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 14px',
                  background: 'var(--task-accent-teal)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.01em',
                  touchAction: 'manipulation',
                }}
              >
                <Check size={13} strokeWidth={2.5} />
                Accept &amp; digest
              </button>
              <button
                type="button"
                data-testid="pm-decline"
                onClick={(e) => {
                  e.stopPropagation()
                  mutateTask({ id: task.id, fields: { approval_status: 'declined' } })
                  showUndo(
                    'Meeting declined',
                    () => mutateTask({ id: task.id, fields: { approval_status: 'pending' } }),
                  )
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  background: 'transparent',
                  color: 'var(--task-accent-coral)',
                  border: '1px solid var(--task-accent-coral)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  touchAction: 'manipulation',
                }}
              >
                <X size={13} strokeWidth={2} />
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
