import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import { stageIndex, toApiStage } from '../lib/stageNormalize'
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
  FolderOpen,
  MoreVertical,
  Archive,
  Trash2,
  Copy as CopyIcon,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useProjects, useMeetingsApi, useTasks, useProjectUpdates, useRevisions, useComments, useProjectPapers } from '../hooks/useApiData'
import { useUpdateProject, useAddAgendaItem, useUpdateTaskStatus, useUpdateTask, useBulkUpdateTasks, useCreateTask } from '../hooks/useMutations'
import { useUndoToast } from '../components/UndoToast'
import BulkActionToolbar from '../components/tasks/BulkActionToolbar'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import TypingIndicator from '../components/TypingIndicator'
import { formatShortDate, formatMediumDate, localDateKey } from '../lib/dateUtils'
import Avatar from '../components/Avatar'
import InlineSelect from '../components/InlineSelect'
import InlineAssigneePicker from '../components/InlineAssigneePicker'
import CategoryIcon from '../components/CategoryIcon'
import WatchButton from '../components/WatchButton'
import TaskCard from '../components/tasks/TaskCard'
import TaskGridView from '../components/tasks/TaskGridView'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import TaskDetailPanel from '../components/tasks/TaskDetailPanel'
import EntityNotFound from '../components/EntityNotFound'
import type { Project } from '../data/types'
import type { TaskRow } from '../lib/api'
import RevisionTracker from '../components/RevisionTracker'
import KeyLinksEditor from '../components/KeyLinksEditor'
import WorkOnActions from '../components/WorkOnActions'
import LinkifiedText from '../components/LinkifiedText'
import FileUpload from '../components/FileUpload'
import PresenceAvatars from '../components/PresenceAvatars'
import { usePresence, useTyping, useIntentBroadcast, type Intent } from '../hooks/usePresence'
import { useIsMobile } from '../hooks/useIsMobile'
import { useComposeSheet } from '../hooks/useComposeSheet'
import SubmissionTimeline from '../components/SubmissionTimeline'
import ConferencePrep from '../components/ConferencePrep'
import InsightPanel from '../components/InsightPanel'
import ProjectLiterature from './project/ProjectLiterature'
import ActivityStream, { type StreamFilter } from '../components/project/ActivityStream'
import ProjectDecisions from './project/ProjectDecisions'
import ProjectDependencies from './project/ProjectDependencies'
import SmartCompose from '../components/SmartCompose'
import ProjectDocuments from './project/ProjectDocuments'
import { PATHS } from '../constants/paths'
import { CATEGORY_OPTIONS } from '../constants/categories'
import { useOpenParam } from '../hooks/useOpenParam'
import EmptyStateArt from '../components/EmptyStateArt'
import EmptyState from '../components/EmptyState'

// P2-5: notes + comments collapsed into the single chronological `activity`
// stream (Notes / Comments / All are filters over it, not separate tabs).
type Tab = 'overview' | 'tasks' | 'files' | 'activity' | 'revisions' | 'literature'

// Values are D1 lowercase canonical; labels are Title Case for display.
const STAGES = ['idea', 'data_collection', 'analysis', 'writing', 'review', 'revisions', 'published'] as const
type Stage = (typeof STAGES)[number]
const STAGE_LABELS: Record<Stage, string> = {
  idea: 'Idea',
  data_collection: 'Data Collection',
  analysis: 'Analysis',
  writing: 'Writing',
  review: 'Review',
  revisions: 'Revisions',
  published: 'Published',
}

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: projects = [], isLoading, isError } = useProjects()

  const project = projects.find((p) => p.slug === slug)

  usePageMeta(
    project ? `${project.title} | MN-CCORE` : 'Project Not Found | MN-CCORE',
    project?.description ?? 'MN-CCORE research project details.',
    {
      ogType: 'article',
      ogImage: slug ? `https://mn-ccore-lab.pages.dev/og/project/${slug}` : undefined,
    },
  )

  // Still fetching — don't render "not found" prematurely
  if (isLoading) {
    return (
      <div className="content-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <div style={{ height: '2rem', width: '12rem', borderRadius: 'var(--radius-lg)', background: 'var(--border-subtle)', marginBottom: '1.5rem' }} />
        <div style={{ height: '2rem', width: '60%', borderRadius: 'var(--radius-lg)', background: 'var(--border-subtle)', marginBottom: '0.75rem' }} />
        <div style={{ height: '1rem', width: '40%', borderRadius: 'var(--radius-lg)', background: 'var(--border-subtle)' }} />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="content-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <Link
          to={PATHS.projects}
          className="inline-flex items-center gap-2 mb-6"
          style={{ fontSize: '14px', color: 'var(--slate)', textDecoration: 'none' }}
        >
          <ArrowLeft size={16} />
          Back to Pipeline
        </Link>
        <EmptyStateArt variant="generic" style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
        <h1 style={{ fontWeight: 600, fontSize: '1.5rem', color: 'var(--ink)', marginBottom: '0.5rem' }}>
          Could not load project
        </h1>
        <p style={{ color: 'var(--slate)', marginBottom: '1.25rem' }}>
          There was a problem fetching the project data. Check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '6px 16px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--teal-solid)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!project) {
    return (
      <EntityNotFound
        entityLabel="Project"
        reference={slug}
        artVariant="grants"
        backTo={{ to: PATHS.projects, label: 'Back to Pipeline' }}
        siblings={projects.slice(0, 5).map((p) => ({ label: p.title, to: PATHS.project(p.slug) }))}
      />
    )
  }

  return (
    <div style={{ minHeight: '100dvh' }}>
      <div className="content-container" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
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
  const { showUndo, showSuccess } = useUndoToast()
  const { data: projectUpdates = [] } = useProjectUpdates(project.slug)
  const { data: projectComments = [] } = useComments(project.slug)
  const { isAuthenticated, user } = useAuth()
  const isPi = user?.isPi ?? false

  // Tabs — support ?tab= query param for deep linking + write-back on switch (PD-2).
  // P2-5: legacy ?tab=notes / ?tab=comments deep-links resolve to the unified
  // `activity` tab with the matching stream filter pre-selected.
  const [searchParams, setSearchParams] = useSearchParams()
  const [streamFilter, setStreamFilter] = useState<StreamFilter>(() => {
    const tab = searchParams.get('tab')
    if (tab === 'notes') return 'notes'
    if (tab === 'comments') return 'comments'
    return 'all'
  })
  const initialTab = (() => {
    const tab = searchParams.get('tab')
    if (tab === 'notes' || tab === 'comments') return 'activity' as Tab
    if (tab && ['overview', 'tasks', 'files', 'activity', 'revisions', 'literature'].includes(tab)) return tab as Tab
    return 'overview' as Tab
  })()
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab)
  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab)
    const next = new URLSearchParams(searchParams)
    if (tab === 'overview') {
      next.delete('tab')
    } else {
      next.set('tab', tab)
    }
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  // Jump to the activity stream pre-filtered (used by the Recent-activity card).
  const goToStream = useCallback((filter: StreamFilter) => {
    setStreamFilter(filter)
    setActiveTab('activity')
  }, [setActiveTab])
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'done' | 'blocked'>('active')
  const createTask = useCreateTask()

  // Revisions for this project
  const { data: revisions = [] } = useRevisions(project.slug)

  // Tab counts (PD-12)
  const { data: papers = [] } = useProjectPapers(project.slug)
  const { data: filesData = [] } = useQuery<Array<unknown>>({
    queryKey: ['attachments', 'project', project.slug],
    queryFn: async () => {
      const res = await fetch(`/api/files?entity_type=project&entity_id=${project.slug}`)
      const json = await res.json() as { data: Array<unknown> }
      return json.data || []
    },
  })

  // Tasks for this project
  const { data: projectTasks = [] } = useTasks({ project: project.slug })
  const updateTaskStatus = useUpdateTaskStatus()
  const updateTask = useUpdateTask()
  const bulkUpdate = useBulkUpdateTasks()
  const pendingTasks = projectTasks.filter((t) => !t.completed)
  const completedTasks = projectTasks.filter((t) => t.completed)

  // Multi-select for tasks tab
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const handleFieldChange = (id: string, field: string, value: unknown) => {
    updateTask.mutate({ id, fields: { [field]: value } })
  }

  const handleBulkAction = (action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'snooze' | 'status', value?: string) => {
    if (action === 'snooze') {
      const days = parseInt(value || '1', 10)
      // S2: capture prior due dates before mutating so Undo restores the exact
      // pre-snooze values; report tasks skipped for having no due date.
      const prior: Array<{ id: string; due_date: string }> = []
      let skipped = 0
      for (const id of selectedIds) {
        const task = projectTasks.find(t => t.id === id)
        if (!task?.due_date) { skipped++; continue }
        prior.push({ id, due_date: task.due_date })
        const d = new Date(task.due_date + 'T12:00:00')
        d.setDate(d.getDate() + days)
        const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        handleFieldChange(id, 'due_date', newDate)
      }
      const snoozedLabel = `${prior.length} snoozed +${days}d`
      const skippedLabel = skipped > 0 ? ` · ${skipped} skipped (no due date)` : ''
      showUndo(`${snoozedLabel}${skippedLabel}`, () => {
        for (const p of prior) handleFieldChange(p.id, 'due_date', p.due_date)
      })
      setSelectedIds(new Set())
      return
    }
    bulkUpdate.mutate({ ids: [...selectedIds], action, value }, {
      onSuccess: () => setSelectedIds(new Set()),
    })
  }

  // Copy link
  const [copied, setCopied] = useState(false)
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  // S21: tasks-tab "Copy task list" button — flip-to-check feedback like its
  // siblings (was zero-feedback).
  const [tasksCopied, setTasksCopied] = useState(false)

  // Action menu (archive / delete / duplicate) — PD-7
  const navigate = useNavigate()
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const isArchived = project.status === 'done'
  const handleArchiveProject = () => {
    if (isArchived) return
    const prevStatus = project.status
    d1Update.mutate({ status: 'done' } as Partial<Project>)
    showUndo('Project archived', () => d1Update.mutate({ status: prevStatus } as Partial<Project>))
    setActionMenuOpen(false)
  }
  const handleDeleteProject = async () => {
    if (!window.confirm(`Delete project "${project.title}"? Tasks will be unlinked; comments and notes will be cascade-removed.`)) return
    setActionMenuOpen(false)
    try {
      const res = await fetch(`/api/projects/${project.slug}/delete`, { method: 'POST' })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['projects'] })
        navigate(PATHS.projects)
      } else {
        showSuccess('Delete failed — please try again or contact Nick.')
      }
    } catch (err) {
      console.error('Delete project failed', err)
      showSuccess('Delete failed — please try again.')
    }
  }
  const handleDuplicateProject = async () => {
    setActionMenuOpen(false)
    try {
      const newTitle = `${project.title} (copy)`
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          stage: project.stage,
          category: project.category,
          pi: project.pi,
          status: 'active',
        }),
      })
      const json = await res.json() as { data?: { slug?: string } }
      if (res.ok && json.data?.slug) {
        queryClient.invalidateQueries({ queryKey: ['projects'] })
        navigate(`${PATHS.projects}/${json.data.slug}`)
      } else {
        showSuccess('Duplicate failed — please try again.')
      }
    } catch (err) {
      console.error('Duplicate project failed', err)
      showSuccess('Duplicate failed — please try again.')
    }
  }

  // Strategic Context ("Why This Matters Now") editing
  const [editingStrategic, setEditingStrategic] = useState(false)
  const [strategicDraft, setStrategicDraft] = useState(project.strategic_context ?? '')
  const { data: apiMeetings = [] } = useMeetingsApi()

  // Brain.db's granular stages map onto the 6 canonical strip stages
  // (lib/stageNormalize). P2-R2-14.
  const currentStageIndex = stageIndex(project.stage)

  // Inline editing
  const [editingDescription, setEditingDescription] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [descDraft, setDescDraft] = useState(project.description ?? '')
  const [editingShortName, setEditingShortName] = useState(false)
  const [shortNameDraft, setShortNameDraft] = useState(project.short_name ?? '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(project.title)
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Notes/Comments explainer banner dismissibility (PD-4)
  const [notesCommentsBannerDismissed, setNotesCommentsBannerDismissed] = useState(() => {
    try { return localStorage.getItem('mnccore.banner.notes-comments.dismissed') === '1' } catch { return false }
  })

  // Tab strip overflow affordance (PD-16) — show right-edge fade when content scrolls
  const tabStripRef = useRef<HTMLDivElement>(null)
  const [tabStripHasOverflow, setTabStripHasOverflow] = useState(false)
  useEffect(() => {
    const el = tabStripRef.current
    if (!el) return
    const checkOverflow = () => {
      const hasMore = el.scrollWidth > el.clientWidth + 2
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
      setTabStripHasOverflow(hasMore && !atEnd)
    }
    checkOverflow()
    el.addEventListener('scroll', checkOverflow, { passive: true })
    window.addEventListener('resize', checkOverflow)
    return () => {
      el.removeEventListener('scroll', checkOverflow)
      window.removeEventListener('resize', checkOverflow)
    }
  }, [])


  // Task detail panel
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)

  // S1: consume `?openTask=<id>` deep-links (search emits
  // /portal/projects/<slug>?openTask=<id>). Open the task's detail panel once
  // this project's tasks have loaded.
  useOpenParam(
    'openTask',
    (id) => {
      const t = projectTasks.find((pt) => pt.id === id)
      if (t) setSelectedTask(t)
    },
    { ready: projectTasks.length > 0 },
  )

  // Presence: who else is viewing this project right now (Slack-style)
  const viewerSlugs = usePresence('project', project.slug)
  const { typingPeers: projectTypingPeers, broadcastTyping: broadcastProjectTyping } = useTyping('project', project.slug)

  const queryClient = useQueryClient()

  // Landing-card merged Recent Activity: last 3 notes + comments (GH #27)
  const recentActivity = useMemo(() => {
    type RecentItem = { id: string; kind: 'note' | 'comment'; content: string; author: string; created_at: string; update_type?: string }
    const notes: RecentItem[] = projectUpdates.map((u) => ({
      id: `note-${u.id}`, kind: 'note', content: u.content, author: u.author, created_at: u.created_at, update_type: u.update_type,
    }))
    const comments: RecentItem[] = projectComments.map((c) => ({
      id: `comment-${c.id}`, kind: 'comment', content: c.content, author: c.author_slug || c.author_name || '', created_at: c.created_at,
    }))
    return [...notes, ...comments]
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
      .slice(0, 3)
  }, [projectUpdates, projectComments])

  // Quick compose state — inline on landing card, defers to ProjectUpdateFeed-style mutation
  const [quickComposeText, setQuickComposeText] = useState('')
  const projectSelfIntent: Intent = quickComposeText.trim().length > 0 ? 'commenting' : 'viewing'
  const projectPeerIntents = useIntentBroadcast('project', project.slug, projectSelfIntent)
  const [quickComposeKind, setQuickComposeKind] = useState<'note' | 'comment'>('note')
  const [quickComposeSubmitting, setQuickComposeSubmitting] = useState(false)
  const [quickComposeDragOver, setQuickComposeDragOver] = useState(false)
  const [quickComposeUploading, setQuickComposeUploading] = useState(false)
  const isMobile = useIsMobile()
  const [composeSheetOpen, setComposeSheetOpen] = useState(false)
  useComposeSheet(isMobile && composeSheetOpen, () => setComposeSheetOpen(false))
  // T-04 inline file drop — Slack parity. Upload → append link to compose.
  // The drag-drop wrapper still calls uploadToCompose; SmartCompose's own
  // paperclip + paste path uses uploadContext directly.
  const uploadToCompose = useCallback(async (file: File) => {
    if (!project) return
    setQuickComposeUploading(true)
    try {
      const urlRes = await fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          context: { type: 'project', id: project.slug },
        }),
      })
      const urlData = await urlRes.json() as { data?: { uploadUrl?: string; key?: string } }
      if (!urlData.data?.uploadUrl || !urlData.data?.key) throw new Error('presign failed')
      await fetch(urlData.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      const doneRes = await fetch('/api/upload/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: urlData.data.key,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          entityType: 'project',
          entityId: project.slug,
        }),
      })
      const doneData = await doneRes.json() as { data?: { url?: string } }
      queryClient.invalidateQueries({ queryKey: ['attachments', 'project', project.slug] })
      const link = doneData.data?.url ?? `/api/files/${urlData.data.key}`
      setQuickComposeText((prev) => (prev ? `${prev}\n[${file.name}](${link})` : `[${file.name}](${link})`))
    } catch (err) {
      console.error('compose upload failed', err)
    } finally {
      setQuickComposeUploading(false)
    }
  }, [project, queryClient])
  const handleQuickCompose = async () => {
    const text = quickComposeText.trim()
    if (!text || quickComposeSubmitting) return
    setQuickComposeSubmitting(true)
    try {
      const endpoint = quickComposeKind === 'note'
        ? `/api/projects/${project.slug}/updates`
        : `/api/projects/${project.slug}/comments`
      const body = quickComposeKind === 'note'
        ? { content: text, update_type: 'progress' }
        : { content: text }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setQuickComposeText('')
        setComposeSheetOpen(false)
        if (quickComposeKind === 'note') {
          queryClient.invalidateQueries({ queryKey: ['project-updates', project.slug] })
        } else {
          queryClient.invalidateQueries({ queryKey: ['comments', project.slug] })
        }
      }
    } finally {
      setQuickComposeSubmitting(false)
    }
  }

  // Add to meeting agenda
  const [showAgendaForm, setShowAgendaForm] = useState(false)
  const [agendaNote, setAgendaNote] = useState('')
  const nextUpcomingMeeting = useMemo(() => {
    const today = localDateKey()
    const upcoming = apiMeetings.find((m) => m.status === 'upcoming')
    if (upcoming) return upcoming
    const future = [...apiMeetings]
      .filter((m) => m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    return future[0] ?? null
  }, [apiMeetings])
  const addAgenda = useAddAgendaItem(nextUpcomingMeeting?.id ?? '')

  // S17 (2026-06-09): instant write + 5s undo, matching Projects/Manuscripts.
  // Stage writes go through toApiStage() (Rule 35) — the API 400s on
  // non-canonical values and silently reverts the optimistic update.
  function handleStageChange(stage: Stage) {
    if (stage === project.stage) return
    const prevStage = project.stage ?? 'idea'
    d1Update.mutate({ stage: toApiStage(stage) })
    showUndo(`Stage → ${STAGE_LABELS[stage]}`, () =>
      d1Update.mutate({ stage: toApiStage(prevStage) }),
    )
  }

  function handleDescSave() {
    setEditingDescription(false)
    if (descDraft.trim() !== (project.description ?? '').trim()) {
      d1Update.mutate({ description: descDraft.trim() || undefined })
    }
  }

  function handleShortNameSave() {
    setEditingShortName(false)
    const trimmed = shortNameDraft.trim()
    if (trimmed !== (project.short_name ?? '').trim()) {
      d1Update.mutate({ short_name: trimmed || undefined } as Partial<Project>)
    }
  }

  function handleTitleSave() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== project.title.trim()) {
      d1Update.mutate({ title: trimmed } as Partial<Project>)
    }
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
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleTitleSave()
                  }
                  if (e.key === 'Escape') {
                    setTitleDraft(project.title)
                    setEditingTitle(false)
                  }
                }}
                autoFocus
                aria-label="Edit project title"
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
                  color: 'var(--ink)',
                  background: 'none',
                  border: 'none',
                  borderBottom: '2px solid var(--teal)',
                  outline: 'none',
                  padding: '2px 0',
                  width: '100%',
                  fontFamily: 'inherit',
                  lineHeight: 1.2,
                }}
              />
            ) : (
              <h1
                onClick={() => {
                  setTitleDraft(project.title)
                  setEditingTitle(true)
                }}
                title="Click to edit title"
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
                  color: 'var(--ink)',
                  margin: 0,
                  lineHeight: 1.2,
                  cursor: 'pointer',
                }}
              >
                {project.title}
              </h1>
            )}
            {editingShortName ? (
              <input
                value={shortNameDraft}
                onChange={(e) => setShortNameDraft(e.target.value)}
                onBlur={handleShortNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleShortNameSave()
                  if (e.key === 'Escape') {
                    setShortNameDraft(project.short_name ?? '')
                    setEditingShortName(false)
                  }
                }}
                autoFocus
                placeholder="Add short name..."
                style={{
                  fontSize: 'var(--value-size)',
                  color: 'var(--ink)',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--teal)',
                  outline: 'none',
                  padding: '2px 0',
                  marginTop: '2px',
                  width: '100%',
                  maxWidth: '280px',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <span
                onClick={() => {
                  setEditingShortName(true)
                  setShortNameDraft(project.short_name ?? '')
                }}
                style={{
                  fontSize: 'var(--value-size)',
                  color: 'var(--slate)',
                  opacity: project.short_name ? 0.85 : 0.85,
                  fontStyle: project.short_name ? 'normal' : 'italic',
                  cursor: 'pointer',
                  padding: '2px 0',
                  marginTop: '2px',
                  display: 'block',
                }}
              >
                {project.short_name || 'Add short name...'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleCopyLink}
              className="p-1.5 rounded-md transition-colors hover:bg-black/5"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--teal)' : 'var(--slate)', opacity: copied ? 1 : 0.85 }}
              title={copied ? 'Link copied!' : 'Copy link'}
            >
              {copied ? <Check size={14} /> : <Link2 size={14} />}
            </button>
            <WatchButton id={project.slug} type="project" label={project.title} slug={project.slug} />
            {/* Action menu (archive / delete / duplicate) — PD-7 */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setActionMenuOpen((v) => !v)}
                onBlur={(e) => {
                  // close when focus leaves the wrapper
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
                    setTimeout(() => setActionMenuOpen(false), 150)
                  }
                }}
                className="p-1.5 rounded-md transition-colors hover:bg-black/5"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.85 }}
                title="More actions"
                aria-haspopup="menu"
                aria-expanded={actionMenuOpen}
              >
                <MoreVertical size={14} />
              </button>
              {actionMenuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    minWidth: '180px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-menu)',
                    zIndex: 'var(--z-dropdown)' as any,
                    padding: '4px',
                  }}
                >
                  <button
                    role="menuitem"
                    onClick={handleArchiveProject}
                    disabled={isArchived}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', fontSize: '12px', color: 'var(--ink)',
                      background: 'none', border: 'none', borderRadius: 'var(--radius-md)',
                      cursor: isArchived ? 'not-allowed' : 'pointer',
                      opacity: isArchived ? 0.5 : 1,
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { if (!isArchived) e.currentTarget.style.background = 'var(--hover-subtle)' }}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Archive size={13} />
                    {isArchived ? 'Already archived' : 'Archive project'}
                  </button>
                  <button
                    role="menuitem"
                    onClick={handleDuplicateProject}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', fontSize: '12px', color: 'var(--ink)',
                      background: 'none', border: 'none', borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-subtle)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <CopyIcon size={13} />
                    Duplicate
                  </button>
                  <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 2px' }} />
                  <button
                    role="menuitem"
                    onClick={handleDeleteProject}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', fontSize: '12px', color: 'var(--maroon)',
                      background: 'none', border: 'none', borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-subtle)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Trash2 size={13} />
                    Delete project…
                  </button>
                </div>
              )}
            </div>
            <PresenceAvatars slugs={viewerSlugs} peerIntents={projectPeerIntents} />
          </div>
        </div>

        {/* Meta row: category, PI, status, stage, agenda button — all inline-editable */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CategoryIcon category={project.category || 'MNCCORE'} size={14} />
            {/* S3: canonical 3-bucket options — legacy clif/lab/nate/mentee
                400'd at the API and silently reverted. */}
            <InlineSelect
              value={project.category || ''}
              options={CATEGORY_OPTIONS}
              onChange={(val) => d1Update.mutate({ category: val } as Partial<Project>)}
            />
          </div>

          <InlineAssigneePicker
            value={project.pi || ''}
            onChange={(slug) => d1Update.mutate({ pi: slug } as Partial<Project>)}
          />

          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

          <InlineSelect
            value={project.status || 'active'}
            options={[
              { value: 'active', label: 'Active', color: 'var(--green)' },
              { value: 'waiting_external', label: 'Waiting', color: 'var(--gold)' },
              { value: 'blocked', label: 'Blocked', color: 'var(--maroon)' },
              { value: 'done', label: 'Done', color: 'var(--slate)' },
            ]}
            onChange={(val) => d1Update.mutate({ status: val } as Partial<Project>)}
          />

          <InlineSelect
            value={project.stage || 'idea'}
            options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
            onChange={(val) => handleStageChange(val as Stage)}
          />

          {isAuthenticated && nextUpcomingMeeting && (
            <button
              onClick={() => setShowAgendaForm(!showAgendaForm)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]"
              style={{
                background: showAgendaForm ? 'var(--gold)' : 'var(--gold-active)',
                color: showAgendaForm ? '#0f1923' : 'var(--gold-on-emphasis)',
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
              <span style={{ width: 5, height: 5, borderRadius: 'var(--radius-circle)', background: 'var(--teal-solid)' }} />
              {pendingTasks.length} active
            </span>
          )}
          {(() => {
            const overdue = pendingTasks.filter(t => t.due_date && t.due_date < localDateKey())
            return overdue.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--maroon)', fontWeight: 500 }}>
                <span style={{ width: 5, height: 5, borderRadius: 'var(--radius-circle)', background: 'var(--maroon-solid)' }} />
                {overdue.length} overdue
              </span>
            ) : null
          })()}
          {completedTasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--green)', fontWeight: 500 }}>
              <span style={{ width: 5, height: 5, borderRadius: 'var(--radius-circle)', background: 'var(--green)' }} />
              {completedTasks.length} done
            </span>
          )}
          {project.lastActivity && (
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
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
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--sp-md) var(--sp-lg)',
                  border: '1px solid rgba(201, 168, 76, 0.15)',
                }}
                className="detail-card"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.75,
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
                    style={{ background: 'none', border: 'none', color: 'var(--slate)', opacity: 'var(--ink-label)', padding: '2px' }}
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
                      fontSize: 'var(--value-size)',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--sp-sm) var(--sp-md)',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--gold-emphasis)')}
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

      {/* Tab navigation — M-31 + PD-11 (role/keyboard) + PD-12 (counts) + PD-16 (overflow fade) */}
      <div style={{ position: 'relative', marginBottom: '24px' }} className="project-tab-strip-wrap">
      {tabStripHasOverflow && <div aria-hidden="true" className="project-tab-strip-fade" />}
      <div
        ref={tabStripRef}
        className="flex flex-nowrap items-center gap-1 pb-2 overflow-x-auto project-tab-strip"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
        }}
        role="tablist"
        aria-label="Project sections"
      >
        {(() => {
          const activityCount = projectUpdates.length + projectComments.length
          const tabs: Array<{ id: Tab; label: string }> = [
            { id: 'overview', label: 'Overview' },
            { id: 'tasks', label: `Tasks${pendingTasks.length ? ` (${pendingTasks.length})` : ''}` },
            { id: 'activity', label: `Activity${activityCount ? ` (${activityCount})` : ''}` },
            { id: 'files', label: `Files${filesData.length ? ` (${filesData.length})` : ''}` },
            { id: 'revisions', label: `Revisions${revisions.length ? ` (${revisions.length})` : ''}` },
            { id: 'literature', label: `Literature${papers.length ? ` (${papers.length})` : ''}` },
          ]
          return tabs.map((tab, i) => (
            <button
              key={tab.id}
              role="tab"
              id={`projectdetail-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`projectdetail-tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
                  e.preventDefault()
                  let nextIdx = i
                  if (e.key === 'ArrowRight') nextIdx = (i + 1) % tabs.length
                  else if (e.key === 'ArrowLeft') nextIdx = (i - 1 + tabs.length) % tabs.length
                  else if (e.key === 'Home') nextIdx = 0
                  else if (e.key === 'End') nextIdx = tabs.length - 1
                  const nextTab = tabs[nextIdx]
                  setActiveTab(nextTab.id)
                  // Focus the new tab button
                  setTimeout(() => {
                    const btn = document.getElementById(`projectdetail-tab-${nextTab.id}`)
                    btn?.focus()
                  }, 0)
                }
              }}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
              style={{
                color: activeTab === tab.id ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: activeTab === tab.id ? 'var(--teal-active)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: activeTab === tab.id ? 1 : 0.85,
              }}
            >
              {tab.label}
            </button>
          ))
        })()}
      </div>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (<div role="tabpanel" id="projectdetail-tabpanel-overview" aria-labelledby="projectdetail-tab-overview">

      {/* ── Landing Card: 2-col action panel (GH #27, #29, #33 + 2026-04-23 feedback) ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: '16px 20px',
          marginBottom: '1.5rem',
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Left column (2/3): Open Tasks — always visible, + Add task CTA */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} style={{ color: 'var(--teal)' }} />
                <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Open Tasks
                </span>
                {pendingTasks.length > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
                    {pendingTasks.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTask(true)}
                  style={{ fontSize: '11px', color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                >
                  + Add task
                </button>
                {pendingTasks.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('tasks')}
                    style={{ fontSize: '11px', color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    View all →
                  </button>
                )}
              </div>
            </div>
            {pendingTasks.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.85, padding: '12px 0' }}>
                No open tasks.{' '}
                <button
                  type="button"
                  onClick={() => setShowCreateTask(true)}
                  style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}
                >
                  Add one
                </button>
                .
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {pendingTasks
                  .slice()
                  .sort((a, b) => {
                    const ad = a.due_date || '9999-12-31'
                    const bd = b.due_date || '9999-12-31'
                    return ad.localeCompare(bd)
                  })
                  .slice(0, 5)
                  .map((task) => (
                    <div key={task.id} style={{ minWidth: 0 }}>
                      <TaskCard
                        task={task}
                        onStatusChange={(id, status) => {
                          const prev = task.status
                          updateTaskStatus.mutate({ id, status })
                          showUndo(`Status → ${status}`, () => updateTaskStatus.mutate({ id, status: prev }))
                        }}
                        onClick={() => setSelectedTask(task)}
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Right column (1/3): Key Links (top) + Recent Activity (bottom) */}
          <div className="md:col-span-1 flex flex-col gap-4">
            {/* Local launch — Open folder + Work on this in Claude (mnccore://).
                Only when the project has a working folder. */}
            {project.primary_folder && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen size={13} style={{ color: 'var(--teal)' }} />
                  <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    On this machine
                  </span>
                </div>
                <WorkOnActions primaryFolder={project.primary_folder} projectLabel={project.short_name || project.title} />
              </div>
            )}
            {/* Key Links strip */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link2 size={13} style={{ color: 'var(--teal)' }} />
                <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Key Links
                </span>
              </div>
              <KeyLinksEditor
                links={[
                  { url: project.key_link_1, desc: project.key_link_1_desc },
                  { url: project.key_link_2, desc: project.key_link_2_desc },
                  { url: project.key_link_3, desc: project.key_link_3_desc },
                ]}
                onSave={(next) => {
                  d1Update.mutate({
                    key_link_1: next[0]?.url || null,
                    key_link_1_desc: next[0]?.desc || null,
                    key_link_2: next[1]?.url || null,
                    key_link_2_desc: next[1]?.desc || null,
                    key_link_3: next[2]?.url || null,
                    key_link_3_desc: next[2]?.desc || null,
                  } as Partial<Project>)
                }}
              />
            </div>

            {/* Recent Activity */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock size={13} style={{ color: 'var(--gold)' }} />
                  <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Recent
                  </span>
                </div>
                {recentActivity.length > 0 && (
                  <button
                    type="button"
                    onClick={() => goToStream('all')}
                    style={{ fontSize: '11px', color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    All →
                  </button>
                )}
              </div>
              {recentActivity.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.85, margin: 0, padding: '4px 0' }}>
                  No activity yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {recentActivity.map((item) => {
                    const info = item.author ? getPersonInfo(item.author) : null
                    const isKnown = info && info.name !== 'Unknown'
                    const attributor = isKnown ? info!.name.split(' ')[0] : (item.kind === 'note' ? 'Note' : 'Comment')
                    const dt = new Date(item.created_at)
                    const rel = formatShortDate(item.created_at)
                    return (
                      <div
                        key={item.id}
                        onClick={() => goToStream(item.kind === 'note' ? 'notes' : 'comments')}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '6px',
                          fontSize: '11px', color: 'var(--ink)', lineHeight: 1.35,
                          padding: '4px 6px', borderRadius: 'var(--radius-md)',
                          cursor: 'pointer', transition: 'background 150ms ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-subtle)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        title={dt.toLocaleString()}
                      >
                        <span
                          style={{
                            flexShrink: 0, marginTop: 4, width: 5, height: 5,
                            borderRadius: 'var(--radius-circle)',
                            background: item.kind === 'note' ? 'var(--teal)' : 'var(--gold)',
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', marginBottom: 1 }}>
                            {attributor} · {rel}
                          </div>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.content}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-width Quick compose at bottom. On mobile, the inline compose
            is replaced by a compact trigger; the actual form mounts in a
            BottomSheet-style fixed overlay above the keyboard. Same state,
            same refs — only the positioning/z-index changes when open. */}
        {isMobile && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => setComposeSheetOpen(true)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--muted)',
                fontSize: '13px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              aria-label="Open compose"
            >
              <Send size={14} style={{ flexShrink: 0 }} />
              <span>{quickComposeText.trim() ? `Draft: ${quickComposeText.slice(0, 40)}…` : 'Add note or comment…'}</span>
            </button>
          </div>
        )}
        {isMobile && composeSheetOpen && (
          <div
            onClick={() => setComposeSheetOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 'var(--z-modal-backdrop)' as unknown as number,
            }}
            aria-hidden
          />
        )}
        <div
          data-compose-slot
          style={
            isMobile
              ? (composeSheetOpen
                  ? {
                      position: 'fixed',
                      left: 0, right: 0, bottom: 0,
                      zIndex: 'var(--z-modal)' as unknown as number,
                      background: 'var(--cream)',
                      padding: 'var(--sp-md) var(--sp-lg) calc(var(--sp-lg) + env(safe-area-inset-bottom))',
                      borderTopLeftRadius: 'var(--radius-2xl)',
                      borderTopRightRadius: 'var(--radius-2xl)',
                      boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
                    }
                  : { display: 'none' })
              : { borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }
          }
        >
          <div className="flex items-center gap-2 mb-2">
            <div style={{ display: 'inline-flex', gap: 4, padding: 2, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)' }}>
              <button
                type="button"
                onClick={() => setQuickComposeKind('note')}
                style={{
                  fontSize: '10px', fontWeight: 500, padding: '4px 10px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: quickComposeKind === 'note' ? 'var(--teal-solid)' : 'transparent',
                  color: quickComposeKind === 'note' ? 'var(--ink-bright, #fff)' : 'var(--slate)',
                }}
              >
                Note
              </button>
              <button
                type="button"
                onClick={() => setQuickComposeKind('comment')}
                style={{
                  fontSize: '10px', fontWeight: 500, padding: '4px 10px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: quickComposeKind === 'comment' ? 'var(--gold)' : 'transparent',
                  color: quickComposeKind === 'comment' ? '#0f1923' : 'var(--slate)',
                }}
              >
                Comment
              </button>
            </div>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setQuickComposeDragOver(true) }}
            onDragLeave={() => setQuickComposeDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setQuickComposeDragOver(false)
              const files = Array.from(e.dataTransfer.files || [])
              files.forEach(uploadToCompose)
            }}
            style={{
              borderRadius: 'var(--radius-md)',
              outline: quickComposeDragOver ? '2px dashed var(--teal)' : 'none',
              outlineOffset: '2px',
            }}
          >
            {/* SmartCompose (D14) — replaces the prior decorative @/:/📎
                button row. @ → MentionInput dropdown, : → emoji palette,
                paperclip → real R2 upload via uploadContext. State is
                shared via value/onChange so the BottomSheet trigger label
                ("Draft: …") still updates and broadcastProjectTyping fires. */}
            <SmartCompose
              theme="light"
              bare
              value={quickComposeText}
              onChange={(next) => { setQuickComposeText(next); broadcastProjectTyping(next.trim().length > 0) }}
              onSubmit={async () => { await handleQuickCompose() }}
              submitting={quickComposeSubmitting}
              uploadContext={{ type: 'project', id: project.slug }}
              placeholder={quickComposeKind === 'note' ? 'Post a note... (Cmd+Enter to send, paste or drop to attach)' : 'Comment to team... (Cmd+Enter to send)'}
              rows={2}
              alwaysShowToolbar
              submitLabel={quickComposeKind === 'note' ? 'Post note' : 'Comment'}
            />
          </div>
          {quickComposeUploading && (
            <p className="mt-1 text-[10px]" style={{ color: 'var(--teal)', opacity: 0.85 }}>Uploading…</p>
          )}
          <TypingIndicator slugs={projectTypingPeers} className="mt-1" />
        </div>
      </motion.div>

      {/* Project Timeline removed 2026-04-23 — vertical wall of non-interactive
          visuals took up screen real estate without supporting any "doing"
          action. Stage indicator below is the canonical interactive stage UI. */}

      {/* Strategic Context — Why This Matters Now */}
      {(project.strategic_context || isPi) && (
        <div
          className="mt-6 p-4 rounded-xl"
          style={{
            background: 'var(--gold-hover)',
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
                  opacity: 'var(--ink-label)',
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
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
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--sp-sm) var(--sp-md)',
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
                  style={{ color: 'var(--slate)', background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
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
                fontSize: 'var(--value-size)',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
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
            margin: '0 0 var(--sp-md) 0',
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
              zIndex: 'var(--z-base)',
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
                zIndex: 'var(--z-base)',
              }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            />
          )}
          {STAGES.map((stage, i) => {
            const isCurrent = i === currentStageIndex
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
                  zIndex: 'var(--z-sticky)',
                }}
              >
                <motion.button
                  type="button"
                  onClick={() => handleStageChange(stage)}
                  className="cursor-pointer"
                  style={{
                    width: isCurrent ? '20px' : '14px',
                    height: isCurrent ? '20px' : '14px',
                    borderRadius: 'var(--radius-circle)',
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
                  title={`Move to ${STAGE_LABELS[stage]}`}
                />
                <span
                  className="project-stage-label"
                  title={STAGE_LABELS[stage]}
                  style={{
                    fontSize: '10px',
                    color: isCurrent ? 'var(--gold)' : isFuture ? 'var(--slate)' : 'var(--ink)',
                    opacity: isCurrent ? 1 : isFuture ? 0.85 : 0.85,
                    fontWeight: isCurrent ? 700 : 400,
                    marginTop: '8px',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </div>
            )
          })}
        </div>

        {/* S17: confirmation banner removed — stage change is now instant +
            5s undo (handleStageChange), matching Projects/Manuscripts. */}
      </motion.div>

      {/* Details section */}
      <div
        style={{ marginBottom: '2.5rem' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <h2
            style={{
              fontWeight: 500,
              fontSize: '16px',
              color: 'var(--ink)',
              margin: '0 0 var(--sp-md) 0',
            }}
          >
            Details
          </h2>

          <div
            style={{
              background: 'var(--ice)',
              borderRadius: 'var(--radius-xl)',
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
                  opacity: 0.75,
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
                    borderRadius: 'var(--radius-md)',
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
                      padding: 'var(--sp-xs) 0',
                      opacity: project.description ? 1 : 0.85,
                      borderBottom: '1px dashed transparent',
                      transition: 'border-color 0.2s',
                      whiteSpace: 'pre-wrap',
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
                    {project.description
                      ? <LinkifiedText text={project.description} />
                      : 'Click to add a description...'}
                  </p>
                  {project.description && project.description.length > 200 && (
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 'var(--label-size)',
                        color: 'var(--teal)',
                        padding: 'var(--sp-xs) 0',
                        opacity: 0.8,
                      }}
                    >
                      {descExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Key Links moved to landing card above (Track A §A1, #29) */}

            {/* Team */}
            {project.team && project.team.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '10px',
                    color: 'var(--slate)',
                    opacity: 0.75,
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
                            variant="ice"
                            size="base-sm"
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 'var(--value-size)',
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
                    opacity: 0.85,
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
                    opacity: 0.85,
                  }}
                >
                  <Clock size={13} />
                  Last activity {formatMediumDate(project.lastActivity)}
                </span>
              )}
            </div>
          </div>
        </motion.div>

      </div>

      {/* Key Documents */}
      <ProjectDocuments projectSlug={project.slug} />

      {/* Related Projects (AI Insights) */}
      <InsightPanel projectSlug={project.slug} />

      {/* Conference Prep Tracking */}
      <div style={{ marginTop: '1.5rem' }}>
        <ConferencePrep projectId={project.slug} />
      </div>

      </div>)}

      {/* ── FILES TAB ── */}
      {activeTab === 'files' && (
        <div role="tabpanel" id="projectdetail-tabpanel-files" aria-labelledby="projectdetail-tab-files" style={{ marginBottom: '2rem' }}>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Project Files
            </span>
          </div>
          <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }} className="detail-card">
            <FileUpload entityType="project" entityId={project.slug} />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
            Drop a file or click to upload. Attachments are stored on R2 and searchable via the Search page.
          </p>
        </div>
      )}

      {/* ── TASKS TAB ── (PD-5: TaskGridView per Rule 17 / Decision D23) */}
      {activeTab === 'tasks' && (() => {
        const filtered = taskFilter === 'all' ? projectTasks : taskFilter === 'active' ? pendingTasks : taskFilter === 'done' ? completedTasks : projectTasks.filter(t => t.status === 'blocked')
        return (
          <div role="tabpanel" id="projectdetail-tabpanel-tasks" aria-labelledby="projectdetail-tab-tasks" style={{ marginBottom: '2rem' }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
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
                        background: taskFilter === f ? 'var(--teal-active)' : 'none',
                        color: taskFilter === f ? 'var(--teal)' : 'var(--slate)',
                        border: `1px solid ${taskFilter === f ? 'var(--teal)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        opacity: taskFilter === f ? 1 : 0.85,
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
                    setTasksCopied(true)
                    setTimeout(() => setTasksCopied(false), 2000)
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border"
                  style={{ color: tasksCopied ? 'var(--green)' : 'var(--slate)', borderColor: tasksCopied ? 'var(--green)' : 'var(--border-subtle)', background: 'none', cursor: 'pointer', opacity: tasksCopied ? 1 : 0.85 }}
                  title={tasksCopied ? 'Copied!' : 'Copy task list to clipboard'}
                >
                  {tasksCopied ? <Check size={11} /> : <FileText size={11} />}
                  {tasksCopied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowCreateTask(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{ backgroundColor: 'var(--teal-solid)', color: 'var(--ink-bright, #fff)', border: 'none', cursor: 'pointer' }}
                >
                  <Plus size={13} />
                  New Task
                </button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={32} />}
                title={taskFilter === 'active' ? 'No active tasks' : taskFilter === 'done' ? 'No completed tasks' : taskFilter === 'blocked' ? 'No blocked tasks' : 'No tasks for this project'}
                subtitle={taskFilter === 'all' ? 'Create a task above to start tracking work for this project.' : undefined}
              />
            ) : (
              <TaskGridView
                tasks={filtered}
                allTasks={projectTasks}
                onStatusChange={(id, status) => {
                  const task = projectTasks.find(t => t.id === id)
                  const prev = task?.status
                  updateTaskStatus.mutate({ id, status })
                  if (prev) showUndo(`Status → ${status}`, () => updateTaskStatus.mutate({ id, status: prev }))
                }}
                onFieldChange={handleFieldChange}
                onOpenDetail={setSelectedTask}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            )}

            <BulkActionToolbar
              selectedIds={selectedIds}
              selectedTasks={projectTasks.filter(t => selectedIds.has(t.id))}
              onClear={() => setSelectedIds(new Set())}
              onBulkAction={handleBulkAction}
              isUpdating={bulkUpdate.isPending}
            />
          </div>
        )
      })()}

      {/* ── REVISIONS TAB ── */}
      {activeTab === 'revisions' && (
        <div role="tabpanel" id="projectdetail-tabpanel-revisions" aria-labelledby="projectdetail-tab-revisions">
          {/* Submission lifecycle timeline */}
          <div className="table-container" style={{ padding: '16px 20px', marginBottom: '1rem' }}>
            <SubmissionTimeline projectId={project.slug} />
          </div>

          {/* Existing revision tracker (reviewer comments) */}
          <div className="table-container" style={{ padding: '16px 20px', marginBottom: '2rem' }}>
            <RevisionTracker projectId={project.slug} />
          </div>
        </div>
      )}

      {/* ── ACTIVITY TAB ── (P2-5: one chronological stream; Notes/Comments/All
            are filters over it, not separate tabs) */}
      {activeTab === 'activity' && (
        <div role="tabpanel" id="projectdetail-tabpanel-activity" aria-labelledby="projectdetail-tab-activity" style={{ scrollMarginTop: '60px' }}>
          {/* Notes vs Comments explainer — dismissible one-time banner (PD-4 / S18) */}
          {!notesCommentsBannerDismissed && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '12px 16px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
                color: 'var(--muted)',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>Notes vs Comments:</strong>{' '}
                <span><strong>Notes</strong> are an informal progress log — visible to the team, auto-timestamped (e.g. "Talked with Peter, he'll run the script and get back next week"). <strong>Comments</strong> are team discussion (@mentions notify).</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem('mnccore.banner.notes-comments.dismissed', '1') } catch {}
                  setNotesCommentsBannerDismissed(true)
                }}
                aria-label="Dismiss explainer"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  lineHeight: 0,
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Stream filters: All / Notes / Comments */}
          <div className="flex items-center gap-1.5 mb-4" role="group" aria-label="Filter activity stream">
            {(['all', 'notes', 'comments'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={streamFilter === f}
                onClick={() => setStreamFilter(f)}
                className="text-[11px] px-3 py-1 rounded-full font-medium transition-colors"
                style={{
                  background: streamFilter === f ? 'var(--teal-active)' : 'none',
                  color: streamFilter === f ? 'var(--teal)' : 'var(--slate)',
                  border: `1px solid ${streamFilter === f ? 'var(--teal)' : 'var(--border-subtle)'}`,
                  cursor: 'pointer',
                  opacity: streamFilter === f ? 1 : 0.85,
                }}
              >
                {f === 'all' ? 'All' : f === 'notes' ? 'Notes' : 'Comments'}
              </button>
            ))}
          </div>

          <ActivityStream project={project} filter={streamFilter} />

          {/* Project decisions + dependencies management surfaces — shown only in
              the unfiltered ('all') view; their items already appear inline in
              the stream above, these provide the add/manage affordances. */}
          {streamFilter === 'all' && (
            <>
              <ProjectDecisions projectSlug={project.slug} />
              <ProjectDependencies project={project} isPi={isPi} />
            </>
          )}
        </div>
      )}

      {/* ── LITERATURE TAB ── */}
      {activeTab === 'literature' && (
        <div role="tabpanel" id="projectdetail-tabpanel-literature" aria-labelledby="projectdetail-tab-literature">
          <ProjectLiterature projectSlug={project.slug} isPi={isPi} />
        </div>
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
          createTask.mutate({ ...task, project_id: project.slug }, {
            // S16: confirm the create + offer a working "Open →" into the new
            // task's detail panel instead of dead-ending in silence.
            onSuccess: (resp) => {
              const created = resp?.data
              showSuccess(
                'Task created',
                created ? { label: 'Open →', onClick: () => setSelectedTask(created) } : undefined,
              )
            },
          })
          setShowCreateTask(false)
        }}
      />

      {/* Scoped dark mode styles */}
      <style>{`
        .dark .detail-card {
          background-color: var(--cream) !important;
          background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
          border: 1px solid var(--border-subtle);
        }
        /* M-31: hide scrollbar on tab strip while keeping horizontal scroll */
        .project-tab-strip {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .project-tab-strip::-webkit-scrollbar {
          display: none;
        }
        /* PD-16: right-edge fade gradient when tab strip overflows */
        .project-tab-strip-fade {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 8px;
          width: 32px;
          pointer-events: none;
          background: linear-gradient(to right, transparent, var(--cream));
          z-index: 1;
        }
        .dark .project-tab-strip-fade {
          background: linear-gradient(to right, transparent, var(--ink));
        }
        /* PD-15: stage strip mobile — truncate labels at narrow widths to prevent horizontal-scroll */
        @media (max-width: 480px) {
          .project-stage-label {
            max-width: 44px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      `}</style>
    </>
  )
}


// ProjectKeyLinks (read-only) — superseded by KeyLinksEditor imported from
// ../components/KeyLinksEditor. The editable editor ships display AND add/edit
// /remove controls in one component.
