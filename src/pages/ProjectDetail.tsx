import { useState, useRef, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  FileText,
  Plus,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useData } from '../hooks/useLocalData'
import { directors, getAllMembers } from '../data/team'
import Avatar from '../components/Avatar'
import type { Project, Meeting, ActionItem } from '../data/types'

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { projects, meetings, updateProject, addProjectNote, toggleActionItem } = useData()

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
        <ProjectDetailInner
          project={project}
          meetings={meetings}
          updateProject={updateProject}
          addProjectNote={addProjectNote}
          toggleActionItem={toggleActionItem}
        />
      </div>
    </div>
  )
}

interface InnerProps {
  project: Project
  meetings: Meeting[]
  updateProject: (slug: string, updates: Partial<Project>) => void
  addProjectNote: (slug: string, note: string, author?: string) => void
  toggleActionItem: (meetingId: string, actionIndex: number) => void
}

function ProjectDetailInner({
  project,
  meetings,
  updateProject,
  addProjectNote,
  toggleActionItem,
}: InnerProps) {
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

  // Collect action items from meetings that reference this project
  const relatedActions = useMemo(() => {
    const items: { meetingId: string; meetingTitle: string; meetingDate: string; action: ActionItem; actionIndex: number }[] = []
    for (const m of meetings) {
      if (!m.actionItems) continue
      m.actionItems.forEach((a: ActionItem, i: number) => {
        if (a.projectSlug === project.title) {
          items.push({
            meetingId: m.id,
            meetingTitle: m.title,
            meetingDate: m.date,
            action: a,
            actionIndex: i,
          })
        }
      })
    }
    // Pending first, then completed
    items.sort((a, b) => {
      if (a.action.completed !== b.action.completed) return a.action.completed ? 1 : -1
      return b.meetingDate.localeCompare(a.meetingDate)
    })
    return items
  }, [meetings, project.title])

  function handleStageClick(stage: Stage) {
    if (stage === project.stage) return
    setConfirmStage(stage)
  }

  function confirmStageChange() {
    if (!confirmStage) return
    updateProject(project.slug, { stage: confirmStage })
    setConfirmStage(null)
  }

  function handleDescSave() {
    setEditingDescription(false)
    if (descDraft.trim() !== (project.description ?? '').trim()) {
      updateProject(project.slug, { description: descDraft.trim() || undefined })
    }
  }

  function handleAddNote() {
    const text = noteText.trim()
    if (!text) return
    addProjectNote(project.slug, text)
    setNoteText('')
  }

  return (
    <>
      {/* Back link */}
      <div style={{ paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
        <Link
          to="/projects"
          className="inline-flex items-center gap-2"
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
        </div>

        {/* Title + PI */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
          <div style={{ flex: 1 }}>
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
            marginBottom: '2rem',
          }}
        />
      </motion.div>

      {/* Stage indicator */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        style={{ marginBottom: '2.5rem' }}
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
                  Started {formatDate(project.startDate)}
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
                  Last activity {formatDate(project.lastActivity)}
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

      {/* Action items from meetings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        style={{ marginBottom: '2.5rem' }}
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
                  key={`${item.meetingId}-${item.actionIndex}`}
                  layout
                  className="flex items-start gap-3"
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
                  }}
                >
                  <motion.button
                    type="button"
                    onClick={() => toggleActionItem(item.meetingId, item.actionIndex)}
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
                          Due {formatDate(item.action.dueDate)}
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
                        from {formatDate(item.meetingDate)}
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
        }
      `}</style>
    </>
  )
}
