// PendingMeetingsCard — dedicated triage surface for captured meetings awaiting Accept/Decline.
//
// Nick's ask: "it can't just be a task with a checkbox, needs to be an accept/decline mechanism."
// Mounted at the TOP of My Tasks and Today, above all regular task groups.
// Pending meeting tasks are EXCLUDED from the regular task list to prevent double-render.
//
// Mutation path: mutateTask({ id, fields: { approval_status: 'accepted' | 'declined',
//                                            status: 'done' } })  <- #97: answering CLOSES it
// Undo path: showUndo() reverts to 'pending' — identical to the old TaskCard inline buttons.
//
// Renders null when tasks is empty (no card appears when nothing is pending).
//
// Look (Today reskin, 2026-10-09): the same warm gold attention card as
// "Needs you": one card, title inside it, no box-in-box. Accept is the glossy
// teal primary. Styles: .tk-attn in index.css (the .tk wrapper scopes them).

import { Check, X } from 'lucide-react'
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
  /** Wrap in the page band (.mt-band). My Tasks needs it; Today passes false. */
  band?: boolean
}

export function PendingMeetingsCard({ tasks, band = true }: PendingMeetingsCardProps) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()

  if (tasks.length === 0) return null

  const card = (
    <div className="tk">
      <section className="tk-attn" aria-label="Meeting to triage">
        <div className="tk-attn-h">
          <span className="tk-attn-dot" aria-hidden="true" />
          {tasks.length === 1 ? 'Meeting to triage' : 'Meetings to triage'}
          <span className="tk-cnt">{tasks.length}</span>
        </div>

        {tasks.map((task) => (
          <div key={task.id} className="tk-qrow" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Title + captured timestamp */}
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: 'var(--sk-t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {/* meeting_title is the raw capture title; fall back to the task
                    name with the "Meeting: … [pending approval]" wrapper stripped */}
                {task.meeting_title || cleanMeetingTitle(task.title)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--sk-t3)', marginTop: 2 }}>
                Captured {capturedAgo(task.created_at)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                data-testid="pm-accept"
                className="tk-btn tk-sm tk-pri"
                onClick={(e) => {
                  e.stopPropagation()
                  // #97: close the row as well as answering it. The approval
                  // task is a triage artifact — once answered it is not work,
                  // so it must not linger as an open todo in counts, the digest
                  // email or PB sync. The API derives the completed triad from
                  // `status` (api/routes/tasks.ts:322-340), and undo's
                  // status:'todo' clears it symmetrically.
                  mutateTask({ id: task.id, fields: { approval_status: 'accepted', status: 'done' } })
                  showUndo(
                    'Meeting accepted — digest queued',
                    () => mutateTask({ id: task.id, fields: { approval_status: 'pending', status: 'todo' } }),
                  )
                }}
                style={{ touchAction: 'manipulation' }}
              >
                <Check size={13} strokeWidth={2.5} />
                Accept &amp; digest
              </button>
              <button
                type="button"
                data-testid="pm-decline"
                className="tk-btn tk-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  // #97: see the Accept handler — declining closes the row too.
                  mutateTask({ id: task.id, fields: { approval_status: 'declined', status: 'done' } })
                  showUndo(
                    'Meeting declined',
                    () => mutateTask({ id: task.id, fields: { approval_status: 'pending', status: 'todo' } }),
                  )
                }}
                style={{ touchAction: 'manipulation' }}
              >
                <X size={13} strokeWidth={2} />
                Decline
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
  return band ? <div className="mt-band" style={{ paddingTop: 12, paddingBottom: 0 }}>{card}</div> : card
}
