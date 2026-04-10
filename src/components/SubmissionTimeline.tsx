/**
 * SubmissionTimeline — vertical timeline of paper submission lifecycle events.
 *
 * Shows the full journey: submitted -> reviews_received -> revision_due ->
 * resubmitted -> accepted/rejected/withdrawn.
 *
 * Used on ProjectDetail (Revisions tab) and as an active submissions
 * widget on the Manuscripts page.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  MessageSquare,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  LogOut,
  Plus,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import type { SubmissionEventType, SubmissionEventRow } from '../lib/api'
import { useSubmissionEvents } from '../hooks/useApiData'
import { useCreateSubmissionEvent, useDeleteSubmissionEvent } from '../hooks/useMutations'
import { formatRelativeTime, getDaysUntil } from '../lib/dateUtils'
import EmptyState from './EmptyState'
import { getStatusColor, getStatusBg } from '../lib/statusColors'

// ── Event config ──

const EVENT_CONFIG: Record<SubmissionEventType, {
  label: string
  color: string
  bg: string
  icon: typeof Send
}> = {
  submitted: {
    label: 'Submitted',
    color: getStatusColor('submitted'),
    bg: getStatusBg('submitted'),
    icon: Send,
  },
  reviews_received: {
    label: 'Reviews Received',
    color: getStatusColor('review_received'),
    bg: getStatusBg('review_received'),
    icon: MessageSquare,
  },
  revision_due: {
    label: 'Revision Due',
    color: getStatusColor('revision_due'),
    bg: getStatusBg('revision_due'),
    icon: Clock,
  },
  resubmitted: {
    label: 'Resubmitted',
    color: getStatusColor('resubmitted'),
    bg: getStatusBg('resubmitted'),
    icon: RotateCcw,
  },
  accepted: {
    label: 'Accepted',
    color: getStatusColor('accepted'),
    bg: getStatusBg('accepted'),
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    color: getStatusColor('rejected'),
    bg: getStatusBg('rejected'),
    icon: XCircle,
  },
  withdrawn: {
    label: 'Withdrawn',
    color: getStatusColor('withdrawn'),
    bg: getStatusBg('withdrawn'),
    icon: LogOut,
  },
}

const EVENT_TYPES: SubmissionEventType[] = [
  'submitted',
  'reviews_received',
  'revision_due',
  'resubmitted',
  'accepted',
  'rejected',
  'withdrawn',
]

function formatDaysUntil(dateStr: string): string {
  const diff = getDaysUntil(dateStr)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'today'
  if (diff === 1) return 'in 1d'
  return `in ${diff}d`
}

// ── Add Event Form ──

function AddEventForm({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const [eventType, setEventType] = useState<SubmissionEventType>('submitted')
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10))
  const [journal, setJournal] = useState('')
  const [notes, setNotes] = useState('')
  const createEvent = useCreateSubmissionEvent(projectId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createEvent.mutate(
      {
        project_id: projectId,
        event_type: eventType,
        event_date: eventDate,
        journal: journal || undefined,
        notes: notes || undefined,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={handleSubmit}
      style={{
        padding: '14px 16px',
        background: 'var(--surface-raised)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        marginBottom: '16px',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        {/* Event type */}
        <div>
          <label style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 0.6, display: 'block', marginBottom: '4px' }}>
            Event Type
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as SubmissionEventType)}
              style={{
                width: '100%',
                padding: '6px 28px 6px 10px',
                fontSize: 'var(--value-size)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                color: 'var(--ink)',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_CONFIG[t].label}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--slate)', opacity: 'var(--ink-label)' }}
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <label style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 0.6, display: 'block', marginBottom: '4px' }}>
            Date
          </label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: 'var(--value-size)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--ink)',
            }}
          />
        </div>
      </div>

      {/* Journal */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 0.6, display: 'block', marginBottom: '4px' }}>
          Journal
        </label>
        <input
          type="text"
          value={journal}
          onChange={(e) => setJournal(e.target.value)}
          placeholder="e.g., CHEST, AJRCCM"
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: 'var(--value-size)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--ink)',
          }}
        />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 0.6, display: 'block', marginBottom: '4px' }}>
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional details..."
          rows={2}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: 'var(--value-size)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--ink)',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 'var(--label-weight)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--slate)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createEvent.isPending}
          style={{
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--teal)',
            background: 'var(--teal)',
            color: '#fff',
            cursor: createEvent.isPending ? 'wait' : 'pointer',
            opacity: createEvent.isPending ? 0.6 : 1,
          }}
        >
          {createEvent.isPending ? 'Adding...' : 'Add Event'}
        </button>
      </div>
    </motion.form>
  )
}

// ── Single Timeline Event ──

function TimelineEvent({
  event,
  isLast,
  onDelete,
}: {
  event: SubmissionEventRow
  isLast: boolean
  onDelete: (id: string) => void
}) {
  const config = EVENT_CONFIG[event.event_type as SubmissionEventType] || EVENT_CONFIG.submitted
  const Icon = config.icon
  const isTerminal = ['accepted', 'rejected', 'withdrawn'].includes(event.event_type)
  const isFuture = event.event_type === 'revision_due'
  const relativeDate = isFuture ? formatDaysUntil(event.event_date) : formatRelativeTime(event.event_date)
  const isOverdue = isFuture && relativeDate.includes('overdue')

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', gap: '12px', position: 'relative' }}
    >
      {/* Timeline line + dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px', flexShrink: 0 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 'var(--radius-circle)',
            background: config.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: isTerminal ? `2px solid ${config.color}` : 'none',
            flexShrink: 0,
          }}
        >
          <Icon size={12} style={{ color: config.color }} />
        </div>
        {!isLast && (
          <div
            style={{
              width: '2px',
              flex: 1,
              minHeight: '16px',
              background: 'var(--border-subtle)',
              opacity: 'var(--ink-label)',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Badge */}
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: config.color,
              padding: '2px 8px',
              borderRadius: 'var(--radius-lg)',
              background: config.bg,
              lineHeight: 1.4,
            }}
          >
            {config.label}
          </span>

          {/* Date pill */}
          <span
            style={{
              fontSize: 'var(--label-size)',
              fontWeight: 'var(--label-weight)',
              color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
              opacity: isOverdue ? 1 : 0.5,
            }}
          >
            {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>

          {/* Relative time */}
          <span
            style={{
              fontSize: 'var(--label-size)',
              fontWeight: 'var(--label-weight)',
              color: isOverdue ? 'var(--maroon)' : 'var(--teal)',
              opacity: isOverdue ? 1 : 0.7,
              padding: '1px 6px',
              borderRadius: 'var(--radius-lg)',
              background: isOverdue ? 'rgba(122, 0, 25, 0.08)' : 'rgba(45, 138, 138, 0.06)',
            }}
          >
            {relativeDate}
          </span>

          {/* Delete button */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(event.id) }}
            title="Delete event"
            style={{
              marginLeft: 'auto',
              padding: '2px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--slate)',
              opacity: 0.3,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.8' }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.3' }}
          >
            <Trash2 size={12} />
          </button>
        </div>

        {/* Journal */}
        {event.journal && (
          <span style={{ fontSize: '12px', color: 'var(--ink)', opacity: 0.6, display: 'block', marginTop: '3px' }}>
            {event.journal}
          </span>
        )}

        {/* Notes */}
        {event.notes && (
          <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 'var(--ink-label)', margin: '4px 0 0', lineHeight: 1.5 }}>
            {event.notes}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ── Main Component: SubmissionTimeline (for ProjectDetail) ──

export default function SubmissionTimeline({ projectId }: { projectId: string }) {
  const { data: events = [], isLoading } = useSubmissionEvents(projectId)
  const deleteEvent = useDeleteSubmissionEvent(projectId)
  const [showAdd, setShowAdd] = useState(false)

  // Show newest at top
  const sortedEvents = [...events].reverse()

  if (isLoading) {
    return (
      <div style={{ padding: '24px 0' }}>
        <div style={{ height: '60px', background: 'var(--border-subtle)', opacity: 0.3, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Send size={14} style={{ color: 'var(--teal)' }} />
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Submission Timeline
          </h3>
          {events.length > 0 && (
            <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 'var(--label-weight)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--teal)',
            cursor: 'pointer',
            transition: 'background 0.12s ease-out',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(45, 138, 138, 0.06)' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent' }}
        >
          <Plus size={12} />
          Add Event
        </button>
      </div>

      {/* Add event form */}
      <AnimatePresence>
        {showAdd && <AddEventForm projectId={projectId} onClose={() => setShowAdd(false)} />}
      </AnimatePresence>

      {/* Timeline */}
      {sortedEvents.length > 0 ? (
        <div style={{ paddingLeft: '4px' }}>
          <AnimatePresence mode="popLayout">
            {sortedEvents.map((event, i) => (
              <TimelineEvent
                key={event.id}
                event={event}
                isLast={i === sortedEvents.length - 1}
                onDelete={(id) => deleteEvent.mutate(id)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        !showAdd && (
          <EmptyState
            icon={<Send size={20} />}
            title="No submission events yet"
            subtitle="Track your paper's journey through peer review"
          />
        )
      )}
    </div>
  )
}

// ── Exported: Active Submissions Dashboard (for Manuscripts page) ──

export function ActiveSubmissionsDashboard({
  submissions,
}: {
  submissions: {
    id: string
    project_id: string
    latest_event_type: SubmissionEventType
    latest_event_date: string
    journal: string | null
    project_title: string | null
    project_slug: string | null
    days_since_submission: number
    revision_due_date: string | null
    days_until_revision_due: number | null
  }[]
}) {
  if (submissions.length === 0) return null

  return (
    <div
      className="table-container"
      style={{ marginBottom: '1.5rem' }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Send size={14} style={{ color: 'var(--teal)' }} />
        <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)' }}>
          Active Submissions
        </span>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          {submissions.length}
        </span>
      </div>

      {/* Column headers */}
      <div
        className="hidden sm:grid"
        style={{
          gridTemplateColumns: 'minmax(200px, 1fr) 120px 120px 100px 100px',
          padding: '6px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {['Project', 'Status', 'Journal', 'Submitted', 'Revision Due'].map((col) => (
          <span
            key={col}
            style={{
              fontSize: '10px',
              fontWeight: 'var(--label-weight)',
              color: 'var(--slate)',
              opacity: 0.45,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      {submissions.map((sub) => {
        const config = EVENT_CONFIG[sub.latest_event_type] || EVENT_CONFIG.submitted
        const isOverdue = sub.days_until_revision_due !== null && sub.days_until_revision_due < 0

        return (
          <a
            key={sub.id}
            href={`/projects/${sub.project_slug || sub.project_id}?tab=revisions`}
            className="active-submission-row"
            style={{
              textDecoration: 'none',
              display: 'block',
            }}
          >
            {/* Desktop row */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: 'minmax(200px, 1fr) 120px 120px 100px 100px',
                padding: '10px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'background 0.12s ease-out',
              }}
            >
              {/* Project title */}
              <span style={{ fontSize: 'var(--value-size)', fontWeight: 'var(--label-weight)', color: 'var(--ink)', lineHeight: 1.4 }}>
                {sub.project_title || sub.project_id}
              </span>

              {/* Status badge */}
              <span
                style={{
                  fontSize: 'var(--label-size)',
                  fontWeight: 600,
                  color: config.color,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-lg)',
                  background: config.bg,
                  display: 'inline-block',
                  width: 'fit-content',
                }}
              >
                {config.label}
              </span>

              {/* Journal */}
              <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.6 }}>
                {sub.journal || '--'}
              </span>

              {/* Days since submission */}
              <span style={{ fontSize: '12px', color: 'var(--teal)', opacity: 0.7 }}>
                {sub.days_since_submission}d ago
              </span>

              {/* Revision due */}
              {sub.revision_due_date ? (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: isOverdue ? 600 : 400,
                    color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
                    opacity: isOverdue ? 1 : 0.6,
                  }}
                >
                  {isOverdue
                    ? `${Math.abs(sub.days_until_revision_due!)}d overdue`
                    : `${sub.days_until_revision_due}d left`
                  }
                </span>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.3 }}>--</span>
              )}
            </div>

            {/* Mobile row */}
            <div
              className="sm:hidden"
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: 'var(--value-size)', fontWeight: 'var(--label-weight)', color: 'var(--ink)', flex: 1 }}>
                  {sub.project_title || sub.project_id}
                </span>
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    fontWeight: 600,
                    color: config.color,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-lg)',
                    background: config.bg,
                  }}
                >
                  {config.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                {sub.journal && <span>{sub.journal}</span>}
                <span>{sub.days_since_submission}d ago</span>
                {sub.revision_due_date && (
                  <span style={{ color: isOverdue ? 'var(--maroon)' : undefined, fontWeight: isOverdue ? 600 : 400, opacity: isOverdue ? 1 : undefined }}>
                    {isOverdue ? `${Math.abs(sub.days_until_revision_due!)}d overdue` : `${sub.days_until_revision_due}d left`}
                  </span>
                )}
              </div>
            </div>
          </a>
        )
      })}

      <style>{`
        .active-submission-row > div:hover {
          background: rgba(201, 168, 76, 0.06) !important;
        }
        .dark .active-submission-row > div:hover {
          background: rgba(201, 168, 76, 0.08) !important;
        }
      `}</style>
    </div>
  )
}
