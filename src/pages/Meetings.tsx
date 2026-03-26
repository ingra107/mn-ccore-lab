import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, CheckCircle2, Circle, Search, Clock, Plus, Users } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useMeetings } from '../hooks/useLocalData'
import { directors, getAllMembers } from '../data/team'
import { projects as projectOptions } from '../data/projects'
import MeetingCard from '../components/MeetingCard'
import QuickAddForm from '../components/QuickAddForm'
import Avatar from '../components/Avatar'
import type { ActionItem, Meeting } from '../data/types'

type FilterMode = 'all' | 'decisions' | 'actions'

const ALL_TEAM_MEMBERS = [
  ...directors.map((d) => ({ slug: d.slug, name: d.name, initials: d.initials, photoUrl: d.photoUrl })),
  ...getAllMembers().map((m) => ({ slug: m.slug ?? m.name, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
]

// Deduplicate by slug
const TEAM_OPTIONS = ALL_TEAM_MEMBERS.filter(
  (m, i, arr) => arr.findIndex((x) => x.slug === m.slug) === i
)

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

function getNextMeetingDate(meetingsList: Meeting[]): Date {
  const today = new Date()
  const sortedDates = meetingsList
    .map((m) => new Date(m.date + 'T12:00:00'))
    .sort((a, b) => b.getTime() - a.getTime())

  if (sortedDates.length > 0) {
    let next = new Date(sortedDates[0])
    next.setDate(next.getDate() + 14)
    while (next < today) {
      next.setDate(next.getDate() + 14)
    }
    return next
  }

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
  meetingId: string
  actionIndex: number
}

export default function Meetings() {
  usePageMeta(
    'Meeting Hub | MN-CCORE',
    'MNCCORE biweekly meetings, decisions, and action items archive.'
  )

  const headerRef = useScrollReveal<HTMLDivElement>()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Use localStorage-backed meetings data
  const { meetings, addMeeting, addActionItem, toggleActionItem } = useMeetings()

  // Add action item form state
  const [showAddAction, setShowAddAction] = useState(false)
  const [newActionDesc, setNewActionDesc] = useState('')
  const [newActionAssignee, setNewActionAssignee] = useState('nick')
  const [newActionDueDate, setNewActionDueDate] = useState('')
  const [newActionProject, setNewActionProject] = useState('')

  // Add meeting form state
  const [showAddMeeting, setShowAddMeeting] = useState(false)
  const [newMeetingDate, setNewMeetingDate] = useState('')
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [newMeetingAttendees, setNewMeetingAttendees] = useState<string[]>(['nick', 'nate'])
  const [newMeetingAgenda, setNewMeetingAgenda] = useState<string[]>([''])

  // Compute next meeting
  const nextMeeting = useMemo(() => getNextMeetingDate(meetings), [meetings])
  const daysUntil = getDaysUntil(nextMeeting)

  // Collect all action items across all meetings with context
  const allActionItems = useMemo(() => {
    const items: ActionItemWithContext[] = []
    for (const mtg of meetings) {
      if (mtg.actionItems) {
        for (let ai = 0; ai < mtg.actionItems.length; ai++) {
          items.push({
            ...mtg.actionItems[ai],
            meetingDate: mtg.date,
            meetingTitle: mtg.title,
            meetingId: mtg.id,
            actionIndex: ai,
          })
        }
      }
    }
    return items
  }, [meetings])

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
          ...(m.actionItems?.map((a: ActionItem) => a.description) ?? []),
        ].join(' ').toLowerCase()
        return searchable.includes(q)
      })
    }

    return result
  }, [filter, searchQuery, meetings])

  const FILTER_OPTIONS: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All Meetings' },
    { key: 'decisions', label: 'Decisions Only' },
    { key: 'actions', label: 'Action Items' },
  ]

  // Handlers
  function handleToggleAction(meetingId: string, actionIndex: number) {
    toggleActionItem(meetingId, actionIndex)
  }

  function handleAddActionItem() {
    if (!newActionDesc.trim()) return

    // Find the most recent meeting to attach the action item to
    const sortedMeetings = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    const targetMeetingId = sortedMeetings[0]?.id
    if (!targetMeetingId) return

    const newItem: ActionItem = {
      description: newActionDesc.trim(),
      assignee: newActionAssignee,
      completed: false,
      ...(newActionDueDate ? { dueDate: newActionDueDate } : {}),
      ...(newActionProject ? { projectSlug: newActionProject } : {}),
    }

    addActionItem(targetMeetingId, newItem)

    // Reset form
    setNewActionDesc('')
    setNewActionAssignee('nick')
    setNewActionDueDate('')
    setNewActionProject('')
    setShowAddAction(false)
  }

  function handleAddMeeting() {
    if (!newMeetingDate || !newMeetingTitle.trim()) return

    const newMeeting: Meeting = {
      id: `mtg-${newMeetingDate}`,
      date: newMeetingDate,
      title: newMeetingTitle.trim(),
      type: 'biweekly',
      attendees: newMeetingAttendees,
      agenda: newMeetingAgenda.filter((a) => a.trim()),
      actionItems: [],
      decisions: [],
    }

    addMeeting(newMeeting)

    // Reset form
    setNewMeetingDate('')
    setNewMeetingTitle('')
    setNewMeetingAttendees(['nick', 'nate'])
    setNewMeetingAgenda([''])
    setShowAddMeeting(false)
  }

  function toggleAttendee(slug: string) {
    setNewMeetingAttendees((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  function addAgendaItem() {
    setNewMeetingAgenda((prev) => [...prev, ''])
  }

  function updateAgendaItem(index: number, value: string) {
    setNewMeetingAgenda((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  function removeAgendaItem(index: number) {
    setNewMeetingAgenda((prev) => prev.filter((_, i) => i !== index))
  }

  // Input style helper
  const inputStyle: React.CSSProperties = {
    background: 'var(--ice)',
    border: '1px solid rgba(201,168,76,0.15)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    outline: 'none',
    borderRadius: '8px',
    padding: '6px 10px',
    width: '100%',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--slate)',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '4px',
    display: 'block',
  }

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

        {/* Upcoming Meeting */}
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

        {/* Action Items Summary */}
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
                      <button
                        type="button"
                        className="cursor-pointer shrink-0 mt-0.5 action-toggle-btn"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '12px',
                          margin: '-10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          transition: 'transform 0.15s ease',
                          minWidth: '44px',
                          minHeight: '44px',
                        }}
                        onClick={() => handleToggleAction(item.meetingId, item.actionIndex)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                        }}
                        title="Mark as completed"
                      >
                        <Circle size={16} style={{ color: 'var(--gold)' }} />
                      </button>
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

              {/* Add action item form */}
              <QuickAddForm
                isOpen={showAddAction}
                onToggle={() => setShowAddAction(true)}
                onSubmit={handleAddActionItem}
                onCancel={() => {
                  setShowAddAction(false)
                  setNewActionDesc('')
                  setNewActionAssignee('nick')
                  setNewActionDueDate('')
                  setNewActionProject('')
                }}
                triggerLabel="Add Action Item"
                submitLabel="Add Item"
                className="mt-3"
              >
                <div className="space-y-3">
                  {/* Description */}
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input
                      type="text"
                      value={newActionDesc}
                      onChange={(e) => setNewActionDesc(e.target.value)}
                      placeholder="What needs to be done?"
                      style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddActionItem() }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Assignee */}
                    <div>
                      <label style={labelStyle}>Assignee</label>
                      <select
                        value={newActionAssignee}
                        onChange={(e) => setNewActionAssignee(e.target.value)}
                        style={inputStyle}
                      >
                        {TEAM_OPTIONS.map((m) => (
                          <option key={m.slug} value={m.slug}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Due date */}
                    <div>
                      <label style={labelStyle}>Due Date (optional)</label>
                      <input
                        type="date"
                        value={newActionDueDate}
                        onChange={(e) => setNewActionDueDate(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Project link */}
                  <div>
                    <label style={labelStyle}>Project (optional)</label>
                    <select
                      value={newActionProject}
                      onChange={(e) => setNewActionProject(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">No project link</option>
                      {projectOptions.map((p) => (
                        <option key={p.title} value={p.title}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </QuickAddForm>
            </div>
          )}

          {/* If no pending actions but form should still be accessible */}
          {pendingActions.length === 0 && (
            <div className="mb-4">
              <p className="text-sm mb-2" style={{ color: 'var(--slate)', opacity: 0.5 }}>
                No pending action items.
              </p>
              <QuickAddForm
                isOpen={showAddAction}
                onToggle={() => setShowAddAction(true)}
                onSubmit={handleAddActionItem}
                onCancel={() => {
                  setShowAddAction(false)
                  setNewActionDesc('')
                }}
                triggerLabel="Add Action Item"
                submitLabel="Add Item"
              >
                <div className="space-y-3">
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input
                      type="text"
                      value={newActionDesc}
                      onChange={(e) => setNewActionDesc(e.target.value)}
                      placeholder="What needs to be done?"
                      style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddActionItem() }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={labelStyle}>Assignee</label>
                      <select
                        value={newActionAssignee}
                        onChange={(e) => setNewActionAssignee(e.target.value)}
                        style={inputStyle}
                      >
                        {TEAM_OPTIONS.map((m) => (
                          <option key={m.slug} value={m.slug}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Due Date (optional)</label>
                      <input type="date" value={newActionDueDate} onChange={(e) => setNewActionDueDate(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Project (optional)</label>
                    <select value={newActionProject} onChange={(e) => setNewActionProject(e.target.value)} style={inputStyle}>
                      <option value="">No project link</option>
                      {projectOptions.map((p) => (<option key={p.title} value={p.title}>{p.title}</option>))}
                    </select>
                  </div>
                </div>
              </QuickAddForm>
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
                      <button
                        type="button"
                        className="cursor-pointer shrink-0 mt-0.5 action-toggle-btn"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '12px',
                          margin: '-10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          transition: 'transform 0.15s ease',
                          minWidth: '44px',
                          minHeight: '44px',
                        }}
                        onClick={() => handleToggleAction(item.meetingId, item.actionIndex)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                        }}
                        title="Mark as pending"
                      >
                        <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
                      </button>
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

          {allActionItems.length === 0 && !showAddAction && (
            <div>
              <p className="text-sm mb-2" style={{ color: 'var(--slate)', opacity: 0.5 }}>
                No action items recorded yet.
              </p>
              <QuickAddForm
                isOpen={showAddAction}
                onToggle={() => setShowAddAction(true)}
                onSubmit={handleAddActionItem}
                onCancel={() => setShowAddAction(false)}
                triggerLabel="Add Action Item"
                submitLabel="Add Item"
              >
                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    type="text"
                    value={newActionDesc}
                    onChange={(e) => setNewActionDesc(e.target.value)}
                    placeholder="What needs to be done?"
                    style={inputStyle}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddActionItem() }}
                  />
                </div>
              </QuickAddForm>
            </div>
          )}
        </div>

        {/* Meeting Archive */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
            >
              Meeting Archive
            </h2>

            {/* Record Meeting button */}
            <QuickAddForm
              isOpen={showAddMeeting}
              onToggle={() => setShowAddMeeting(true)}
              onSubmit={handleAddMeeting}
              onCancel={() => {
                setShowAddMeeting(false)
                setNewMeetingDate('')
                setNewMeetingTitle('')
                setNewMeetingAttendees(['nick', 'nate'])
                setNewMeetingAgenda([''])
              }}
              triggerLabel="Record Meeting"
              submitLabel="Save Meeting"
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Date */}
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input
                      type="date"
                      value={newMeetingDate}
                      onChange={(e) => setNewMeetingDate(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* Title */}
                  <div>
                    <label style={labelStyle}>Title</label>
                    <input
                      type="text"
                      value={newMeetingTitle}
                      onChange={(e) => setNewMeetingTitle(e.target.value)}
                      placeholder="Meeting title"
                      style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)' }}
                    />
                  </div>
                </div>

                {/* Attendees */}
                <div>
                  <label style={labelStyle}>
                    <Users size={10} className="inline mr-1" />
                    Attendees
                  </label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {TEAM_OPTIONS.slice(0, 10).map((m) => {
                      const selected = newMeetingAttendees.includes(m.slug)
                      return (
                        <button
                          key={m.slug}
                          type="button"
                          onClick={() => toggleAttendee(m.slug)}
                          className="cursor-pointer inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '11px',
                            background: selected ? 'rgba(201,168,76,0.2)' : 'var(--ice)',
                            color: selected ? 'var(--ink)' : 'var(--slate)',
                            border: selected ? '1px solid var(--gold)' : '1px solid rgba(201,168,76,0.1)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ width: 16, height: 16 }}>
                            <Avatar
                              name={m.name}
                              initials={m.initials}
                              photoUrl={m.photoUrl}
                              size="sm"
                              variant="ice"
                              className="!w-4 !h-4 !min-w-0 !min-h-0 !text-[6px]"
                            />
                          </div>
                          {m.name.split(' ')[0]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Agenda items */}
                <div>
                  <label style={labelStyle}>Agenda</label>
                  <div className="space-y-2">
                    {newMeetingAgenda.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span
                          className="shrink-0 text-xs"
                          style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5, width: '18px' }}
                        >
                          {i + 1}.
                        </span>
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => updateAgendaItem(i, e.target.value)}
                          placeholder="Agenda item"
                          style={{ ...inputStyle, flex: 1 }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)' }}
                        />
                        {newMeetingAgenda.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAgendaItem(i)}
                            className="cursor-pointer shrink-0 text-xs"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--slate)',
                              opacity: 0.4,
                              padding: '4px',
                            }}
                          >
                            x
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addAgendaItem}
                      className="cursor-pointer inline-flex items-center gap-1 text-xs"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 0',
                      }}
                    >
                      <Plus size={12} />
                      Add agenda item
                    </button>
                  </div>
                </div>
              </div>
            </QuickAddForm>
          </div>

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
                    minHeight: '44px',
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
                  minHeight: '44px',
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
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onToggleAction={handleToggleAction}
                />
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
        .dark .quick-add-form-container {
          background: #162535 !important;
        }
        .dark .quick-add-trigger {
          background: #162535 !important;
        }
        .dark select, .dark input[type="date"] {
          color-scheme: dark;
        }
        .dark .action-item-card {
          border-color: rgba(201, 168, 76, 0.12) !important;
        }
        .dark .meeting-card {
          border-color: rgba(201, 168, 76, 0.12) !important;
        }
      `}</style>
    </div>
  )
}
