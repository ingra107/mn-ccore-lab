import { useState, useRef, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import RoundPrompt from '../components/RoundPrompt'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  ListChecks,
  MessageSquarePlus,
  FileText,
  Lightbulb,
  Users,
  Plus,
  ExternalLink,
  GripVertical,
  UserCheck,
  Scale,
  Copy,
  Check,
  X,
  Sparkles,
  Paperclip,
  AtSign,
  Smile,
  Upload as UploadIcon,
} from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePageMeta } from '../hooks/usePageMeta'
import { useMeetingDetail } from '../hooks/useApiData'
import type { ActionItemRow as ActionItemRowType, AgendaItemRow } from '../hooks/useApiData'
import { useQueryClient } from '@tanstack/react-query'
import { useToggleActionItem, useAddAgendaItem, useUpdateMeetingNotes, useCreateDecision, useCreateTask } from '../hooks/useMutations'
import FileUpload from '../components/FileUpload'
import TypingIndicator from '../components/TypingIndicator'
import { appendCharToInput, parseCarriedForward } from '../lib/textUtils'
import { parseQuickAddInput } from '../lib/parseQuickAdd'
import { emailToSlug } from '../lib/emailSlug'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useUndoToast } from '../components/UndoToast'
import Avatar from '../components/Avatar'
import WatchButton from '../components/WatchButton'
import PresenceAvatars from '../components/PresenceAvatars'
import { usePresence, useTyping } from '../hooks/usePresence'
import HoverCard from '../components/HoverCard'
import type { HoverCardData } from '../components/HoverCard'
import { useHoverCard } from '../hooks/useHoverCard'
import { getPersonInfo, getMemberBySlug, directors, getAllMembers } from '../data/team'
import { formatLongDate, formatShortDate } from '../lib/dateUtils'
import { getMeetingFacilitator } from '../lib/facilitator'
import { PATHS } from '../constants/paths'

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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  upcoming: { bg: 'var(--teal-emphasis)', text: 'var(--teal)' },
  'in-progress': { bg: 'var(--gold-emphasis)', text: 'var(--gold)' },
  completed: { bg: 'rgba(34, 197, 94, 0.12)', text: 'var(--green-light)' },
}

const AGENDA_TYPE_ICONS: Record<string, typeof Lightbulb> = {
  discussion: MessageSquarePlus,
  decision: Lightbulb,
  update: FileText,
  document: ExternalLink,
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: meeting, isLoading } = useMeetingDetail(id || '')
  const { isAuthenticated } = useAuth()
  const { showSuccess } = useToast()
  const [copiedSummary, setCopiedSummary] = useState(false)
  const [generatingAgenda, setGeneratingAgenda] = useState(false)
  const [agendaCopied, setAgendaCopied] = useState(false)
  // Hooks must be called unconditionally (before any conditional returns)
  const toggleAction = useToggleActionItem()
  const { showUndo } = useUndoToast()
  const handleToggleAction = (id: string) => {
    toggleAction.mutate(id)
    showUndo('Action item toggled', () => toggleAction.mutate(id))
  }
  const addAgenda = useAddAgendaItem(meeting?.id || '')
  const updateNotes = useUpdateMeetingNotes(meeting?.id || '')
  const viewerSlugs = usePresence('meeting', meeting?.id)
  const createDecision = useCreateDecision()
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(meeting?.notes || '')
  const [showDecisionForm, setShowDecisionForm] = useState(false)
  const [decisionTitle, setDecisionTitle] = useState('')
  const [decisionRationale, setDecisionRationale] = useState('')

  // Multi-select for action items
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set())
  const toggleActionSelect = (id: string) => setSelectedActionIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  // Local action item order — persists in state during session
  // IMPORTANT: must be declared BEFORE conditional early returns to satisfy Rules of Hooks
  const [actionOrder, setActionOrder] = useState<string[]>([])
  // Dedupe Cartesian duplicates from join (mirrors MyItems.tsx:678).
  // Key: normalized title + assignee + due. Newest updated_at wins.
  const dedupedActionItems = useMemo(() => {
    const seen = new Map<string, ActionItemRowType>()
    for (const item of meeting?.action_items || []) {
      const text = (item.description || '').replace(/^\[Carried forward\]\s*/i, '').toLowerCase().trim()
      const key = `${text}::${item.assignee ?? ''}::${item.due_date ?? ''}`
      const existing = seen.get(key)
      const itemTs = (item as any).updated_at ?? item.created_at ?? ''
      const existingTs = existing ? ((existing as any).updated_at ?? existing.created_at ?? '') : ''
      if (!existing || itemTs > existingTs) {
        seen.set(key, item)
      }
    }
    return [...seen.values()]
  }, [meeting?.action_items])
  const pendingActions = useMemo(
    () => dedupedActionItems.filter((a: ActionItemRowType) => !a.completed),
    [dedupedActionItems]
  )
  const completedActions = useMemo(
    () => dedupedActionItems.filter((a: ActionItemRowType) => a.completed),
    [dedupedActionItems]
  )
  const orderedPendingActions = useMemo(() => {
    if (actionOrder.length === 0) return pendingActions
    const orderMap = new Map(actionOrder.map((id, i) => [id, i]))
    return [...pendingActions].sort((a, b) => {
      const ai = orderMap.get(a.id)
      const bi = orderMap.get(b.id)
      if (ai === undefined && bi === undefined) return 0
      if (ai === undefined) return 1
      if (bi === undefined) return -1
      return ai - bi
    })
  }, [pendingActions, actionOrder])

  // Keyboard nav on action items: n focuses add form, j/k move focus, x or
  // Enter toggles focused action. focusedActionIndex + the current actions
  // list are read from refs so the window listener is not rebuilt on every
  // focus move (would re-attach ~N times per keystroke).
  const [focusedActionIndex, setFocusedActionIndex] = useState(-1)
  const focusedActionIndexRef = useRef(focusedActionIndex)
  const orderedPendingActionsRef = useRef(orderedPendingActions)
  focusedActionIndexRef.current = focusedActionIndex
  orderedPendingActionsRef.current = orderedPendingActions
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const isTyping = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (isTyping) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const list = orderedPendingActionsRef.current
      const total = list.length
      if (e.key === 'n') {
        e.preventDefault()
        const add = document.querySelector<HTMLInputElement>('[data-testid="meeting-action-add"]')
        add?.focus()
      } else if (e.key === 'j') {
        e.preventDefault()
        setFocusedActionIndex((i) => (total === 0 ? -1 : Math.min(total - 1, i + 1)))
      } else if (e.key === 'k') {
        e.preventDefault()
        setFocusedActionIndex((i) => (total === 0 ? -1 : Math.max(0, i - 1)))
      } else if (e.key === 'x' || e.key === 'Enter') {
        const idx = focusedActionIndexRef.current
        if (idx >= 0 && idx < total) {
          e.preventDefault()
          handleToggleAction(list[idx].id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleBatchComplete = () => {
    for (const id of selectedActionIds) {
      toggleAction.mutate(id)
    }
    showUndo(`Completed ${selectedActionIds.size} action item(s)`, () => {
      for (const id of selectedActionIds) {
        toggleAction.mutate(id)
      }
    })
    setSelectedActionIds(new Set())
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  usePageMeta(
    meeting ? `${meeting.title} | MN-CCORE` : 'Meeting | MN-CCORE',
    'MNCCORE meeting details, agenda, action items, and decisions.',
    {
      ogType: 'article',
      ogImage: meeting?.id ? `https://mn-ccore-lab.pages.dev/og/meeting/${meeting.id}` : undefined,
    },
  )

  if (isLoading) {
    return (
      <div className="content-container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto"
          style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="content-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <Link to={PATHS.meetings} className="inline-flex items-center gap-2 mb-6"
          style={{ fontSize: '14px', color: 'var(--slate)', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Meetings
        </Link>
        <h1 style={{ fontWeight: 600, fontSize: '1.75rem', color: 'var(--ink)' }}>
          Meeting not found
        </h1>
      </div>
    )
  }

  const attendees = parseJsonArray(meeting.attendees)
  const autoAgenda = parseJsonArray(meeting.agenda)
  const decisions = parseJsonArray(meeting.decisions)
  const statusStyle = STATUS_COLORS[meeting.status] || STATUS_COLORS.completed
  const actionItems = dedupedActionItems
  const teamAgendaItems = meeting.agenda_items || []

  async function handleAgendaDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = teamAgendaItems.findIndex(i => i.id === active.id)
    const newIndex = teamAgendaItems.findIndex(i => i.id === over.id)
    const reordered = arrayMove(teamAgendaItems, oldIndex, newIndex)

    // Persist to API
    fetch(`/api/meetings/${meeting!.id}/agenda/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(i => i.id) }),
    })
  }

  function handleActionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedPendingActions.findIndex(i => i.id === active.id)
    const newIndex = orderedPendingActions.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(orderedPendingActions, oldIndex, newIndex)
    setActionOrder(reordered.map(i => i.id))
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
      showSuccess('Could not generate agenda')
    } finally {
      setGeneratingAgenda(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Back link */}
        <Breadcrumb backTo="/meetings" backLabel="Meetings" current={meeting?.title} />

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs"
              style={{ fontSize: 'var(--label-size)', background: statusStyle.bg, color: statusStyle.text }}>
              <Calendar size={12} /> {meeting.status}
            </span>
            <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {meeting.type}
            </span>
            <WatchButton id={meeting.id} type="meeting" label={meeting.title} />
            {viewerSlugs.length > 0 && <PresenceAvatars slugs={viewerSlugs} />}
            <Link
              to={PATHS.meetingPrep(meeting.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs transition-colors"
              style={{
                fontSize: 'var(--label-size)',
                color: 'var(--teal)', textDecoration: 'none',
                border: '1px solid rgba(45,138,138,0.2)',
                background: 'var(--teal-hover)',
              }}
            >
              <ListChecks size={11} /> Prep View
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
                const actions = (meeting.action_items || []).filter((a: any) => !a.completed)
                if (actions.length > 0) {
                  lines.push('## Open Action Items')
                  actions.forEach((a: any) => lines.push(`- [ ] ${a.description} (@${a.assignee})`))
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
                color: copiedSummary ? 'var(--green)' : 'var(--slate)',
                border: `1px solid ${copiedSummary ? 'var(--green)' : 'var(--border-subtle)'}`,
                background: copiedSummary ? 'var(--green-hover)' : 'none',
                cursor: 'pointer',
                opacity: copiedSummary ? 1 : 0.85,
              }}
            >
              {copiedSummary ? <Check size={11} /> : <Copy size={11} />}
              {copiedSummary ? 'Copied!' : 'Copy Summary'}
            </button>
            <button
              onClick={handleGenerateAgenda}
              disabled={generatingAgenda}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs transition-colors"
              style={{
                fontSize: 'var(--label-size)',
                color: agendaCopied ? 'var(--green)' : 'var(--gold)',
                border: `1px solid ${agendaCopied ? 'var(--green)' : 'rgba(201,168,76,0.25)'}`,
                background: agendaCopied ? 'var(--green-hover)' : 'var(--gold-hover)',
                cursor: generatingAgenda ? 'wait' : 'pointer',
                opacity: generatingAgenda ? 0.85 : 1,
              }}
            >
              {agendaCopied ? <Check size={11} /> : <Sparkles size={11} />}
              {agendaCopied ? 'Copied!' : generatingAgenda ? 'Generating…' : 'Generate Agenda'}
            </button>
          </div>

          <h1 style={{ fontWeight: 600, fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)', color: 'var(--ink)', lineHeight: 1.15, margin: 0 }}>
            {meeting.title}
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--slate)', marginTop: '6px' }}>
            {formatLongDate(meeting.date)}
          </p>

          {/* Facilitator badge */}
          {(() => {
            const facilitatorSlug = getMeetingFacilitator(meeting.date)
            const facilitatorInfo = facilitatorSlug ? getPersonInfo(facilitatorSlug) : null
            return facilitatorInfo ? (
              <div className="flex items-center gap-2 mt-2">
                <UserCheck size={14} style={{ color: 'var(--teal)' }} />
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--teal)' }}>
                  Facilitator:
                </span>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 20, height: 20 }}>
                    <Avatar name={facilitatorInfo.name} initials={facilitatorInfo.initials} photoUrl={facilitatorInfo.photoUrl} size="xs" variant="ice" />
                  </div>
                  <span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)' }}>
                    {facilitatorInfo.name}
                  </span>
                </div>
              </div>
            ) : null
          })()}

          {/* Attendees — clickable toggle */}
          <AttendanceSection meetingId={meeting.id} attendees={attendees} />

          <div style={{ height: '1px', background: 'linear-gradient(to right, var(--gold), transparent)', opacity: 0.85, marginTop: '1.5rem' }} />
        </motion.div>

        {/* Projects discussed — derived from action items' project_id */}
        {(() => {
          const projectSlugs = [...new Set(actionItems.filter(a => a.project_id).map(a => a.project_id!))]
          if (projectSlugs.length === 0) return null
          return (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'var(--label-weight)' }}>
                Projects discussed
              </span>
              {projectSlugs.map((slug: string) => (
                <a
                  key={slug}
                  href={PATHS.project(slug)}
                  style={{
                    fontSize: 'var(--label-size)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--teal-active)',
                    color: 'var(--teal)',
                    textDecoration: 'none',
                    fontWeight: 'var(--label-weight)',
                  }}
                >
                  {slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </a>
              ))}
            </div>
          )
        })()}

        {/* Two-column: Agenda + Action Items (action items first on mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
          {/* Left: Agenda (order-2 on mobile so actions show first) */}
          <motion.div className="order-2 lg:order-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <div className="flex items-center gap-2 mb-3">
              <ListChecks size={16} style={{ color: 'var(--gold)' }} />
              <h2 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
                Agenda
              </h2>
            </div>

            {/* Opening Round icebreaker prompt */}
            <RoundPrompt meetingId={meeting.id} />

            <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '16px 20px', marginTop: '1rem' }} className="detail-card">
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

          {/* Right: Action Items (order-1 on mobile so actions show first) */}
          <motion.div className="order-1 lg:order-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
              <h2 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
                Action Items
              </h2>
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                {completedActions.length}/{actionItems.length}
              </span>
            </div>

            <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }} className="detail-card">
              {/* Inline add action item */}
              <AddActionItemForm
                meetingId={meeting.id}
                isAuthenticated={isAuthenticated}
                onSuccess={() => showSuccess('Action item added')}
              />

              {/* Batch action bar */}
              <AnimatePresence>
                {selectedActionIds.size >= 2 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg"
                      style={{
                        background: 'var(--teal-hover)',
                        border: '1px solid rgba(45,138,138,0.15)',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
                        {selectedActionIds.size} selected
                      </span>
                      <button
                        onClick={handleBatchComplete}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
                        style={{ background: 'var(--teal-solid)', color: 'white', border: 'none', cursor: 'pointer' }}
                      >
                        <CheckCircle2 size={12} />
                        Complete All
                      </button>
                      <button
                        onClick={() => setSelectedActionIds(new Set())}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors"
                        style={{ color: 'var(--slate)', background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                      >
                        <X size={11} />
                        Clear
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pending items (drag-to-reorder) */}
              {orderedPendingActions.length > 0 && (
                <div className="mb-3">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActionDragEnd}>
                    <SortableContext items={orderedPendingActions.map(i => i.id)} strategy={verticalListSortingStrategy}>
                      {orderedPendingActions.map((item, idx) => (
                        <SortableActionItem key={item.id} item={item} onToggle={handleToggleAction} selected={selectedActionIds.has(item.id)} onToggleSelect={toggleActionSelect} isFocused={idx === focusedActionIndex} />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {/* Completed items */}
              {completedActions.length > 0 && (
                <div>
                  <p style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginBottom: '6px' }}>
                    Completed
                  </p>
                  {completedActions.map((item) => (
                    <ActionItemRow key={item.id} item={item} onToggle={handleToggleAction} selected={selectedActionIds.has(item.id)} onToggleSelect={toggleActionSelect} />
                  ))}
                </div>
              )}

              {actionItems.length === 0 && (
                <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textAlign: 'center', padding: 'var(--sp-lg) 0', margin: 0 }}>
                  No action items yet — type above to add one
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Decisions */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.2 }} className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <Scale size={16} style={{ color: 'var(--gold)' }} />
            <h2 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
              Decisions
            </h2>
            {isAuthenticated && (
              <button
                onClick={() => setShowDecisionForm(!showDecisionForm)}
                style={{
                  marginLeft: 'auto', background: 'none', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', padding: '4px 10px', cursor: 'pointer',
                  fontSize: 'var(--label-size)', color: 'var(--gold)',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <Plus size={12} /> Log Decision
              </button>
            )}
          </div>
          <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }} className="detail-card">
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
                  style={{ marginBottom: decisions.length > 0 ? '12px' : 0, paddingBottom: decisions.length > 0 ? '12px' : 0, borderBottom: decisions.length > 0 ? '1px solid rgba(201,168,76,0.1)' : 'none' }}
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
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--gold-emphasis)')}
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
                    <button
                      type="submit"
                      style={{ background: 'var(--gold)', color: '#0f1923', border: 'none', borderRadius: 'var(--radius-md)', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDecisionForm(false); setDecisionTitle(''); setDecisionRationale('') }}
                      style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '5px 14px', fontSize: '12px', cursor: 'pointer', color: 'var(--slate)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {decisions.map((d, i) => (
              <div key={i} className="flex items-start gap-3 py-2" style={{ borderBottom: i < decisions.length - 1 ? '1px solid rgba(201, 168, 76, 0.06)' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: 'var(--gold)', marginTop: '7px', flexShrink: 0 }} />
                <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>{d}</p>
              </div>
            ))}

            {decisions.length === 0 && !showDecisionForm && (
              <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textAlign: 'center', padding: 'var(--sp-lg) 0', margin: 0 }}>
                No decisions logged yet. Record one during the meeting so nobody forgets.
              </p>
            )}
          </div>
        </motion.div>

        {/* T-50 Files section — files attached to this meeting. */}
        {meeting.id && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.22 }} className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <UploadIcon size={16} style={{ color: 'var(--teal)' }} />
              <h3 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
                Files
              </h3>
            </div>
            <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '20px' }} className="detail-card">
              <FileUpload entityType="meeting" entityId={meeting.id} />
            </div>
          </motion.div>
        )}

        {/* Notes */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.25 }} className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} style={{ color: 'var(--gold)' }} />
            <h3 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
              Meeting Notes
            </h3>
          </div>
          <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '20px' }} className="detail-card">
            {editingNotes ? (
              <div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={12}
                  style={{
                    width: '100%',
                    fontSize: '14px',
                    lineHeight: 1.7,
                    color: 'var(--ink)',
                    background: 'var(--cream)',
                    border: '1px solid rgba(201,168,76,0.2)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--sp-md) var(--sp-lg)',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      updateNotes.mutate(notesDraft)
                      setEditingNotes(false)
                    }
                    if (e.key === 'Escape') {
                      setNotesDraft(meeting?.notes || '')
                      setEditingNotes(false)
                    }
                  }}
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => { updateNotes.mutate(notesDraft); setEditingNotes(false) }}
                    style={{ background: '#dcb355', color: '#1a1a1a', border: 'none', borderRadius: 'var(--radius-md)', padding: '6px 16px', fontSize: 'var(--value-size)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Save Notes
                  </button>
                  <button
                    onClick={() => { setNotesDraft(meeting?.notes || ''); setEditingNotes(false) }}
                    style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '6px 16px', fontSize: 'var(--value-size)', cursor: 'pointer', color: 'var(--slate)' }}
                  >
                    Cancel
                  </button>
                  <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                    Ctrl+Enter to save · Esc to cancel
                  </span>
                </div>
              </div>
            ) : (
              <div className="relative group">
                {meeting?.notes ? (
                  <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                    {meeting.notes}
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontStyle: 'italic', margin: 0, cursor: 'pointer' }}
                    onClick={() => { setNotesDraft(''); setEditingNotes(true) }}>
                    No notes yet. Click to add.
                  </p>
                )}
                <button
                  onClick={() => { setNotesDraft(meeting?.notes || ''); setEditingNotes(true) }}
                  className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'var(--gold-active)', border: 'none', borderRadius: 'var(--radius-md)', padding: 'var(--sp-xs) var(--sp-sm)', cursor: 'pointer', color: 'var(--gold)', fontSize: 'var(--label-size)' }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <style>{`
        .dark .detail-card { background-color: var(--cream) !important; background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important; border: 1px solid var(--border-subtle); }
        .action-item-row:active { background: var(--gold-hover); }
        .action-item-row:hover { background: var(--gold-hover); }
        .dark .action-item-row:active { background: var(--gold-active); }
        .dark .action-item-row:hover { background: var(--gold-hover); }
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
      <button {...listeners} aria-label="Reorder item" className="cursor-grab active:cursor-grabbing mt-1 flex-shrink-0" style={{ background: 'none', border: 'none', padding: '2px', color: 'var(--slate)', opacity: 0.75 }}>
        <GripVertical size={14} />
      </button>
      <Icon size={14} style={{ color: 'var(--gold)', marginTop: '2px', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0 }}>{item.content}</p>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          Added by {item.added_by}
          {item.document_url && (
            <> · <a href={item.document_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>View document</a></>
          )}
        </span>
      </div>
    </div>
  )
}

function SortableActionItem({ item, onToggle, selected, onToggleSelect, isFocused }: { item: ActionItemRowType; onToggle: (id: string) => void; selected?: boolean; onToggleSelect?: (id: string) => void; isFocused?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 'var(--z-sticky)' : ('auto' as const),
    outline: isFocused ? '2px solid var(--teal)' : 'none',
    outlineOffset: isFocused ? '-2px' : '0',
    borderRadius: 'var(--radius-md)',
  }

  return (
    // dnd-kit attributes live on the explicit drag handle button, not the
    // wrapper div — avoids axe nested-interactive when the child ActionItemRow
    // renders its own buttons.
    <div ref={setNodeRef} style={style} className="flex items-center group/action">
      <button
        {...attributes}
        {...listeners}
        aria-label="Reorder action item"
        className="flex-shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover/action:opacity-100 transition-opacity"
        style={{ background: 'none', border: 'none', padding: '2px', color: 'var(--slate)', opacity: 0.75 }}
      >
        <GripVertical size={14} />
      </button>
      <div style={{ flex: 1 }}>
        <ActionItemRow item={item} onToggle={onToggle} selected={selected} onToggleSelect={onToggleSelect} />
      </div>
    </div>
  )
}

function AttendeeChip({ slug }: { slug: string }) {
  const p = getPersonInfo(slug)
  const hoverCard = useHoverCard()
  const memberData = buildMemberHoverData(slug)

  return (
    <div
      key={slug}
      ref={hoverCard.triggerRef as React.RefObject<HTMLDivElement>}
      className="flex items-center gap-1.5 flex-shrink-0"
      title={p.name}
      onMouseEnter={hoverCard.handlers.onMouseEnter}
      onMouseLeave={hoverCard.handlers.onMouseLeave}
    >
      <div style={{ width: 24, height: 24 }}>
        <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="tight" variant="ice" />
      </div>
      <span style={{ fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{p.name.split(' ')[0]}</span>
      <HoverCard
        data={memberData}
        isVisible={hoverCard.isVisible}
        position={hoverCard.position}
        cardRef={hoverCard.cardRef}
        cardHandlers={hoverCard.cardHandlers}
      />
    </div>
  )
}

function ActionItemRow({ item, onToggle, selected, onToggleSelect }: { item: ActionItemRowType; onToggle?: (id: string) => void; selected?: boolean; onToggleSelect?: (id: string) => void }) {
  const person = getPersonInfo(item.assignee)
  const isOverdue = item.due_date && !item.completed && new Date(item.due_date) < new Date()
  const hoverCard = useHoverCard()
  const memberData = buildMemberHoverData(item.assignee)

  return (
    <div
      className="action-item-row flex items-start gap-3 py-2.5"
      style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.06)', cursor: 'pointer', borderRadius: 'var(--radius-md)', margin: '0 -8px', padding: '10px 8px', transition: 'background 0.15s', background: selected ? 'var(--teal-hover)' : undefined }}
      // role="button" removed (axe nested-interactive): row contains a
      // checkbox button + task-title button inside. Background click still
      // toggles via e.target === e.currentTarget guard.
      onClick={(e) => {
        if (e.target === e.currentTarget) onToggle?.(item.id)
      }}
    >
      {/* Select checkbox */}
      {onToggleSelect && (
        <div className="flex-shrink-0" style={{ display: 'flex', alignItems: 'center', paddingTop: 'var(--sp-md)' }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id) }}
            style={{
              width: 16,
              height: 16,
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${selected ? 'var(--teal)' : 'var(--border-default)'}`,
              background: selected ? 'var(--teal-solid)' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 150ms ease',
            }}
            aria-label={selected ? 'Deselect action item' : 'Select action item'}
          >
            {selected && (
              <Check size={10} style={{ color: 'white' }} />
            )}
          </button>
        </div>
      )}

      {/* Touch target: 44px invisible hit area around the 20px circle */}
      <div className="flex-shrink-0 relative" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button type="button" className="cursor-pointer hover:scale-110 transition-transform"
          onClick={(e) => { e.stopPropagation(); onToggle?.(item.id) }}
          style={{ background: 'none', border: 'none', padding: 0, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.completed ? 'var(--teal)' : isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: item.completed ? 1 : 0.85 }}
          title={item.completed ? 'Mark as pending' : 'Mark as completed'}>
          {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>
      </div>
      <div style={{ flex: 1, paddingTop: '10px' }}>
        <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0, lineHeight: 1.4, textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.85 : 1 }}>
          {(() => { const { isCarried, clean } = parseCarriedForward(item.description); return (<>{isCarried && <span className="carried-badge">↻ carried</span>}{clean}</>); })()}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <div
            ref={hoverCard.triggerRef as React.RefObject<HTMLDivElement>}
            className="flex items-center gap-1"
            onMouseEnter={hoverCard.handlers.onMouseEnter}
            onMouseLeave={hoverCard.handlers.onMouseLeave}
          >
            <div style={{ width: 16, height: 16 }}>
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" variant="ice" />
            </div>
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>{person.name.split(' ')[0]}</span>
            <HoverCard
              data={memberData}
              isVisible={hoverCard.isVisible}
              position={hoverCard.position}
              cardRef={hoverCard.cardRef}
              cardHandlers={hoverCard.cardHandlers}
            />
          </div>
          {item.due_date && (
            <span style={{ fontSize: '10px', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: isOverdue ? 1 : 0.85, fontWeight: isOverdue ? 600 : 400 }}>
              {isOverdue ? 'Overdue: ' : 'Due '}{formatShortDate(item.due_date)}
            </span>
          )}
          {item.project_id && (
            <Link to={PATHS.project(item.project_id)} onClick={(e) => e.stopPropagation()} style={{ fontSize: '10px', color: 'var(--gold)', textDecoration: 'none' }}>
              {item.project_id}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Action Item (NLP quick-add) ─────────────────────────

const PRIORITY_LABELS: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium' }
const PRIORITY_COLORS: Record<number, string> = { 1: 'var(--maroon)', 2: 'var(--orange)', 3: 'var(--gold)' }

function AddActionItemForm({ meetingId, isAuthenticated, onSuccess }: { meetingId: string; isAuthenticated: boolean; onSuccess: () => void }) {
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { typingPeers: meetingTypingPeers, broadcastTyping: broadcastMeetingTyping } = useTyping('meeting', meetingId)
  const appendCh = (ch: string) => appendCharToInput(inputRef, ch, setText)
  const createTask = useCreateTask()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const fallbackAssignee = user?.email ? emailToSlug(user.email) : 'nick-ingraham'

  const parsed = text.trim() ? parseQuickAddInput(text) : null
  const hasContent = parsed && parsed.title.trim().length > 0

  // T-04 inline file drop on meeting action-item compose. Files attach to
  // the meeting (not the forthcoming task) — R2 flow mirrors FileUpload.
  const uploadToCompose = async (file: File) => {
    setUploading(true)
    try {
      const urlRes = await fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', context: { type: 'meeting', id: meetingId } }),
      })
      const urlData = await urlRes.json() as { data?: { uploadUrl?: string; key?: string } }
      if (!urlData.data?.uploadUrl || !urlData.data?.key) throw new Error('presign failed')
      await fetch(urlData.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      const doneRes = await fetch('/api/upload/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: urlData.data.key, filename: file.name, contentType: file.type, sizeBytes: file.size, entityType: 'meeting', entityId: meetingId }),
      })
      const doneData = await doneRes.json() as { data?: { url?: string } }
      queryClient.invalidateQueries({ queryKey: ['attachments', 'meeting', meetingId] })
      const link = doneData.data?.url ?? `/api/files/${urlData.data.key}`
      setText((prev) => (prev ? `${prev} [${file.name}](${link})` : `[${file.name}](${link})`))
    } catch (err) {
      console.error('meeting compose upload failed', err)
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!parsed || !hasContent) return

    createTask.mutate({
      title: parsed.title,
      description: parsed.title,
      assignee: parsed.assigneeSlug ?? fallbackAssignee,
      meeting_id: meetingId,
      due_date: parsed.dueDate ?? undefined,
      priority: parsed.priority === 1 ? 'urgent' : parsed.priority === 2 ? 'high' : parsed.priority === 3 ? 'medium' : 'medium',
    }, {
      onSuccess: () => {
        setText('')
        queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
        onSuccess()
        inputRef.current?.focus()
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(45,138,138,0.08)' }}>
      <div
        className="flex items-center gap-2"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files || []).forEach(uploadToCompose) }}
        style={{ outline: dragOver ? '2px dashed var(--teal)' : 'none', outlineOffset: '2px', borderRadius: 'var(--radius-lg)' }}
      >
        <Plus size={14} style={{ color: 'var(--teal)', opacity: 0.85, flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          data-testid="meeting-action-add"
          value={text}
          onChange={(e) => { setText(e.target.value); broadcastMeetingTyping(e.target.value.trim().length > 0) }}
          onPaste={(e) => {
            const fi = Array.from(e.clipboardData?.items || []).find((it) => it.kind === 'file')
            if (fi) { e.preventDefault(); const f = fi.getAsFile(); if (f) uploadToCompose(f) }
          }}
          placeholder={isAuthenticated || !import.meta.env.PROD ? '@nick Review draft p2 Friday (drop/paste files to attach)' : 'Sign in to add items'}
          disabled={!isAuthenticated && import.meta.env.PROD}
          style={{
            flex: 1, fontSize: 'var(--value-size)', color: 'var(--ink)',
            background: 'var(--cream)', border: '1px solid color-mix(in srgb, var(--teal) 12%, transparent)', borderRadius: 'var(--radius-lg)',
            padding: 'var(--sp-sm) var(--sp-md)', outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--teal)')}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--teal) 12%, transparent)'; broadcastMeetingTyping(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setText(''); e.currentTarget.blur() } }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Attach file"
          className="flex-shrink-0 p-2 rounded-lg"
          style={{ border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--slate)', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.55 : 0.85 }}
        >
          <Paperclip size={12} />
        </button>
        <button
          type="button"
          onClick={() => appendCh('@')}
          title="Mention teammate (@name)"
          className="flex-shrink-0 p-2 rounded-lg"
          style={{ border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', opacity: 0.85 }}
        >
          <AtSign size={12} />
        </button>
        <button
          type="button"
          onClick={() => appendCh(':')}
          title="Add emoji reaction (:emoji:)"
          className="flex-shrink-0 p-2 rounded-lg"
          style={{ border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--slate)', cursor: 'pointer', opacity: 0.85 }}
        >
          <Smile size={12} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => { Array.from(e.target.files || []).forEach(uploadToCompose); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        {hasContent && (
          <motion.button
            type="submit"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-shrink-0 p-2 rounded-lg cursor-pointer"
            style={{ background: 'var(--teal-solid)', color: 'white', border: 'none' }}
          >
            <Plus size={14} />
          </motion.button>
        )}
      </div>

      {!isAuthenticated && import.meta.env.PROD && (
        <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75, marginLeft: '22px', marginTop: '4px', display: 'inline-block' }}>
          <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 'var(--weight-ui)' as any, textDecoration: 'underline' }}>Sign in</a> to add action items
        </span>
      )}

      <TypingIndicator slugs={meetingTypingPeers} style={{ margin: '4px 0 0 22px' }} />

      {/* Token preview chips */}
      {parsed && (parsed.assigneeName || parsed.priority || parsed.dueDate || parsed.projectTitle) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex flex-wrap items-center gap-1.5 mt-1.5 ml-6"
        >
          {parsed.assigneeName && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--gold-emphasis)', color: 'var(--gold)' }}>
              @{parsed.assigneeName}
            </span>
          )}
          {parsed.priority && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'rgba(122,0,25,0.1)', color: PRIORITY_COLORS[parsed.priority] }}>
              P{parsed.priority} {PRIORITY_LABELS[parsed.priority]}
            </span>
          )}
          {parsed.dueDate && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--teal-active)', color: 'var(--teal)' }}>
              Due {parsed.dueDate}
            </span>
          )}
          {parsed.projectTitle && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--teal-active)', color: 'var(--teal)' }}>
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
    </form>
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
              background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: 'var(--radius-lg)',
              padding: 'var(--sp-sm) var(--sp-md)', outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--gold-emphasis)')}
          />
        </div>
        {!isAuthenticated && import.meta.env.PROD && !text.trim() && (
          <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
            <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 'var(--weight-ui)' as any, textDecoration: 'underline' }}>Sign in</a> to add items
          </span>
        )}
        {text.trim() && (
          <>
            <motion.button type="button" onClick={() => setShowDocInput(!showDocInput)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
              style={{ background: 'transparent', border: '1px solid rgba(201, 168, 76, 0.2)', color: 'var(--slate)' }}
              title="Attach document link">
              <FileText size={14} />
            </motion.button>
            <motion.button type="submit" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
              style={{ background: 'var(--gold)', color: '#0f1923', border: 'none' }}>
              <Plus size={14} />
            </motion.button>
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
                background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: 'var(--radius-lg)',
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
function AttendanceSection({ meetingId, attendees }: { meetingId: string; attendees: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const [localAttendees, setLocalAttendees] = useState<string[]>(attendees)

  const allPeople = [...directors, ...getAllMembers()].filter(p => p.slug)
  const uniquePeople = allPeople.filter((p, i) => allPeople.findIndex(x => x.slug === p.slug) === i)

  const toggleAttendee = async (slug: string) => {
    const newList = localAttendees.includes(slug)
      ? localAttendees.filter(s => s !== slug)
      : [...localAttendees, slug]
    setLocalAttendees(newList)
    try {
      await fetch(`/api/meetings/${meetingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendees: JSON.stringify(newList) }),
      })
    } catch { /* silent */ }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Users size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'var(--label-weight)' }}>
          Attendees
        </span>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
          {localAttendees.length}
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'var(--teal)', marginLeft: 'auto' }}
        >
          {expanded ? 'Done' : '+ Edit'}
        </button>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {localAttendees.map(slug => <AttendeeChip key={slug} slug={slug} />)}
        {localAttendees.length === 0 && !expanded && (
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No attendees logged</span>
        )}
      </div>
      {expanded && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mt-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--ice)', border: '1px solid var(--border-subtle)' }}>
          {uniquePeople.map(person => {
            const slug = person.slug!
            const p = getPersonInfo(slug)
            const present = localAttendees.includes(slug)
            return (
              <button
                key={slug}
                onClick={() => toggleAttendee(slug)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition-colors"
                style={{
                  background: present ? 'var(--teal-active)' : 'none',
                  border: `1px solid ${present ? 'var(--teal)' : 'var(--border-subtle)'}`,
                  color: present ? 'var(--teal)' : 'var(--slate)',
                  cursor: 'pointer',
                  opacity: present ? 1 : 0.85,
                }}
              >
                <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="sm-icon" />
                {p.name.split(' ')[0]}
                {present && <UserCheck size={10} style={{ marginLeft: 'auto' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
