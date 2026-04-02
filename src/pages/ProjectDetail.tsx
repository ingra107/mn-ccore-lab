import { useState, useRef, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  CalendarPlus,
  Clock,
  CheckCircle2,
  Circle,
  Compass,
  FileText,
  Plus,
  Send,
  X,
  Link2,
  Check,
  BookOpen,
  GitBranch,
  ArrowRight,
  Trash2,
  Scale,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useProjects, useMeetingsApi, useActionItems, useProjectPapers, useProjectDependencies, useDecisions, useTasks } from '../hooks/useApiData'
import type { DecisionRow } from '../hooks/useApiData'
import { useUpdateProject, useAddAgendaItem, useToggleActionItem, usePostProjectUpdate, useUnlinkPaper, useCreateDependency, useDeleteDependency, useUpdateTaskStatus } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import { formatMediumDate, formatTimestamp } from '../lib/dateUtils'
import Avatar from '../components/Avatar'
import InlineSelect from '../components/InlineSelect'
import WatchButton from '../components/WatchButton'
import ProjectComments from '../components/ProjectComments'
import ProjectUpdateFeed from '../components/ProjectUpdateFeed'
import TaskCard from '../components/tasks/TaskCard'
import type { Project, ActionItem } from '../data/types'

type Tab = 'overview' | 'tasks' | 'activity' | 'literature'

const PI_EMAILS = ['ningraha@umn.edu', 'sandb029@umn.edu', 'nicholas.ingraham@gmail.com']

const STAGES = ['Idea', 'Data Collection', 'Analysis', 'Writing', 'Review', 'Published'] as const
type Stage = (typeof STAGES)[number]

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  clif: { bg: 'var(--maroon)', text: '#ffffff', label: 'CLIF' },
  lab: { bg: 'var(--teal)', text: '#ffffff', label: 'Lab' },
  nate: { bg: 'var(--gold)', text: '#0f1923', label: 'Mesfin' },
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
            fontFamily: 'var(--font-sans)',
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

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Tasks for this project
  const { data: projectTasks = [] } = useTasks({ project: project.slug })
  const updateTaskStatus = useUpdateTaskStatus()
  const pendingTasks = projectTasks.filter((t) => !t.completed)
  const completedTasks = projectTasks.filter((t) => t.completed)

  // Copy link
  const [copied, setCopied] = useState(false)
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Strategic Context ("Why This Matters Now") editing
  const [editingStrategic, setEditingStrategic] = useState(false)
  const [strategicDraft, setStrategicDraft] = useState(project.strategic_context ?? '')
  const { data: apiMeetings = [] } = useMeetingsApi()
  const { data: actionItemRows = [] } = useActionItems()
  const { data: papers = [] } = useProjectPapers(project.slug)
  const unlinkPaper = useUnlinkPaper()

  const cat = CATEGORY_COLORS[project.category] ?? {
    bg: 'var(--slate)',
    text: '#ffffff',
    label: project.category,
  }
  const pi = getPersonInfo(project.pi)

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
      <Breadcrumb backTo="/projects" backLabel="Projects" current={project.title} />

      {/* ── Compact Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{ marginBottom: '16px' }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {project.title}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleCopyLink}
              className="p-1.5 rounded-md transition-colors hover:bg-black/5"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--teal)' : 'var(--slate)', opacity: copied ? 1 : 0.3 }}
              title={copied ? 'Link copied!' : 'Copy link'}
            >
              {copied ? <Check size={14} /> : <Link2 size={14} />}
            </button>
            <WatchButton id={project.slug} type="project" label={project.title} slug={project.slug} />
          </div>
        </div>

        {/* Meta row: category dot, PI, status, stage, agenda button */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: cat.bg, color: cat.text, fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}
          >
            {cat.label}
          </span>

          <div className="flex items-center gap-1.5">
            <div style={{ width: 24, height: 24, flexShrink: 0 }}>
              <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="gold" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[8px]" />
            </div>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--slate)' }}>{pi.name}</span>
          </div>

          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

          <InlineSelect
            value={project.status || 'Active'}
            options={[
              { value: 'Active', label: 'Active', color: 'var(--green)' },
              { value: 'Pending', label: 'Pending', color: 'var(--gold)' },
              { value: 'Completed', label: 'Done', color: 'var(--slate)' },
            ]}
            onChange={(val) => d1Update.mutate({ status: val } as Partial<Project>)}
          />

          <InlineSelect
            value={project.stage || 'Idea'}
            options={STAGES.map((s) => ({ value: s, label: s }))}
            onChange={(val) => d1Update.mutate({ stage: val } as Partial<Project>)}
          />

          {isAuthenticated && nextUpcomingMeeting && (
            <button
              onClick={() => setShowAgendaForm(!showAgendaForm)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]"
              style={{
                background: showAgendaForm ? 'var(--gold)' : 'rgba(201,168,76,0.08)',
                color: showAgendaForm ? '#0f1923' : 'var(--gold)',
                border: '1px solid rgba(201,168,76,0.2)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <CalendarPlus size={11} />
              Agenda
            </button>
          )}

          {pendingTasks.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', fontWeight: 500 }}
            >
              <CheckCircle2 size={12} />
              {pendingTasks.length} task{pendingTasks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </motion.div>

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
                      fontFamily: 'var(--font-sans)',
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

      {/* Tab navigation */}
      <div
        className="flex items-center gap-1 mb-6 pb-2 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        {([
          { id: 'overview' as Tab, label: 'Overview' },
          { id: 'tasks' as Tab, label: `Tasks${pendingTasks.length ? ` (${pendingTasks.length})` : ''}` },
          { id: 'activity' as Tab, label: 'Activity' },
          { id: 'literature' as Tab, label: 'Literature' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
            style={{
              fontFamily: 'var(--font-sans)',
              color: activeTab === tab.id ? 'var(--teal)' : 'var(--slate)',
              backgroundColor: activeTab === tab.id ? 'rgba(45,138,138,0.08)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              opacity: activeTab === tab.id ? 1 : 0.6,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (<>

      {/* Strategic Context — Why This Matters Now */}
      {(project.strategic_context || isPi) && (
        <div
          className="mt-6 p-4 rounded-xl"
          style={{
            background: 'rgba(201, 168, 76, 0.06)',
            border: '1px solid rgba(201, 168, 76, 0.15)',
            marginBottom: '1.5rem',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Compass size={14} style={{ color: 'var(--gold)' }} />
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--gold)',
                  fontWeight: 600,
                }}
              >
                Why This Matters Now
              </span>
            </div>
            {isPi && !editingStrategic && (
              <button
                onClick={() => { setStrategicDraft(project.strategic_context ?? ''); setEditingStrategic(true) }}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--slate)',
                  opacity: 0.5,
                  background: 'none',
                  border: '1px solid var(--border-light)',
                  cursor: 'pointer',
                }}
              >
                {project.strategic_context ? 'Edit' : 'Add context'}
              </button>
            )}
          </div>
          {editingStrategic ? (
            <div>
              <textarea
                value={strategicDraft}
                onChange={(e) => setStrategicDraft(e.target.value)}
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
                  borderRadius: '8px',
                  padding: '8px 12px',
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    d1Update.mutate({ strategic_context: strategicDraft.trim() || undefined })
                    setEditingStrategic(false)
                  }
                  if (e.key === 'Escape') {
                    setEditingStrategic(false)
                  }
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => { d1Update.mutate({ strategic_context: strategicDraft.trim() || undefined }); setEditingStrategic(false) }}
                  className="px-3 py-1 rounded-md text-xs font-medium"
                  style={{ fontFamily: 'var(--font-body)', background: 'var(--gold)', color: '#0f1923', border: 'none', cursor: 'pointer' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingStrategic(false)}
                  className="px-3 py-1 rounded-md text-xs"
                  style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', background: 'none', border: '1px solid var(--border-light)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <span className="text-[10px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>
                  Ctrl+Enter to save
                </span>
              </div>
            </div>
          ) : project.strategic_context ? (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--ink)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {project.strategic_context}
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
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
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
                    fontFamily: 'var(--font-sans)',
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
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
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
                  fontFamily: 'var(--font-sans)',
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
                    fontFamily: 'var(--font-sans)',
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
                    fontFamily: 'var(--font-sans)',
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
                    fontFamily: 'var(--font-sans)',
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
                    fontFamily: 'var(--font-sans)',
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
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
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
                          fontFamily: 'var(--font-sans)',
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

      </>)}

      {/* ── TASKS TAB ── */}
      {activeTab === 'tasks' && (
        <div className="table-container" style={{ padding: '16px 20px', marginBottom: '2rem' }}>
          {pendingTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 size={32} style={{ color: 'var(--teal)', opacity: 0.3, margin: '0 auto 12px' }} />
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--slate)', opacity: 0.5 }}>
                No tasks for this project
              </p>
            </div>
          ) : (
            <>
              {pendingTasks.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Active ({pendingTasks.length})
                  </span>
                  {pendingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStatusChange={(id, status) => updateTaskStatus.mutate({ id, status })}
                    />
                  ))}
                </div>
              )}
              {completedTasks.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.35, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Done ({completedTasks.length})
                  </span>
                  {completedTasks.slice(0, 5).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStatusChange={(id, status) => updateTaskStatus.mutate({ id, status })}
                    />
                  ))}
                  {completedTasks.length > 5 && (
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--slate)', opacity: 0.4, paddingLeft: '4px' }}>
                      +{completedTasks.length - 5} more completed
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ACTIVITY TAB ── */}
      {activeTab === 'activity' && (<>

      {/* Decisions */}
      <ProjectDecisionsSection projectSlug={project.slug} />

      {/* Dependencies */}
      <ProjectDependenciesSection project={project} isPi={isPi} />

      {/* Project Updates — async status posts */}
      <div id="updates" style={{ scrollMarginTop: '60px' }}>
        <ProjectUpdateFeed projectSlug={project.slug} />
      </div>

      {/* Comments from D1 */}
      <div id="comments" style={{ scrollMarginTop: '60px' }}>
        <ProjectComments projectSlug={project.slug} />
      </div>

      </>)}

      {/* ── LITERATURE TAB ── */}
      {activeTab === 'literature' && (
      <div style={{ marginBottom: '2.5rem' }}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={16} style={{ color: 'var(--gold)' }} />
          <h2
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '16px',
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            Related Literature
          </h2>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              color: 'var(--slate)',
              opacity: 0.6,
            }}
          >
            {papers.length}
          </span>
        </div>
        <div
          style={{
            background: 'var(--ice)',
            borderRadius: '12px',
            padding: '16px 20px',
          }}
          className="detail-card"
        >
          {papers.length > 0 ? (
            <div>
              {papers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-3 py-2.5"
                  style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.06)' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        color: 'var(--ink)',
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      {p.title || 'Untitled paper'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {p.journal && (
                        <span
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: '10px',
                            color: 'var(--slate)',
                            opacity: 0.7,
                          }}
                        >
                          {p.journal}
                        </span>
                      )}
                      {p.pub_date && (
                        <span
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: '10px',
                            color: 'var(--slate)',
                            opacity: 0.5,
                          }}
                        >
                          {p.pub_date}
                        </span>
                      )}
                    </div>
                    {p.note && (
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '11px',
                          color: 'var(--teal)',
                          fontStyle: 'italic',
                          margin: '4px 0 0',
                        }}
                      >
                        {p.note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {p.doi && (
                      <a
                        href={`https://doi.org/${p.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs"
                        style={{
                          color: 'var(--gold)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '10px',
                          textDecoration: 'none',
                        }}
                        title="View via DOI"
                      >
                        <Link2 size={11} />
                        DOI
                      </a>
                    )}
                    {isPi && (
                      <button
                        onClick={() => unlinkPaper.mutate({ id: p.id, project_slug: project.slug })}
                        className="cursor-pointer p-1 rounded transition-colors"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--slate)',
                          opacity: 0.3,
                        }}
                        title="Remove link"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
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
              No papers linked yet. Link papers from the Research Digest.
            </p>
          )}
        </div>
      </div>
      )}

      {/* Action items — rendered inside Activity tab */}
      {activeTab === 'activity' && (<>
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
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
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
                          fontFamily: 'var(--font-sans)',
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
                            fontFamily: 'var(--font-sans)',
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
                          fontFamily: 'var(--font-sans)',
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

      </>)}

      {/* Scoped dark mode styles */}
      <style>{`
        .dark .detail-card {
          background: #111820 !important;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
      `}</style>
    </>
  )
}

// ── Project Decisions Section ────────────────────────────────────

function ProjectDecisionsSection({ projectSlug }: { projectSlug: string }) {
  const { data: decisions = [] } = useDecisions(projectSlug)

  if (decisions.length === 0) return null

  return (
    <motion.div
      id="decisions"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          <Scale size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px', color: 'var(--gold)' }} />
          Decisions
        </h2>
        <Link
          to="/decisions"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            color: 'var(--teal)',
            textDecoration: 'none',
          }}
        >
          View all
        </Link>
      </div>

      <div
        style={{
          background: 'var(--ice)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        <div className="flex flex-col gap-3">
          {decisions.slice(0, 5).map((decision: DecisionRow) => (
            <div
              key={decision.id}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Scale size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                    fontWeight: 600,
                  }}
                >
                  {decision.title}
                </span>
                {decision.outcome_status !== 'pending' && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      color: decision.outcome_status === 'recorded' ? 'var(--teal)' : 'var(--gold)',
                      backgroundColor: decision.outcome_status === 'recorded' ? 'rgba(45,138,138,0.08)' : 'rgba(201,168,76,0.08)',
                    }}
                  >
                    {decision.outcome_status}
                  </span>
                )}
              </div>
              {decision.rationale && (
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    color: 'var(--slate)',
                    lineHeight: 1.5,
                    margin: '0 0 0 20px',
                  }}
                >
                  {decision.rationale.length > 120 ? decision.rationale.slice(0, 120) + '...' : decision.rationale}
                </p>
              )}
              {decision.outcome && (
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    color: 'var(--teal)',
                    margin: '4px 0 0 20px',
                    fontStyle: 'italic',
                  }}
                >
                  Outcome: {decision.outcome.length > 80 ? decision.outcome.slice(0, 80) + '...' : decision.outcome}
                </p>
              )}
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 0.5,
                  marginLeft: '20px',
                  display: 'inline-block',
                  marginTop: '4px',
                }}
              >
                {new Date(decision.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {decision.decided_by && ` -- ${decision.decided_by}`}
              </span>
            </div>
          ))}
          {decisions.length > 5 && (
            <Link
              to="/decisions"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                color: 'var(--teal)',
                textDecoration: 'none',
                textAlign: 'center',
                padding: '8px 0',
              }}
            >
              +{decisions.length - 5} more decisions
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Dependencies Section ────────────────────────────────────────

const REL_COLORS: Record<string, string> = {
  feeds_into: 'var(--gold)',
  blocks: 'var(--maroon)',
  shares_data: 'var(--teal)',
  related_to: 'var(--slate)',
}

const REL_LABELS: Record<string, string> = {
  feeds_into: 'feeds into',
  blocks: 'blocks',
  shares_data: 'shares data with',
  related_to: 'related to',
}

const REL_OPTIONS = [
  { value: 'feeds_into', label: 'Feeds into' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'shares_data', label: 'Shares data' },
  { value: 'related_to', label: 'Related to' },
]

function ProjectDependenciesSection({ project, isPi }: { project: Project; isPi: boolean }) {
  const { data: deps = [] } = useProjectDependencies(project.slug)
  const { data: allProjects = [] } = useProjects()
  const createDep = useCreateDependency()
  const deleteDep = useDeleteDependency()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newTarget, setNewTarget] = useState('')
  const [newRelType, setNewRelType] = useState('feeds_into')
  const [newDirection, setNewDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [newNote, setNewNote] = useState('')

  // Split into incoming and outgoing
  const outgoing = deps.filter((d) => d.from_slug === project.slug)
  const incoming = deps.filter((d) => d.to_slug === project.slug)

  // Available targets (exclude self and already connected)
  const connectedSlugs = new Set(deps.map((d) => d.from_slug === project.slug ? d.to_slug : d.from_slug))
  const availableTargets = allProjects.filter(
    (p) => p.slug !== project.slug && !connectedSlugs.has(p.slug)
  )

  function handleAdd() {
    if (!newTarget) return
    const input = newDirection === 'outgoing'
      ? { from_slug: project.slug, to_slug: newTarget, relationship_type: newRelType, note: newNote || undefined }
      : { from_slug: newTarget, to_slug: project.slug, relationship_type: newRelType, note: newNote || undefined }

    createDep.mutate(input)
    setNewTarget('')
    setNewNote('')
    setShowAddForm(false)
  }

  function getProjectTitle(slug: string): string {
    const p = allProjects.find((pr) => pr.slug === slug)
    return p?.title || slug
  }

  return (
    <motion.div
      id="dependencies"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          <GitBranch size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px', color: 'var(--teal)' }} />
          Dependencies
        </h2>
        {isPi && !showAddForm && (
          <motion.button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              background: 'rgba(45, 138, 138, 0.08)',
              color: 'var(--teal)',
              border: '1px solid rgba(45, 138, 138, 0.2)',
            }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus size={12} />
            Add dependency
          </motion.button>
        )}
      </div>

      {/* Add dependency form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginBottom: '12px' }}
          >
            <div
              style={{
                background: 'var(--ice)',
                borderRadius: '10px',
                padding: '14px 16px',
                border: '1px solid rgba(45, 138, 138, 0.15)',
              }}
              className="detail-card"
            >
              <div className="flex flex-wrap gap-2 items-end mb-3">
                {/* Direction */}
                <div>
                  <label
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Direction
                  </label>
                  <select
                    value={newDirection}
                    onChange={(e) => setNewDirection(e.target.value as 'outgoing' | 'incoming')}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      outline: 'none',
                    }}
                  >
                    <option value="outgoing">This project ...</option>
                    <option value="incoming">... feeds this project</option>
                  </select>
                </div>

                {/* Relationship type */}
                <div>
                  <label
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Relationship
                  </label>
                  <select
                    value={newRelType}
                    onChange={(e) => setNewRelType(e.target.value)}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      outline: 'none',
                    }}
                  >
                    {REL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Target project */}
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Project
                  </label>
                  <select
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    style={{
                      width: '100%',
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      outline: 'none',
                    }}
                  >
                    <option value="">Select a project...</option>
                    {availableTargets.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Note */}
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Optional note..."
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  border: '1px solid rgba(201, 168, 76, 0.15)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  outline: 'none',
                  marginBottom: '10px',
                }}
              />

              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newTarget}
                  className="cursor-pointer px-3 py-1.5 rounded-md text-xs font-medium"
                  style={{
                    background: newTarget ? 'var(--teal)' : 'var(--ice)',
                    color: newTarget ? '#ffffff' : 'var(--slate)',
                    border: 'none',
                    fontFamily: 'var(--font-body)',
                    opacity: newTarget ? 1 : 0.5,
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  Add
                </motion.button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewTarget(''); setNewNote('') }}
                  className="px-3 py-1.5 rounded-md text-xs"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: 'var(--slate)',
                    background: 'none',
                    border: '1px solid var(--border-light)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dependency list */}
      <div
        style={{
          background: 'var(--ice)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        {outgoing.length === 0 && incoming.length === 0 ? (
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
            No dependencies linked to this project
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Outgoing */}
            {outgoing.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-3"
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '10px',
                    color: REL_COLORS[dep.relationship_type] || 'var(--slate)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {REL_LABELS[dep.relationship_type] || dep.relationship_type}
                </span>
                <ArrowRight size={12} style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }} />
                <Link
                  to={`/projects/${dep.to_slug}`}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                    textDecoration: 'none',
                    flex: 1,
                  }}
                >
                  {getProjectTitle(dep.to_slug)}
                </Link>
                {dep.note && (
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.5,
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dep.note}
                  </span>
                )}
                {isPi && (
                  <motion.button
                    type="button"
                    onClick={() => deleteDep.mutate(dep.id)}
                    className="cursor-pointer flex-shrink-0 p-1 rounded"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--slate)',
                      opacity: 0.3,
                    }}
                    whileHover={{ opacity: 0.8 }}
                    whileTap={{ scale: 0.9 }}
                    title="Remove dependency"
                  >
                    <Trash2 size={12} />
                  </motion.button>
                )}
              </div>
            ))}

            {/* Incoming */}
            {incoming.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-3"
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
                }}
              >
                <Link
                  to={`/projects/${dep.from_slug}`}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                    textDecoration: 'none',
                  }}
                >
                  {getProjectTitle(dep.from_slug)}
                </Link>
                <ArrowRight size={12} style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }} />
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '10px',
                    color: REL_COLORS[dep.relationship_type] || 'var(--slate)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {REL_LABELS[dep.relationship_type] || dep.relationship_type}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--slate)',
                    opacity: 0.6,
                    flex: 1,
                  }}
                >
                  this project
                </span>
                {dep.note && (
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.5,
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dep.note}
                  </span>
                )}
                {isPi && (
                  <motion.button
                    type="button"
                    onClick={() => deleteDep.mutate(dep.id)}
                    className="cursor-pointer flex-shrink-0 p-1 rounded"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--slate)',
                      opacity: 0.3,
                    }}
                    whileHover={{ opacity: 0.8 }}
                    whileTap={{ scale: 0.9 }}
                    title="Remove dependency"
                  >
                    <Trash2 size={12} />
                  </motion.button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

