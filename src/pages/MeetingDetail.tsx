import { useState } from 'react'
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
} from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePageMeta } from '../hooks/usePageMeta'
import { useMeetingDetail } from '../hooks/useApiData'
import type { ActionItemRow as ActionItemRowType, AgendaItemRow } from '../hooks/useApiData'
import { useToggleActionItem, useAddAgendaItem, useUpdateMeetingNotes } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/Avatar'
import WatchButton from '../components/WatchButton'
import { getPersonInfo } from '../data/team'
import { formatLongDate, formatShortDate } from '../lib/dateUtils'
import { getMeetingFacilitator } from '../lib/facilitator'

function parseJsonArray(s: string | null): string[] {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  upcoming: { bg: 'rgba(45, 138, 138, 0.15)', text: 'var(--teal)' },
  'in-progress': { bg: 'rgba(201, 168, 76, 0.15)', text: 'var(--gold)' },
  completed: { bg: 'rgba(34, 197, 94, 0.12)', text: '#22c55e' },
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
  // Hooks must be called unconditionally (before any conditional returns)
  const toggleAction = useToggleActionItem()
  const addAgenda = useAddAgendaItem(meeting?.id || '')
  const updateNotes = useUpdateMeetingNotes(meeting?.id || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(meeting?.notes || '')

  usePageMeta(
    meeting ? `${meeting.title} | MN-CCORE` : 'Meeting | MN-CCORE',
    'MNCCORE meeting details, agenda, action items, and decisions.'
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
        <Link to="/meetings" className="inline-flex items-center gap-2 mb-6"
          style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Meetings
        </Link>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: '1.75rem', color: 'var(--ink)' }}>
          Meeting not found
        </h1>
      </div>
    )
  }

  const attendees = parseJsonArray(meeting.attendees)
  const autoAgenda = parseJsonArray(meeting.agenda)
  const decisions = parseJsonArray(meeting.decisions)
  const statusStyle = STATUS_COLORS[meeting.status] || STATUS_COLORS.completed
  const actionItems = meeting.action_items || []
  const teamAgendaItems = meeting.agenda_items || []

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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

  const pendingActions = actionItems.filter((a) => !a.completed)
  const completedActions = actionItems.filter((a) => a.completed)

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Back link */}
        <Breadcrumb backTo="/meetings" backLabel="Meetings" current={meeting?.title} />

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: statusStyle.bg, color: statusStyle.text }}>
              <Calendar size={12} /> {meeting.status}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
              {meeting.type}
            </span>
            <WatchButton id={meeting.id} type="meeting" label={meeting.title} />
          </div>

          <h1 style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)', color: 'var(--ink)', lineHeight: 1.15, margin: 0 }}>
            {meeting.title}
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--slate)', marginTop: '6px' }}>
            {formatLongDate(meeting.date)}
          </p>

          {/* Facilitator badge */}
          {(() => {
            const facilitatorSlug = getMeetingFacilitator(meeting.date)
            const facilitatorInfo = facilitatorSlug ? getPersonInfo(facilitatorSlug) : null
            return facilitatorInfo ? (
              <div className="flex items-center gap-2 mt-2">
                <UserCheck size={14} style={{ color: 'var(--teal)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--teal)' }}>
                  Facilitator:
                </span>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 20, height: 20 }}>
                    <Avatar name={facilitatorInfo.name} initials={facilitatorInfo.initials} photoUrl={facilitatorInfo.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)' }}>
                    {facilitatorInfo.name}
                  </span>
                </div>
              </div>
            ) : null
          })()}

          {/* Attendees — horizontal scroll on mobile */}
          {attendees.length > 0 && (
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 -mx-1 px-1 attendee-scroll">
              <Users size={14} style={{ color: 'var(--slate)', opacity: 0.5, flexShrink: 0 }} />
              {attendees.map((slug) => {
                const p = getPersonInfo(slug)
                return (
                  <div key={slug} className="flex items-center gap-1.5 flex-shrink-0" title={p.name}>
                    <div style={{ width: 24, height: 24 }}>
                      <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0" />
                    </div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{p.name.split(' ')[0]}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ height: '1px', background: 'linear-gradient(to right, var(--gold), transparent)', opacity: 0.3, marginTop: '1.5rem' }} />
        </motion.div>

        {/* Two-column: Agenda + Action Items (action items first on mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
          {/* Left: Agenda (order-2 on mobile so actions show first) */}
          <motion.div className="order-2 lg:order-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <div className="flex items-center gap-2 mb-3">
              <ListChecks size={16} style={{ color: 'var(--gold)' }} />
              <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
                Agenda
              </h2>
            </div>

            {/* Opening Round icebreaker prompt */}
            <RoundPrompt meetingId={meeting.id} />

            <div style={{ background: 'var(--ice)', borderRadius: '12px', padding: '16px 20px', marginTop: '1rem' }} className="detail-card">
              {/* Auto-generated agenda items */}
              {autoAgenda.length > 0 && (
                <div className="mb-4">
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65, marginBottom: '8px' }}>
                    Prepared agenda
                  </p>
                  <ol style={{ margin: 0, paddingLeft: '20px' }}>
                    {autoAgenda.map((item, i) => (
                      <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6, marginBottom: '4px' }}>
                        {item}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Team-added agenda items (drag-to-reorder) */}
              {teamAgendaItems.length > 0 && (
                <div className="mb-4">
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65, marginBottom: '8px' }}>
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
              <AddAgendaForm isAuthenticated={isAuthenticated} onAdd={(input) => addAgenda.mutate(input)} />
            </div>
          </motion.div>

          {/* Right: Action Items (order-1 on mobile so actions show first) */}
          <motion.div className="order-1 lg:order-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
              <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
                Action Items
              </h2>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                {completedActions.length}/{actionItems.length}
              </span>
            </div>

            <div style={{ background: 'var(--ice)', borderRadius: '12px', padding: '16px 20px' }} className="detail-card">
              {/* Pending items */}
              {pendingActions.length > 0 && (
                <div className="mb-3">
                  {pendingActions.map((item) => (
                    <ActionItemRow key={item.id} item={item} onToggle={(id) => toggleAction.mutate(id)} />
                  ))}
                </div>
              )}

              {/* Completed items */}
              {completedActions.length > 0 && (
                <div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65, marginBottom: '6px' }}>
                    Completed
                  </p>
                  {completedActions.map((item) => (
                    <ActionItemRow key={item.id} item={item} onToggle={(id) => toggleAction.mutate(id)} />
                  ))}
                </div>
              )}

              {actionItems.length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', opacity: 0.4, textAlign: 'center', padding: '16px 0', margin: 0 }}>
                  No action items yet
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Decisions */}
        {decisions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={16} style={{ color: 'var(--gold)' }} />
              <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
                Decisions
              </h2>
            </div>
            <div style={{ background: 'var(--ice)', borderRadius: '12px', padding: '16px 20px' }} className="detail-card">
              {decisions.map((d, i) => (
                <div key={i} className="flex items-start gap-3 py-2" style={{ borderBottom: i < decisions.length - 1 ? '1px solid rgba(201, 168, 76, 0.06)' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', marginTop: '7px', flexShrink: 0 }} />
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>{d}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Notes */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }} className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} style={{ color: 'var(--gold)' }} />
            <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
              Meeting Notes
            </h3>
          </div>
          <div style={{ background: 'var(--ice)', borderRadius: '12px', padding: '20px' }} className="detail-card">
            {editingNotes ? (
              <div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={12}
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    lineHeight: 1.7,
                    color: 'var(--ink)',
                    background: 'var(--cream)',
                    border: '1px solid rgba(201,168,76,0.2)',
                    borderRadius: 8,
                    padding: '12px 16px',
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
                    style={{ background: 'var(--gold)', color: 'var(--ink)', border: 'none', borderRadius: 6, padding: '6px 16px', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Save Notes
                  </button>
                  <button
                    onClick={() => { setNotesDraft(meeting?.notes || ''); setEditingNotes(false) }}
                    style={{ background: 'none', border: '1px solid var(--border-light)', borderRadius: 6, padding: '6px 16px', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer', color: 'var(--slate)' }}
                  >
                    Cancel
                  </button>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
                    Ctrl+Enter to save · Esc to cancel
                  </span>
                </div>
              </div>
            ) : (
              <div className="relative group">
                {meeting?.notes ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', lineHeight: 1.7, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                    {meeting.notes}
                  </div>
                ) : (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--slate)', opacity: 0.5, fontStyle: 'italic', margin: 0, cursor: 'pointer' }}
                    onClick={() => { setNotesDraft(''); setEditingNotes(true) }}>
                    No notes yet. Click to add.
                  </p>
                )}
                <button
                  onClick={() => { setNotesDraft(meeting?.notes || ''); setEditingNotes(true) }}
                  className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(201,168,76,0.1)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <style>{`
        .dark .detail-card { background: #162535 !important; border: 1px solid rgba(201, 168, 76, 0.12); }
        .action-item-row:active { background: rgba(201, 168, 76, 0.06); }
        .action-item-row:hover { background: rgba(201, 168, 76, 0.04); }
        .dark .action-item-row:active { background: rgba(201, 168, 76, 0.1); }
        .dark .action-item-row:hover { background: rgba(201, 168, 76, 0.06); }
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
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : ('auto' as const),
  }
  const Icon = AGENDA_TYPE_ICONS[item.type] || MessageSquarePlus

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 py-2" {...attributes}>
      <button {...listeners} className="cursor-grab active:cursor-grabbing mt-1 flex-shrink-0" style={{ background: 'none', border: 'none', padding: '2px', color: 'var(--slate)', opacity: 0.3 }}>
        <GripVertical size={14} />
      </button>
      <Icon size={14} style={{ color: 'var(--gold)', marginTop: '2px', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', margin: 0 }}>{item.content}</p>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
          Added by {item.added_by}
          {item.document_url && (
            <> · <a href={item.document_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>View document</a></>
          )}
        </span>
      </div>
    </div>
  )
}

function ActionItemRow({ item, onToggle }: { item: ActionItemRowType; onToggle?: (id: string) => void }) {
  const person = getPersonInfo(item.assignee)
  const isOverdue = item.due_date && !item.completed && new Date(item.due_date) < new Date()

  return (
    <div
      className="action-item-row flex items-start gap-3 py-2.5"
      style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.06)', cursor: 'pointer', borderRadius: '6px', margin: '0 -8px', padding: '10px 8px', transition: 'background 0.15s' }}
      onClick={() => onToggle?.(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(item.id) } }}
    >
      {/* Touch target: 44px invisible hit area around the 20px circle */}
      <div className="flex-shrink-0 relative" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button type="button" className="cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onToggle?.(item.id) }}
          style={{ background: 'none', border: 'none', padding: 0, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.completed ? 'var(--teal)' : isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: item.completed ? 1 : 0.5, transition: 'transform 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          title={item.completed ? 'Mark as pending' : 'Mark as completed'}>
          {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>
      </div>
      <div style={{ flex: 1, paddingTop: '10px' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', margin: 0, lineHeight: 1.4, textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.5 : 1 }}>
          {item.description}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <div className="flex items-center gap-1">
            <div style={{ width: 16, height: 16 }}>
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-4 !h-4 !min-w-0 !min-h-0 !text-[7px]" />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.6 }}>{person.name.split(' ')[0]}</span>
          </div>
          {item.due_date && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: isOverdue ? 1 : 0.5, fontWeight: isOverdue ? 600 : 400 }}>
              {isOverdue ? 'Overdue: ' : 'Due '}{formatShortDate(item.due_date)}
            </span>
          )}
          {item.project_id && (
            <Link to={`/projects/${item.project_id}`} onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--gold)', textDecoration: 'none' }}>
              {item.project_id}
            </Link>
          )}
        </div>
      </div>
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
              width: '100%', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)',
              background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: '8px',
              padding: '8px 12px', outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.15)')}
          />
        </div>
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
                width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink)',
                background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: '8px',
                padding: '6px 10px', outline: 'none', marginTop: '6px',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}
