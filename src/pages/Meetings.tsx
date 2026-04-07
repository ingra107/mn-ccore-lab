import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, Calendar, CheckCircle2, Circle, Search, Clock, Plus, Users, UserCheck } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useListKeyboardNav } from '../hooks/useListKeyboardNav'
import { useMeetingsApi, useActionItems, useMeetingCadence } from '../hooks/useApiData'
import type { MeetingRow, ActionItemRow } from '../hooks/useApiData'
import { useToggleActionItem, useCreateActionItem } from '../hooks/useMutations'
import { useUndoToast } from '../components/UndoToast'
import { directors, getAllMembers, getPersonInfo } from '../data/team'
import { projects as projectOptions } from '../data/projects'
import MeetingCard from '../components/MeetingCard'
import QuickAddForm from '../components/QuickAddForm'
import Avatar from '../components/Avatar'
import { getMeetingFacilitator } from '../lib/facilitator'
import PageTooltip from '../components/PageTooltip'
import type { Meeting, ActionItem } from '../data/types'

type FilterMode = 'all' | 'decisions' | 'actions'

const ALL_TEAM_MEMBERS = [
  ...directors.map((d) => ({ slug: d.slug, name: d.name, initials: d.initials, photoUrl: d.photoUrl })),
  ...getAllMembers().map((m) => ({ slug: m.slug ?? m.name, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
]

// Deduplicate by slug
const TEAM_OPTIONS = ALL_TEAM_MEMBERS.filter(
  (m, i, arr) => arr.findIndex((x) => x.slug === m.slug) === i
)

// ── Transform D1 rows → frontend Meeting type ──────────────

function parseJsonArray(val: string | null): string[] {
  if (!val) return []
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function meetingRowToMeeting(row: MeetingRow, actionItems: ActionItemRow[]): Meeting {
  const meetingActions = actionItems.filter((ai) => ai.meeting_id === row.id)
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    type: row.type as Meeting['type'],
    attendees: parseJsonArray(row.attendees),
    agenda: parseJsonArray(row.agenda),
    decisions: parseJsonArray(row.decisions),
    notes: row.notes || undefined,
    actionItems: meetingActions.map((ai) => ({
      id: ai.id,
      description: ai.description,
      assignee: ai.assignee,
      dueDate: ai.due_date || undefined,
      completed: ai.completed === 1,
      projectSlug: ai.project_id || undefined,
    })),
  }
}

function getNextMeetingDate(meetingsList: Meeting[]): Date {
  const today = new Date()
  // Find the next upcoming meeting
  const upcoming = meetingsList
    .map((m) => new Date(m.date + 'T12:00:00'))
    .filter((d) => d >= today)
    .sort((a, b) => a.getTime() - b.getTime())

  if (upcoming.length > 0) return upcoming[0]

  // Extrapolate from the most recent meeting + 14 days
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
}

export default function Meetings() {
  usePageMeta(
    'Meeting Hub | MN-CCORE',
    'MNCCORE biweekly meetings, decisions, and action items archive.'
  )

  const headerRef = useScrollReveal<HTMLDivElement>()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // D1 API data
  const { data: meetingRows = [] } = useMeetingsApi()
  const { data: actionItemRows = [] } = useActionItems()
  const { data: cadence } = useMeetingCadence()
  const toggleMutation = useToggleActionItem()
  const { showUndo } = useUndoToast()
  const createActionMutation = useCreateActionItem()

  const toggleWithUndo = (id: string) => {
    toggleMutation.mutate(id)
    showUndo('Action item toggled', () => toggleMutation.mutate(id))
  }

  // Transform D1 rows → Meeting objects
  const meetings = useMemo(
    () => meetingRows.map((row) => meetingRowToMeeting(row, actionItemRows)),
    [meetingRows, actionItemRows]
  )

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
  // Deduplicate: if a "[Carried forward]" version exists, prefer it over the original
  const allActionItems = useMemo(() => {
    const items: ActionItemWithContext[] = []
    for (const mtg of meetings) {
      if (mtg.actionItems) {
        for (const ai of mtg.actionItems) {
          items.push({
            ...ai,
            meetingDate: mtg.date,
            meetingTitle: mtg.title,
            meetingId: mtg.id,
          })
        }
      }
    }
    // Deduplicate by normalized description + assignee
    const seen = new Map<string, ActionItemWithContext>()
    for (const item of items) {
      const normalized = item.description.replace(/^\[Carried forward\]\s*/i, '').toLowerCase()
      const key = `${normalized}::${item.assignee}`
      const existing = seen.get(key)
      if (!existing || item.meetingDate > existing.meetingDate) {
        seen.set(key, item)
      }
    }
    return [...seen.values()]
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

  useListKeyboardNav({
    itemCount: filteredMeetings.length,
    focusedIndex,
    setFocusedIndex,
  })

  const FILTER_OPTIONS: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All Meetings' },
    { key: 'decisions', label: 'Decisions Only' },
    { key: 'actions', label: 'Action Items' },
  ]

  // Handlers
  function handleToggleAction(_meetingId: string, actionId: string) {
    toggleWithUndo(actionId)
  }

  function handleAddActionItem() {
    if (!newActionDesc.trim()) return

    // Find the most recent meeting to attach the action item to
    const sortedMeetings = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    const targetMeetingId = sortedMeetings[0]?.id

    createActionMutation.mutate({
      meeting_id: targetMeetingId,
      description: newActionDesc.trim(),
      assignee: newActionAssignee,
      ...(newActionDueDate ? { due_date: newActionDueDate } : {}),
      ...(newActionProject ? { project_id: newActionProject } : {}),
    })

    // Reset form
    setNewActionDesc('')
    setNewActionAssignee('nick')
    setNewActionDueDate('')
    setNewActionProject('')
    setShowAddAction(false)
  }

  function handleAddMeeting() {
    if (!newMeetingDate || !newMeetingTitle.trim()) return

    // POST to D1 API
    fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: newMeetingDate,
        title: newMeetingTitle.trim(),
        type: 'biweekly',
        attendees: newMeetingAttendees,
        agenda: newMeetingAgenda.filter((a) => a.trim()),
      }),
    }).then(() => {
      // Refetch meetings
      window.location.reload()
    })

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
    fontSize: '13px',
    outline: 'none',
    borderRadius: '8px',
    padding: '6px 10px',
    width: '100%',
  }

  const labelStyle: React.CSSProperties = {
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
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.1)', flexShrink: 0 }}>
              <Users size={19} style={{ color: 'var(--teal)' }} />
            </div>
            <h1
              style={{
                fontWeight: 800,
                fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              Meeting Hub
            </h1>
          </div>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--slate)',
              opacity: 0.7,
              marginTop: '6px',
              maxWidth: '520px',
            }}
          >
            {meetings.length} meetings tracked — decisions, action items, and notes
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
                className="text-sm font-medium"
                style={{ color: 'var(--ink)', margin: 0 }}
              >
                Next Meeting
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--slate)', opacity: 0.7 }}
              >
                {nextMeeting.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              {(() => {
                const dateStr = nextMeeting.toISOString().slice(0, 10)
                const fSlug = getMeetingFacilitator(dateStr)
                const fInfo = fSlug ? getPersonInfo(fSlug) : null
                return fInfo ? (
                  <p className="flex items-center gap-1.5 text-xs mt-1" style={{ color: 'var(--teal)', margin: '4px 0 0 0' }}>
                    <UserCheck size={12} />
                    Facilitated by {fInfo.name}
                  </p>
                ) : null
              })()}
            </div>
            <div className="ml-auto text-right">
              <div className="flex items-center gap-1.5">
                <Clock size={14} style={{ color: 'var(--gold)' }} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--ink)' }}
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
          <PageTooltip id="meetings-prep-hint" text="Click a meeting for prep and actions" />
        </div>

        {/* Meeting Cadence */}
        {cadence && cadence.recommendation !== 'no_upcoming' && (
          <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.12)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Activity size={14} style={{ color: 'var(--gold)' }} />
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gold)' }}>
                Meeting Cadence
              </span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>
              {cadence.emoji} {cadence.recommendation}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {cadence.reasons.map((r, i) => (
                <span key={i} style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.7 }}>
                  {'\u2022'} {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Items Summary */}
        <div className="mb-8">
          <h2
            className="text-lg font-medium mb-3"
            style={{ color: 'var(--ink)' }}
          >
            Action Items
          </h2>

          {/* Pending */}
          {pendingActions.length > 0 && (
            <div className="mb-4">
              <h3
                className="text-xs font-normal uppercase tracking-wider mb-2"
                style={{ color: 'var(--gold)', letterSpacing: '0.06em' }}
              >
                Pending ({pendingActions.length})
              </h3>
              <div className="space-y-2">
                {pendingActions.map((item) => {
                  const info = getPersonInfo(item.assignee)
                  return (
                    <div
                      key={item.id || item.description}
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
                        onClick={() => item.id && toggleWithUndo(item.id)}
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
                        <p className="text-sm leading-snug" style={{ color: 'var(--ink)' }}>
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
                            <span className="text-xs" style={{ color: 'var(--slate)' }}>
                              {info.name}
                            </span>
                          </div>
                          {item.dueDate && (
                            <span
                              className="text-xs"
                              style={{ color: 'var(--slate)', opacity: 0.6 }}
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

          {/* If no pending actions but some completed exist — show "no pending" with add form */}
          {pendingActions.length === 0 && allActionItems.length > 0 && (
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
                className="text-xs font-normal uppercase tracking-wider mb-2"
                style={{ color: 'var(--teal)', letterSpacing: '0.06em' }}
              >
                Completed ({completedActions.length})
              </h3>
              <div className="space-y-1.5">
                {completedActions.map((item) => {
                  const info = getPersonInfo(item.assignee)
                  return (
                    <div
                      key={item.id || item.description}
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
                        onClick={() => item.id && toggleWithUndo(item.id)}
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
                            <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                              {info.name}
                            </span>
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: 'var(--slate)', opacity: 0.55 }}
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
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-lg font-medium"
              style={{ color: 'var(--ink)' }}
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
                          style={{ color: 'var(--slate)', opacity: 0.5, width: '18px' }}
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
                              opacity: 0.55,
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
                    minHeight: '44px',
                    background: filter === f.key ? 'var(--gold)' : 'var(--ice)',
                    color: filter === f.key ? '#0f1923' : 'var(--slate)',
                    border: 'none',
                    transitionProperty: 'background-color, color',
                    transitionDuration: '150ms',
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
                style={{ color: 'var(--slate)', opacity: 0.55 }}
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
          <motion.div
            className="table-container space-y-3"
            style={{ padding: '16px 20px' }}
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {filteredMeetings.length > 0 ? (
              filteredMeetings.map((meeting) => (
                <motion.div key={meeting.id} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}>
                  <MeetingCard
                    meeting={meeting}
                    onToggleAction={handleToggleAction}
                  />
                </motion.div>
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm" style={{ color: 'var(--slate)', opacity: 0.5 }}>
                  {searchQuery ? 'No meetings match your search.' : 'No meetings found.'}
                </p>
              </div>
            )}
          </motion.div>

          {/* Stats footer */}
          <div className="mt-4 text-center">
            <span
              className="text-xs"
              style={{ color: 'var(--slate)', opacity: 0.55 }}
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
