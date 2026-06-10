import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Calendar, CheckCircle2, Circle, Search, Clock, Plus, Users, UserCheck, ListChecks, ArrowRight, ChevronLeft, Scale } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useListKeyboardNav } from '../hooks/useListKeyboardNav'
import { useMeetingsApi, useActionItems, useMeetingCadence } from '../hooks/useApiData'
import type { MeetingRow, ActionItemRow } from '../hooks/useApiData'
import { useToggleActionItem, useCreateActionItem, useCreateDecision } from '../hooks/useMutations'
import { useUndoToast } from '../components/UndoToast'
import { useToast } from '../hooks/useToast'
import { directors, getAllMembers, getPersonInfo } from '../data/team'
import { projects as projectOptions } from '../data/projects'
import QuickAddForm from '../components/QuickAddForm'
import Avatar from '../components/Avatar'
import PageHeader from '../components/PageHeader'
import InlineSelect from '../components/InlineSelect'
import InlineAssigneePicker from '../components/InlineAssigneePicker'
import { getMeetingFacilitator } from '../lib/facilitator'
import { parseCarriedForward, emDashifyTitle } from '../lib/textUtils'
import { formatFullDate, formatShortDate, localDateKey } from '../lib/dateUtils'
import PageTooltip, { dismissPageTooltip } from '../components/PageTooltip'
import type { Meeting, ActionItem } from '../data/types'
import { PATHS } from '../constants/paths'

type FilterMode = 'all' | 'decisions' | 'actions'

const ALL_TEAM_MEMBERS = [
  ...directors.map((d) => ({ slug: d.slug, name: d.name, initials: d.initials, photoUrl: d.photoUrl })),
  ...getAllMembers().map((m) => ({ slug: m.slug ?? m.name, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
]

const TEAM_OPTIONS = ALL_TEAM_MEMBERS.filter(
  (m, i, arr) => arr.findIndex((x) => x.slug === m.slug) === i
)

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
  const upcoming = meetingsList
    .map((m) => new Date(m.date + 'T12:00:00'))
    .filter((d) => d >= today)
    .sort((a, b) => a.getTime() - b.getTime())
  if (upcoming.length > 0) return upcoming[0]
  const sortedDates = meetingsList
    .map((m) => new Date(m.date + 'T12:00:00'))
    .sort((a, b) => b.getTime() - a.getTime())
  if (sortedDates.length > 0) {
    const next = new Date(sortedDates[0])
    next.setDate(next.getDate() + 14)
    while (next < today) next.setDate(next.getDate() + 14)
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

interface ActionItemWithContext extends ActionItem {
  meetingDate: string
  meetingTitle: string
  meetingId: string
  carryCount?: number
}

// ── Meeting Detail Panel ────────────────────────────────────

interface MeetingDetailProps {
  meeting: Meeting
  onToggleAction: (meetingId: string, actionId: string) => void
}

function MeetingDetail({ meeting, onToggleAction }: MeetingDetailProps) {
  const pendingActions = meeting.actionItems?.filter((a) => !a.completed).length ?? 0
  const totalActions = meeting.actionItems?.length ?? 0
  const fSlug = getMeetingFacilitator(meeting.date)
  const fInfo = fSlug ? getPersonInfo(fSlug) : null

  // M-26: Log Decision inline form
  const [showDecisionForm, setShowDecisionForm] = useState(false)
  const [decisionTitle, setDecisionTitle] = useState('')
  const [decisionRationale, setDecisionRationale] = useState('')
  const createDecision = useCreateDecision()
  const { showSuccess } = useToast()

  function handleLogDecision(e: React.FormEvent) {
    e.preventDefault()
    if (!decisionTitle.trim()) return
    createDecision.mutate({
      title: decisionTitle.trim(),
      rationale: decisionRationale.trim() || undefined,
      context: `From meeting: ${meeting.title} (${meeting.date})`,
      meeting_id: meeting.id,
    }, {
      onSuccess: () => {
        showSuccess('Decision logged')
        setDecisionTitle('')
        setDecisionRationale('')
        setShowDecisionForm(false)
      },
    })
  }

  // M-07: Show carried-forward items with cleaned descriptions
  const actionItemsWithCarried = useMemo(() => {
    if (!meeting.actionItems) return []
    return meeting.actionItems.map((item) => {
      const { isCarried, clean } = parseCarriedForward(item.description)
      return { ...item, isCarried, cleanDescription: clean }
    })
  }, [meeting.actionItems])

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-start gap-4">
          <div
            className="shrink-0 flex flex-col items-center justify-center rounded-xl"
            style={{ width: '60px', height: '60px', background: 'var(--gold-light)', border: '1px solid rgba(201,168,76,0.3)' }}
          >
            <span style={{ fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>
              {new Date(meeting.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
            </span>
            <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
              {new Date(meeting.date + 'T12:00:00').getDate()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-medium leading-snug" style={{ color: 'var(--ink)', margin: 0 }}>
              {emDashifyTitle(meeting.title)}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)', opacity: 0.85 }}>
              {formatFullDate(meeting.date)}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                <Users size={12} />
                {meeting.attendees?.length ?? 0} attendees
              </span>
              {totalActions > 0 && (
                <span className="flex items-center gap-1 text-xs" style={{ color: pendingActions > 0 ? 'var(--gold)' : 'var(--teal)' }}>
                  <ListChecks size={12} />
                  {pendingActions > 0 ? `${pendingActions} pending` : `${totalActions} done`}
                </span>
              )}
              {fInfo && (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--teal)' }}>
                  <UserCheck size={12} />
                  Facilitated by {fInfo.name}
                </span>
              )}
            </div>
          </div>
          <div className="hidden sm:flex items-center -space-x-2 shrink-0">
            {meeting.attendees?.slice(0, 5).map((slug) => {
              const info = getPersonInfo(slug)
              return (
                <div key={slug} style={{ width: 28, height: 28 }}>
                  <Avatar name={info.name} initials={info.initials} photoUrl={info.photoUrl} variant="ice" size="base-sm" />
                </div>
              )
            })}
            {(meeting.attendees?.length ?? 0) > 5 && (
              <span className="text-xs pl-2" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                +{(meeting.attendees?.length ?? 0) - 5}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: '1.5rem' }} />

      {meeting.attendees && meeting.attendees.length > 0 && (
        <div className="mb-6">
          <h4 className="mtg-section-label mb-2">Attendees</h4>
          <div className="flex flex-wrap items-center gap-2">
            {meeting.attendees.map((slug) => {
              const info = getPersonInfo(slug)
              return (
                <div key={slug} className="flex items-center gap-1.5">
                  <div style={{ width: 24, height: 24 }}>
                    <Avatar name={info.name} initials={info.initials} photoUrl={info.photoUrl} variant="ice" size="tight" />
                  </div>
                  <span className="text-xs" style={{ color: 'var(--ink)' }}>{info.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {meeting.agenda && meeting.agenda.length > 0 && (
        <div className="mb-6">
          <h4 className="mtg-section-label mb-2">Agenda</h4>
          <ol className="list-decimal list-inside space-y-1">
            {meeting.agenda.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{item}</li>
            ))}
          </ol>
        </div>
      )}

      {meeting.decisions && meeting.decisions.length > 0 && (
        <div className="mb-6">
          <h4 className="mtg-section-label mtg-section-label--gold mb-2">Decisions</h4>
          <div className="space-y-2">
            {meeting.decisions.map((decision, i) => (
              <div key={i} className="flex gap-2 px-3 py-2 rounded-md text-sm"
                style={{ background: 'var(--gold-active)', border: '1px solid rgba(201,168,76,0.2)', color: 'var(--ink)' }}>
                <span style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px' }}>&#9670;</span>
                {decision}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* M-07: action items with carried-forward badges */}
      {actionItemsWithCarried.length > 0 && (
        <div className="mb-6">
          <h4 className="mtg-section-label mb-2">Action Items</h4>
          <div className="space-y-2">
            {actionItemsWithCarried.map((item, i) => {
              const info = getPersonInfo(item.assignee)
              return (
                <div key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                  <button
                    type="button"
                    className="cursor-pointer shrink-0 mt-0.5 action-toggle-btn"
                    style={{ background: 'none', border: 'none', padding: 'var(--sp-md)', margin: '-10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', transition: 'transform 0.15s ease', minWidth: '44px', minHeight: '44px' }}
                    onClick={() => { if (item.id) onToggleAction(meeting.id, item.id) }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    title={item.completed ? 'Mark as pending' : 'Mark as completed'}
                  >
                    {item.completed
                      ? <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
                      : <Circle size={16} style={{ color: 'var(--gold)' }} />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <span style={{ textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.85 : 1 }}>
                      {item.isCarried && <span className="carried-badge">&#x21bb; carried</span>}
                      {item.cleanDescription}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <div style={{ width: 16, height: 16 }}>
                          <Avatar name={info.name} initials={info.initials} photoUrl={info.photoUrl} variant="ice" size="2xs" />
                        </div>
                        <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.85 }}>{info.name}</span>
                      </div>
                      {item.dueDate && (
                        <span className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
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

      {meeting.notes && (
        <div className="mb-6">
          <h4 className="mtg-section-label mb-2">Notes</h4>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--slate)' }}>{meeting.notes}</p>
        </div>
      )}

      {/* M-26: Log Decision section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="mtg-section-label mtg-section-label--gold" style={{ margin: 0 }}>Log Decision</h4>
          <button
            type="button"
            onClick={() => setShowDecisionForm(!showDecisionForm)}
            style={{
              background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
              padding: '2px 8px', cursor: 'pointer', fontSize: '10px', color: 'var(--gold)',
              display: 'inline-flex', alignItems: 'center', gap: '3px',
            }}
          >
            <Scale size={10} /> {showDecisionForm ? 'Cancel' : 'Add'}
          </button>
        </div>
        <AnimatePresence>
          {showDecisionForm && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
              onSubmit={handleLogDecision}
              style={{ marginBottom: '8px' }}
            >
              <input
                type="text"
                value={decisionTitle}
                onChange={(e) => setDecisionTitle(e.target.value)}
                placeholder="What was decided?"
                autoFocus
                style={{
                  width: '100%', fontSize: 'var(--value-size)', color: 'var(--ink)',
                  background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 'var(--radius-lg)',
                  padding: 'var(--sp-sm) var(--sp-md)', outline: 'none', marginBottom: '6px', boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)')}
              />
              <input
                type="text"
                value={decisionRationale}
                onChange={(e) => setDecisionRationale(e.target.value)}
                placeholder="Why? (optional rationale)"
                style={{
                  width: '100%', fontSize: '12px', color: 'var(--ink)',
                  background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 'var(--radius-lg)',
                  padding: '6px 12px', outline: 'none', marginBottom: '8px', boxSizing: 'border-box',
                }}
              />
              <div className="flex gap-2">
                {/* Theme-agnostic dark-gold fill + white text = 7.5:1
                    AA both modes. --gold light (#6b5420) failed with
                    dark text (2.46:1). r7 2026-04-22. */}
                <button type="submit"
                  style={{ background: 'var(--stage-fill-analysis)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Save
                </button>
                <button type="button" onClick={() => { setShowDecisionForm(false); setDecisionTitle(''); setDecisionRationale('') }}
                  style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '5px 14px', fontSize: '12px', cursor: 'pointer', color: 'var(--slate)' }}>
                  Cancel
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <Link
        to={PATHS.meeting(meeting.id)}
        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-md text-xs font-medium"
        // Theme-agnostic dark-gold fill + white text = 7.5:1 AA both
        // modes. --gold light failed with dark text (2.46:1). r7 2026-04-22.
        style={{ fontSize: 'var(--label-size)', background: 'var(--stage-fill-analysis)', color: '#fff', textDecoration: 'none', transition: 'opacity 0.2s' }}
      >
        View Full Meeting <ArrowRight size={11} />
      </Link>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────

export default function Meetings() {
  usePageMeta('Meeting Hub | MN-CCORE', 'MNCCORE biweekly meetings, decisions, and action items archive.')

  const headerRef = useScrollReveal<HTMLDivElement>()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  // M-34: mobile view — false = show list, true = show detail
  const [mobileShowDetail, setMobileShowDetail] = useState(false)

  const { data: meetingRows = [], isLoading: meetingsLoading } = useMeetingsApi()
  const { data: actionItemRows = [] } = useActionItems()
  const { data: cadence } = useMeetingCadence()
  const toggleMutation = useToggleActionItem()
  const { showUndo } = useUndoToast()
  const createActionMutation = useCreateActionItem()

  const toggleWithUndo = (id: string) => {
    toggleMutation.mutate(id)
    showUndo('Action item toggled', () => toggleMutation.mutate(id))
  }

  const meetings = useMemo(
    () => meetingRows.map((row) => meetingRowToMeeting(row, actionItemRows)),
    [meetingRows, actionItemRows]
  )

  const [showAddAction, setShowAddAction] = useState(false)
  const [newActionDesc, setNewActionDesc] = useState('')
  const [newActionAssignee, setNewActionAssignee] = useState('nick-ingraham')
  const [newActionDueDate, setNewActionDueDate] = useState('')
  const [newActionProject, setNewActionProject] = useState('')

  const [showAddMeeting, setShowAddMeeting] = useState(false)
  const [newMeetingDate, setNewMeetingDate] = useState('')
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [newMeetingAttendees, setNewMeetingAttendees] = useState<string[]>(['nick-ingraham', 'nate-mesfin'])
  const [newMeetingAgenda, setNewMeetingAgenda] = useState<string[]>([''])

  const nextMeeting = useMemo(() => getNextMeetingDate(meetings), [meetings])
  const daysUntil = getDaysUntil(nextMeeting)
  const nextMeetingDateStr = localDateKey(nextMeeting)

  const allActionItems = useMemo(() => {
    const items: ActionItemWithContext[] = []
    for (const mtg of meetings) {
      if (mtg.actionItems) {
        for (const ai of mtg.actionItems) {
          items.push({ ...ai, meetingDate: mtg.date, meetingTitle: mtg.title, meetingId: mtg.id })
        }
      }
    }
    // M-07: dedup carried-forward items — keep most recent, attach carryCount for badge
    const counts = new Map<string, number>()
    for (const item of items) {
      const normalized = item.description.replace(/^\[Carried forward\]\s*/i, '').toLowerCase()
      const key = `${normalized}::${item.assignee}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const seen = new Map<string, ActionItemWithContext>()
    for (const item of items) {
      const normalized = item.description.replace(/^\[Carried forward\]\s*/i, '').toLowerCase()
      const key = `${normalized}::${item.assignee}`
      const existing = seen.get(key)
      if (!existing || item.meetingDate > existing.meetingDate) {
        seen.set(key, { ...item, carryCount: (counts.get(key) ?? 1) > 1 ? counts.get(key) : undefined })
      }
    }
    return [...seen.values()]
  }, [meetings])

  const pendingActions = allActionItems.filter((a) => !a.completed)
  const completedActions = allActionItems.filter((a) => a.completed)

  const filteredMeetings = useMemo(() => {
    let result = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    if (filter === 'decisions') result = result.filter((m) => m.decisions && m.decisions.length > 0)
    else if (filter === 'actions') result = result.filter((m) => m.actionItems && m.actionItems.length > 0)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((m) => {
        const searchable = [
          m.title, m.notes ?? '',
          ...(m.agenda ?? []),
          ...(m.decisions ?? []),
          ...(m.actionItems?.map((a: ActionItem) => a.description) ?? []),
        ].join(' ').toLowerCase()
        return searchable.includes(q)
      })
    }
    return result
  }, [filter, searchQuery, meetings])

  const effectiveSelectedId = selectedMeetingId ?? filteredMeetings[0]?.id ?? null
  const selectedMeeting = filteredMeetings.find((m) => m.id === effectiveSelectedId) ?? null

  useListKeyboardNav({ itemCount: filteredMeetings.length, focusedIndex, setFocusedIndex })

  const FILTER_OPTIONS: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'decisions', label: 'Decisions' },
    { key: 'actions', label: 'Actions' },
  ]

  function handleToggleAction(_meetingId: string, actionId: string) {
    toggleWithUndo(actionId)
  }

  function handleAddActionItem() {
    if (!newActionDesc.trim()) return
    const sortedMeetings = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    const targetMeetingId = sortedMeetings[0]?.id
    createActionMutation.mutate({
      meeting_id: targetMeetingId,
      description: newActionDesc.trim(),
      assignee: newActionAssignee,
      ...(newActionDueDate ? { due_date: newActionDueDate } : {}),
      ...(newActionProject ? { project_id: newActionProject } : {}),
    })
    setNewActionDesc('')
    setNewActionAssignee('nick-ingraham')
    setNewActionDueDate('')
    setNewActionProject('')
    setShowAddAction(false)
  }

  function handleAddMeeting() {
    if (!newMeetingDate || !newMeetingTitle.trim()) return
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
    }).then(() => { window.location.reload() })
    setNewMeetingDate('')
    setNewMeetingTitle('')
    setNewMeetingAttendees(['nick-ingraham', 'nate-mesfin'])
    setNewMeetingAgenda([''])
    setShowAddMeeting(false)
  }

  function toggleAttendee(slug: string) {
    setNewMeetingAttendees((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug])
  }

  function addAgendaItem() { setNewMeetingAgenda((prev) => [...prev, '']) }
  function updateAgendaItem(index: number, value: string) {
    setNewMeetingAgenda((prev) => prev.map((item, i) => (i === index ? value : item)))
  }
  function removeAgendaItem(index: number) {
    setNewMeetingAgenda((prev) => prev.filter((_, i) => i !== index))
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--ice)', border: '1px solid rgba(201,168,76,0.15)', color: 'var(--ink)',
    fontSize: 'var(--value-size)', outline: 'none', borderRadius: 'var(--radius-lg)', padding: '6px 10px', width: '100%',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', display: 'block',
  }

  function isNextMeeting(meeting: Meeting): boolean {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const d = new Date(meeting.date + 'T12:00:00')
    d.setHours(0, 0, 0, 0)
    return d >= today && meeting.date === nextMeetingDateStr
  }

  // H-02: subtitle for PageHeader
  const pageSubtitle = [
    allActionItems.length > 0
      ? `${Math.round((completedActions.length / allActionItems.length) * 100)}% complete`
      : null,
    pendingActions.length > 0 ? `${pendingActions.length} pending` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* H-02: PageHeader replaces inline H1 */}
      <div className="content-container" style={{ paddingTop: '1.5rem', paddingBottom: '1rem', flexShrink: 0 }}>
        <div ref={headerRef} className="fade-in-up">
          <PageHeader
            icon={<Users size={18} />}
            title="Meeting Hub"
            subtitle={pageSubtitle || undefined}
            count={meetings.length}
            actions={
              <div className="flex items-center gap-3 flex-wrap">
                {/* Next meeting pill */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'var(--gold-light)', border: '1px solid rgba(201,168,76,0.25)' }}>
                  <Calendar size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                  <div>
                    <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                      {nextMeeting.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs ml-1.5" style={{ color: 'var(--muted)' }}>
                      {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                    </span>
                    {(() => {
                      const fSlug = getMeetingFacilitator(nextMeetingDateStr)
                      const fInfo = fSlug ? getPersonInfo(fSlug) : null
                      return fInfo ? (
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--teal)', marginTop: 2 }}>
                          <UserCheck size={10} />
                          {fInfo.name.split(' ')[0]}
                        </span>
                      ) : null
                    })()}
                  </div>
                  <Clock size={12} style={{ color: 'var(--gold)', marginLeft: 4 }} />
                </div>

                {/* Record Meeting */}
                <QuickAddForm
                  isOpen={showAddMeeting}
                  onToggle={() => setShowAddMeeting(true)}
                  onSubmit={handleAddMeeting}
                  onCancel={() => { setShowAddMeeting(false); setNewMeetingDate(''); setNewMeetingTitle(''); setNewMeetingAttendees(['nick-ingraham', 'nate-mesfin']); setNewMeetingAgenda(['']) }}
                  triggerLabel="Record Meeting"
                  submitLabel="Save Meeting"
                >
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label style={labelStyle}>Date</label>
                        <input type="date" value={newMeetingDate} onChange={(e) => setNewMeetingDate(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Title</label>
                        <input type="text" value={newMeetingTitle} onChange={(e) => setNewMeetingTitle(e.target.value)} placeholder="Meeting title" style={inputStyle}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--gold-emphasis)' }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}><Users size={10} className="inline mr-1" />Attendees</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {TEAM_OPTIONS.slice(0, 10).map((m) => {
                          const selected = newMeetingAttendees.includes(m.slug)
                          return (
                            <button key={m.slug} type="button" onClick={() => toggleAttendee(m.slug)}
                              className="cursor-pointer inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                              style={{ fontSize: 'var(--label-size)', background: selected ? 'rgba(201,168,76,0.2)' : 'var(--ice)', color: selected ? 'var(--ink)' : 'var(--slate)', border: selected ? '1px solid var(--gold)' : '1px solid rgba(201,168,76,0.1)', transition: 'all 0.15s ease' }}>
                              <div style={{ width: 16, height: 16 }}><Avatar name={m.name} initials={m.initials} photoUrl={m.photoUrl} variant="ice" size="2xs" /></div>
                              {m.name.split(' ')[0]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Agenda</label>
                      <div className="space-y-2">
                        {newMeetingAgenda.map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="shrink-0 text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', width: '18px' }}>{i + 1}.</span>
                            <input type="text" value={item} onChange={(e) => updateAgendaItem(i, e.target.value)} placeholder="Agenda item"
                              style={{ ...inputStyle, flex: 1 }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--gold-emphasis)' }} />
                            {newMeetingAgenda.length > 1 && (
                              <button type="button" onClick={() => removeAgendaItem(i)} className="cursor-pointer shrink-0 text-xs"
                                style={{ background: 'none', border: 'none', color: 'var(--slate)', opacity: 'var(--ink-label)', padding: 'var(--sp-xs)' }}>x</button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={addAgendaItem} className="cursor-pointer inline-flex items-center gap-1 text-xs"
                          style={{ background: 'none', border: 'none', color: 'var(--gold)', padding: 'var(--sp-xs) 0' }}>
                          <Plus size={12} />Add agenda item
                        </button>
                      </div>
                    </div>
                  </div>
                </QuickAddForm>
              </div>
            }
          />

          {cadence && cadence.recommendation !== 'no_upcoming' && (() => {
            // P2-R2-15: lead with the most actionable signal; tuck the rest
            // behind a native disclosure so 5-stat callouts don't overwhelm.
            const lead = cadence.reasons[0]
            const rest = cadence.reasons.slice(1)
            return (
              <details className="mt-3 px-3 py-2 rounded-lg group"
                style={{ background: 'var(--gold-hover)', border: '1px solid rgba(201,168,76,0.12)' }}>
                <summary className="flex items-center gap-2 cursor-pointer list-none"
                  style={{ outline: 'none' }}>
                  <Activity size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: 600 }}>
                    {cadence.emoji} {cadence.recommendation}
                  </span>
                  {lead && (
                    <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                      {lead}
                    </span>
                  )}
                  {rest.length > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto' }}>
                      +{rest.length} more
                    </span>
                  )}
                </summary>
                {rest.length > 0 && (
                  <div className="mt-1.5 pl-5" style={{ fontSize: '11px', color: 'var(--slate)', opacity: 'var(--ink-label)', lineHeight: 1.6 }}>
                    {rest.map((r, i) => <div key={i}>· {r}</div>)}
                  </div>
                )}
              </details>
            )
          })()}
        </div>
      </div>

      {/* M-03: 240px list, M-28: minHeight 400px, M-34: mobile-detail class */}
      <div className={`meetings-split-panel${mobileShowDetail ? ' mobile-detail' : ''}`}
        style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 0, height: 'calc(100vh - 130px)', overflow: 'hidden' }}>

        {/* Left panel — M-28: minHeight, M-34: hidden when mobile-detail active */}
        <div className="meetings-list-panel" style={{ overflowY: 'auto', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="flex items-center gap-1.5">
              {FILTER_OPTIONS.map((f) => (
                <motion.button key={f.key} type="button" onClick={() => setFilter(f.key)}
                  className="cursor-pointer inline-flex items-center px-2.5 py-1 rounded-full text-xs"
                  // Active: theme-agnostic dark-gold + white text =
                  // AA both modes. r7 2026-04-22.
                  style={{ background: filter === f.key ? 'var(--stage-fill-analysis)' : 'var(--ice)', color: filter === f.key ? '#fff' : 'var(--slate)', border: 'none', transitionProperty: 'background-color, color', transitionDuration: '150ms', transitionTimingFunction: 'ease' }}
                  whileTap={{ scale: 0.95 }} aria-pressed={filter === f.key}>
                  {f.label}
                </motion.button>
              ))}
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--ice)', border: '1px solid rgba(201,168,76,0.15)', color: 'var(--ink)', outline: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)' }} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 500 }}>
            {meetingsLoading && filteredMeetings.length === 0 ? (
              // CLS fix (C8): skeleton meeting rows reserve list height before data arrives
              Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={`mtg-skel-${i}`}
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    opacity: 0.85,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 46, height: 10, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }} />
                    <div style={{ width: 36, height: 10, background: 'var(--surface-2)', borderRadius: 'var(--radius-full)' }} />
                  </div>
                  <div style={{ width: '85%', height: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }} />
                </div>
              ))
            ) : filteredMeetings.length > 0 ? (
              filteredMeetings.map((meeting, idx) => {
                const isSelected = meeting.id === effectiveSelectedId
                const isNext = isNextMeeting(meeting)
                const actionCount = meeting.actionItems?.length ?? 0
                const pendingCount = meeting.actionItems?.filter((a) => !a.completed).length ?? 0
                return (
                  <button key={meeting.id} type="button" className="cursor-pointer w-full text-left"
                    style={{ display: 'block', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', background: isSelected ? 'rgba(45,138,138,0.08)' : 'transparent', borderLeft: isNext ? '3px solid var(--teal)' : isSelected ? '3px solid rgba(45,138,138,0.4)' : '3px solid transparent', transition: 'background 150ms ease', outline: 'none' }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(201,168,76,0.04)' }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    onClick={() => { setSelectedMeetingId(meeting.id); setFocusedIndex(idx); setMobileShowDetail(true); dismissPageTooltip('meetings-prep-hint') }}>
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontSize: '11px', color: isNext ? 'var(--teal)' : 'var(--slate)', opacity: isNext ? 1 : 0.85, flexShrink: 0, fontWeight: isNext ? 600 : 400, minWidth: '46px' }}>
                        {formatShortDate(meeting.date)}
                      </span>
                      {actionCount > 0 && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: pendingCount > 0 ? 'rgba(201,168,76,0.15)' : 'rgba(45,138,138,0.12)', color: pendingCount > 0 ? 'var(--gold)' : 'var(--teal)', flexShrink: 0, fontWeight: 500 }}>
                          {pendingCount > 0 ? `${pendingCount} actions` : '✓'}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '12px', color: isSelected ? 'var(--ink)' : 'var(--slate)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: isSelected ? 1 : 0.85, fontWeight: isSelected ? 500 : 400 }}>
                      {emDashifyTitle(meeting.title)}
                    </p>
                    {isNext && (
                      <span style={{ fontSize: '10px', color: 'var(--teal)', marginTop: '2px', display: 'block', opacity: 0.8 }}>
                        Next meeting
                      </span>
                    )}
                  </button>
                )
              })
            ) : (
              <div className="py-10 text-center px-4">
                <p className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  {searchQuery ? 'No matches.' : 'No meetings found.'}
                </p>
              </div>
            )}
          </div>

          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <span className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {meetings.length} meetings &middot; {allActionItems.length} actions &middot;{' '}
              {meetings.reduce((acc, m) => acc + (m.decisions?.length ?? 0), 0)} decisions
            </span>
          </div>
        </div>

        {/* Right panel: meeting detail */}
        <div className="meetings-detail-panel" style={{ overflowY: 'auto', padding: 'var(--sp-xl)', minHeight: 'calc(100vh - 240px)', contain: 'layout' }}>
          {/* M-34: mobile back button */}
          <button
            type="button"
            className="meetings-back-btn"
            onClick={() => setMobileShowDetail(false)}
            style={{ display: 'none', alignItems: 'center', gap: '6px', marginBottom: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: '13px', padding: '4px 0' }}
          >
            <ChevronLeft size={16} /> Back to meetings
          </button>
          {selectedMeeting ? (
            <motion.div key={selectedMeeting.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <MeetingDetail meeting={selectedMeeting} onToggleAction={handleToggleAction} />

              <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '1px solid var(--border-subtle)' }}>
                <h3 className="text-base font-medium mb-4" style={{ color: 'var(--ink)' }}>All Pending Actions</h3>

                {pendingActions.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {pendingActions.map((item) => {
                      const info = getPersonInfo(item.assignee)
                      const { isCarried: itemIsCarried, clean: itemClean } = parseCarriedForward(item.description)
                      return (
                        <div key={item.id || item.description} className="flex items-start gap-3 p-3 rounded-lg action-item-card"
                          style={{ background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.15)', boxShadow: 'var(--shadow-card)' }}>
                          <button type="button" className="cursor-pointer shrink-0 mt-0.5 action-toggle-btn"
                            style={{ background: 'none', border: 'none', padding: 'var(--sp-md)', margin: '-10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', transition: 'transform 0.15s ease', minWidth: '44px', minHeight: '44px' }}
                            onClick={() => item.id && toggleWithUndo(item.id)}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                            title="Mark as completed">
                            <Circle size={16} style={{ color: 'var(--gold)' }} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-snug" style={{ color: 'var(--ink)' }}>
                              {itemIsCarried && <span className="carried-badge">&#x21bb; carried</span>}
                              {item.carryCount && item.carryCount > 1 && (
                                <span className="carried-count-badge">&times;{item.carryCount}</span>
                              )}
                              {itemClean}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5">
                              <div className="flex items-center gap-1.5">
                                <div style={{ width: 18, height: 18 }}><Avatar name={info.name} initials={info.initials} photoUrl={info.photoUrl} variant="ice" size="sm-icon" /></div>
                                <span className="text-xs" style={{ color: 'var(--slate)' }}>{info.name}</span>
                              </div>
                              {item.dueDate && <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.75 }}>due {formatShortDate(item.dueDate)}</span>}
                              {item.projectSlug && <span className="inline-block px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--ice)', color: 'var(--slate)', fontSize: '10px' }}>{item.projectSlug}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm mb-4" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No pending action items.</p>
                )}

                <QuickAddForm
                  isOpen={showAddAction}
                  onToggle={() => setShowAddAction(true)}
                  onSubmit={handleAddActionItem}
                  onCancel={() => { setShowAddAction(false); setNewActionDesc(''); setNewActionAssignee('nick-ingraham'); setNewActionDueDate(''); setNewActionProject('') }}
                  triggerLabel="Add Action Item"
                  submitLabel="Add Item"
                >
                  <div className="space-y-3">
                    <div>
                      <label style={labelStyle}>Description</label>
                      <input type="text" value={newActionDesc} onChange={(e) => setNewActionDesc(e.target.value)} placeholder="What needs to be done?" style={inputStyle}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--gold-emphasis)' }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddActionItem() }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label style={labelStyle}>Assignee</label>
                        <InlineAssigneePicker
                          value={newActionAssignee}
                          onChange={setNewActionAssignee}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Due Date (optional)</label>
                        <input type="date" value={newActionDueDate} onChange={(e) => setNewActionDueDate(e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Project (optional)</label>
                      <InlineSelect
                        value={newActionProject}
                        options={[{ value: '', label: 'No project link' }, ...projectOptions.map((p) => ({ value: p.title, label: p.title }))]}
                        onChange={setNewActionProject}
                        size="md"
                        alwaysShowChevron
                      />
                    </div>
                  </div>
                </QuickAddForm>

                {completedActions.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-xs font-normal uppercase tracking-wider mb-2" style={{ color: 'var(--teal)', letterSpacing: '0.06em' }}>
                      Completed ({completedActions.length})
                    </h4>
                    <div className="space-y-1.5">
                      {completedActions.map((item) => {
                        const info = getPersonInfo(item.assignee)
                        const { isCarried: cIsCarried, clean: cClean } = parseCarriedForward(item.description)
                        return (
                          <div key={item.id || item.description} className="flex items-start gap-3 p-2.5 rounded-lg action-item-card" style={{ background: 'var(--cream)', opacity: 0.85 }}>
                            <button type="button" className="cursor-pointer shrink-0 mt-0.5 action-toggle-btn"
                              style={{ background: 'none', border: 'none', padding: 'var(--sp-md)', margin: '-10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', transition: 'transform 0.15s ease', minWidth: '44px', minHeight: '44px' }}
                              onClick={() => item.id && toggleWithUndo(item.id)}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                              title="Mark as pending">
                              <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-snug" style={{ color: 'var(--ink)', textDecoration: 'line-through', opacity: 0.85 }}>
                                {cIsCarried && <span className="carried-badge">&#x21bb; carried</span>}
                                {cClean}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 mt-1">
                                <div className="flex items-center gap-1.5">
                                  <div style={{ width: 16, height: 16 }}><Avatar name={info.name} initials={info.initials} photoUrl={info.photoUrl} variant="ice" size="2xs" /></div>
                                  <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.75 }}>{info.name}</span>
                                </div>
                                <span className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>from {formatShortDate(item.meetingDate)}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              <Calendar size={32} style={{ marginBottom: '1rem', opacity: 0.85 }} />
              <p className="text-sm">Select a meeting to view details</p>
            </div>
          )}
        </div>
      </div>

      <PageTooltip id="meetings-prep-hint" text="Click a meeting for prep and actions" />

      <style>{`
        .dark .action-item-card {
          background-color: var(--cream) !important;
          background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
          border-color: var(--border-subtle) !important;
        }
        .dark .quick-add-form-container {
          background-color: var(--cream) !important;
          background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
        }
        .dark .quick-add-trigger {
          background-color: var(--cream) !important;
          background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
        }
        .dark select, .dark input[type="date"] { color-scheme: dark; }
        .mtg-section-label {
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--slate); opacity: 0.85;
        }
        .mtg-section-label--gold { color: var(--gold) !important; opacity: 1 !important; }
        .carried-count-badge {
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 600; padding: 0px 4px; border-radius: 9999px;
          background: rgba(201,168,76,0.15); color: var(--gold);
          margin-right: 4px; vertical-align: middle;
        }
        /* M-34: Mobile — show only list OR detail, not both stacked */
        @media (max-width: 767px) {
          .meetings-split-panel {
            grid-template-columns: 1fr !important;
            height: calc(100vh - 200px) !important;
            overflow: hidden !important;
          }
          .meetings-list-panel { display: flex !important; }
          .meetings-detail-panel { display: none !important; }
          .meetings-split-panel.mobile-detail .meetings-list-panel { display: none !important; }
          .meetings-split-panel.mobile-detail .meetings-detail-panel { display: block !important; overflow-y: auto; }
          .meetings-back-btn { display: flex !important; }
          .meetings-list-panel { border-right: none !important; }
        }
      `}</style>
    </div>
  )
}
