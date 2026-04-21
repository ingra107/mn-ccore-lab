import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, CheckCircle2, Circle, Users, ListChecks, ArrowRight, UserCheck } from 'lucide-react'
import Avatar from './Avatar'
import { getPersonInfo } from '../data/team'
import { formatFullDate, formatShortDate } from '../lib/dateUtils'
import { getMeetingFacilitator } from '../lib/facilitator'
import type { Meeting } from '../data/types'
import { PATHS } from '../constants/paths'

interface MeetingCardProps {
  meeting: Meeting
  onToggleAction?: (meetingId: string, actionId: string) => void
}

export default function MeetingCard({ meeting, onToggleAction }: MeetingCardProps) {
  const [expanded, setExpanded] = useState(false)
  const pendingActions = meeting.actionItems?.filter((a) => !a.completed).length ?? 0
  const totalActions = meeting.actionItems?.length ?? 0

  return (
    <motion.div
      layout
      className="meeting-card"
      style={{
        background: 'var(--cream)',
        borderRadius: 'var(--radius-xl)',
        borderLeft: pendingActions > 0 ? '3px solid var(--gold)' : '3px solid var(--ice)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease',
      }}
      whileHover={{
        boxShadow: 'var(--shadow-card-hover)',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Collapsed header — always visible */}
      <div className="flex items-center gap-3 sm:gap-4 p-4">
        {/* Date badge */}
        <div
          className="shrink-0 flex flex-col items-center justify-center rounded-lg"
          style={{
            width: '52px',
            height: '52px',
            background: 'var(--gold-light)',
            border: '1px solid rgba(201,168,76,0.3)',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              color: 'var(--gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              lineHeight: 1,
            }}
          >
            {new Date(meeting.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </span>
          <span
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--ink)',
              lineHeight: 1.2,
            }}
          >
            {new Date(meeting.date + 'T12:00:00').getDate()}
          </span>
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm sm:text-base font-normal leading-snug truncate"
            style={{
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            {meeting.title}
          </h3>
          <div className="flex items-center gap-3 mt-1">
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              <Users size={12} />
              {meeting.attendees?.length ?? 0}
            </span>
            {totalActions > 0 && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{
                  color: pendingActions > 0 ? 'var(--gold)' : 'var(--teal)',
                }}
              >
                <ListChecks size={12} />
                {pendingActions > 0 ? `${pendingActions} pending` : `${totalActions} done`}
              </span>
            )}
            {(() => {
              const fSlug = getMeetingFacilitator(meeting.date)
              const fInfo = fSlug ? getPersonInfo(fSlug) : null
              return fInfo ? (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--teal)' }}>
                  <UserCheck size={12} />
                  {fInfo.name.split(' ')[0]}
                </span>
              ) : null
            })()}
          </div>
        </div>

        {/* Attendee avatars (desktop) */}
        <div className="hidden sm:flex items-center -space-x-2">
          {meeting.attendees?.slice(0, 4).map((slug) => {
            const info = getPersonInfo(slug)
            return (
              <div key={slug} style={{ width: 28, height: 28 }}>
                <Avatar
                  name={info.name}
                  initials={info.initials}
                  photoUrl={info.photoUrl}
                  variant="ice"
                  size="base-sm"
                />
              </div>
            )
          })}
          {(meeting.attendees?.length ?? 0) > 4 && (
            <span
              className="text-xs pl-2"
              style={{ color: 'var(--slate)', opacity: 0.75 }}
            >
              +{(meeting.attendees?.length ?? 0) - 4}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
          style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
        >
          <ChevronDown size={20} />
        </motion.div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 pb-4"
              style={{ borderTop: '1px solid rgba(201,168,76,0.15)' }}
            >
              {/* Date line */}
              <p
                className="text-xs mt-3 mb-3"
                style={{ color: 'var(--slate)', opacity: 0.75 }}
              >
                {formatFullDate(meeting.date)}
              </p>

              {/* Attendees (full list) */}
              {meeting.attendees && meeting.attendees.length > 0 && (
                <div className="mb-4">
                  <h4
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--slate)', opacity: 0.75, letterSpacing: '0.06em' }}
                  >
                    Attendees
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {meeting.attendees.map((slug) => {
                      const info = getPersonInfo(slug)
                      return (
                        <div key={slug} className="flex items-center gap-1.5">
                          <div style={{ width: 24, height: 24 }}>
                            <Avatar
                              name={info.name}
                              initials={info.initials}
                              photoUrl={info.photoUrl}
                              variant="ice"
                              size="tight"
                            />
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: 'var(--ink)' }}
                          >
                            {info.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Agenda */}
              {meeting.agenda && meeting.agenda.length > 0 && (
                <div className="mb-4">
                  <h4
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--slate)', opacity: 0.75, letterSpacing: '0.06em' }}
                  >
                    Agenda
                  </h4>
                  <ol className="list-decimal list-inside space-y-1">
                    {meeting.agenda.map((item, i) => (
                      <li
                        key={i}
                        className="text-sm leading-relaxed"
                        style={{ color: 'var(--ink)' }}
                      >
                        {item}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Decisions */}
              {meeting.decisions && meeting.decisions.length > 0 && (
                <div className="mb-4">
                  <h4
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--gold)', letterSpacing: '0.06em' }}
                  >
                    Decisions
                  </h4>
                  <div className="space-y-2">
                    {meeting.decisions.map((decision, i) => (
                      <div
                        key={i}
                        className="flex gap-2 px-3 py-2 rounded-md text-sm"
                        style={{
                          background: 'var(--gold-active)',
                          border: '1px solid rgba(201,168,76,0.2)',
                          color: 'var(--ink)',
                          }}
                      >
                        <span style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px' }}>&#9670;</span>
                        {decision}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {meeting.actionItems && meeting.actionItems.length > 0 && (
                <div className="mb-4">
                  <h4
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--slate)', opacity: 0.75, letterSpacing: '0.06em' }}
                  >
                    Action Items
                  </h4>
                  <div className="space-y-2">
                    {meeting.actionItems.map((item, i) => {
                      const info = getPersonInfo(item.assignee)
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-sm"
                          style={{ color: 'var(--ink)' }}
                        >
                          <button
                            type="button"
                            className="cursor-pointer shrink-0 mt-0.5 action-toggle-btn"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 'var(--sp-md)',
                              margin: '-10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 'var(--radius-sm)',
                              transition: 'transform 0.15s ease',
                              minWidth: '44px',
                              minHeight: '44px',
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (item.id) onToggleAction?.(meeting.id, item.id)
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.2)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)'
                            }}
                            title={item.completed ? 'Mark as pending' : 'Mark as completed'}
                          >
                            {item.completed ? (
                              <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
                            ) : (
                              <Circle size={16} style={{ color: 'var(--gold)' }} />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <span style={{ textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.85 : 1 }}>
                              {item.description}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex items-center gap-1">
                                <div style={{ width: 16, height: 16 }}>
                                  <Avatar
                                    name={info.name}
                                    initials={info.initials}
                                    photoUrl={info.photoUrl}
                                    variant="ice"
                                    size="2xs"
                                  />
                                </div>
                                <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.85 }}>
                                  {info.name}
                                </span>
                              </div>
                              {item.dueDate && (
                                <span
                                  className="text-xs"
                                  style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
                                >
                                  due {formatShortDate(item.dueDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              {meeting.notes && (
                <div className="mb-4">
                  <h4
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--slate)', opacity: 0.75, letterSpacing: '0.06em' }}
                  >
                    Notes
                  </h4>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--slate)' }}
                  >
                    {meeting.notes}
                  </p>
                </div>
              )}

              {/* View Full Meeting link */}
              <Link
                to={PATHS.meeting(meeting.id)}
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-md text-xs font-medium"
                style={{
                  fontSize: 'var(--label-size)',
                  background: 'var(--gold)',
                  color: '#0f1923',
                  textDecoration: 'none',
                  transition: 'opacity 0.2s',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                View Full Meeting <ArrowRight size={11} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
