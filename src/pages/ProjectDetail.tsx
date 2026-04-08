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
  Compass,
  FileText,
  Plus,
  Send,
  X,
  Check,
  Link2,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useProjects, useMeetingsApi, useTasks, useProjectUpdates, useRevisions } from '../hooks/useApiData'
import { useUpdateProject, useAddAgendaItem, usePostProjectUpdate, useUpdateTaskStatus, useCreateTask } from '../hooks/useMutations'
import { useUndoToast } from '../components/UndoToast'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import { formatShortDate, formatMediumDate, formatTimestamp } from '../lib/dateUtils'
import Avatar from '../components/Avatar'
import InlineSelect from '../components/InlineSelect'
import WatchButton from '../components/WatchButton'
import TaskCard from '../components/tasks/TaskCard'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import TaskDetailPanel from '../components/tasks/TaskDetailPanel'
import type { Project } from '../data/types'
import type { TaskRow } from '../lib/api'
import RevisionTracker from '../components/RevisionTracker'
import SubmissionTimeline from '../components/SubmissionTimeline'
import ConferencePrep from '../components/ConferencePrep'
import InsightPanel from '../components/InsightPanel'
import ProjectLiterature from './project/ProjectLiterature'
import ProjectActivity from './project/ProjectActivity'

type Tab = 'overview' | 'tasks' | 'revisions' | 'activity' | 'literature'

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
            fontWeight: 800,
            fontSize: '1.75rem',
            color: 'var(--ink)',
          }}
        >
          Project not found
        </h1>
        <p style={{ color: 'var(--slate)', marginTop: '0.5rem' }}>
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
  const { showUndo } = useUndoToast()
  const postUpdate = usePostProjectUpdate(project.slug)
  const { data: projectUpdates = [] } = useProjectUpdates(project.slug)
  const { isAuthenticated, user } = useAuth()
  const isPi = user?.email ? PI_EMAILS.includes(user.email) : false

  // Tabs — support ?tab= query param for deep linking
  const initialTab = (() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab && ['overview', 'tasks', 'revisions', 'activity', 'literature'].includes(tab)) return tab as Tab
    return 'overview' as Tab
  })()
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'done' | 'blocked'>('active')
  const createTask = useCreateTask()

  // Revisions for this project
  const { data: revisions = [] } = useRevisions(project.slug)

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
  const [descExpanded, setDescExpanded] = useState(false)
  const [descDraft, setDescDraft] = useState(project.description ?? '')
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Note input
  const [noteText, setNoteText] = useState('')

  // Task detail panel
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)

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
            style={{ background: cat.bg, color: cat.text, letterSpacing: '0.04em' }}
          >
            {cat.label}
          </span>

          <div className="flex items-center gap-1.5">
            <div style={{ width: 24, height: 24, flexShrink: 0 }}>
              <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="gold" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[8px]" />
            </div>
            <span style={{ fontSize: '13px', color: 'var(--slate)' }}>{pi.name}</span>
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
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <CalendarPlus size={11} />
              Agenda
            </button>
          )}

        </div>

        {/* Quick stats strip */}
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {pendingTasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--teal)', fontWeight: 500 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)' }} />
              {pendingTasks.length} active
            </span>
          )}
          {(() => {
            const overdue = pendingTasks.filter(t => t.due_date && t.due_date < new Date().toISOString().split('T')[0])
            return overdue.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--maroon)', fontWeight: 500 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--maroon)' }} />
                {overdue.length} overdue
              </span>
            ) : null
          })()}
          {completedTasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--green)', fontWeight: 500 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
              {completedTasks.length} done
            </span>
          )}
          {project.lastActivity && (
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.55 }}>
              Last activity {formatShortDate(project.lastActivity)}
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
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Add to: {nextUpcomingMeeting.title.split(':')[0]} ({formatShortDate(nextUpcomingMeeting.date)})
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
          { id: 'revisions' as Tab, label: `Revisions${revisions.length ? ` (${revisions.length})` : ''}` },
          { id: 'activity' as Tab, label: 'Activity' },
          { id: 'literature' as Tab, label: 'Literature' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
            style={{
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

      {/* Project Timeline */}
      <div className="mt-6 mb-6" style={{ padding: '0 4px' }}>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Project Timeline
          </span>
        </div>
        <ProjectTimeline
          createdAt={project.startDate}
          stage={project.stage}
          tasks={projectTasks}
          updates={projectUpdates}
        />
      </div>

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
                  style={{ background: 'var(--gold)', color: '#0f1923', border: 'none', cursor: 'pointer' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingStrategic(false)}
                  className="px-3 py-1 rounded-md text-xs"
                  style={{ color: 'var(--slate)', background: 'none', border: '1px solid var(--border-light)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.55 }}>
                  Ctrl+Enter to save
                </span>
              </div>
            </div>
          ) : project.strategic_context ? (
            <p
              style={{
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
        transition={{ duration: 0.25, delay: 0.1 }}
        style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
      >
        <h2
          style={{
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
              transition={{ duration: 0.25, ease: 'easeInOut' }}
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
                    fontSize: '10px',
                    color: isCurrent ? 'var(--gold)' : isFuture ? 'var(--slate)' : 'var(--ink)',
                    opacity: isCurrent ? 1 : isFuture ? 0.55 : 0.7,
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
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <h2
            style={{
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
                <div>
                  <p
                    onClick={() => {
                      setDescDraft(project.description ?? '')
                      setEditingDescription(true)
                    }}
                    style={{
                      fontSize: '14px',
                      color: project.description ? 'var(--ink)' : 'var(--slate)',
                      lineHeight: 1.6,
                      margin: 0,
                      cursor: 'pointer',
                      padding: '4px 0',
                      opacity: project.description ? 1 : 0.5,
                      borderBottom: '1px dashed transparent',
                      transition: 'border-color 0.2s',
                      ...(!descExpanded && project.description && project.description.length > 200 ? {
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical' as const,
                      } : {}),
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
                  {project.description && project.description.length > 200 && (
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '11px',
                        color: 'var(--teal)',
                        padding: '4px 0',
                        opacity: 0.8,
                      }}
                    >
                      {descExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Team */}
            {project.team && project.team.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
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
          transition={{ duration: 0.25, delay: 0.2 }}
        >
          <h2
            style={{
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
                    }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Plus size={12} />
                  Add Note
                </motion.button>
              )}
            </div>

            {/* Notes list — from project_updates table */}
            <div className="flex flex-col gap-2">
              <AnimatePresence mode="popLayout">
                {projectUpdates.length > 0 ? (
                  [...projectUpdates].reverse().map((update) => (
                    <motion.div
                      key={update.id}
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
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 0.7,
                          display: 'block',
                          marginBottom: '4px',
                        }}
                      >
                        {formatTimestamp(update.created_at)}
                        {update.author && ` — ${getPersonInfo(update.author).name}`}
                      </span>
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--ink)',
                          lineHeight: 1.5,
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {update.content}
                      </p>
                    </motion.div>
                  ))
                ) : (
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--slate)',
                      opacity: 0.55,
                      textAlign: 'center',
                      padding: '16px 0',
                      margin: 0,
                    }}
                  >
                    No notes yet — add one above
                  </p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Related Projects (AI Insights) */}
      <InsightPanel projectSlug={project.slug} />

      {/* Conference Prep Tracking */}
      <div style={{ marginTop: '1.5rem' }}>
        <ConferencePrep projectId={project.slug} />
      </div>

      </>)}

      {/* ── TASKS TAB ── */}
      {activeTab === 'tasks' && (
        <div className="table-container" style={{ padding: '16px 20px', marginBottom: '2rem' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {(['all', 'active', 'done', 'blocked'] as const).map(f => {
                const count = f === 'all' ? projectTasks.length : f === 'active' ? pendingTasks.length : f === 'done' ? completedTasks.length : projectTasks.filter(t => t.status === 'blocked').length
                if (f !== 'all' && count === 0) return null
                return (
                  <button
                    key={f}
                    onClick={() => setTaskFilter(f)}
                    className="text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors"
                    style={{
                      background: taskFilter === f ? 'rgba(45,138,138,0.1)' : 'none',
                      color: taskFilter === f ? 'var(--teal)' : 'var(--slate)',
                      border: `1px solid ${taskFilter === f ? 'var(--teal)' : 'var(--border-subtle)'}`,
                      cursor: 'pointer',
                      opacity: taskFilter === f ? 1 : 0.6,
                    }}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)} {count > 0 ? `(${count})` : ''}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const lines = pendingTasks.map(t => `- [ ] ${t.title || t.description}${t.due_date ? ` (due ${t.due_date})` : ''}`)
                  navigator.clipboard.writeText(lines.join('\n'))
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border"
                style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', background: 'none', cursor: 'pointer', opacity: 0.6 }}
                title="Copy task list to clipboard"
              >
                <FileText size={11} />
                Copy
              </button>
              <button
                onClick={() => setShowCreateTask(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                style={{ backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                <Plus size={13} />
                New Task
              </button>
            </div>
          </div>
          {(() => {
            const filtered = taskFilter === 'all' ? projectTasks : taskFilter === 'active' ? pendingTasks : taskFilter === 'done' ? completedTasks : projectTasks.filter(t => t.status === 'blocked')
            return filtered.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 size={32} style={{ color: 'var(--teal)', opacity: 0.3, margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', color: 'var(--slate)', opacity: 0.55 }}>
                  {taskFilter === 'active' ? 'No active tasks.' : taskFilter === 'done' ? 'No completed tasks.' : 'No tasks for this project.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={(id, status) => {
                      const prev = task.status
                      updateTaskStatus.mutate({ id, status })
                      showUndo(`Status → ${status}`, () => updateTaskStatus.mutate({ id, status: prev }))
                    }}
                    onClick={() => setSelectedTask(task)}
                  />
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── REVISIONS TAB ── */}
      {activeTab === 'revisions' && (
        <>
          {/* Submission lifecycle timeline */}
          <div className="table-container" style={{ padding: '16px 20px', marginBottom: '1rem' }}>
            <SubmissionTimeline projectId={project.slug} />
          </div>

          {/* Existing revision tracker (reviewer comments) */}
          <div className="table-container" style={{ padding: '16px 20px', marginBottom: '2rem' }}>
            <RevisionTracker projectId={project.slug} />
          </div>
        </>
      )}

      {/* ── ACTIVITY TAB ── */}
      {activeTab === 'activity' && (
        <ProjectActivity project={project} isPi={isPi} />
      )}

      {/* ── LITERATURE TAB ── */}
      {activeTab === 'literature' && (
        <ProjectLiterature projectSlug={project.slug} isPi={isPi} />
      )}

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* Create Task Modal — pre-filled with project */}
      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        onCreate={(task) => {
          createTask.mutate({ ...task, project_id: project.slug })
          setShowCreateTask(false)
        }}
      />

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

// ── Project Timeline ─────────────────────────────────────
function ProjectTimeline({ createdAt, stage, tasks, updates }: {
  createdAt?: string
  stage?: string
  tasks: { completed_at: string | null; title: string; status: string }[]
  updates: { created_at: string; content: string; author?: string }[]
}) {
  const events = useMemo(() => {
    const items: { date: string; label: string; type: 'created' | 'stage' | 'task' | 'update'; color: string }[] = []

    if (createdAt) {
      items.push({ date: createdAt, label: 'Project created', type: 'created', color: 'var(--gold)' })
    }

    // Completed tasks as milestones
    for (const t of tasks) {
      if (t.completed_at) {
        items.push({ date: t.completed_at, label: t.title, type: 'task', color: 'var(--green)' })
      }
    }

    // Project updates as milestones
    for (const u of updates) {
      items.push({
        date: u.created_at,
        label: u.content.slice(0, 60) + (u.content.length > 60 ? '...' : ''),
        type: 'update',
        color: 'var(--teal)',
      })
    }

    // Current stage marker
    if (stage) {
      items.push({ date: new Date().toISOString(), label: `Current: ${stage}`, type: 'stage', color: 'var(--gold)' })
    }

    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(-8) // show last 8 events
  }, [createdAt, stage, tasks, updates])

  if (events.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.55, textAlign: 'center', padding: '12px 0' }}>
        No timeline events yet.
      </p>
    )
  }

  return (
    <div className="relative" style={{ paddingLeft: '20px' }}>
      {/* Vertical line */}
      <div
        style={{
          position: 'absolute',
          left: '7px',
          top: '4px',
          bottom: '4px',
          width: '2px',
          background: 'var(--border-subtle)',
          borderRadius: '1px',
        }}
      />
      <div className="flex flex-col gap-3">
        {events.map((event, i) => (
          <div key={i} className="flex items-start gap-3 relative">
            {/* Dot */}
            <div
              style={{
                position: 'absolute',
                left: '-17px',
                top: '5px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: event.color,
                border: '2px solid var(--cream)',
                zIndex: 1,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '12px', color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>
                {event.label}
              </p>
              <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.55 }}>
                {formatShortDate(event.date)}
                {event.type === 'task' && <span style={{ color: 'var(--green)', marginLeft: '6px' }}>completed</span>}
                {event.type === 'update' && <span style={{ color: 'var(--teal)', marginLeft: '6px' }}>note</span>}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
