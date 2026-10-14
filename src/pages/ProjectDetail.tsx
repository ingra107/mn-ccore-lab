import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import { Button } from '../components/ui/Button'
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
  MoreVertical,
  Archive,
  Trash2,
  Copy as CopyIcon,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useMarkSeen } from '../hooks/useEntitySeen'
import { useProjects, useMeetingsApi, useTasks, useProjectUpdates, useRevisions, useComments, useProjectPapers, useProjectLinks, useProjectPublications } from '../hooks/useApiData'
import { useUpdateProject, useAddAgendaItem, useUpdateTaskStatus, useUpdateTask, useBulkUpdateTasks, useCreateTask, useSetProjectLinkRole } from '../hooks/useMutations'
import { useUndoToast } from '../components/UndoToast'
import BulkActionToolbar from '../components/tasks/BulkActionToolbar'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import TypingIndicator from '../components/TypingIndicator'
import { formatShortDate, formatMediumDate, localDateKey } from '../lib/dateUtils'
import { meetingsForProject } from '../lib/projectMeetings'
import { formatDbLocal } from '../lib/time'
import { FaceDisc } from '../components/today/skin'
import InlineSelect from '../components/InlineSelect'
import InlineAssigneePicker from '../components/InlineAssigneePicker'
import CategoryIcon from '../components/CategoryIcon'
import WatchButton from '../components/WatchButton'
import { ProjectOpenTaskCards } from '../components/project/ProjectOpenTaskCards'
import TaskGridView from '../components/tasks/TaskGridView'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import TaskDetailPanel from '../components/tasks/LazyTaskDetailPanel'
import EntityNotFound from '../components/EntityNotFound'
import type { Project } from '../data/types'
import type { TaskRow } from '../lib/api'
import RevisionTracker from '../components/RevisionTracker'
import KeyLinksEditor from '../components/KeyLinksEditor'
import ProjectLinkLibrary from '../components/ProjectLinkLibrary'
import ProjectMembers from '../components/project/ProjectMembers'
import { AllProjectsBanner } from '../components/AllProjectsControls'
import ProjectPublications from '../components/ProjectPublications'
import ProjectFolderActions from '../components/project/ProjectFolderActions'
import LinkifiedText from '../components/LinkifiedText'
import { CollapsibleBody } from '../components/activity/CollapsibleBody'
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
import { LABEL_STYLE } from '../components/ui/labelStyle'
import { STATUS_LIST_OPTIONS, mutedCategoryOptions, LIST_T3 } from '../lib/projectListOptions'
import { useOpenParam } from '../hooks/useOpenParam'
import EmptyStateArt from '../components/EmptyStateArt'
import EmptyState from '../components/EmptyState'
import { ICON_PROPS } from '../lib/iconProps'
import { projectShortLabel } from '../lib/displayNames'
import SectionHead from '../components/ui/SectionHead'
import ProjectProducts from '../components/project/ProjectProducts'
import ProductDescription from '../components/project/ProductDescription'
import { pairFields } from '../lib/projectPairs'
import { scopeByProduct } from '../lib/products'
import { useProjectProducts } from '../hooks/useProjectProducts'
import PageHeartbeat from '../components/moments/PageHeartbeat'
import PageWithRail from '../components/PageWithRail'

// P2-5: notes + comments collapsed into the single chronological `activity`
// stream (Notes / Comments / All are filters over it, not separate tabs).
type Tab = 'overview' | 'tasks' | 'meetings' | 'files' | 'activity' | 'revisions' | 'literature'

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: projects = [], isLoading, isError } = useProjects()

  const project = projects.find((p) => p.slug === slug)

  // New-activity signal (entity_seen v81): visiting the project page IS the
  // "seen" mark — project activity newer than this visit re-flags as ● new.
  const markSeen = useMarkSeen()
  const seenProjectId = (project as { id?: string } | undefined)?.id
  const seenFiredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!seenProjectId || seenFiredRef.current === seenProjectId) return
    seenFiredRef.current = seenProjectId
    markSeen('project', seenProjectId)
  }, [seenProjectId, markSeen])

  usePageMeta(
    project ? `${project.title} | MN-CCORE` : 'Project Not Found | MN-CCORE',
    project?.description ?? 'MN-CCORE research project details.',
    'article',
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
          <ArrowLeft {...ICON_PROPS} size={16} />
          Back to Pipeline
        </Link>
        <EmptyStateArt variant="generic" style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
        <h1 style={{ fontWeight: 600, fontSize: '1.5rem', color: 'var(--ink)', marginBottom: '0.5rem' }}>
          Could not load project
        </h1>
        <p style={{ color: 'var(--slate)', marginBottom: '1.25rem' }}>
          There was a problem fetching the project data. Check your connection and try again.
        </p>
        <Button
          variant="primary"
          onClick={() => window.location.reload()}
          style={{
            padding: '6px 16px',
            borderRadius: 'var(--radius-lg)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Retry
        </Button>
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

/** A path the mnccore:// launcher can open: a drive path, ~ path or file:// URL. */
function isLocalFolder(folder: string | null | undefined): folder is string {
  return !!folder && /^(file:\/\/|[A-Za-z]:[\\/]|~[\\/])/.test(folder.trim())
}

function ProjectDetailInner({ project }: InnerProps) {
  // D1 mutations
  const d1Update = useUpdateProject(project.slug)
  const { showUndo, showSuccess, showError } = useUndoToast()
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
    if (tab && ['overview', 'tasks', 'meetings', 'files', 'activity', 'revisions', 'literature'].includes(tab)) return tab as Tab
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
  // Full links table (every role). Task views get the role='key' subset from
  // handleGetTaskLinks; this page is the one surface that shows the archive.
  const { data: storedLinks, isLoading: linksLoading } = useProjectLinks(project.slug)
  const setLinkRole = useSetProjectLinkRole(project.slug)

  // Tab counts (PD-12)
  const { data: papers = [] } = useProjectPapers(project.slug)
  const { data: publications = [] } = useProjectPublications(project.slug)
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
  // Product chip = filter (Nick, 2026-10-12): ?product=<prd_id> narrows the open
  // tasks, the Tasks tab and the stats to that product (task.product_id). Only
  // a project with 2+ products filters; an unknown id reads as All.
  const { data: productData } = useProjectProducts(project.slug)
  const productFilter = (() => {
    const id = searchParams.get('product')
    const list = productData?.products ?? []
    return id && list.length > 1 && list.some((p) => p.id === id) ? id : null
  })()
  const setProductFilter = useCallback((id: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('product', id)
    else next.delete('product')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const productList = productData?.products ?? []
  const selectedProduct = productFilter ? productList.find((p) => p.id === productFilter) ?? null : null
  // The product read answered: the caller is a member of this project (or the PI).
  const canTagItems = !!productData
  // Tasks with no product (or one that is no longer live) are project-wide: they follow the product's own.
  const scopedTasks = productFilter ? scopeByProduct(projectTasks, productFilter, productList) : projectTasks
  const pendingTasks = scopedTasks.filter((t) => !t.completed)
  const completedTasks = scopedTasks.filter((t) => t.completed)

  // Multi-select for tasks tab
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectAnchorId, setSelectAnchorId] = useState<string | null>(null)

  // Wrapped in useCallback so TaskGridView's selectModeActive useEffect doesn't
  // reinstall window listeners on every ProjectDetail render (was re-created
  // per-render as an inline arrow — flagged in Phase G scoping pass).
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
    setSelectAnchorId(id)
  }, [])

  const handleSelectRange = useCallback((targetId: string, orderedIds: string[], anchor: string | null) => {
    if (!anchor || !orderedIds.includes(anchor)) {
      toggleSelect(targetId)
      return
    }
    const anchorIdx = orderedIds.indexOf(anchor)
    const targetIdx = orderedIds.indexOf(targetId)
    if (anchorIdx === -1 || targetIdx === -1) { toggleSelect(targetId); return }
    const lo = Math.min(anchorIdx, targetIdx)
    const hi = Math.max(anchorIdx, targetIdx)
    const rangeIds = orderedIds.slice(lo, hi + 1)
    setSelectedIds(prev => { const n = new Set(prev); for (const id of rangeIds) n.add(id); return n })
    // Anchor stays put (same pivot as useSelection.selectRange)
  }, [toggleSelect])

  const handleFieldChange = (id: string, field: string, value: unknown) => {
    // The grid's project cell hands a Project ~ Product pair as `slug::prd_id`.
    const fields = field === 'project_id' && typeof value === 'string' && value.includes('::')
      ? pairFields(value)
      : { [field]: value }
    updateTask.mutate({ id, fields })
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
        showError('Delete failed — please try again or contact Nick.')
      }
    } catch (err) {
      console.error('Delete project failed', err)
      showError('Delete failed — please try again.')
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
          // The copy is born with the same first product: the home's kind and stage.
          kind: project.home_kind ?? undefined,
          stage: project.home_stage ?? undefined,
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
        showError('Duplicate failed — please try again.')
      }
    } catch (err) {
      console.error('Duplicate project failed', err)
      showError('Duplicate failed — please try again.')
    }
  }

  // Strategic Context ("Why This Matters Now") editing
  const [editingStrategic, setEditingStrategic] = useState(false)
  const [strategicDraft, setStrategicDraft] = useState(project.strategic_context ?? '')
  const { data: apiMeetings = [] } = useMeetingsApi()

  // Inline editing
  const [editingDescription, setEditingDescription] = useState(false)
  const [descDraft, setDescDraft] = useState(project.description ?? '')
  // Parse the running description log into leading prose + dated entries. Pure
  const [editingShortName, setEditingShortName] = useState(false)
  const [shortNameDraft, setShortNameDraft] = useState(project.short_name ?? '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(project.title)
  const descRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const shortNameInputRef = useRef<HTMLInputElement>(null)
  const agendaNoteInputRef = useRef<HTMLInputElement>(null)
  const strategicDraftRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (editingTitle) titleInputRef.current?.focus({ preventScroll: true }) }, [editingTitle])
  useEffect(() => { if (editingShortName) shortNameInputRef.current?.focus({ preventScroll: true }) }, [editingShortName])
  useEffect(() => { if (editingDescription) descRef.current?.focus({ preventScroll: true }) }, [editingDescription])
  useEffect(() => { if (editingStrategic) strategicDraftRef.current?.focus({ preventScroll: true }) }, [editingStrategic])

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

  // #111 — a task named in the activity feed opens HERE, in the panel this page
  // already mounts. It used to be a plain <a href="/portal/my-tasks?openTask=…">,
  // so reading the feed and clicking a task threw you onto another page (Nick:
  // "it should show me that task, not take me to the task page"). Returning
  // false on a miss lets the link's href navigate, so a task that isn't in this
  // project's loaded rows still goes somewhere rather than nowhere.
  const openTaskInPlace = useCallback(
    (id: string) => {
      const t = projectTasks.find((pt) => pt.id === id)
      if (!t) return false
      setSelectedTask(t)
      return true
    },
    [projectTasks],
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

  // Quick compose state — inline on landing card; posts via postProjectActivity to activity_entries
  const [quickComposeText, setQuickComposeText] = useState('')
  const projectSelfIntent: Intent = quickComposeText.trim().length > 0 ? 'commenting' : 'viewing'
  const projectPeerIntents = useIntentBroadcast('project', project.slug, projectSelfIntent)
  const [quickComposeKind, setQuickComposeKind] = useState<'note' | 'comment'>('note')
  const [quickComposeSubmitting, setQuickComposeSubmitting] = useState(false)
  const isMobile = useIsMobile()
  const [composeSheetOpen, setComposeSheetOpen] = useState(false)
  useComposeSheet(isMobile && composeSheetOpen, () => setComposeSheetOpen(false))
  // T-04 inline file drop now lives inside SmartCompose (#1358): drop,
  // paste and the paperclip share its one upload queue and one uploading
  // flag. This page used to wrap SmartCompose in its own drop zone with a
  // third hand-rolled upload chain and a second flag for the same box.
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
  useEffect(() => { if (showAgendaForm) agendaNoteInputRef.current?.focus({ preventScroll: true }) }, [showAgendaForm])
  // A project's meetings are the ones GRANTED to it (schema-v122, Nick
  // 2026-10-09: "belongs to", chosen on the meeting page), out of the meetings
  // this viewer can already see. A meeting that only DISCUSSED the project
  // (meetings.tags) is not listed. The agenda picker offers only these,
  // upcoming, soonest first; it used to post to the lab's next meeting
  // whatever the project.
  const projectMeetings = useMemo(
    () => meetingsForProject(apiMeetings, { id: project.id ?? '' }, localDateKey()),
    [apiMeetings, project.id],
  )
  const [agendaMeetingPick, setAgendaMeetingPick] = useState<string | null>(null)
  const agendaMeeting = projectMeetings.upcoming.find((m) => m.id === agendaMeetingPick) ?? projectMeetings.upcoming[0] ?? null
  const addAgenda = useAddAgendaItem(agendaMeeting?.id ?? '')

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


  const iconsEl = (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleCopyLink}
              className="p-1.5 rounded-md transition-colors hover:bg-black/5 tip"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--job-accent)' : 'var(--slate)', opacity: copied ? 1 : 0.85 }}
              data-tip={copied ? 'Link copied!' : 'Copy link'}
              aria-label={copied ? 'Link copied!' : 'Copy link'}
            >
              {copied ? <Check {...ICON_PROPS} size={14} /> : <Link2 {...ICON_PROPS} size={14} />}
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
                className="p-1.5 rounded-md transition-colors hover:bg-black/5 tip"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.85 }}
                data-tip="More actions"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={actionMenuOpen}
              >
                <MoreVertical {...ICON_PROPS} size={14} />
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
                    background: 'var(--sk-card)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-menu)',
                    zIndex: 'var(--z-dropdown)',
                    padding: '4px',
                  }}
                >
                  <button
                    role="menuitem"
                    onClick={handleArchiveProject}
                    disabled={isArchived}
                    className="hov-bg"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', fontSize: '12px', color: 'var(--ink)',
                      background: 'none', border: 'none', borderRadius: 'var(--radius-md)',
                      cursor: isArchived ? 'not-allowed' : 'pointer',
                      opacity: isArchived ? 0.5 : 1,
                      textAlign: 'left',
                      '--hov-bg': isArchived ? 'transparent' : 'var(--hover-subtle)',
                    } as React.CSSProperties}
                  >
                    <Archive {...ICON_PROPS} size={13} />
                    {isArchived ? 'Already archived' : 'Archive project'}
                  </button>
                  <button
                    role="menuitem"
                    onClick={handleDuplicateProject}
                    className="hov-bg"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', fontSize: '12px', color: 'var(--ink)',
                      background: 'none', border: 'none', borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', textAlign: 'left',
                      '--hov-bg': 'var(--hover-subtle)',
                    } as React.CSSProperties}
                  >
                    <CopyIcon {...ICON_PROPS} size={13} />
                    Duplicate
                  </button>
                  <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 2px' }} />
                  <button
                    role="menuitem"
                    onClick={handleDeleteProject}
                    className="hov-bg"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 10px', fontSize: '12px', color: 'var(--job-danger)',
                      background: 'none', border: 'none', borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', textAlign: 'left',
                      '--hov-bg': 'var(--hover-subtle)',
                    } as React.CSSProperties}
                  >
                    <Trash2 {...ICON_PROPS} size={13} />
                    Delete project…
                  </button>
                </div>
              )}
            </div>
            <PresenceAvatars slugs={viewerSlugs} peerIntents={projectPeerIntents} />
          </div>
  )

  const metaEl = (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CategoryIcon category={project.category || 'MNCCORE'} size={14} color={LIST_T3} />
            {/* S3: canonical 3-bucket options — legacy clif/lab/nate/mentee
                400'd at the API and silently reverted. Muted t3 like the
                Projects list (shared option helpers, lib/projectListOptions). */}
            <InlineSelect
              value={project.category || ''}
              options={mutedCategoryOptions(CATEGORY_OPTIONS)}
              onChange={(val) => d1Update.mutate({ category: val } as Partial<Project>)}
            />
          </div>

          <InlineAssigneePicker
            value={project.pi || ''}
            onChange={(slug) => d1Update.mutate({ pi: slug } as Partial<Project>)}
          />

          {/* Divider only where status shares the line with group + PI. */}
          <div className="hidden md:block" style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

          {/* The project has no stage of its own: each product carries its stage
              (Products section below). */}
          <InlineSelect
            value={project.status || 'active'}
            options={STATUS_LIST_OPTIONS}
            onChange={(val) => d1Update.mutate({ status: val } as Partial<Project>)}
          />

          {isAuthenticated && agendaMeeting && (
            <button
              onClick={() => setShowAgendaForm(!showAgendaForm)}
              title={`Add an agenda item to one of this project's meetings`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]"
              style={{
                background: showAgendaForm ? 'var(--job-accent)' : 'transparent',
                color: showAgendaForm ? 'var(--sk-card)' : 'var(--sk-t2)',
                border: `1px solid ${showAgendaForm ? 'var(--job-accent)' : 'var(--sk-line2)'}`,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <CalendarPlus {...ICON_PROPS} size={11} />
              Agenda
            </button>
          )}

        </div>
  )

  const agendaFormEl = (
      <AnimatePresence>
        {showAgendaForm && agendaMeeting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
              style={{ marginBottom: 'var(--sp-md)' }}
            >
              <div
                style={{
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--sp-md) var(--sp-lg)',
                  border: `1px solid var(--sk-line)`,
                }}
                className="detail-card"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    style={LABEL_STYLE}
                  >
                    {projectMeetings.upcoming.length === 1 ? (
                      <>Add to: {agendaMeeting.title.split(':')[0]} ({formatShortDate(agendaMeeting.date)})</>
                    ) : (
                      <label className="inline-flex items-center gap-1">
                        Add to:
                        <select
                          aria-label="Meeting to add this agenda item to"
                          value={agendaMeeting.id}
                          onChange={(e) => setAgendaMeetingPick(e.target.value)}
                          style={{
                            fontSize: '11px',
                            textTransform: 'none',
                            letterSpacing: 'normal',
                            color: 'var(--ink)',
                            background: 'var(--cream)',
                            border: `1px solid var(--sk-line2)`,
                            borderRadius: 'var(--radius-md)',
                            padding: '1px 4px',
                          }}
                        >
                          {projectMeetings.upcoming.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title.split(':')[0]} ({formatShortDate(m.date)})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setShowAgendaForm(false); setAgendaNote('') }}
                    className="cursor-pointer"
                    style={{ background: 'none', border: 'none', color: 'var(--slate)', opacity: 'var(--ink-label)', padding: '2px' }}
                  >
                    <X {...ICON_PROPS} size={14} />
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
                    ref={agendaNoteInputRef}
                    style={{
                      flex: 1,
                      fontSize: 'var(--value-size)',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: `1px solid var(--sk-line2)`,
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--sp-sm) var(--sp-md)',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--job-accent)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--sk-line2)')}
                  />
                  {agendaNote.trim() && (
                    <motion.button
                      type="submit"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
                      style={{ background: 'var(--job-accent)', color: 'var(--sk-card)', border: 'none' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Send {...ICON_PROPS} size={14} />
                    </motion.button>
                  )}
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
  )

  const tabsEl = (
      <div style={{ position: 'relative', marginBottom: 'var(--sp-xl)' }} className="project-tab-strip-wrap">
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
          const meetingCount = projectMeetings.upcoming.length + projectMeetings.past.length
          const tabs: Array<{ id: Tab; label: string }> = [
            { id: 'overview', label: 'Overview' },
            { id: 'tasks', label: `Tasks${pendingTasks.length ? ` (${pendingTasks.length})` : ''}` },
            { id: 'meetings', label: `Meetings${meetingCount ? ` (${meetingCount})` : ''}` },
            { id: 'activity', label: `Activity${activityCount ? ` (${activityCount})` : ''}` },
            { id: 'files', label: `Files${filesData.length ? ` (${filesData.length})` : ''}` },
            { id: 'revisions', label: `Revisions${revisions.length ? ` (${revisions.length})` : ''}` },
            { id: 'literature', label: `Literature & Publications${(papers.length + publications.length) ? ` (${papers.length + publications.length})` : ''}` },
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
                color: activeTab === tab.id ? 'var(--job-accent)' : 'var(--slate)',
                backgroundColor: activeTab === tab.id ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'transparent',
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
  )

  const openListEl = (
pendingTasks.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.85, padding: '12px 0' }}>
                No open tasks.{' '}
                <button
                  type="button"
                  onClick={() => setShowCreateTask(true)}
                  style={{ color: 'var(--job-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}
                >
                  Add one
                </button>
                .
              </div>
            ) : (
              <ProjectOpenTaskCards
                tasks={pendingTasks
                  .slice()
                  .sort((x, y) => (x.due_date || '9999-12-31').localeCompare(y.due_date || '9999-12-31'))
                  .slice(0, 5)}
                project={project}
                onOpenEditor={setSelectedTask}
              />
            )
  )

  const membersEl = (
isAuthenticated && (project.slug ?? project.id) && (
              <ProjectMembers projectRef={(project.slug ?? project.id) as string} projectTitle={project.title} />
            )
  )

  const linksEl = (
            <ProjectLinkLibrary
              hideFolder
              links={storedLinks}
              isLoading={linksLoading}
              slotUrls={[project.key_link_1, project.key_link_2, project.key_link_3]}
              onSetRole={(link, role) => setLinkRole.mutate({ linkId: link.id, role })}
              documents={<ProjectDocuments projectSlug={project.slug} />}
              pinnedEditor={
                <KeyLinksEditor
                  hideLabel
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
              }
            />
  )

  const pubsEl = (
            <ProjectPublications
              projectSlug={project.slug}
              projectTitle={project.title}
              isPi={isPi}
              variant="card"
            />
  )

  const recentListEl = (
recentActivity.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.85, margin: 0, padding: '4px 0' }}>
                  No activity yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {recentActivity.map((item) => {
                    const info = item.author ? getPersonInfo(item.author) : null
                    const isKnown = info && info.name !== 'Unknown'
                    const attributor = isKnown ? info!.name.split(' ')[0] : (item.kind === 'note' ? 'Note' : 'Comment')
                    // UTC-correct tooltip: created_at is a bare D1 UTC string.
                    const fullWhen = formatDbLocal(item.created_at, 'datetime')
                    const rel = formatShortDate(item.created_at)
                    return (
                      <div
                        key={item.id}
                        onClick={() => goToStream(item.kind === 'note' ? 'notes' : 'comments')}
                        className="hov-bg tip"
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '6px',
                          fontSize: '11px', color: 'var(--ink)', lineHeight: 1.35,
                          padding: '4px 6px', borderRadius: 'var(--radius-md)',
                          cursor: 'pointer', transition: 'background 150ms ease',
                          '--hov-bg': 'var(--hover-subtle)',
                        } as React.CSSProperties}
                        data-tip={fullWhen}
                      >
                        <span
                          style={{
                            flexShrink: 0, marginTop: 4, width: 5, height: 5,
                            borderRadius: 'var(--radius-circle)',
                            background: item.kind === 'note' ? 'var(--sk-t2)' : 'var(--sk-t3)',
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
              )
  )

  const composeEl = (
<>
        {isMobile && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => setComposeSheetOpen(true)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--sk-panel)',
                border: '1px solid var(--field-edge)',
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
              <Send {...ICON_PROPS} size={14} style={{ flexShrink: 0 }} />
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
            <div style={{ display: 'inline-flex', gap: 4 }}>
              {/* N1b — mode pills go tint-not-fill (locked canon pt 4), matching
                  the task panel's COMMENT/NOTE segmented pills; tray bg removed
                  (box-budget — the composer below is the one box). */}
              <button
                type="button"
                onClick={() => setQuickComposeKind('note')}
                style={{
                  fontSize: '10px', fontWeight: quickComposeKind === 'note' ? 600 : 500, padding: '4px 10px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: quickComposeKind === 'note' ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'transparent',
                  color: quickComposeKind === 'note' ? 'var(--job-accent)' : 'var(--slate)',
                }}
              >
                Note
              </button>
              <button
                type="button"
                onClick={() => setQuickComposeKind('comment')}
                style={{
                  fontSize: '10px', fontWeight: quickComposeKind === 'comment' ? 600 : 500, padding: '4px 10px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: quickComposeKind === 'comment' ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'transparent',
                  color: quickComposeKind === 'comment' ? 'var(--job-accent)' : 'var(--slate)',
                }}
              >
                Comment
              </button>
            </div>
          </div>
          <div>
            {/* SmartCompose (D14) — replaces the prior decorative @/:/📎
                button row. @ → MentionInput dropdown, : → emoji palette,
                paperclip → real R2 upload via uploadContext. State is
                shared via value/onChange so the BottomSheet trigger label
                ("Draft: …") still updates and broadcastProjectTyping fires.
                launchContext (bug found 2026-07-21): custom-mode SmartCompose
                only intercepts @workon/@quickchat when this prop is passed
                (seed-isolation opt-in — see useLaunchCommands.ts /
                SmartCompose.tsx submit()). Without it, a typed "@workon …"
                fell straight through to handleQuickCompose and posted as a
                plain team-visible comment instead of firing a launch. No new
                primitive needed — this wires the SAME opt-in TaskDetailPanel/
                MorningThoughtCompose already use via useLaunchCommands;
                @hermes stays server-side-detected here (postActivityEntry,
                api/routes/projects.ts), unlike task mode. */}
            <SmartCompose
              value={quickComposeText}
              onChange={(next) => { setQuickComposeText(next); broadcastProjectTyping(next.trim().length > 0) }}
              onSubmit={async () => { await handleQuickCompose() }}
              submitting={quickComposeSubmitting}
              uploadContext={{ type: 'project', id: project.slug }}
              launchContext={{ projectSlug: project.slug, primaryFolder: project.primary_folder, taskId: null }}
              placeholder={quickComposeKind === 'note' ? 'Post a note... (Cmd+Enter to send, paste or drop to attach)' : 'Comment to team... (Cmd+Enter to send)'}
              rows={2}
              alwaysShowToolbar
              submitLabel={quickComposeKind === 'note' ? 'Post note' : 'Comment'}
            />
          </div>
          <TypingIndicator slugs={projectTypingPeers} className="mt-1" />
        </div>
</>
  )

  const strategicEl = (
(project.strategic_context || isPi) && (
        <div
          className="mt-6"
          style={{
            marginBottom: '1.5rem',
            paddingLeft: 2,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Compass {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t3)' }} />
              <span
                style={{
                  ...LABEL_STYLE,
                  color: 'var(--sk-t1)',
                }}
              >
                Why this matters now
              </span>
            </div>
            {isPi && !editingStrategic && (
              <button
                onClick={() => { setStrategicDraft(project.strategic_context ?? ''); setEditingStrategic(true) }}
                className="tk-btn tk-sm"
              >
                {project.strategic_context ? 'Edit' : 'Add context'}
              </button>
            )}
          </div>
          {editingStrategic ? (
            <div>
              <textarea
                ref={strategicDraftRef}
                value={strategicDraft}
                onChange={(e) => setStrategicDraft(e.target.value)}
                placeholder="2-3 sentences: What's the strategic context? Why is this project important right now? What should the team know?"
                rows={3}
                style={{
                  width: '100%',
                  fontSize: '14px',
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  border: '1px solid var(--job-accent)',
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
                  style={{ background: 'var(--job-accent)', color: 'var(--sk-card)', border: 'none', cursor: 'pointer' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingStrategic(false)}
                  className="tk-btn tk-sm"
                >
                  Cancel
                </button>
                <span className="kbd-hint text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
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
      )
  )

  const detailsEl = (
      <div
        style={{ marginBottom: '2.5rem' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <SectionHead title="Details" />

          <div
            style={{
              borderRadius: 'var(--radius-xl)',
              padding: '20px',
            }}
            className="detail-card"
          >
            {/* The selected product's own description sits above the project's. */}
            {selectedProduct && <ProductDescription slug={project.slug} product={selectedProduct} canEdit={canTagItems} />}
            {/* Description — inline editable */}
            <div style={{ marginBottom: 'var(--sp-lg)' }}>
              <label
                style={{
                  ...LABEL_STYLE,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Description
                {selectedProduct && <span data-testid="project-description-marker" style={{ marginLeft: 8, fontSize: 11, color: 'var(--sk-t3)' }}>project</span>}
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
                  rows={3}
                  style={{
                    width: '100%',
                    fontSize: '14px',
                    color: 'var(--ink)',
                    background: 'var(--cream)',
                    border: '1px solid var(--job-accent)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              ) : (
                // CollapsibleBody wraps the click-to-edit <p> from outside, so its
                // more/less control is not part of the edit target, and shows only
                // when the text measurably overflows 3 lines (#8635; was length > 200).
                // The padding and the dashed hover rule sit on the wrapper, outside
                // the measured box: inside it they add 5px to a 3-line body, which
                // then shows a "more" that reveals nothing and clips the rule.
                // .desc-edit lights the rule only while the TEXT is hovered.
                <div
                  className="desc-edit"
                  style={{
                    padding: 'var(--sp-xs) 0',
                    borderBottom: '1px dashed transparent',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <CollapsibleBody maxLines={3} fontSize="14px" lineHeight={1.6} contentKey={project.description ?? ''}>
                    <p
                      onClick={() => {
                        setDescDraft(project.description ?? '')
                        setEditingDescription(true)
                      }}
                      data-desc-text=""
                      style={{
                        color: project.description ? 'var(--ink)' : 'var(--slate)',
                        margin: 0,
                        cursor: 'pointer',
                        opacity: project.description ? 1 : 0.85,
                        whiteSpace: 'pre-wrap',
                      }}
                      title="Click to edit"
                    >
                      {project.description
                        ? <LinkifiedText text={project.description} />
                        : 'Click to add a description...'}
                    </p>
                  </CollapsibleBody>
                </div>
              )}
            </div>

            {/* Key Links moved to landing card above (Track A §A1, #29) */}

            {/* Team */}
            {project.team && project.team.length > 0 && (
              <div style={{ marginBottom: 'var(--sp-lg)' }}>
                <label
                  style={{
                    ...LABEL_STYLE,
                    display: 'block',
                    marginBottom: 'var(--sp-sm)',
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
                          <FaceDisc label={info.name} initials={info.initials} photo={info.photoUrl} px={28} />
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
            <div className="flex flex-wrap gap-4" style={{ marginTop: 'var(--sp-sm)' }}>
              {project.googleDocUrl && (
                <a
                  href={project.googleDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5"
                  style={{
                    fontSize: '12px',
                    color: 'var(--sk-t2)',
                    textDecoration: 'none',
                  }}
                >
                  <FileText {...ICON_PROPS} size={14} />
                  Google Doc
                  <ExternalLink {...ICON_PROPS} size={10} />
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
                  <Calendar {...ICON_PROPS} size={13} />
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
                  <Clock {...ICON_PROPS} size={13} />
                  Last activity {formatMediumDate(project.lastActivity)}
                </span>
              )}
            </div>
          </div>
        </motion.div>

      </div>
  )

  const insightEl = (
      <InsightPanel projectSlug={project.slug} />
  )

  const confEl = (
      <div style={{ marginTop: '1.5rem' }}>
        <ConferencePrep projectId={project.slug} />
      </div>
  )

  const otherTabsEl = (
<>
      {/* ── FILES TAB ── */}
      {activeTab === 'files' && (
        <div role="tabpanel" id="projectdetail-tabpanel-files" aria-labelledby="projectdetail-tab-files" style={{ marginBottom: '2rem' }}>
          <div className="flex items-center gap-2 mb-3">
            <span style={LABEL_STYLE}>
              Project files
            </span>
          </div>
          <div style={{ borderRadius: 'var(--radius-xl)', padding: '16px 20px' }} className="detail-card">
            <FileUpload entityType="project" entityId={project.slug} products={productList} productId={productFilter} canTag={canTagItems} />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 'var(--sp-sm)' }}>
            Drop a file or click to upload. Attachments are stored on R2 and searchable via the Search page.
          </p>
        </div>
      )}

      {/* ── MEETINGS TAB ── the meetings GRANTED to this project (schema-v122,
          Nick 2026-10-09), out of the meetings the viewer can already see:
          the list comes from the viewer-scoped /api/meetings. */}
      {activeTab === 'meetings' && (
        <div role="tabpanel" id="projectdetail-tabpanel-meetings" aria-labelledby="projectdetail-tab-meetings" style={{ marginBottom: '2rem' }}>
          {projectMeetings.upcoming.length + projectMeetings.past.length === 0 ? (
            <EmptyState
              icon={<Calendar size={32} />}
              title="No meetings for this project yet"
              subtitle="A meeting shows here once its owner or Nick gives this project access on the meeting page."
            />
          ) : (
            ([['Upcoming', projectMeetings.upcoming], ['Past', projectMeetings.past]] as const).map(([label, rows]) =>
              rows.length === 0 ? null : (
                <section key={label} style={{ marginBottom: 'var(--sp-lg)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={LABEL_STYLE}>
                      {label} ({rows.length})
                    </span>
                  </div>
                  <ul className="detail-card" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--sp-xs) 0', listStyle: 'none', margin: 0 }}>
                    {rows.map((m) => (
                      <li key={m.id}>
                        <Link
                          to={`/portal/meetings/${m.id}`}
                          className="flex items-center gap-3"
                          style={{ padding: 'var(--sp-sm) var(--sp-lg)', color: 'var(--ink)', textDecoration: 'none', fontSize: 'var(--value-size)' }}
                        >
                          <Calendar {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', flexShrink: 0 }} />
                          <span style={{ color: 'var(--slate)', minWidth: '5.5rem', fontSize: '12px' }}>{formatShortDate(m.date)}</span>
                          <span className="truncate">{m.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
            )
          )}
        </div>
      )}

      {/* ── TASKS TAB ── (PD-5: TaskGridView per Rule 17 / Decision D23) */}
      {activeTab === 'tasks' && (() => {
        const filtered = taskFilter === 'all' ? scopedTasks : taskFilter === 'active' ? pendingTasks : taskFilter === 'done' ? completedTasks : scopedTasks.filter(t => t.status === 'blocked')
        return (
          <div role="tabpanel" id="projectdetail-tabpanel-tasks" aria-labelledby="projectdetail-tab-tasks" style={{ marginBottom: '2rem' }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {(['all', 'active', 'done', 'blocked'] as const).map(f => {
                  const count = f === 'all' ? scopedTasks.length : f === 'active' ? pendingTasks.length : f === 'done' ? completedTasks.length : scopedTasks.filter(t => t.status === 'blocked').length
                  if (f !== 'all' && count === 0) return null
                  return (
                    <button
                      key={f}
                      onClick={() => setTaskFilter(f)}
                      className="text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors"
                      style={{
                        background: taskFilter === f ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'none',
                        color: taskFilter === f ? 'var(--job-accent)' : 'var(--slate)',
                        border: `1px solid ${taskFilter === f ? 'var(--job-accent)' : 'var(--border-subtle)'}`,
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
                  className="tk-btn tk-sm tip"
                  style={{ opacity: tasksCopied ? 1 : 0.85 }}
                  data-tip={tasksCopied ? 'Copied!' : 'Copy task list to clipboard'}
                  aria-label={tasksCopied ? 'Copied!' : 'Copy task list to clipboard'}
                >
                  {tasksCopied ? <Check {...ICON_PROPS} size={11} /> : <FileText {...ICON_PROPS} size={11} />}
                  {tasksCopied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowCreateTask(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{ backgroundColor: 'var(--job-accent)', color: 'var(--sk-card)', border: 'none', cursor: 'pointer' }}
                >
                  <Plus {...ICON_PROPS} size={13} />
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
                anchorId={selectAnchorId}
                onSelectRange={handleSelectRange}
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
            <RevisionTracker projectId={project.slug} products={productList} productId={productFilter} canTag={canTagItems} />
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
                background: 'var(--sk-panel)',
                border: '1px solid var(--sk-line)',
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
                  try { localStorage.setItem('mnccore.banner.notes-comments.dismissed', '1') } catch { /* best-effort; localStorage can throw in private mode / on quota */ }
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
                <X {...ICON_PROPS} size={14} />
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
                  background: streamFilter === f ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'none',
                  color: streamFilter === f ? 'var(--job-accent)' : 'var(--slate)',
                  border: `1px solid ${streamFilter === f ? 'var(--job-accent)' : 'var(--border-subtle)'}`,
                  cursor: 'pointer',
                  opacity: streamFilter === f ? 1 : 0.85,
                }}
              >
                {f === 'all' ? 'All' : f === 'notes' ? 'Notes' : 'Comments'}
              </button>
            ))}
          </div>

          <ActivityStream project={project} filter={streamFilter} onOpenTask={openTaskInPlace} products={productList} productId={productFilter} canTag={canTagItems} />

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
          <ProjectLiterature projectSlug={project.slug} projectTitle={project.title} isPi={isPi} />
        </div>
      )}
</>
  )

  const projectOverlays = (
<>
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
        defaultProject={project.slug}
        defaultProductId={productFilter}
        onCreate={(task) => {
          // A task made while a product chip is selected lands on that product
          // (the modal preselects the pair); the picker may still move it.
          // The modal closes itself once this resolves; a failed create keeps
          // it open with the text intact.
          return createTask.mutateAsync({ ...task, project_id: task.project_id ?? project.slug }).then((resp) => {
            // S16: confirm the create + offer a working "Open →" into the new
            // task's detail panel instead of dead-ending in silence.
            const created = resp?.data
            showSuccess(
              'Task created',
              created ? { label: 'Open →', onClick: () => setSelectedTask(created) } : undefined,
            )
          })
        }}
      />

      {/* Scoped dark mode styles */}
      <style>{`
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
          background: linear-gradient(to right, transparent, var(--page-bg));
          z-index: 1;
        }
        /* The fade ends in the colour actually behind the strip: the page
           canvas (--page-bg, flips with the theme). --cream is the card/field
           well, #fff in light, and painted a white block over the last tab on
           the cream page (N1.17 fixed the dark half of the same smear). */
      `}</style>
</>
  )

  // Layout (Nick 2026-10-12, 'C'): header, then ONE row holding the products
  // and the stats line (above the tabs, so every tab shows it), then the tabs and
  // the main column. A sticky right rail holds the folder actions, members,
  // links, published work and recent activity, like Today's rail.
  const overdueCount = pendingTasks.filter((t) => t.due_date && t.due_date < localDateKey()).length
  const statList = [
    { key: 'active', value: pendingTasks.length, label: 'active', rule: 't' },
    { key: 'overdue', value: overdueCount, label: 'overdue', rule: 'o' },
    { key: 'done', value: completedTasks.length, label: 'done', rule: 'n' },
  ].filter((s) => s.value > 0)
  // Header counts in Today's stat anatomy (.tk-stats / .tk-st). Plain numbers,
  // not links: Tasks has no per-project filter to land on. Zeros are not shown.
  const renderStats = (style: React.CSSProperties) =>
    statList.length === 0 ? null : (
      <div className="tk" data-testid="project-stats">
        <div className="tk-stats" style={style}>
          {statList.map((s) => (
            <div key={s.key} className="tk-st" aria-label={`${s.value} ${s.label}`}>
              <span className={`tk-rl tk-${s.rule}`} aria-hidden="true" />
              <span>
                <span className="tk-v" style={{ display: 'block' }}>{s.value}</span>
                <span className="tk-l">{s.label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    )

  // Compact title: the short name sits on the title's line when both fit,
  // and drops under the title when they do not (.pj-title wraps).
  const titleCompactEl = (
    <div className="pj-title">
      {editingTitle ? (
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleTitleSave() }
            if (e.key === 'Escape') { setTitleDraft(project.title); setEditingTitle(false) }
          }}
          ref={titleInputRef}
          aria-label="Edit project title"
          className="pj-title-input"
        />
      ) : (
        <h1 className="pj-h1">
          <button
            type="button"
            className="pj-edit-btn"
            onClick={() => { setTitleDraft(project.title); setEditingTitle(true) }}
            title="Edit title"
          >
            {project.title}
          </button>
        </h1>
      )}
      {editingShortName ? (
        <input
          value={shortNameDraft}
          onChange={(e) => setShortNameDraft(e.target.value)}
          onBlur={handleShortNameSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleShortNameSave()
            if (e.key === 'Escape') { setShortNameDraft(project.short_name ?? ''); setEditingShortName(false) }
          }}
          ref={shortNameInputRef}
          placeholder="Add short name..."
          className="pj-short-input"
        />
      ) : project.short_name ? (
        <button
          type="button"
          className="pj-short pj-edit-btn"
          onClick={() => { setEditingShortName(true); setShortNameDraft(project.short_name ?? '') }}
          title="Edit short name"
        >
          {project.short_name}
        </button>
      ) : null}
    </div>
  )

  const openTasksSection = (
    <section className="pj-sec" data-testid="project-open-tasks">
      <SectionHead
        title="Open tasks"
        count={pendingTasks.length > 0 ? pendingTasks.length : undefined}
        right={
          <span className="pj-head-links">
            <button type="button" onClick={() => setShowCreateTask(true)} className="pj-link hit-area">+ Add task</button>
            {pendingTasks.length > 3 && (
              <button type="button" onClick={() => setActiveTab('tasks')} className="pj-link hit-area">View all →</button>
            )}
          </span>
        }
      />
      {openListEl}
    </section>
  )

  const recentSection = (
    <section className="pj-sec" data-testid="project-recent">
      <SectionHead
        title="Recent"
        right={recentActivity.length > 0 ? (
          <button type="button" onClick={() => goToStream('all')} className="pj-link hit-area">All →</button>
        ) : undefined}
      />
      {recentListEl}
    </section>
  )

  const folderEl = (project.slug ?? project.id) ? (
    <ProjectFolderActions
      projectRef={(project.slug ?? project.id) as string}
      projectLabel={projectShortLabel(project)}
      piFallbackFolder={isPi && isLocalFolder(project.primary_folder) ? project.primary_folder : null}
    />
  ) : null

  const overviewEl = (
    <div role="tabpanel" id="projectdetail-tabpanel-overview" aria-labelledby="projectdetail-tab-overview">
      {openTasksSection}
      {strategicEl}
      {detailsEl}
      {insightEl}
      {confEl}
    </div>
  )

  const statsInline = renderStats({ margin: 0, padding: 0, border: 0 })

  return (
    <>
      <Breadcrumb backTo="/projects" backLabel="Projects" current={project.title} />
      <AllProjectsBanner />
      <PageWithRail
        testId="project-grid"
        railLabel="Project side panel"
        railTestId="project-rail"
        head={
          <div className="pj-head">
            <div className="pj-headrow">
              {titleCompactEl}
              {iconsEl}
            </div>
            <div className="pj-metarow">
              {metaEl}
              {!project.short_name && !editingShortName && (
                <button
                  type="button"
                  className="pj-short-empty"
                  onClick={() => { setEditingShortName(true); setShortNameDraft('') }}
                >
                  + Short name
                </button>
              )}
            </div>
            <PageHeartbeat />
          </div>
        }
        /* The folder actions come right after the header in the DOM, so Tab
           reaches them early and the phone shows them under the header. The
           grid puts them at the top of the rail on a wide screen. */
        railTop={folderEl}
        rail={
          <>
            {membersEl}
            {linksEl}
            {pubsEl}
            {recentSection}
            <div className="pj-compose">{composeEl}</div>
          </>
        }
      >
        <div className="pj-main">
          {agendaFormEl}
          {project.id ? (
            <ProjectProducts projectId={project.id} slug={project.slug} stats={statsInline} selectedId={productFilter} onSelect={setProductFilter} />
          ) : statsInline}
          {tabsEl}
          {activeTab === 'overview' && overviewEl}
          {otherTabsEl}
        </div>
      </PageWithRail>
      {projectOverlays}
      <style>{PJ_CSS}</style>
    </>
  )
}

// Project page styles. The grid, rail and stack rules live in PageWithRail
// (index.css "PageWithRail"); this keeps the title, link and tab rules.
const PJ_CSS = `
.pj-head .pg-hb { margin-top: 2px; height: 10px; }
.pj-headrow { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.pj-metarow { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }
.pj-title { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.pj-h1 { margin: 0; min-width: 0; font-weight: 700; font-size: clamp(1.25rem, 2.6vw, 1.6rem); line-height: 1.2; color: var(--ink); }
.pj-edit-btn { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.pj-edit-btn:focus-visible { outline: 2px solid var(--job-accent); outline-offset: 2px; border-radius: var(--radius-sm); }
.pj-short { flex: none; font-size: var(--value-size); color: var(--sk-t3); white-space: nowrap; }
.pj-short-empty { background: none; border: 0; padding: 0; font-size: 11px; color: var(--sk-t3); cursor: pointer; white-space: nowrap; }
.pj-short-empty:hover { color: var(--sk-t1); }
.pj-title-input {
  font-weight: 700; font-size: clamp(1.25rem, 2.6vw, 1.6rem); color: var(--ink); background: none; border: 0;
  border-bottom: 2px solid var(--job-accent); outline: none; padding: 2px 0; width: 100%; font-family: inherit; line-height: 1.2;
}
.pj-short-input {
  font-size: var(--value-size); color: var(--ink); background: none; border: 0; border-bottom: 1px solid var(--job-accent);
  outline: none; padding: 2px 0; max-width: 240px; font-family: inherit;
}
.pj-sec { margin-bottom: 22px; }
.pwr-rail .pj-sec { margin-bottom: 0; }
.pj-head-links { display: inline-flex; align-items: center; gap: 14px; }
.pj-link { background: none; border: 0; padding: 0; font-size: 11px; color: var(--job-accent); cursor: pointer; }
.pj-main .project-tab-strip-wrap { margin-bottom: var(--sp-lg) !important; }
.pj-main .project-tab-strip button { padding-left: 10px; padding-right: 10px; }
.pj-compose [data-compose-slot] { border-top: 0 !important; padding-top: 0 !important; }
`



// ProjectKeyLinks (read-only) — superseded by KeyLinksEditor imported from
// ../components/KeyLinksEditor. The editable editor ships display AND add/edit
// /remove controls in one component.
// ProjectStoredLinkChip — superseded by shared StoredLinkChip in
// ../components/StoredLinkChip. Do not fork.
