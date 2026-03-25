import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, CheckCircle2, Circle, Search, Clock } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { meetings } from '../data/meetings'
import { directors, getAllMembers } from '../data/team'
import MeetingCard from '../components/MeetingCard'
import Avatar from '../components/Avatar'
import type { ActionItem } from '../data/types'

type FilterMode = 'all' | 'decisions' | 'actions'

function getPersonInfo(slug: string) {
  const director = directors.find((d) => d.slug === slug)
  if (director) {
    return { name: director.name, initials: director.initials, photoUrl: director.photoUrl }
  }
  const member = getAllMembers().find((m) => m.slug === slug)
  if (member) {
    return { name: member.name, initials: member.initials, photoUrl: member.photoUrl }
  }
  return { name: slug, initials: slug.slice(0, 2).toUpperCase(), photoUrl: undefined }
}

function getNextMeetingDate(): Date {
  // Biweekly on Tuesdays. Find the next Tuesday on or after today.
  const today = new Date()
  // Get the most recent meeting date and add 14 days
  const sortedDates = meetings
    .map((m) => new Date(m.date + 'T12:00:00'))
    .sort((a, b) => b.getTime() - a.getTime())

  if (sortedDates.length > 0) {
    let next = new Date(sortedDates[0])
    next.setDate(next.getDate() + 14)
    // If that's already past, keep adding 14 days
    while (next < today) {
      next.setDate(next.getDate() + 14)
    }
    return next
  }

  // Fallback: next Tuesday
  const day = today.getDay()
  const daysUntilTuesday = (2 - day + 7) % 7 || 7
  const nextTuesday = new Date(today)
  nextTuesday.setDate(today.getDate() + daysUntilTuesday)
  return nextTuesday
}

function getDaysUntil(target: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const t = new Date(target)
  t.setHours(0, 0, 0, 0)
  return Math.ceil((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface ActionItemWithContext extends ActionItem {
  meetingDate: string
  meetingTitle: string
}

export default function Meetings() {
  usePageMeta(
    'Meeting Hub | MN-CCORE',
    'MNCCORE biweekly meetings, decisions, and action items archive.'
  )

  const headerRef = useScrollReveal<HTMLDivElement>()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Compute next meeting
  const nextMeeting = useMemo(() => getNextMeetingDate(), [])
  const daysUntil = getDaysUntil(nextMeeting)

  // Collect all action items across all meetings with context
  const allActionItems = useMemo(() => {
    const items: ActionItemWithContext[] = []
    for (const mtg of meetings) {
      if (mtg.actionItems) {
        for (const ai of mtg.actionItems) {
          items.push({
            ...ai,
            meetingDate: mtg.date,
            meetingTitle: mtg.title,
          })
        }
      }
    }
    return items
  }, [])

  const pendingActions = allActionItems.filter((a) => !a.completed)
  const completedActions = allActionItems.filter((a) => a.completed)

  // Filter meetings
  const filteredMeetings = useMemo(() => {
    let result = [...meetings].sort((a, b) => b.date.localeCompare(a.date))

    if (filter === 'decisions') {
      result = result.filter((m) => m.decisions && m.decisions.length > 0)
    } else if (filter === 'actions') {
      result = result.filter((m) => m.actionItems && m.actionItems.length > 0)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((m) => {
        const searchable = [
          m.title,
          m.notes ?? '',
          ...(m.agenda ?? []),
          ...(m.decisions ?? []),
          ...(m.actionItems?.map((a) => a.description) ?? []),
        ].join(' ').toLowerCase()
        return searchable.includes(q)
      })
    }

    return result
  }, [filter, searchQuery])

  const FILTER_OPTIONS: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All Meetings' },
    { key: 'decisions', label: 'Decisions Only' },
    { key: 'actions', label: 'Action Items' },
  ]

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '2rem', paddingTop: '1.5rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              color: 'var(--ink)',
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Meeting Hub
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              color: 'var(--slate)',
              opacity: 0.7,
              marginTop: '6px',
              maxWidth: '520px',
            }}
          >
            MNCCORE biweekly meetings, decisions, and action items
          </p>

          {/* Gold rule */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(to right, var(--gold), transparent)',
              opacity: 0.3,
              marginTop: '1.25rem',
            }}
          />
        </div>

        {/* ── Upcoming Meeting ── */}
        <div
          className="mb-8 p-4 sm:p-5 rounded-xl"
          style={{
            background: 'var(--gold-light)',
            border: '1px solid rgba(201,168,76,0.3)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="shrink-0 flex items-center justify-center rounded-lg"
              style={{
                width: '44px',
                height: '44px',
                background: 'var(--gold)',
              }}
            >
              <Calendar size={22} style={{ color: '#0f1923' }} />
            </div>
            <div>
              <h2
                className="text-sm font-semibold"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)', margin: 0 }}
              >
                Next Meeting
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.7 }}
              >
                {nextMeeting.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="ml-auto text-right">
              <div className="flex items-center gap-1.5">
                <Clock size={14} style={{ color: 'var(--gold)' }} />
                <span
                  className="text-sm font-semibold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
                >
                  {daysUntil === 0
                    ? 'Today'
                    : daysUntil === 1
                      ? 'Tomorrow'
                      : `${daysUntil} days`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Items Summary ── */}
        <div className="mb-8">
          <h2
            className="text-lg font-semibold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
          >
            Action Items
          </h2>

          {/* Pending */}
          {pendingActions.length > 0 && (
            <div className="mb-4">
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}
              >
                Pending ({pendingActions.length})
              </h3>
              <div className="space-y-2">
                {pendingActions.map((item, i) => {
                  const info = getPersonInfo(item.assignee)
                  return (
                    <div
                      key={`pending-${i}`}
                      className="flex items-start gap-3 p-3 rounded-lg action-item-card"
                      style={{
                        background: 'var(--cream)',
                        border: '1px solid rgba(201,168,76,0.15)',
                        boxShadow: 'var(--shadow-card)',
                      }}
                    >
                      <Circle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug" style={{ color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>
                          {item.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <div style={{ width: 18, height: 18 }}>
                              <Avatar
                                name={info.name}
                                initials={info.initials}
                                photoUrl={info.photoUrl}
                                size="sm"
                                variant="ice"
                                className="!w-[18px] !h-[18px] !min-w-0 !min-h-0"
                              />
                            </div>
                            <span className="text-xs" style={{ color: 'var(--slate)', fontFamily: 'var(--font-body)' }}>
                              {info.name}
                            </span>
                          </div>
                          {item.dueDate && (
                            <span
                              className="text-xs"
                              style={{ color: 'var(--slate)', opacity: 0.6, fontFamily: 'var(--font-mono)' }}
                            >
                              due {formatShortDate(item.dueDate)}
                            </span>
                          )}
                          {item.projectSlug && (
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-xs"
                              style={{
                                background: 'var(--ice)',
                                color: 'var(--slate)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '10px',
                              }}
                            >
                              {item.projectSlug}
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

          {/* Completed */}
          {completedActions.length > 0 && (
            <div>
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}
              >
                Completed ({completedActions.length})
              </h3>
              <div className="space-y-1.5">
                {completedActions.map((item, i) => {
                  const info = getPersonInfo(item.assignee)
                  return (
                    <div
                      key={`completed-${i}`}
                      className="flex items-start gap-3 p-2.5 rounded-lg action-item-card"
                      style={{
                        background: 'var(--cream)',
                        opacity: 0.7,
                      }}
                    >
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm leading-snug"
                          style={{
                            color: 'var(--ink)',
                            fontFamily: 'var(--font-body)',
                            textDecoration: 'line-through',
                            opacity: 0.6,
                          }}
                        >
                          {item.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <div className="flex items-center gap-1.5">
                            <div style={{ width: 16, height: 16 }}>
                              <Avatar
                                name={info.name}
                                initials={info.initials}
                                photoUrl={info.photoUrl}
                                size="sm"
                                variant="ice"
                                className="!w-4 !h-4 !min-w-0 !min-h-0"
                              />
                            </div>
                            <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.6, fontFamily: 'var(--font-body)' }}>
                              {info.name}
                            </span>
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: 'var(--slate)', opacity: 0.4, fontFamily: 'var(--font-mono)' }}
                          >
                            from {formatShortDate(item.meetingDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {allActionItems.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--slate)', opacity: 0.5 }}>
              No action items recorded yet.
            </p>
          )}
        </div>

        {/* ── Meeting Archive ── */}
        <div>
          <h2
            className="text-lg font-semibold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
          >
            Meeting Archive
          </h2>

          {/* Filter bar + search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-2">
              {FILTER_OPTIONS.map((f) => (
                <motion.button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="cursor-pointer inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    minHeight: '32px',
                    background: filter === f.key ? 'var(--gold)' : 'var(--ice)',
                    color: filter === f.key ? '#0f1923' : 'var(--slate)',
                    border: 'none',
                    transitionProperty: 'background-color, color',
                    transitionDuration: '200ms',
                    transitionTimingFunction: 'ease',
                  }}
                  whileTap={{ scale: 0.95 }}
                  aria-pressed={filter === f.key}
                >
                  {f.label}
                </motion.button>
              ))}
            </div>

            {/* Search box */}
            <div className="relative sm:ml-auto" style={{ maxWidth: '280px', width: '100%' }}>
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--slate)', opacity: 0.4 }}
              />
              <input
                type="text"
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm"
                style={{
                  background: 'var(--ice)',
                  border: '1px solid rgba(201,168,76,0.15)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gold)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'
                }}
              />
            </div>
          </div>

          {/* Meeting list */}
          <div className="space-y-3">
            {filteredMeetings.length > 0 ? (
              filteredMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm" style={{ color: 'var(--slate)', opacity: 0.5, fontFamily: 'var(--font-body)' }}>
                  {searchQuery ? 'No meetings match your search.' : 'No meetings found.'}
                </p>
              </div>
            )}
          </div>

          {/* Stats footer */}
          <div className="mt-4 text-center">
            <span
              className="text-xs"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}
            >
              {meetings.length} meetings &middot; {allActionItems.length} action items &middot;{' '}
              {meetings.reduce((acc, m) => acc + (m.decisions?.length ?? 0), 0)} decisions
            </span>
          </div>
        </div>
      </div>

      {/* Scoped styles */}
      <style>{`
        .dark .meeting-card {
          background: #162535 !important;
        }
        .dark .action-item-card {
          background: #162535 !important;
        }
      `}</style>
    </div>
  )
}
