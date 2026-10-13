/**
 * ActiveSubmissionsWidget — horizontal scroll of mini-cards representing
 * the Lab's currently-in-flight submissions (M-12, D25).
 *
 * Renders at the top of the Manuscripts List view, above the category
 * chips and below the NeedsAttentionDashboard. Uses the existing
 * `/api/submissions/active` endpoint (already returns one row per
 * active project sorted by upcoming revision due, then submission age).
 *
 * Empty state: "No active submissions in the last 30 days." Component
 * renders nothing while loading so it never causes CLS on the page.
 */

import { Link } from 'react-router-dom'
import { Send, Clock, ArrowRight } from 'lucide-react'
import { useActiveSubmissions } from '../hooks/useApiData'
import type { ActiveSubmissionRow, SubmissionEventType } from '../lib/api'
import { PATHS } from '../constants/paths'
import { formatShortDate } from '../lib/dateUtils'
import { ICON_PROPS } from '../lib/iconProps'

const EVENT_LABEL: Record<SubmissionEventType, string> = {
  submitted: 'Submitted',
  reviews_received: 'Reviews in',
  revision_due: 'Revision due',
  resubmitted: 'Resubmitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

function MiniCard({ row, compact = false }: { row: ActiveSubmissionRow; compact?: boolean }) {
  const slug = row.project_slug || row.project_id
  const href = slug ? `${PATHS.project(slug)}?tab=revisions` : PATHS.manuscripts
  const status = EVENT_LABEL[row.latest_event_type] || row.latest_event_type
  // Coral if revision is overdue, gold if due soon (<=14d), teal otherwise.
  const dueIn = row.days_until_revision_due
  const accent =
    dueIn !== null && dueIn !== undefined && dueIn < 0
      ? 'var(--job-overdue)'
      : dueIn !== null && dueIn !== undefined && dueIn <= 14
        ? 'var(--job-stale)'
        : 'var(--sk-t2)'

  return (
    <Link
      to={href}
      className="active-submission-card sk-mat"
      style={{
        flexShrink: 0,
        minWidth: compact ? 0 : '220px',
        maxWidth: compact ? 'none' : '260px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'box-shadow 0.12s ease-out',
      }}
    >
      <div className="flex items-center gap-1.5" style={{ fontSize: '11px', fontWeight: 500, color: accent, letterSpacing: '0.02em' }}>
        <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: accent }} />
        {status}
      </div>
      <div
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.3,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
        }}
        title={row.project_title || row.project_id}
      >
        {row.project_title || 'Untitled project'}
      </div>
      <div className="flex items-center gap-2" style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85 }}>
        {row.journal && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.journal}
          </span>
        )}
        {row.revision_due_date && (
          <span className="ml-auto inline-flex items-center gap-1" style={{ color: accent, fontWeight: 500, flexShrink: 0 }}>
            <Clock {...ICON_PROPS} size={10} />
            {formatShortDate(row.revision_due_date)}
          </span>
        )}
        {!row.revision_due_date && row.days_since_submission !== null && row.days_since_submission !== undefined && (
          <span className="ml-auto" style={{ color: 'var(--slate)', opacity: 0.85, flexShrink: 0 }}>
            {row.days_since_submission}d ago
          </span>
        )}
      </div>
    </Link>
  )
}

/** `compact`: the Manuscripts rail. Cards stack in one column instead of scrolling sideways. */
export default function ActiveSubmissionsWidget({ compact = false }: { compact?: boolean } = {}) {
  const { data, isLoading } = useActiveSubmissions()
  if (isLoading) return null
  const rows = data ?? []

  return (
    <div style={{ marginBottom: compact ? 0 : '1.25rem' }}>
      <div className="flex items-center gap-2 mb-2">
        <Send {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t2)' }} />
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          Active submissions
        </h3>
        <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85 }}>
          {rows.length === 1 ? '1 paper' : `${rows.length} papers`}
        </span>
      </div>
      {rows.length === 0 ? (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--sk-t1) 4%, transparent)',
            fontSize: '12px',
            color: 'var(--muted)',
          }}
        >
          No active submissions in the last 30 days.
        </div>
      ) : (
        <div
          className="active-submissions-scroller"
          style={compact ? { display: 'flex', flexDirection: 'column', gap: '8px' } : {
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '4px',
            scrollSnapType: 'x proximity',
          }}
        >
          {rows.map((row) => (
            <div key={row.id} style={{ scrollSnapAlign: 'start' }}>
              <MiniCard row={row} compact={compact} />
            </div>
          ))}
          {!compact && rows.length >= 4 && (
            <Link
              to={PATHS.manuscripts}
              style={{
                flexShrink: 0,
                alignSelf: 'center',
                padding: '6px 12px',
                fontSize: '11px',
                color: 'var(--sk-t2)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              View all
              <ArrowRight {...ICON_PROPS} size={11} />
            </Link>
          )}
        </div>
      )}
      <style>{`
        .active-submission-card:hover {
          box-shadow: inset 0 1px 0 var(--sk-rim-ac), var(--sk-amb);
        }
      `}</style>
    </div>
  )
}
