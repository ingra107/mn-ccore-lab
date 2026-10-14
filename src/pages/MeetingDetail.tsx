import { useState, useRef, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import PageWithRail from '../components/PageWithRail'
import RoundPrompt from '../components/RoundPrompt'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar,
  ListChecks,
  MessageSquarePlus,
  FileText,
  Lightbulb,
  Users,
  Plus,
  ExternalLink,
  GripVertical,
  UserCheck,
  Copy,
  Check,
  Sparkles,
  Pencil} from 'lucide-react'
import { DndContext, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { InputSafePointerSensor, InputSafeTouchSensor } from '../lib/dndSensors'
import { isEditableTarget } from '../lib/editableTarget'
import { usePageMeta } from '../hooks/usePageMeta'
import { useMeetingDetail, useProjects, useTeam } from '../hooks/useApiData'
import { buildAttendeeLookup, resolveAttendeeList } from '../../shared/attendees'
import type { AgendaItemRow, MeetingDetail as MeetingDetailData } from '../hooks/useApiData'
import { useQueryClient } from '@tanstack/react-query'
import { useAddAgendaItem, useUpdateMeetingNotes, useCreateDecision, useCreateTask, useUpdateMeetingMeta } from '../hooks/useMutations'
import { useMarkSeen } from '../hooks/useEntitySeen'
import FileUpload from '../components/FileUpload'
import TypingIndicator from '../components/TypingIndicator'
import MarkdownView from '../components/MarkdownView'
import { emDashifyTitle } from '../lib/textUtils'
import { parseQuickAddInput } from '../lib/parseQuickAdd'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useUndoToast } from '../components/UndoToast'
import { FaceDisc } from '../components/today/skin'
import WatchButton from '../components/WatchButton'
import PresenceAvatars from '../components/PresenceAvatars'
import { usePresence, useTyping, useIntentBroadcast, type Intent } from '../hooks/usePresence'
import HoverCard from '../components/HoverCard'
import type { HoverCardData } from '../components/HoverCard'
import { useHoverCard } from '../hooks/useHoverCard'
import { getPersonInfo, getMemberBySlug, directors, getAllMembers } from '../data/team'
import { formatLongDate } from '../lib/dateUtils'
import { PATHS } from '../constants/paths'
import SmartCompose from '../components/SmartCompose'
import HeartbeatLine from '../components/HeartbeatLine'
import EntityNotFound from '../components/EntityNotFound'
import { ICON_PROPS } from '../lib/iconProps'
import { isTaskDone } from '../lib/taskGrouping'
import { MeetingActionList } from '../components/meetings/MeetingActionList'
import { prepareActionItems } from '../lib/meetingActionItems'
import MeetingActivityFeed from '../components/meetings/MeetingActivityFeed'
import MeetingProjectsSection from '../components/meetings/MeetingProjectsSection'
import { isLabSeriesTitle } from '../../shared/meetingAudience'
import { AttendeeBadge } from '../components/meetings/Attendees'
import { meetingStatus } from '../lib/meetingStatus'
import SectionHead from '../components/ui/SectionHead'
import PageHeartbeat from '../components/moments/PageHeartbeat'
import { Button } from '../components/ui/Button'

function buildMemberHoverData(slug: string): HoverCardData {
  const p = getPersonInfo(slug)
  const dir = directors.find(d => d.slug === slug)
  const member = getMemberBySlug(slug)
  return {
    type: 'member',
    name: p.name,
    role: dir?.role || member?.role,
    photoUrl: p.photoUrl,
    initials: p.initials,
  }
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
}

// Section headings: Today's treatment (15px / 600 / --sk-t1, TodayPage's h2).
// The status chip is a neutral word (color jobs, Nick 2026-10-11): upcoming,
// in progress and completed are facts about the meeting, not asks of him.
const STATUS_CHIP = { bg: 'var(--hover-subtle)', text: 'var(--sk-t2)' }

const AGENDA_TYPE_ICONS: Record<string, typeof Lightbulb> = {
  discussion: MessageSquarePlus,
  decision: Lightbulb,
  update: FileText,
  document: ExternalLink,
}

const MEETING_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'ad-hoc', label: 'Ad-hoc' },
  { value: 'journal-club', label: 'Journal Club' },
  { value: 'one-on-one', label: 'One-on-one' },
]

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: meeting, isLoading } = useMeetingDetail(id || '')
  const { isAuthenticated } = useAuth()
  const { showSuccess, showError } = useToast()
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [copiedNotes, setCopiedNotes] = useState(false)
  const [generatingAgenda, setGeneratingAgenda] = useState(false)
  const [agendaCopied, setAgendaCopied] = useState(false)
  // Hooks must be called unconditionally (before any conditional returns)
  const addAgenda = useAddAgendaItem(meeting?.id || '')
  const updateNotes = useUpdateMeetingNotes(meeting?.id || '')
  // T6: single mutation for all metadata edits (title/type/attendees/tags).
  const updateMeta = useUpdateMeetingMeta(meeting?.id || '')
  const { data: allProjects = [] } = useProjects()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editingTitle) titleInputRef.current?.focus({ preventScroll: true }) }, [editingTitle])
  const viewerSlugs = usePresence('meeting', meeting?.id)
  const [meetingHasCompose, setMeetingHasCompose] = useState(false)
  const meetingSelfIntent: Intent = meetingHasCompose ? 'commenting' : 'viewing'
  const meetingPeerIntents = useIntentBroadcast('meeting', meeting?.id, meetingSelfIntent)
  const createDecision = useCreateDecision()
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(meeting?.notes || '')
  const [showDecisionForm, setShowDecisionForm] = useState(false)
  const [decisionTitle, setDecisionTitle] = useState('')
  const [decisionRationale, setDecisionRationale] = useState('')
  const decisionTitleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (showDecisionForm) decisionTitleRef.current?.focus({ preventScroll: true })
  }, [showDecisionForm])

  // Viewing this page counts as "seen" for the Meetings new-notes badge/pill.
  const markSeen = useMarkSeen()
  useEffect(() => {
    if (meeting?.id) markSeen('meeting', meeting.id)
  }, [meeting?.id, markSeen])

  // S9: agenda drag order — same local-order pattern as before. Without this
  // the agenda drag computed arrayMove + POSTed but never wrote the new order,
  // so the item visually snapped back until a refetch.
  const [agendaOrder, setAgendaOrder] = useState<string[]>([])
  // The list both this page and the meeting's Today card show: deduped, open
  // first, then by due date (lib/meetingActionItems).
  const actionItems = useMemo(() => prepareActionItems(meeting?.action_items), [meeting?.action_items])
  const completedCount = useMemo(() => actionItems.filter((a) => isTaskDone(a)).length, [actionItems])

  // "n" still focuses the add-item compose box — independent of the removed
  // drag/focus-index nav, kept as its own small effect.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(document.activeElement)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n') {
        e.preventDefault()
        const add = document.querySelector<HTMLInputElement>('[data-testid="meeting-action-add"]')
        add?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // #514: input-safe variants (same class as #481); both SortableAgendaItem
  // and SortableActionItem scope listeners to a dedicated grip-handle
  // button (not the row/card), so this is preventive hardening rather than
  // a fix for a reachable bug today.
  const sensors = useSensors(
    useSensor(InputSafePointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(InputSafeTouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  usePageMeta(
    meeting ? `${meeting.title} | MN-CCORE` : 'Meeting | MN-CCORE',
    'MNCCORE meeting details, agenda, action items, and decisions.',
    'article',
  )

  if (isLoading) {
    return (
      <div className="content-container" style={{ paddingTop: '4rem', display: 'flex', justifyContent: 'center', opacity: 0.85 }}>
        <HeartbeatLine variant="slow" color="var(--sk-t3)" strokeWidth={1.5} width="100%" height={48} />
      </div>
    )
  }

  if (!meeting) {
    return (
      <EntityNotFound
        entityLabel="Meeting"
        reference={id}
        artVariant="meetings"
        backTo={{ to: PATHS.meetings, label: 'Back to Meetings' }}
      />
    )
  }

  const attendees = parseJsonArray(meeting.attendees)
  const autoAgenda = parseJsonArray(meeting.agenda)
  const decisions = parseJsonArray(meeting.decisions)
  const status = meetingStatus(meeting)
  const rawTeamAgendaItems = meeting.agenda_items || []
  // S9: apply the local drag order so a reordered agenda stays put (mirrors
  // orderedPendingActions). Items with no recorded order sink to the bottom in
  // their original relative order.
  const teamAgendaItems = (() => {
    if (agendaOrder.length === 0) return rawTeamAgendaItems
    const orderMap = new Map(agendaOrder.map((id, i) => [id, i]))
    return [...rawTeamAgendaItems].sort((a, b) => {
      const ai = orderMap.get(a.id)
      const bi = orderMap.get(b.id)
      if (ai === undefined && bi === undefined) return 0
      if (ai === undefined) return 1
      if (bi === undefined) return -1
      return ai - bi
    })
  })()

  async function handleAgendaDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = teamAgendaItems.findIndex(i => i.id === active.id)
    const newIndex = teamAgendaItems.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(teamAgendaItems, oldIndex, newIndex)

    // S9: write the new order to local state FIRST (optimistic) so the item
    // stays where dropped, then persist. Mirrors handleActionDragEnd.
    setAgendaOrder(reordered.map(i => i.id))

    // Persist to API
    fetch(`/api/meetings/${meeting!.id}/agenda/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(i => i.id) }),
    })
  }

  async function handleGenerateAgenda() {
    if (!meeting || generatingAgenda) return
    setGeneratingAgenda(true)
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/generate-agenda`)
      if (!res.ok) throw new Error('Failed to generate agenda')
      const data = await res.json() as {
        title: string
        sections: Array<{ title: string; items: Array<{ label?: string; assignee?: string; due_date?: string }> }>
      }
      const lines: string[] = [`# ${data.title}`, '']
      for (const section of data.sections) {
        if (section.items.length === 0) continue
        lines.push(`## ${section.title}`)
        for (const item of section.items) {
          const label = item.label || '(untitled)'
          const meta = [item.assignee ? `@${item.assignee}` : '', item.due_date || ''].filter(Boolean).join(' · ')
          lines.push(`- ${label}${meta ? `  (${meta})` : ''}`)
        }
        lines.push('')
      }
      await navigator.clipboard.writeText(lines.join('\n'))
      setAgendaCopied(true)
      showSuccess('Agenda copied to clipboard')
      setTimeout(() => setAgendaCopied(false), 2500)
    } catch {
      showError('Could not generate agenda')
    } finally {
      setGeneratingAgenda(false)
    }
  }

  function handleTitleSave() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (meeting && trimmed && trimmed !== meeting.title.trim()) {
      updateMeta.mutate({ title: trimmed })
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Back link */}
        <Breadcrumb backTo="/meetings" backLabel="Meetings" current={meeting?.title} />

        <PageWithRail
          testId="meeting-grid"
          railLabel="Meeting details"
          railTestId="meeting-rail"
          head={
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleTitleSave() }
                  if (e.key === 'Escape') { setTitleDraft(meeting.title); setEditingTitle(false) }
                }}
                ref={titleInputRef}
                aria-label="Edit meeting title"
                style={{
                  fontWeight: 600, fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)', color: 'var(--ink)',
                  background: 'none', border: 'none', borderBottom: '2px solid var(--job-accent)', outline: 'none',
                  padding: '2px 0', width: '100%', fontFamily: 'inherit', lineHeight: 1.15,
                }}
              />
            ) : (
              // The title opens its editor on a click (mouse convenience); the
              // pencil is the real control: a button keyboard and screen-reader
              // users reach, shown on hover and always on touch (.reveal-on-hover).
              <div className="reveal-host" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1
                  onClick={() => { setTitleDraft(meeting.title); setEditingTitle(true) }}
                  title="Click to edit title"
                  style={{ fontWeight: 600, fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)', color: 'var(--ink)', lineHeight: 1.15, margin: 0, cursor: 'pointer' }}
                >
                  {emDashifyTitle(meeting.title)}
                </h1>
                <Button size="icon"
                  type="button"
                  className="reveal-on-hover hit-area"
                  aria-label="Edit meeting title"
                  title="Edit title"
                  onClick={() => { setTitleDraft(meeting.title); setEditingTitle(true) }}
                  style={{ '--reveal-opacity': 0.85, background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex', color: 'var(--slate)', flexShrink: 0 } as React.CSSProperties}
                >
                  <Pencil {...ICON_PROPS} size={14} aria-hidden="true" />
                </Button>
              </div>
            )}
            {/* The heartbeat line under the title (color-back pick 10). */}
            <PageHeartbeat />
            {/* Stacked (a phone), the rail's date and attendees fall below the
                discussion; this line keeps them at the top. Hidden when the
                rail sits beside the work. */}
            <div className="pwr-stack-only" data-testid="meeting-meta-compact" style={{ marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 'var(--value-size)', color: 'var(--ink)' }}>{formatLongDate(meeting.date)}</p>
              {attendees.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6 }} aria-label={`${attendees.length} attendees`}>
                  {attendees.slice(0, 6).map((slug) => {
                    const p = getPersonInfo(slug)
                    return (
                      <span key={slug} title={p.name} style={{ width: 22, height: 22, display: 'inline-block' }}>
                        <FaceDisc label={p.name} initials={p.initials} photo={p.photoUrl} px={22} />
                      </span>
                    )
                  })}
                  <span style={{ fontSize: 'var(--label-size)', color: 'var(--sk-t3)' }}>
                    {attendees.length} attendee{attendees.length === 1 ? '' : 's'}
                  </span>
                </div>
              )}
            </div>
            </motion.div>
          }
          /* Status, type, share, watch and the three buttons: top of the rail, level with the title. */
          railTop={
            <div data-testid="meeting-controls">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs"
                  style={{ fontSize: 'var(--label-size)', background: STATUS_CHIP.bg, color: STATUS_CHIP.text }}>
                  <Calendar {...ICON_PROPS} size={12} /> {status}
                </span>
                <select
                  aria-label="Meeting type"
                  value={meeting.type}
                  onChange={(e) => updateMeta.mutate({ type: e.target.value })}
                  style={{
                    fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)',
                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                  }}
                >
                  {MEETING_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <LabToggle meeting={meeting} updateMeta={updateMeta} />
                <WatchButton id={meeting.id} type="meeting" label={meeting.title} />
                {viewerSlugs.length > 0 && <PresenceAvatars slugs={viewerSlugs} peerIntents={meetingPeerIntents} />}
                <Link
                  to={PATHS.meetingPrep(meeting.id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs transition-colors"
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)', textDecoration: 'none',
                    border: '1px solid var(--sk-line2)',
                    opacity: 0.85,
                  }}
                >
                  <ListChecks {...ICON_PROPS} size={11} /> Prep view
                </Link>
                <button
                  onClick={() => {
                    if (!meeting) return
                    const lines = [
                      `# ${meeting.title}`,
                      `Date: ${meeting.date}`,
                      '',
                    ]
                    const decisions = parseJsonArray(meeting.decisions)
                    if (decisions.length > 0) {
                      lines.push('## Decisions')
                      decisions.forEach(d => lines.push(`- ${d}`))
                      lines.push('')
                    }
                    const actions = (meeting.action_items || []).filter((a) => !a.completed)
                    if (actions.length > 0) {
                      lines.push('## Open Action Items')
                      actions.forEach((a) => lines.push(`- [ ] ${a.title || a.description} (@${a.assignee})`))
                      lines.push('')
                    }
                    if (meeting.notes) {
                      lines.push('## Notes')
                      lines.push(meeting.notes)
                    }
                    navigator.clipboard.writeText(lines.join('\n')).then(() => {
                      setCopiedSummary(true)
                      setTimeout(() => setCopiedSummary(false), 2000)
                    })
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs transition-colors"
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    border: '1px solid var(--sk-line2)',
                    background: 'none',
                    cursor: 'pointer',
                    opacity: copiedSummary ? 1 : 0.85,
                  }}
                >
                  {copiedSummary ? <Check {...ICON_PROPS} size={11} /> : <Copy {...ICON_PROPS} size={11} />}
                  {copiedSummary ? 'Copied!' : 'Copy summary'}
                </button>
                <button
                  onClick={handleGenerateAgenda}
                  disabled={generatingAgenda}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs transition-colors"
                  style={{
                    fontSize: 'var(--label-size)',
                    // The page's one primary action: the teal accent (color jobs, 2026-10-11).
                    color: 'var(--sk-card)',
                    border: '1px solid transparent',
                    background: 'var(--job-accent)',
                    fontWeight: 600,
                    cursor: generatingAgenda ? 'wait' : 'pointer',
                    opacity: generatingAgenda ? 0.85 : 1,
                  }}
                >
                  {agendaCopied ? <Check {...ICON_PROPS} size={11} /> : <Sparkles {...ICON_PROPS} size={11} />}
                  {agendaCopied ? 'Copied!' : generatingAgenda ? 'Generating…' : 'Generate agenda'}
                </button>
              </div>
            </div>
          }
          rail={
            <div className="md-rail">
            <div data-testid="meeting-when">
              <h3 style={{ margin: 0, fontSize: '12px', color: 'var(--sk-t3)', fontWeight: 500 }}>When</h3>
              <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: '2px 0 0' }}>{formatLongDate(meeting.date)}</p>
            </div>
                {/* Facilitator badge — the RECORDED facilitator only. Blank when the
                    meeting doesn't carry one (#102). */}
                {(() => {
                  const facilitatorInfo = meeting.facilitator ? getPersonInfo(meeting.facilitator) : null
                  return facilitatorInfo ? (
                    <div className="flex items-center gap-2">
                      <UserCheck {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t3)' }} />
                      <span style={{ fontSize: 'var(--label-size)', color: 'var(--sk-t3)' }}>
                        Facilitator:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 20, height: 20 }}>
                          <FaceDisc label={facilitatorInfo.name} initials={facilitatorInfo.initials} photo={facilitatorInfo.photoUrl} px={20} />
                        </div>
                        <span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)' }}>
                          {facilitatorInfo.name}
                        </span>
                      </div>
                    </div>
                  ) : null
                })()}
              {/* Attendees — clickable toggle, for the owner or Nick only (an
                  attendee can read the meeting; the server checks it again) */}
              <AttendanceSection attendees={attendees} updateMeta={updateMeta} canEdit={meeting.can_manage_access === true} />
            {/* Projects (schema-v122): the projects this meeting DISCUSSED (tags,
                set by the PB push; else the action items' projects) as faded
                pills, the projects it is GRANTED to at full contrast. The owner
                or Nick clicks a pill to give or take that project's access. It
                sits here, beside the action items Nick reviews. */}
            <MeetingProjectsSection
              meeting={meeting}
              derivedTags={[...new Set(actionItems.filter((a) => a.project_id).map((a) => a.project_id!))]}
              allProjects={allProjects.filter((p): p is typeof p & { id: string } => !!p.id)}
              updateMeta={updateMeta}
            />
            {/* T-50 Files section — files attached to this meeting. */}
            {meeting.id && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.22 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '12px', color: 'var(--sk-t3)', fontWeight: 500 }}>Files</h3>
                <div style={{ borderRadius: 'var(--radius-xl)', padding: '20px' }} className="detail-card">
                  <FileUpload entityType="meeting" entityId={meeting.id} />
                </div>
              </motion.div>
            )}
            </div>
          }
        >
          {/* Action items lead the main column */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
            <SectionHead title="Action items" count={<>{completedCount}/{actionItems.length}</>} />

            <div style={{ borderRadius: 'var(--radius-xl)', padding: '16px 20px' }} className="detail-card">
              {/* Inline add action item */}
              <AddActionItemForm
                meetingId={meeting.id}
                isAuthenticated={isAuthenticated}
                onContentChange={setMeetingHasCompose}
                onSuccess={() => showSuccess('Action item added')}
              />

              {/* Rows, selection bar and full editor: the same component the
                  meeting's Today card renders. */}
              <MeetingActionList meetingId={meeting.id} items={actionItems} />

              {actionItems.length === 0 && (
                <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textAlign: 'center', padding: 'var(--sp-lg) 0', margin: 0 }}>
                  No action items yet — type above to add one
                </p>
              )}
            </div>
          </motion.div>

        {/* Notes */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.25 }} className="mt-8">
          <SectionHead
            as="h3"
           
            title="Meeting notes"
            right={<>
              {/* #96 — one-click copy of the notes body so Nick can paste them
                  straight to the team. Copies the raw markdown source (what
                  pastes cleanly into mail/Slack), not the rendered DOM. Sits in
                  the section header rather than the hover layer: "copy quick"
                  means always visible. Edit sits beside it in the same slot
                  (rules-ui-design 14): pinned over the notes it covered their
                  first line on a phone, where it can never hide. */}
              {!editingNotes && meeting?.notes && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(meeting.notes || '').then(() => {
                      setCopiedNotes(true)
                      setTimeout(() => setCopiedNotes(false), 2000)
                    }).catch(() => showError('Could not copy notes'))
                  }}
                  data-tip={copiedNotes ? 'Copied' : 'Copy notes as text'}
                  aria-label="Copy meeting notes"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs transition-colors"
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    border: '1px solid var(--sk-line2)',
                    background: 'none',
                    cursor: 'pointer',
                    opacity: copiedNotes ? 1 : 0.85,
                  }}
                >
                  {copiedNotes ? <Check {...ICON_PROPS} size={11} /> : <Copy {...ICON_PROPS} size={11} />}
                  {copiedNotes ? 'Copied!' : 'Copy'}
                </button>
              )}
              {!editingNotes && meeting?.notes && (
                <button
                  type="button"
                  onClick={() => { setNotesDraft(meeting?.notes || ''); setEditingNotes(true) }}
                  aria-label="Edit meeting notes"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs transition-colors hit-area"
                  style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', border: '1px solid var(--sk-line2)', background: 'none', cursor: 'pointer', opacity: 0.85 }}
                >
                  <Pencil {...ICON_PROPS} size={11} />
                  Edit
                </button>
              )}
            </>}
          />
          <div style={{ borderRadius: 'var(--radius-xl)', padding: '20px' }} className="detail-card">
            {editingNotes ? (
              <div onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setNotesDraft(meeting?.notes || '')
                  setEditingNotes(false)
                }
              }}>
                {/* SmartCompose (D14) — replaces bare textarea. @-mention,
                    emoji, R2 paperclip via uploadContext={type:'meeting'},
                    Cmd+Enter triggers Save Notes via onSubmit. */}
                <SmartCompose
                  value={notesDraft}
                  onChange={setNotesDraft}
                  onSubmit={async (content) => {
                    await new Promise<void>((resolve) => {
                      updateNotes.mutate(content, { onSuccess: () => resolve(), onError: () => resolve() })
                    })
                    setEditingNotes(false)
                  }}
                  submitting={updateNotes.isPending}
                  uploadContext={meeting ? { type: 'meeting', id: meeting.id } : undefined}
                  placeholder="Meeting notes…"
                  rows={12}
                  alwaysShowToolbar
                  autoFocus
                  submitLabel="Save Notes"
                  submittingLabel="Saving…"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => { setNotesDraft(meeting?.notes || ''); setEditingNotes(false) }}
                    style={{ background: 'none', border: '1px solid var(--sk-line2)', borderRadius: 'var(--radius-md)', padding: '6px 16px', fontSize: 'var(--value-size)', cursor: 'pointer', color: 'var(--slate)' }}
                  >
                    Cancel
                  </button>
                  <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                    Ctrl+Enter to save · Esc to cancel
                  </span>
                </div>
              </div>
            ) : (
              <div className="tk">
                {meeting?.notes ? (
                  <MarkdownView source={meeting.notes} className="tk-msum" />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setNotesDraft(''); setEditingNotes(true) }}
                    style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontStyle: 'italic', margin: 0, padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    No notes yet. Click to add.
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>

          {/* Agenda */}
          <motion.div className="mt-8" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <SectionHead title="Agenda" />

            {/* Opening Round icebreaker prompt */}
            <RoundPrompt meetingId={meeting.id} />

            <div style={{ borderRadius: 'var(--radius-xl)', padding: '16px 20px', marginTop: '1rem' }} className="detail-card">
              {/* Auto-generated agenda items */}
              {autoAgenda.length > 0 && (
                <div className="mb-4">
                  <p style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginBottom: '8px' }}>
                    Prepared agenda
                  </p>
                  <ol style={{ margin: 0, paddingLeft: '20px' }}>
                    {autoAgenda.map((item, i) => (
                      <li key={i} style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.6, marginBottom: '4px' }}>
                        {item}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Team-added agenda items (drag-to-reorder) */}
              {teamAgendaItems.length > 0 && (
                <div className="mb-4">
                  <p style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginBottom: '8px' }}>
                    Team-added items
                  </p>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleAgendaDragEnd}>
                    <SortableContext items={teamAgendaItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                      {teamAgendaItems.map((item) => (
                        <SortableAgendaItem key={item.id} item={item} AGENDA_TYPE_ICONS={AGENDA_TYPE_ICONS} />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {/* Add agenda item form */}
              <AddAgendaForm isAuthenticated={isAuthenticated} onAdd={(input) => addAgenda.mutate(input, { onSuccess: () => showSuccess('Added to agenda') })} />
            </div>
          </motion.div>

        {/* Decisions */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.2 }} className="mt-8">
          <SectionHead
           
            title="Decisions"
            right={<>
              {isAuthenticated && (
                <button
                  onClick={() => setShowDecisionForm(!showDecisionForm)}
                  style={{
                    background: 'none', border: '1px solid var(--sk-line2)',
                    borderRadius: 'var(--radius-md)', padding: '4px 10px', cursor: 'pointer',
                    fontSize: 'var(--label-size)', color: 'var(--slate)',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <Plus {...ICON_PROPS} size={12} /> Log decision
                </button>
              )}
            </>}
          />
          <div style={{ borderRadius: 'var(--radius-xl)', padding: '16px 20px' }} className="detail-card">
            {/* Inline decision form */}
            <AnimatePresence>
              {showDecisionForm && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!decisionTitle.trim()) return
                    createDecision.mutate({
                      title: decisionTitle.trim(),
                      rationale: decisionRationale.trim() || undefined,
                      context: `From meeting: ${meeting?.title} (${meeting?.date})`,
                      meeting_id: meeting?.id,
                    }, {
                      onSuccess: () => {
                        showSuccess('Decision logged')
                        setDecisionTitle('')
                        setDecisionRationale('')
                        setShowDecisionForm(false)
                      },
                    })
                  }}
                  style={{ marginBottom: decisions.length > 0 ? '12px' : 0, paddingBottom: decisions.length > 0 ? '12px' : 0, borderBottom: decisions.length > 0 ? '1px solid var(--sk-line)' : 'none' }}
                >
                  <input
                    type="text"
                    value={decisionTitle}
                    onChange={(e) => setDecisionTitle(e.target.value)}
                    placeholder="What was decided?"
                    ref={decisionTitleRef}
                    style={{
                      width: '100%', fontSize: 'var(--value-size)', color: 'var(--ink)',
                      background: 'var(--cream)', border: '1px solid var(--field-edge)', borderRadius: 'var(--radius-lg)',
                      padding: 'var(--sp-sm) var(--sp-md)', outline: 'none', marginBottom: '6px', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--job-accent)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--field-edge)')}
                  />
                  <input
                    type="text"
                    value={decisionRationale}
                    onChange={(e) => setDecisionRationale(e.target.value)}
                    placeholder="Why? (optional rationale)"
                    style={{
                      width: '100%', fontSize: '12px', color: 'var(--ink)',
                      background: 'var(--cream)', border: '1px solid var(--field-edge)', borderRadius: 'var(--radius-lg)',
                      padding: '6px 12px', outline: 'none', marginBottom: '8px', boxSizing: 'border-box',
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      style={{ background: 'var(--job-accent)', color: 'var(--sk-card)', border: 'none', borderRadius: 'var(--radius-md)', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDecisionForm(false); setDecisionTitle(''); setDecisionRationale('') }}
                      style={{ background: 'none', border: '1px solid var(--sk-line2)', borderRadius: 'var(--radius-md)', padding: '5px 14px', fontSize: '12px', cursor: 'pointer', color: 'var(--slate)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {decisions.length > 0 && (
              <div className="tk">
                <ul className="tk-decs tk-flat">
                  {decisions.map((d, i) => (
                    <li key={i} className="tk-dec"><span className="tk-dia" aria-hidden="true">&#8226;</span><span>{d}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {decisions.length === 0 && !showDecisionForm && (
              <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textAlign: 'center', padding: 'var(--sp-lg) 0', margin: 0 }}>
                No decisions logged yet. Record one during the meeting so nobody forgets.
              </p>
            )}
          </div>
        </motion.div>

        {/* Discussion (#124) — the meeting's own conversation. Last section on
            purpose: you read what happened, then you ask about it. */}
        {meeting?.id && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.3 }} className="mt-8">
            <SectionHead as="h3" title="Discussion" />
            {/* A flat panel: each comment is its own material card, so the
                wrapper stays plain (no box-in-box, color back pick 1). */}
            <div>
              <MeetingActivityFeed meetingId={meeting.id} />
            </div>
          </motion.div>
        )}
        </PageWithRail>
      </div>

      <style>{`
        .md-rail { display: flex; flex-direction: column; gap: 20px; }
        .md-rail .mt-4 { margin-top: 0; }
        .action-item-row:active, .action-item-row:hover { background: var(--hover-subtle); }
        .attendee-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .attendee-scroll::-webkit-scrollbar { display: none; }
        @media (max-width: 640px) {
          .attendee-scroll { -webkit-overflow-scrolling: touch; }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function SortableAgendaItem({ item, AGENDA_TYPE_ICONS }: { item: AgendaItemRow; AGENDA_TYPE_ICONS: Record<string, typeof MessageSquarePlus> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 'var(--z-sticky)' : ('auto' as const),
  }
  const Icon = AGENDA_TYPE_ICONS[item.type] || MessageSquarePlus

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 py-2" {...attributes}>
      <Button size="icon" {...listeners} aria-label="Reorder item" className="cursor-grab active:cursor-grabbing mt-1 flex-shrink-0" style={{ background: 'none', border: 'none', padding: '2px', color: 'var(--slate)', opacity: 0.75 }}>
        <GripVertical {...ICON_PROPS} size={14} />
      </Button>
      <Icon {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t3)', marginTop: '2px', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0 }}>{item.content}</p>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          Added by {item.added_by}
          {item.document_url && (
            <> · <a href={item.document_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--slate)', textDecoration: 'underline' }}>View document</a></>
          )}
        </span>
      </div>
    </div>
  )
}

function AttendeeChip({ slug }: { slug: string }) {
  const p = getPersonInfo(slug)
  const { triggerRef, isVisible, position, cardRef, cardHandlers, handlers } = useHoverCard()
  const memberData = buildMemberHoverData(slug)

  return (
    <div
      key={slug}
      ref={triggerRef as React.RefObject<HTMLDivElement>}
      className="flex items-center gap-1.5 flex-shrink-0"
      title={p.name}
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
    >
      <span className="tk inline-flex items-center gap-1.5" style={{ fontSize: '12.5px', color: 'var(--sk-t1)', whiteSpace: 'nowrap' }}>
        <AttendeeBadge value={slug} />
      </span>
      <HoverCard
        data={memberData}
        isVisible={isVisible}
        position={position}
        cardRef={cardRef}
        cardHandlers={cardHandlers}
      />
    </div>
  )
}

// ── Add Action Item (NLP quick-add) ─────────────────────────

const PRIORITY_LABELS: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium' }
const PRIORITY_COLORS: Record<number, string> = { 1: 'var(--job-stale)', 2: 'var(--sk-t2)', 3: 'var(--sk-t3)' }

function AddActionItemForm({ meetingId, isAuthenticated, onSuccess, onContentChange }: { meetingId: string; isAuthenticated: boolean; onSuccess: () => void; onContentChange?: (hasContent: boolean) => void }) {
  const [text, setText] = useState('')
  const { typingPeers: meetingTypingPeers, broadcastTyping: broadcastMeetingTyping } = useTyping('meeting', meetingId)
  const createTask = useCreateTask()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const fallbackAssignee = user?.email ? user.slug : 'nick-ingraham'

  const parsed = text.trim() ? parseQuickAddInput(text) : null
  const hasContent = parsed && parsed.title.trim().length > 0

  // SmartCompose now owns the textarea, paperclip (R2 → meeting context),
  // @-mention dropdown, emoji palette, paste-image, Cmd+Enter.
  // We retain `text` state at this level so:
  //   1) parseQuickAddInput runs on every keystroke for live token preview
  //   2) presence broadcast fires from onChange
  //   3) submission still goes through createTask + onSuccess

  const handleSubmit = async (raw: string) => {
    const p = parseQuickAddInput(raw)
    if (!p?.title.trim()) return
    return new Promise<void>((resolve) => {
      createTask.mutate({
        title: p.title,
        description: p.title,
        assignee: p.assigneeSlug ?? fallbackAssignee,
        meeting_id: meetingId,
        due_date: p.dueDate ?? undefined,
        priority: p.priority === 1 ? 'urgent' : p.priority === 2 ? 'high' : p.priority === 3 ? 'medium' : 'medium',
      }, {
        onSuccess: () => {
          setText('')
          broadcastMeetingTyping(false)
          onContentChange?.(false)
          queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
          onSuccess()
          resolve()
        },
        onError: () => resolve(),
      })
    })
  }

  return (
    <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--sk-line)' }}>
      <div className="flex items-start gap-2">
        <Plus {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t3)', opacity: 0.85, flexShrink: 0, marginTop: 10 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {!isAuthenticated && import.meta.env.PROD ? (
            <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75, display: 'inline-block', padding: '8px 0' }}>
              <a href="/api/auth/login" style={{ color: 'var(--job-accent)', fontWeight: 'var(--weight-ui)' as React.CSSProperties['fontWeight'], textDecoration: 'underline' }}>Sign in</a> to add action items
            </span>
          ) : (
            <SmartCompose
              value={text}
              onChange={(next) => {
                setText(next)
                const has = next.trim().length > 0
                broadcastMeetingTyping(has)
                onContentChange?.(has)
              }}
              onSubmit={handleSubmit}
              submitting={createTask.isPending}
              uploadContext={{ type: 'meeting', id: meetingId }}
              placeholder="@nick Review draft p2 Friday"
              rows={1}
              alwaysShowToolbar={hasContent ?? false}
              submitLabel="Add"
            />
          )}
        </div>
      </div>

      <TypingIndicator slugs={meetingTypingPeers} style={{ margin: '4px 0 0 22px' }} />

      {/* Token preview chips */}
      {parsed && (parsed.assigneeName || parsed.priority || parsed.dueDate || parsed.projectTitle) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex flex-wrap items-center gap-1.5 mt-1.5 ml-6"
        >
          {parsed.assigneeName && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--hover-subtle)', color: 'var(--slate)' }}>
              @{parsed.assigneeName}
            </span>
          )}
          {parsed.priority && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--sk-line)', color: PRIORITY_COLORS[parsed.priority] }}>
              P{parsed.priority} {PRIORITY_LABELS[parsed.priority]}
            </span>
          )}
          {parsed.dueDate && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--sk-line)', color: 'var(--sk-t2)' }}>
              Due {parsed.dueDate}
            </span>
          )}
          {parsed.projectTitle && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--sk-line)', color: 'var(--sk-t2)' }}>
              #{parsed.projectTitle}
            </span>
          )}
        </motion.div>
      )}

      {/* Hint text */}
      {!text && (
        <div className="flex items-center gap-3 mt-1.5 ml-6" style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
          <span>@name</span>
          <span>#project</span>
          <span>p1-p3</span>
          <span>Apr 15</span>
        </div>
      )}
    </div>
  )
}

function AddAgendaForm({ isAuthenticated, onAdd }: { isAuthenticated: boolean; onAdd: (input: { content: string; document_url?: string }) => void }) {
  const [text, setText] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [showDocInput, setShowDocInput] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd({ content: text.trim(), document_url: docUrl.trim() || undefined })
    setText('')
    setDocUrl('')
    setShowDocInput(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2 items-end">
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isAuthenticated ? 'Add an agenda item...' : 'Sign in to add items'}
            disabled={!isAuthenticated && import.meta.env.PROD}
            style={{
              width: '100%', fontSize: 'var(--value-size)', color: 'var(--ink)',
              background: 'var(--cream)', border: '1px solid var(--field-edge)', borderRadius: 'var(--radius-lg)',
              padding: 'var(--sp-sm) var(--sp-md)', outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--job-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--field-edge)')}
          />
        </div>
        {!isAuthenticated && import.meta.env.PROD && !text.trim() && (
          <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
            <a href="/api/auth/login" style={{ color: 'var(--job-accent)', fontWeight: 'var(--weight-ui)' as React.CSSProperties['fontWeight'], textDecoration: 'underline' }}>Sign in</a> to add items
          </span>
        )}
        {text.trim() && (
          <>
            <Button as={motion.button} size="icon" aria-label="Attach document link" type="button" onClick={() => setShowDocInput(!showDocInput)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
              style={{ background: 'transparent', border: '1px solid var(--sk-line2)', color: 'var(--slate)' }}
              title="Attach document link">
              <FileText {...ICON_PROPS} size={14} />
            </Button>
            <Button as={motion.button} size="icon" aria-label="Add" type="submit" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
              style={{ background: 'var(--job-accent)', color: 'var(--sk-card)', border: 'none' }}>
              <Plus {...ICON_PROPS} size={14} />
            </Button>
          </>
        )}
      </div>
      <AnimatePresence>
        {showDocInput && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <input
              type="url" value={docUrl} onChange={(e) => setDocUrl(e.target.value)}
              placeholder="Document URL (Google Doc, PDF, etc.)"
              style={{
                width: '100%', fontSize: '12px', color: 'var(--ink)',
                background: 'var(--cream)', border: '1px solid var(--field-edge)', borderRadius: 'var(--radius-lg)',
                padding: '6px 10px', outline: 'none', marginTop: '6px',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}

// ── Attendance Section ───────────────────────────────────
function AttendanceSection({ attendees, updateMeta, canEdit }: { attendees: string[]; updateMeta: ReturnType<typeof useUpdateMeetingMeta>; canEdit: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [localAttendees, setLocalAttendees] = useState<string[]>(attendees)
  const { showError } = useUndoToast()

  const allPeople = [...directors, ...getAllMembers()].filter(p => p.slug)
  const uniquePeople = allPeople.filter((p, i) => allPeople.findIndex(x => x.slug === p.slug) === i)

  // #551: a stored value may be a team email (the PB push, rows written before
  // the receiver normalized) where the picker compares team slugs. Resolve with
  // the same rule the Worker's writers use (shared/attendees.ts): an EXACT
  // team_members.email match is the member's slug, everything else stays as
  // stored. Never by email prefix: `nate@stanford.edu` is not Nate Mesfin.
  const { data: team = [] } = useTeam()
  const lookup = buildAttendeeLookup([
    ...uniquePeople.map(p => ({ slug: p.slug })),
    ...team.map(m => ({ slug: m.slug, email: m.email })),
  ])
  const resolvedAttendees = resolveAttendeeList(localAttendees, lookup)

  const toggleAttendee = (slug: string) => {
    const prevList = localAttendees
    // Toggling writes the RESOLVED list, so a team email is replaced by the
    // slug it stood for and externals are kept.
    const newList = resolvedAttendees.includes(slug)
      ? resolvedAttendees.filter(s => s !== slug)
      : [...resolvedAttendees, slug]
    setLocalAttendees(newList)
    updateMeta.mutate({ attendees: newList }, {
      onError: () => {
        setLocalAttendees(prevList)
        showError('Attendance not saved. Your change was undone; try again.')
      },
    })
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Users {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: 'var(--sk-t3)', fontWeight: 500 }}>
          Attendees
        </span>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
          {resolvedAttendees.length}
        </span>
        {canEdit && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--label-size)', color: 'var(--slate)', padding: 0 }}
          >
            {expanded ? 'Done' : '+ Edit'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 pb-1">
        {resolvedAttendees.map(slug => <AttendeeChip key={slug} slug={slug} />)}
        {resolvedAttendees.length === 0 && !expanded && (
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No attendees logged</span>
        )}
      </div>
      {canEdit && expanded && (
        <div className="grid grid-cols-2 gap-1.5 mt-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--ice)' }}>
          {uniquePeople.map(person => {
            const slug = person.slug!
            const p = getPersonInfo(slug)
            const present = resolvedAttendees.includes(slug)
            return (
              <button
                key={slug}
                onClick={() => toggleAttendee(slug)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition-colors"
                style={{
                  background: present ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'none',
                  border: `1px solid ${present ? 'var(--job-accent)' : 'var(--sk-line2)'}`,
                  color: present ? 'var(--job-accent)' : 'var(--slate)',
                  cursor: 'pointer',
                  opacity: present ? 1 : 0.85,
                }}
              >
                <FaceDisc label={p.name} initials={p.initials} photo={p.photoUrl} px={18} />
                {p.name.split(' ')[0]}
                {present && <UserCheck {...ICON_PROPS} size={10} style={{ marginLeft: 'auto' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Lab meeting toggle (schema-v122) ─────────────────────
// A lab meeting is visible to every member. The three lab series are set by
// title when the meeting is created; the owner or Nick can flip any meeting
// (the server checks again). Everyone else sees a quiet "Lab meeting" label.
function LabToggle({ meeting, updateMeta }: { meeting: MeetingDetailData; updateMeta: ReturnType<typeof useUpdateMeetingMeta> }) {
  const isLab = meeting.audience === 'lab'
  const canFlip = meeting.can_manage_access === true
  if (!canFlip && !isLab) return null
  const auto = isLabSeriesTitle(meeting.title)
  const label = <>Lab meeting{auto && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · auto: lab series</span>}</>
  const style: React.CSSProperties = {
    fontSize: 'var(--label-size)', padding: '1px 8px', borderRadius: '999px', fontFamily: 'inherit',
    background: isLab ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'none',
    color: isLab ? 'var(--job-accent)' : 'var(--slate)',
    border: `1px solid ${isLab ? 'transparent' : 'var(--sk-line2)'}`,
  }
  // Teal marks a SELECTED toggle only (the color-jobs rule). Someone who cannot
  // flip it sees a plain label, so it gets no accent.
  if (!canFlip) return <span title="Every member can see this meeting" style={{ ...style, background: 'none', color: 'var(--slate)', border: '1px solid var(--sk-line2)' }}>{label}</span>
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLab}
      disabled={updateMeta.isPending}
      onClick={() => updateMeta.mutate({ audience: isLab ? 'private' : 'lab' })}
      title={isLab ? 'Every member can see this meeting. Click to make it private.' : 'Only you, its attendees and granted projects see this. Click to share it with the lab.'}
      style={{ ...style, cursor: 'pointer' }}
    >
      {label}
    </button>
  )
}
