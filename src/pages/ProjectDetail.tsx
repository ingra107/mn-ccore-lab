import { useState, useRef, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  CalendarPlus,
  Clock,
  CheckCircle2,
  Circle,
  FileText,
  Plus,
  Send,
  X,
  Link2,
  Check,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useProjects, useMeetingsApi, useActionItems } from '../hooks/useApiData'
import { useUpdateProject, useAddAgendaItem, useToggleActionItem, usePostProjectUpdate } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import { formatMediumDate, formatTimestamp } from '../lib/dateUtils'
import Avatar from '../components/Avatar'
import ProjectComments from '../components/ProjectComments'
import ProjectUpdateFeed from '../components/ProjectUpdateFeed'
import type { Project, ActionItem } from '../data/types'

const PI_EMAILS = ['ningraha@umn.edu', 'sandb029@umn.edu', 'nicholas.ingraham@gmail.com']

const STAGES = ['Idea', 'Data Collection', 'Analysis', 'Writing', 'Review', 'Published'] as const
type Stage = (typeof STAGES)[number]

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  clif: { bg: 'var(--maroon)', text: '#faf8f3', label: 'CLIF' },
  lab: { bg: 'var(--teal)', text: '#faf8f3', label: 'Lab' },
  nate: { bg: 'var(--gold)', text: '#0f1923', label: 'Mesfin' },
}

const STATUS_CLASSES: Record<string, string> = {
  Active: 'badge-active',
  'In Review': 'badge-review',
  Published: 'badge-published',
  'In Preparation': 'badge-preparation',
}

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: projects = [] } = useProjects()

  const project = projects.find((p) => p.slug === slug)

  usePageMeta(
    project ? `${project.title} | MN-CCORE` : 'Project Not Found | MN-CCORE',
    project?.description ?? 'MN-CCORE research project details.'
  )

  if (!project) {
    return (
      <div className="content-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 mb-6"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--slate)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          Back to Pipeline
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.75rem',
            color: 'var(--ink)',
          }}
        >
          Project not found
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', marginTop: '0.5rem' }}>
          No project matches the slug "{slug}".
        </p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        <ProjectDetailInner project={project} />
      </div>
    </div>
  )
}

interface InnerProps {
  project: Project
}

function ProjectDetailInner({ project }: InnerProps) {
  // D1 mutations
  const d1Update = useUpdateProject(project.slug)
  const toggleAction = useToggleActionItem()
  const postUpdate = usePostProjectUpdate(project.slug)
  const { isAuthenticated, user } = useAuth()
  const isPi = user?.email ? PI_EMAILS.includes(user.email) : false

  // Copy link
  const [copied, setCopied] = useState(false)
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // PI Context editing
  const [editingContext, setEditingContext] = useState(false)
  const [contextDraft, setContextDraft] = useState(project.pi_context ?? '')
  const { data: apiMeetings = [] } = useMeetingsApi()
  const { data: actionItemRows = [] } = useActionItems()

  const cat = CATEGORY_COLORS[project.category] ?? {
    bg: 'var(--slate)',
    text: '#faf8f3',
    label: project.category,
  }
  const pi = getPersonInfo(project.pi)
  const statusClass = STATUS_CLASSES[project.status] ?? 'badge-preparation'

  // Stage changer state
  const [confirmStage, setConfirmStage] = useState<Stage | null>(null)
  const currentStageIndex = STAGES.indexOf(project.stage as Stage)

  // Inline editing
  const [editingDescription, setEditingDescription] = useState(false)
  const [descDraft, setDescDraft] = useState(project.description ?? '')
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Note input
  const [noteText, setNoteText] = useState('')

  // Add to meeting agenda
  const [showAgendaForm, setShowAgendaForm] = useState(false)
  const [agendaNote, setAgendaNote] = useState('')
  const nextUpcomingMeeting = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const upcoming = apiMeetings.find((m) => m.status === 'upcoming')
    if (upcoming) return upcoming
    const future = [...apiMeetings]
      .filter((m) => m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    return future[0] ?? null
  }, [apiMeetings])
  const addAgenda = useAddAgendaItem(nextUpcomingMeeting?.id ?? '')

  // Collect action items that reference this project (from D1)
  const relatedActions = useMemo(() => {
    const items = actionItemRows
      .filter((ai) => ai.project_id === project.slug || ai.project_id === project.title)
      .map((ai) => ({
        meetingId: ai.meeting_id || '',
        meetingTitle: ai.meeting_title || '',
        meetingDate: ai.meeting_date || ai.created_at?.split('T')[0] || '',
        action: {
          id: ai.id,
          description: ai.description,
          assignee: ai.assignee,
          dueDate: ai.due_date || undefined,
          completed: ai.completed === 1,
          projectSlug: ai.project_id || undefined,
        } as ActionItem,
      }))
    // Pending first, then completed
    items.sort((a, b) => {
      if (a.action.completed !== b.action.completed) return a.action.completed ? 1 : -1
      return b.meetingDate.localeCompare(a.meetingDate)
    })
    return items
  }, [actionItemRows, project.slug, project.title])

  function handleStageClick(stage: Stage) {
    if (stage === project.stage) return
    setConfirmStage(stage)
  }

  function confirmStageChange() {
    if (!confirmStage) return
    d1Update.mutate({ stage: confirmStage })
    setConfirmStage(null)
  }

  function handleDescSave() {
    setEditingDescription(false)
    if (descDraft.trim() !== (project.description ?? '').trim()) {
      d1Update.mutate({ description: descDraft.trim() || undefined })
    }
  }

  function handleAddNote() {
    const text = noteText.trim()
    if (!text) return
    postUpdate.mutate({ content: text, update_type: 'progress' })
    setNoteText('')
  }

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
        <nav className="flex items-center gap-1.5 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}>
          <Link to="/projects" style={{ color: 'var(--slate)', textDecoration: 'none', opacity: 0.5 }}>Projects</Link>
          <span style={{ opacity: 0.3 }}>/</span>
          <span style={{ color: 'var(--ink)', opacity: 0.8 }}>{project.title.length > 40 ? project.title.slice(0, 40) + '...' : project.title}</span>
        </nav>
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 mt-1"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--slate)',
            textDecoration: 'none',
            opacity: 0.7,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
        >
          <ArrowLeft size={16} />
          Back to Pipeline
        </Link>
      </div>

      {/* Header section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: cat.bg,
              color: cat.text,
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.04em',
            }}
          >
            {cat.label}
          </span>
          <span className={`badge ${statusClass}`}>{project.status}</span>

          {/* Add to meeting agenda button — only when authenticated and a meeting exists */}
          {isAuthenticated && nextUpcomingMeeting && (
            <motion.button
              type="button"
              onClick={() => setShowAgendaForm(!showAgendaForm)}
              className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{
                background: showAgendaForm ? 'var(--gold)' : 'rgba(201, 168, 76, 0.1)',
                color: showAgendaForm ? '#0f1923' : 'var(--gold)',
                border: '1px solid rgba(201, 168, 76, 0.25)',
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 500,
                marginLeft: '4px',
                transition: 'all 0.2s',
              }}
              whileTap={{ scale: 0.95 }}
            >
              <CalendarPlus size={12} />
              Add to meeting agenda
            </motion.button>
          )}
        </div>

        {/* Inline agenda form */}
        <AnimatePresence>
          {showAgendaForm && nextUpcomingMeeting && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              style={{ marginBottom: '12px' }}
            >
              <div
                style={{
                  background: 'var(--ice)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  border: '1px solid rgba(201, 168, 76, 0.15)',
                }}
                className="detail-card"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Add to: {nextUpcomingMeeting.title.split(':')[0]} ({new Date(nextUpcomingMeeting.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                  </span>
                  <button
                    type="button"
                    onClick={() => { setShowAgendaForm(false); setAgendaNote('') }}
                    className="cursor-pointer"
                    style={{ background: 'none', border: 'none', color: 'var(--slate)', opacity: 0.5, padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!agendaNote.trim()) return
                    addAgenda.mutate({
                      content: `[${project.title}] ${agendaNote.trim()}`,
                      project_id: project.slug,
                      type: 'discussion',
                    })
                    setAgendaNote('')
                    setShowAgendaForm(false)
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={agendaNote}
                    onChange={(e) => setAgendaNote(e.target.value)}
                    placeholder="What should we discuss?"
                    autoFocus
                    style={{
                      flex: 1,
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.15)')}
                  />
                  {agendaNote.trim() && (
                    <motion.button
                      type="submit"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
                      style={{ background: 'var(--gold)', color: '#0f1923', border: 'none' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Send size={14} />
                    </motion.button>
                  )}
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Title + PI */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
          <div style={{ flex: 1 }}>
            <div className="flex items-start gap-2">
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                  color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {project.title}
            </h1>
              <button
                onClick={handleCopyLink}
                className="mt-2 p-1.5 rounded-md transition-colors hover:bg-black/5 flex-shrink-0"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--teal)' : 'var(--slate)', opacity: copied ? 1 : 0.3 }}
                title={copied ? 'Link copied!' : 'Copy link to this project'}
              >
                {copied ? <Check size={16} /> : <Link2 size={16} />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div style={{ width: 36, height: 36 }}>
              <Avatar
                name={pi.name}
                initials={pi.initials}
                photoUrl={pi.photoUrl}
                size="sm"
                variant="gold"
                className="!w-9 !h-9 !min-w-0 !min-h-0"
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--slate)',
                fontWeight: 500,
              }}
            >
              {pi.name}
            </span>
          </div>
        </div>

        {/* Gold rule */}
        <div
          style={{
            height: '1px',
            background: 'linear-gradient(to right, var(--gold), transparent)',
            opacity: 0.3,
            marginBottom: '1rem',
          }}
        />
      </motion.div>

      {/* Section navigation */}
      <SectionNav sections={[
        { id: 'overview', label: 'Overview' },
        { id: 'updates', label: 'Updates' },
        { id: 'action-items', label: 'Action Items' },
        { id: 'comments', label: 'Comments' },
      ]} />

      {/* "Why This Matters Now" — PI strategic context */}
      {(project.pi_context || isPi) && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '14px 18px',
            borderRadius: '10px',
            borderLeft: '3px solid var(--gold)',
            backgroundColor: 'rgba(201, 168, 76, 0.04)',
          }}
          className="detail-card"
        >
          <div className="flex items-center justify-between mb-1">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--gold)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              Why This Matters Now
            </span>
            {isPi && !editingContext && (
              <button
                onClick={() => { setContextDraft(project.pi_context ?? ''); setEditingContext(true) }}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--slate)',
                  opacity: 0.5,
                  background: 'none',
                  border: '1px solid var(--border-light)',
                  cursor: 'pointer',
                }}
              >
                {project.pi_context ? 'Edit' : 'Add context'}
              </button>
            )}
          </div>
          {editingContext ? (
            <div>
              <textarea
                value={contextDraft}
                onChange={(e) => setContextDraft(e.target.value)}
                placeholder="2-3 sentences: What's the strategic context? Why is this project important right now? What should the team know?"
                rows={3}
                autoFocus
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  border: '1px solid var(--gold)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  lineHeight: 1.5,
                  resize: 'vertical',
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    d1Update.mutate({ pi_context: contextDraft.trim() || undefined })
                    setEditingContext(false)
                  }
                  if (e.key === 'Escape') {
                    setEditingContext(false)
                  }
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => { d1Update.mutate({ pi_context: contextDraft.trim() || undefined }); setEditingContext(false) }}
                  className="px-3 py-1 rounded-md text-xs font-medium"
                  style={{ fontFamily: 'var(--font-sans)', background: 'var(--gold)', color: '#0f1923', border: 'none', cursor: 'pointer' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingContext(false)}
                  className="px-3 py-1 rounded-md text-xs"
                  style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', background: 'none', border: '1px solid var(--border-light)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>
                  Ctrl+Enter to save
                </span>
              </div>
            </div>
          ) : project.pi_context ? (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--ink)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {project.pi_context}
            </p>
          ) : isPi ? (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--slate)',
                opacity: 0.5,
                margin: 0,
                fontStyle: 'italic',
              }}
            >
              Add strategic context so your team understands why this project matters right now.
            </p>
          ) : null}
        </div>
      )}

      {/* Stage indicator */}
      <motion.div
        id="overview"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: '0 0 12px 0',
          }}
        >
          Stage
        </h2>
        <div className="flex items-center gap-0" style={{ position: 'relative' }}>
          {/* Connecting line */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '16px',
              right: '16px',
              height: '2px',
              background: 'var(--ice)',
              transform: 'translateY(-50%)',
              zIndex: 0,
            }}
          />
          {/* Progress fill */}
          {currentStageIndex >= 0 && (
            <motion.div
              layout
              style={{
                position: 'absolute',
                top: '50%',
                left: '16px',
                width: `${(currentStageIndex / (STAGES.length - 1)) * (100 - 6)}%`,
                height: '2px',
                background: 'var(--gold)',
                transform: 'translateY(-50%)',
                zIndex: 1,
              }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            />
          )}
          {STAGES.map((stage, i) => {
            const isCurrent = stage === project.stage
            const isPast = i < currentStageIndex
            const isFuture = i > currentStageIndex
            return (
              <div
                key={stage}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                <motion.button
                  type="button"
                  onClick={() => handleStageClick(stage)}
                  className="cursor-pointer"
                  style={{
                    width: isCurrent ? '20px' : '14px',
                    height: isCurrent ? '20px' : '14px',
                    borderRadius: '50%',
                    border: isCurrent
                      ? '3px solid var(--gold)'
                      : isPast
                        ? '2px solid var(--gold)'
                        : '2px solid var(--ice)',
                    background: isCurrent
                      ? 'var(--gold)'
                      : isPast
                        ? 'var(--gold)'
                        : 'var(--cream)',
                    transition: 'all 0.2s ease',
                    padding: 0,
                  }}
                  whileHover={{ scale: 1.3 }}
                  whileTap={{ scale: 0.9 }}
                  title={`Move to ${stage}`}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: isCurrent ? 'var(--gold)' : isFuture ? 'var(--slate)' : 'var(--ink)',
                    opacity: isCurrent ? 1 : isFuture ? 0.4 : 0.7,
                    fontWeight: isCurrent ? 700 : 400,
                    marginTop: '8px',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stage}
                </span>
              </div>
            )
          })}
        </div>

        {/* Stage change confirmation modal */}
        <AnimatePresence>
          {confirmStage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              style={{
                marginTop: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'var(--ice)',
                border: '1px solid rgba(201, 168, 76, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--ink)',
                  flex: 1,
                }}
              >
                Move to <strong>{confirmStage}</strong>?
              </span>
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={confirmStageChange}
                  className="cursor-pointer px-3 py-1 rounded-md text-sm font-medium"
                  style={{
                    background: 'var(--gold)',
                    color: '#0f1923',
                    border: 'none',
                    fontFamily: 'var(--font-body)',
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  Confirm
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setConfirmStage(null)}
                  className="cursor-pointer px-3 py-1 rounded-md text-sm font-medium"
                  style={{
                    background: 'transparent',
                    color: 'var(--slate)',
                    border: '1px solid var(--ice)',
                    fontFamily: 'var(--font-body)',
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Two-column layout: Details + Notes */}
      <div
        className="grid grid-cols-1 lg:grid-cols-5 gap-8"
        style={{ marginBottom: '2.5rem' }}
      >
        {/* Left column: Details (3/5) */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '16px',
              color: 'var(--ink)',
              margin: '0 0 12px 0',
            }}
          >
            Details
          </h2>

          <div
            style={{
              background: 'var(--ice)',
              borderRadius: '12px',
              padding: '20px',
            }}
            className="detail-card"
          >
            {/* Description — inline editable */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 0.6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Description
              </label>
              {editingDescription ? (
                <textarea
                  ref={descRef}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={handleDescSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleDescSave()
                    }
                    if (e.key === 'Escape') {
                      setDescDraft(project.description ?? '')
                      setEditingDescription(false)
                    }
                  }}
                  autoFocus
                  rows={3}
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    background: 'var(--cream)',
                    border: '1px solid var(--gold)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              ) : (
                <p
                  onClick={() => {
                    setDescDraft(project.description ?? '')
                    setEditingDescription(true)
                  }}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: project.description ? 'var(--ink)' : 'var(--slate)',
                    lineHeight: 1.6,
                    margin: 0,
                    cursor: 'pointer',
                    padding: '4px 0',
                    opacity: project.description ? 1 : 0.5,
                    borderBottom: '1px dashed transparent',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.4)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = 'transparent')
                  }
                  title="Click to edit"
                >
                  {project.description || 'Click to add a description...'}
                </p>
              )}
            </div>

            {/* Team */}
            {project.team && project.team.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--slate)',
                    opacity: 0.6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Team
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {project.team.map((memberSlug) => {
                    const info = getPersonInfo(memberSlug)
                    return (
                      <div key={memberSlug} className="flex items-center gap-2">
                        <div style={{ width: 28, height: 28 }}>
                          <Avatar
                            name={info.name}
                            initials={info.initials}
                            photoUrl={info.photoUrl}
                            size="sm"
                            variant="ice"
                            className="!w-7 !h-7 !min-w-0 !min-h-0"
                          />
                        </div>
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '13px',
                            color: 'var(--ink)',
                          }}
                        >
                          {info.name}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Metadata row */}
            <div className="flex flex-wrap gap-4" style={{ marginTop: '8px' }}>
              {project.googleDocUrl && (
                <a
                  href={project.googleDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--gold)',
                    textDecoration: 'none',
                  }}
                >
                  <FileText size={14} />
                  Google Doc
                  <ExternalLink size={10} />
                </a>
              )}
              {project.startDate && (
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--slate)',
                    opacity: 0.7,
                  }}
                >
                  <Calendar size={13} />
                  Started {formatMediumDate(project.startDate)}
                </span>
              )}
              {project.lastActivity && (
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--slate)',
                    opacity: 0.7,
                  }}
                >
                  <Clock size={13} />
                  Last activity {formatMediumDate(project.lastActivity)}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Right column: Notes (2/5) */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '16px',
              color: 'var(--ink)',
              margin: '0 0 12px 0',
            }}
          >
            Notes
          </h2>

          <div
            style={{
              background: 'var(--ice)',
              borderRadius: '12px',
              padding: '16px',
            }}
            className="detail-card"
          >
            {/* Add note input */}
            <div style={{ marginBottom: '12px' }}>
              <div className="flex gap-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleAddNote()
                    }
                  }}
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                    background: 'var(--cream)',
                    border: '1px solid rgba(201, 168, 76, 0.2)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.5,
                  }}
                />
              </div>
              {noteText.trim() && (
                <motion.button
                  type="button"
                  onClick={handleAddNote}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="cursor-pointer mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                  style={{
                    background: 'var(--gold)',
                    color: '#0f1923',
                    border: 'none',
                    fontFamily: 'var(--font-body)',
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Plus size={12} />
                  Add Note
                </motion.button>
              )}
            </div>

            {/* Notes list */}
            <div className="flex flex-col gap-2">
              <AnimatePresence mode="popLayout">
                {project.notes && project.notes.length > 0 ? (
                  [...project.notes].reverse().map((note, i) => (
                    <motion.div
                      key={note.timestamp + i}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        background: 'var(--cream)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        borderLeft: '2px solid var(--gold)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 0.5,
                          display: 'block',
                          marginBottom: '4px',
                        }}
                      >
                        {formatTimestamp(note.timestamp)}
                        {note.author && ` -- ${note.author}`}
                      </span>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '13px',
                          color: 'var(--ink)',
                          lineHeight: 1.5,
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {note.content}
                      </p>
                    </motion.div>
                  ))
                ) : (
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--slate)',
                      opacity: 0.4,
                      textAlign: 'center',
                      padding: '16px 0',
                      margin: 0,
                    }}
                  >
                    No notes yet
                  </p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Project Updates — async status posts */}
      <div id="updates" style={{ scrollMarginTop: '60px' }}>
        <ProjectUpdateFeed projectSlug={project.slug} />
      </div>

      {/* Comments from D1 */}
      <div id="comments" style={{ scrollMarginTop: '60px' }}>
        <ProjectComments projectSlug={project.slug} />
      </div>

      {/* Action items from meetings */}
      <motion.div
        id="action-items"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: '0 0 12px 0',
          }}
        >
          Action Items
        </h2>

        <div
          style={{
            background: 'var(--ice)',
            borderRadius: '12px',
            padding: '16px 20px',
          }}
          className="detail-card"
        >
          {relatedActions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {relatedActions.map((item) => (
                <motion.div
                  key={item.action.id || `${item.meetingId}-${item.action.description}`}
                  layout
                  className="flex items-start gap-3"
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
                  }}
                >
                  <motion.button
                    type="button"
                    onClick={() => item.action.id && toggleAction.mutate(item.action.id)}
                    className="cursor-pointer flex-shrink-0 mt-0.5"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: item.action.completed ? 'var(--teal)' : 'var(--slate)',
                      opacity: item.action.completed ? 1 : 0.5,
                    }}
                    whileTap={{ scale: 0.85 }}
                  >
                    {item.action.completed ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </motion.button>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        color: 'var(--ink)',
                        margin: 0,
                        lineHeight: 1.4,
                        textDecoration: item.action.completed ? 'line-through' : 'none',
                        opacity: item.action.completed ? 0.5 : 1,
                      }}
                    >
                      {item.action.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 0.5,
                        }}
                      >
                        {getPersonInfo(item.action.assignee).name}
                      </span>
                      {item.action.dueDate && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            color: 'var(--slate)',
                            opacity: 0.5,
                          }}
                        >
                          Due {formatMediumDate(item.action.dueDate)}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 0.35,
                        }}
                      >
                        from {formatMediumDate(item.meetingDate)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                color: 'var(--slate)',
                opacity: 0.4,
                textAlign: 'center',
                padding: '16px 0',
                margin: 0,
              }}
            >
              No action items linked to this project
            </p>
          )}
        </div>
      </motion.div>

      {/* Scoped dark mode styles */}
      <style>{`
        .dark .detail-card {
          background: #162535 !important;
          border: 1px solid rgba(201, 168, 76, 0.12);
        }
      `}</style>
    </>
  )
}

// ── Section Navigation ──────────────────────────────────────────
function SectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )

    for (const section of sections) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [sections])

  return (
    <div
      className="flex items-center gap-1 mb-6 pb-2 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border-light)' }}
    >
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => {
            const el = document.getElementById(s.id)
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
          style={{
            fontFamily: 'var(--font-sans)',
            color: active === s.id ? 'var(--teal)' : 'var(--slate)',
            backgroundColor: active === s.id ? 'rgba(45,138,138,0.08)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            opacity: active === s.id ? 1 : 0.6,
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
