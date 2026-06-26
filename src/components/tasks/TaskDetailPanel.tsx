import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import {
  X, Circle, Clock, User, Flag, Scale,
  ArrowRightLeft,
  FileText, MessageSquare, Upload, Eye, ScrollText,
  Users, Bell, ClipboardList, Link2, Trash2, Plus, ExternalLink, RefreshCw, Copy, Check,
  ChevronUp, ChevronDown, Send, Paperclip, AtSign, Smile, Type, Loader2,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import CollapsibleSection from '../CollapsibleSection'
import FileUpload from '../FileUpload'
const RichTextEditor = lazy(() => import('../RichTextEditor'))
import { useUpdateTask, useUpdateTaskStatus, usePostTaskUpdate, useBulkUpdateTasks } from '../../hooks/useMutations'
import { useTaskViewTracking } from '../../hooks/useTaskViewTracking'
import { useProjects, useDecisions, useTaskLinks } from '../../hooks/useApiData'
import StoredLinkChip from '../StoredLinkChip'
import GhostSelect from '../ui/GhostSelect'
import type { DecisionRow } from '../../hooks/useApiData'
import { parseTagsString } from '../../lib/tagUtils'
import WorkOnActions from '../WorkOnActions'
import { useToast } from '../../hooks/useToast'
import { useUndoToast } from '../UndoToast'
import { formatRelativeTime } from '../../lib/dateUtils'
import { appendCharToInput, stripMeetingMarker } from '../../lib/textUtils'
import { ACCENT_GOLD, PANEL_BG, isTaskDone, withAlpha } from '../../lib/taskGrouping'
import MentionInput from '../MentionInput'
import TypingIndicator from '../TypingIndicator'
import { getPersonInfo, getAllMembers, directors } from '../../data/team'
import { shortLabelForUrl, gmailKind, buildSeededWorkOnUri } from '../../lib/urlClassify'
import { detectOrigin } from '../../lib/launchOrigin'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import LinkChip from '../LinkChip'
import Avatar from '../Avatar'
import InlineSelect from '../InlineSelect'
import PresenceAvatars from '../PresenceAvatars'
import { usePresence, useTyping, useIntentBroadcast, type Intent } from '../../hooks/usePresence'
import { useIsMobile } from '../../hooks/useIsMobile'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import type { TaskRow } from '../../lib/api'
import { PATHS } from '../../constants/paths'

// ── Detail sub-modules ──────────────────────────────────────
import { FieldBlock, EditableTitle, EditableShortTitle, EditableTextarea, ProjectInlineGhostSelect, DueInlineSelect, WorkflowSection, type WorkflowFields } from './detail/FieldControls'
import { MeLockToggle } from '../ui/MeLockToggle'
import { TaskDependenciesSection } from './detail/TaskDependencies'
import { SubtaskSection } from './detail/SubtaskSection'
import { HandoffSection } from './detail/HandoffSection'
import { TaskActivityFeed } from './detail/TaskActivityFeed'
import TaskIntelligence from './detail/TaskIntelligence'
import KeyLinksEditor from '../KeyLinksEditor'
import { displayRank } from '../../lib/pbLinkDisplayOrder.generated'
import { Brain } from 'lucide-react'

type Tab = 'overview' | 'intelligence' | 'activity' | 'files' | 'details'

const TABS: { key: Tab; label: string; icon: typeof Circle }[] = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'intelligence', label: 'Intelligence', icon: Brain },
  { key: 'activity', label: 'Activity', icon: Clock },
  { key: 'files', label: 'Files', icon: Upload },
  { key: 'details', label: 'Details', icon: Flag },
]

// Deep-link backward compat: ?tab=notes and ?tab=comments from old links
// resolve to the unified Activity tab.
function resolveTab(raw: string | null): Tab {
  if (raw === 'notes' || raw === 'comments') return 'activity'
  if (raw && (['overview', 'intelligence', 'activity', 'files', 'details'] as string[]).includes(raw)) return raw as Tab
  return 'overview'
}

interface TaskDetailPanelProps {
  task: TaskRow | null
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}

export default function TaskDetailPanel({ task: taskProp, onClose, onPrev, onNext }: TaskDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const updateTask = useUpdateTask()
  const updateStatus = useUpdateTaskStatus()
  const bulkUpdate = useBulkUpdateTasks()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isMobilePanel = useIsMobile()

  // S14: in-panel task swap. Clicking a dependency (blocked-by / blocks) opens
  // that task IN the panel without a parent round-trip. The swap target
  // overrides taskProp until the panel is reopened on a different task.
  const [swapTask, setSwapTask] = useState<TaskRow | null>(null)
  useEffect(() => { setSwapTask(null) }, [taskProp?.id])
  const baseTask = swapTask ?? taskProp

  // Parent pages hold selectedTask as a state snapshot. After a mutation
  // the ['tasks', ...] cache updates but that snapshot goes stale (GH #7).
  // Subscribe to the cache and surface the freshest row for this task id.
  const [liveTask, setLiveTask] = useState<TaskRow | null>(baseTask)
  useEffect(() => { setLiveTask(baseTask) }, [baseTask])
  useEffect(() => {
    if (!baseTask?.id) return
    const findFresh = (): TaskRow | null => {
      const queries = qc.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
      for (const [, data] of queries) {
        const fresh = data?.find(t => t.id === baseTask.id)
        if (fresh) return fresh
      }
      return null
    }
    const initial = findFresh()
    if (initial) setLiveTask(initial)
    const unsub = qc.getQueryCache().subscribe(() => {
      const fresh = findFresh()
      if (fresh) setLiveTask(fresh)
    })
    return unsub
  }, [qc, baseTask?.id])
  const task = liveTask ?? baseTask
  // Resolve the task's project to surface its local working folder (mnccore://
  // open/workon affordances). task.project_id is the slug projection from
  // /api/tasks; match by slug first, fall back to id.
  const projectsQuery = useProjects()
  const taskProject = task?.project_id
    ? (projectsQuery.data ?? []).find((p) => p.slug === task.project_id)
    : undefined
  const viewerSlugs = usePresence('task', task?.id)
  const [quickAddHasContent, setQuickAddHasContent] = useState(false)
  const taskSelfIntent: Intent = quickAddHasContent ? 'commenting' : 'viewing'
  const taskPeerIntents = useIntentBroadcast('task', task?.id, taskSelfIntent)
  // Slack-style seen: opening the panel acknowledges the assignment silently
  // (assignee-only; replaces the old explicit Acknowledge button).
  useTaskViewTracking(task)
  const { showUndo } = useUndoToast()
  // Support ?tab= deep links; retire 'notes' and 'comments' → 'activity'.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'overview'
    const raw = new URLSearchParams(window.location.search).get('tab')
    return resolveTab(raw)
  })
  const [copied, setCopied] = useState(false)
  // Brief class flash on tab change so the CSS keyframe re-plays. Class
  // is added when activeTab changes, removed ~140ms later. Tab content
  // stays mounted (display:none) so unsaved Quick Add drafts survive. M-03.
  const [tabAnimating, setTabAnimating] = useState<Tab | null>(null)
  useEffect(() => {
    setTabAnimating(activeTab)
    const t = setTimeout(() => setTabAnimating(null), 140)
    return () => clearTimeout(t)
  }, [activeTab])

  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Swipe-right-to-dismiss (restored 2026-04-23 night).
  // Prior raw-touch implementation was removed 2026-04-20 due to two real
  // bugs; both are solved here:
  //  (1) Pixel-5 inert-drag — raw React setState-per-touchmove raced with
  //      the Android compositor and rendered as no-op. Fix: framer-motion
  //      owns the transform via MotionValue + RAF; no state round-trip.
  //  (2) iOS Safari edge-swipe-back — right-swipes starting near the left
  //      edge conflict with the OS back gesture. Fix: `edgeGuardRef` blocks
  //      drag activation when initial touch is within 32px of viewport left.
  // `touch-action: pan-y` lets vertical scrolling through content still work;
  // framer-motion's own drag handler enforces the horizontal lock.
  const dragX = useMotionValue(0)
  const backdropOpacity = useTransform(dragX, [0, 320], [1, 0])
  const edgeGuardRef = useRef<boolean>(false)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) { edgeGuardRef.current = true; return }
    const t = e.touches[0]
    // Within 32px of the left edge → let iOS Safari own the gesture.
    edgeGuardRef.current = t.clientX < 32
  }

  // Focus trap + Escape + Alt+Up/Down navigation. Audit caught: prior trap
  // checked only `activeElement === first/last`, which leaks when async-mounted
  // regions (KeyLinksEditor, RichTextEditor, comments) inject autofocusing
  // elements that pull focus outside the panel. New rule: if focus drifts
  // outside panelRef on any Tab, snap it back to the first focusable.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement
        if (target.closest('input, textarea, [contenteditable="true"], .ProseMirror')) return
        onClose()
        return
      }
      if (e.altKey && e.key === 'ArrowUp' && onPrev) { e.preventDefault(); onPrev(); return }
      if (e.altKey && e.key === 'ArrowDown' && onNext) { e.preventDefault(); onNext(); return }

      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      const isInsidePanel = active && panelRef.current.contains(active)
      if (!isInsidePanel) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, onPrev, onNext])

  // Capture the element that had focus when the panel opened so we can
  // restore focus there on close (a11y best practice). Then move focus into
  // the panel — title region rather than close button so keyboard users
  // don't sit on "press Enter to cancel."
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!openerRef.current) {
      openerRef.current = document.activeElement as HTMLElement | null
    }
    const titleRegion = panelRef.current?.querySelector<HTMLElement>('#task-detail-title')
    const closeBtn = panelRef.current?.querySelector<HTMLElement>('[data-testid="close-detail-panel"]')
    ;(titleRegion ?? closeBtn)?.focus()
  }, [task?.id])

  // Restore focus to the opener element when the panel unmounts.
  useEffect(() => {
    return () => {
      const opener = openerRef.current
      if (opener && document.body.contains(opener)) {
        try { opener.focus() } catch { /* ignore */ }
      }
    }
  }, [])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to prevent immediate close from the click that opened it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  if (!task) return null

  const handleFieldUpdate = (field: string, value: unknown) => {
    updateTask.mutate({ id: task.id, fields: { [field]: value } })
  }

  const handleStatusChange = (status: string) => {
    if (status === task.status) return
    const prev = task.status
    updateStatus.mutate({ id: task.id, status })
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked', waiting_external: 'Waiting (External)' }
    showUndo(`Status → ${labels[status] || status}`, () => updateStatus.mutate({ id: task.id, status: prev }))
  }

  // Delete with a real 5s undo. The server has NO un-delete path
  // (op:'delete' is a one-way tombstone, no restore/reopen endpoint), so undo
  // is implemented as a delayed commit: optimistically drop the row from every
  // ['tasks'] cache + close the panel now, then fire the actual server delete
  // only after the 5s window elapses. Undo restores the snapshots and cancels
  // the pending server call — nothing ever hits D1.
  const handleDeleteTask = () => {
    const id = task.id
    const label = task.short_title || task.title || task.description || 'task'

    // Snapshot every ['tasks'] cache so undo is exact.
    const snapshots = qc.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
    snapshots.forEach(([key, data]) => {
      if (!data) return
      qc.setQueryData<TaskRow[]>(key, data.filter((t) => t.id !== id))
    })

    let committed = false
    const commitTimer = setTimeout(() => {
      committed = true
      bulkUpdate.mutate({ ids: [id], action: 'delete' })
    }, 5000)

    showUndo(`Deleted "${label}"`, () => {
      if (committed) return
      clearTimeout(commitTimer)
      snapshots.forEach(([key, data]) => { if (data) qc.setQueryData(key, data) })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    })

    onClose()
  }

  return (
    <>
      {/* Backdrop — tap to dismiss + fades with swipe progress on mobile. */}
      <motion.div
        data-testid="detail-backdrop"
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: withAlpha(PANEL_BG, 30),
          opacity: backdropOpacity,
        }}
      />

      {/* Panel */}
      <motion.div
        ref={panelRef}
        data-testid="task-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        className="fixed z-50 task-detail-panel"
        onTouchStart={handleTouchStart}
        drag={typeof window !== 'undefined' && window.innerWidth < 768 ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        dragMomentum={false}
        dragListener={!edgeGuardRef.current}
        onDragStart={() => {
          if (edgeGuardRef.current) return false
        }}
        onDragEnd={(_, info) => {
          const width = panelRef.current?.offsetWidth ?? 400
          if (info.offset.x > width * 0.3 || info.velocity.x > 500) onClose()
        }}
        style={isMobilePanel ? {
          // N1.11 — TRUE full-screen sheet (canon pt 6). The old 90vw cap left
          // a dead sliver of the page showing through, and z-50 sat UNDER the
          // MobileTabBar (--z-sidebar: 100) so live nav floated on a modal
          // surface and occluded the last content strip.
          x: dragX,
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '100vw',
          zIndex: 'var(--z-modal-backdrop)',
          backgroundColor: 'var(--cream)',
          animation: reduceMotion ? 'none' : 'slideIn 200ms ease-out',
          touchAction: 'pan-y',
          overflowX: 'hidden',
          overflowY: 'auto',
        } : {
          // Desktop: floating side-peek — inset 12px all edges, rounded all corners
          x: dragX,
          right: 12,
          top: 12,
          bottom: 12,
          height: 'calc(100vh - 24px)',
          width: 'clamp(420px, 40vw, 640px)',
          maxWidth: 'calc(90vw - 12px)',
          backgroundColor: 'var(--cream)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
          animation: reduceMotion ? 'none' : 'slideIn 200ms ease-out',
          touchAction: 'pan-y',
        }}
      >
        {/* Inner scroll container — carries overflow-y-auto so sticky header
            sticks within the rounded card and content clips to the border-radius.
            Mobile uses the root motion.div overflow directly (no wrapping needed). */}
        <div style={isMobilePanel ? {} : { height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Header — flat: same surface as panel, single hairline bottom only */}
        <div className="task-detail-sticky task-detail-header sticky top-0 z-10 flex items-center justify-between px-5 py-3" style={{ backgroundColor: 'var(--cream)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              Task Detail
            </span>
            {viewerSlugs.length > 0 && <PresenceAvatars slugs={viewerSlugs} peerIntents={taskPeerIntents} />}
          </div>
          <div className="flex items-center gap-1">
            {/* Prev/Next navigation */}
            {(onPrev || onNext) && (
              <div className="flex items-center mr-1">
                <button
                  onClick={onPrev}
                  disabled={!onPrev}
                  title="Previous task (Alt+↑)"
                  style={{ background: 'none', border: 'none', cursor: onPrev ? 'pointer' : 'default', color: 'var(--slate)', padding: '2px', opacity: onPrev ? 'var(--ink-hint)' : 0.15 }}
                >
                  <ChevronUp size={14} strokeWidth={1.5} absoluteStrokeWidth />
                </button>
                <button
                  onClick={onNext}
                  disabled={!onNext}
                  title="Next task (Alt+↓)"
                  style={{ background: 'none', border: 'none', cursor: onNext ? 'pointer' : 'default', color: 'var(--slate)', padding: '2px', opacity: onNext ? 'var(--ink-hint)' : 0.15 }}
                >
                  <ChevronDown size={14} strokeWidth={1.5} absoluteStrokeWidth />
                </button>
              </div>
            )}
            <button
              data-testid="copy-task-link"
              onClick={() => {
                const url = `${window.location.origin}${PATHS.myTasks}?open=${task.id}`
                navigator.clipboard.writeText(url).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }}
              title="Copy task link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--slate)', padding: 'var(--sp-xs)', opacity: copied ? 1 : 'var(--ink-hint)', transition: 'all 150ms' }}
            >
              {copied ? <Check size={14} strokeWidth={1.5} absoluteStrokeWidth /> : <Copy size={14} strokeWidth={1.5} absoluteStrokeWidth />}
            </button>
            <button
              data-testid="close-detail-panel"
              onClick={onClose}
              aria-label="Close task"
              className="task-detail-close"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--slate)',
                padding: 'var(--sp-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </div>
        </div>

        {/* Always visible: Title + Status */}
        <div className="px-5 pt-5 pb-3 flex flex-col gap-4" style={{ minWidth: 0 }}>
          <div id="task-detail-title" tabIndex={-1} style={{ outline: 'none', minWidth: 0, overflowWrap: 'anywhere' }}>
            <EditableTitle
              value={task.title || task.description}
              onSave={(v) => handleFieldUpdate('title', v)}
            />
            {/* Short title — concise row label (Rule 68). Editable inline,
                mirrors ProjectDetail's short_name affordance. */}
            <div className="flex items-center" style={{ gap: 'var(--sp-xs)', marginTop: 'var(--sp-xs)', minWidth: 0 }}>
              <label
                className="flex items-center flex-shrink-0"
                style={{ gap: 'var(--sp-xs)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}
              >
                <Type size={11} strokeWidth={1.5} absoluteStrokeWidth style={{ opacity: 0.85 }} />
                Short title
              </label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableShortTitle
                  value={task.short_title || ''}
                  onSave={(v) => handleFieldUpdate('short_title', v || null)}
                />
              </div>
            </div>
            {/* Task age + acknowledged + source — descriptive metadata, snug
                under the title group (Nick 2026-06-11: it belongs WITH the
                title, not floating between the control sections). */}
            <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 6, fontSize: 10, color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
              {task.created_at && (
                <span>Created {formatRelativeTime(task.created_at)}</span>
              )}
              {/* N1.22 — each separator dot is bundled with its item in one
                  nowrap unit so a line wrap can never strand a leading or
                  trailing '·' on its own. */}
              {task.acknowledged_at && (
                <span className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1">
                    <Clock size={9} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
                    Acknowledged {formatRelativeTime(task.acknowledged_at)}
                    {task.acknowledged_by ? ` by ${task.acknowledged_by}` : ''}
                  </span>
                </span>
              )}
              {task.source && (
                <span className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
                  <span aria-hidden="true">·</span>
                  <span className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--teal-active)', color: 'var(--teal)', opacity: 1 }}>
                    {task.source}
                  </span>
                </span>
              )}
              {(task as any).recurrence && (
                <span className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}>
                  <span aria-hidden="true">·</span>
                  <span className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--gold-active)', color: 'var(--gold)', opacity: 1 }}>
                    <RefreshCw size={8} strokeWidth={1.5} absoluteStrokeWidth style={{ display: 'inline', marginRight: 2 }} aria-hidden="true" />
                    {(task as any).recurrence}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Inline fields row: Status · Priority · Project · Due · Delete
              GhostSelect for Status/Priority/Project (Rule 45: fully opaque
              themed menus, not native OS dropdowns). */}
          {/* N1.22 — tight rowGap keeps the wrapped field rows reading as one
              group on phones instead of a ragged scatter. */}
          <div className="flex items-center flex-wrap" style={{ minWidth: 0, columnGap: 8, rowGap: 4 }}>
            <GhostSelect
              aria-label="Status"
              value={task.status}
              onChange={handleStatusChange}
              options={[
                { value: 'todo', label: 'To Do' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'waiting_external', label: 'Waiting (Ext.)' },
                { value: 'blocked', label: 'Blocked' },
                { value: 'done', label: 'Done' },
              ]}
            />
            <GhostSelect
              aria-label="Priority"
              value={task.priority || 'medium'}
              onChange={(v) => handleFieldUpdate('priority', v)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
            <ProjectInlineGhostSelect
              value={task.project_id || ''}
              onChange={(v) => handleFieldUpdate('project_id', v || null)}
            />
            <DueInlineSelect
              value={task.due_date || ''}
              onChange={(v) => handleFieldUpdate('due_date', v || null)}
            />
            <button
              type="button"
              data-testid="delete-task"
              onClick={handleDeleteTask}
              title="Delete this task"
              aria-label="Delete task"
              className="flex items-center gap-1 flex-shrink-0 rounded-lg transition-colors ml-auto hov-opacity hov-border hov-bg"
              style={{
                background: 'none',
                border: '1px solid transparent',
                color: 'var(--maroon)',
                opacity: 0.85,
                cursor: 'pointer',
                fontSize: 'var(--text-small)',
                fontWeight: 500,
                padding: '4px 8px',
                whiteSpace: 'nowrap',
                '--hov-opacity': '1',
                '--hov-border': 'var(--maroon)',
                '--hov-bg': 'color-mix(in srgb, var(--maroon) 7%, transparent)',
              } as React.CSSProperties}
            >
              <Trash2 size={12} strokeWidth={1.5} absoluteStrokeWidth />
              Delete
            </button>
          </div>

        </div>

        {/* Composer zone — ONE elevated element on the flat panel surface.
            Desktop: inset card (--surface-2 bg + --border-subtle border + radius).
            Mobile: OverviewQuickAdd handles its own sticky positioning + bg;
            skip the card wrapper so the component's negative-margin breakout works. */}
        <div className="px-5" style={{ paddingTop: 'var(--sp-xs)', paddingBottom: 'var(--sp-md)' }}>
          {isMobilePanel ? (
            <OverviewQuickAdd
              taskId={task.id}
              taskTitle={task.title}
              projectSlug={task.project_id}
              primaryFolder={taskProject?.primary_folder}
              onJumpToTab={(tab) => setActiveTab(tab)}
              onContentChange={setQuickAddHasContent}
            />
          ) : (
            <div
              style={{
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--sp-sm) var(--sp-md)',
              }}
            >
              <OverviewQuickAdd
                taskId={task.id}
                taskTitle={task.title}
                projectSlug={task.project_id}
                primaryFolder={taskProject?.primary_folder}
                onJumpToTab={(tab) => setActiveTab(tab)}
                onContentChange={setQuickAddHasContent}
              />
            </div>
          )}
        </div>

        {/* Tab Bar — sits below the composer card with its own border-b. */}
        {/* N1.04: scrollable when narrow — without overflow-x the strip clips
            Files/Details on phones AND tablets with no way to reach them. */}
        <div className="flex px-5" style={{ borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-colors"
              style={{
                whiteSpace: 'nowrap',
                flexShrink: 0,
                color: activeTab === key ? 'var(--teal)' : 'var(--slate)',
                opacity: activeTab === key ? 1 : 0.85,
                borderBottom: activeTab === key ? '2px solid var(--teal)' : '2px solid transparent',
                background: 'none',
                border: 'none',
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === key ? 'var(--teal)' : 'transparent',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              <Icon size={13} strokeWidth={1.5} absoluteStrokeWidth />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content — all rendered, display:none for inactive to preserve state */}
        <div className="p-5 flex flex-col" style={{ gap: 'var(--sp-xl)' }}>

          {/* ── Overview Tab ── */}
          <div
            className={tabAnimating === 'overview' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'overview' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-xl)' }}
          >

            {/* Acknowledgement is now automatic — opening this panel as the
                assignee fires it (useTaskViewTracking above). The old explicit
                "Acknowledge Assignment" button is gone (Nick 2026-06-11:
                Slack-style — seeing the task IS the acknowledgement). */}

            {/* Recent activity peek — first thing visible in the tab.
                Nick wants this where project-actions were: high in the panel. */}
            <OverviewActivityPeek
              taskId={task.id}
              onViewAll={() => setActiveTab('activity')}
            />

            {/* Compact assignee row — small avatar + name inline with ▾ affordance.
                Same visual weight as the Status/Priority/Project/Due selects above.
                Project actions (WorkOnActions / Open) follow on the same row. */}
            <div className="flex items-center gap-3 flex-wrap">
              <CompactAssigneeRow
                value={task.assignee}
                onChange={(v) => handleFieldUpdate('assignee', v)}
              />
              {(taskProject?.primary_folder || task.project_id) && (
                <div className="flex items-center gap-2 ml-auto">
                  {taskProject?.primary_folder && (
                    <WorkOnActions
                      primaryFolder={taskProject.primary_folder}
                      projectLabel={taskProject.title}
                      variant="compact"
                    />
                  )}
                  {task.project_id && (
                    <button
                      type="button"
                      onClick={() => { onClose(); navigate(PATHS.project(task.project_id!)) }}
                      title="Open project"
                      aria-label="Open project"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 'var(--text-small)', fontWeight: 500, padding: '2px 4px' }}
                    >
                      Open <ExternalLink size={12} strokeWidth={1.5} absoluteStrokeWidth />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Key Links — promoted to Overview so users actually see them (prior:
                buried on Details tab with non-underlined ink-colored text, missed).
                Now fully editable: add/edit/remove up to 3 slots inline. */}
            <DetailKeyLinks
              task={task}
              onUpdate={(fields) => {
                // Batch all 6 key_link_* fields in a single mutation so the
                // server sees one update, not six racing requests.
                updateTask.mutate({ id: task.id, fields })
              }}
            />

            {/* Description (rich text, ghost empty → editing border).
                Empty state: one ghost line at --ink-hint, no box.
                Click → editor opens with toolbar + focus border (autosave on blur). */}
            <DescriptionField
              descriptionJson={task.description_json || null}
              descriptionText={task.description ? stripMeetingMarker(task.description) : null}
              onUpdate={(json) => handleFieldUpdate('description_json', json)}
            />

            {/* Subtasks + Workflow — side-by-side (#113). Two equal columns
                so users see planning context (who/what I'm waiting on,
                commitments) alongside the checklist without scrolling.
                WorkflowSection already has an inner grid-cols-2 for its 4
                fields, so this is purely a layout promotion. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-xl)', alignItems: 'start' }}>
              <SubtaskSection taskId={task.id} />
              <div className="flex flex-col" style={{ gap: 'var(--sp-xs, 6px)' }}>
                <div style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workflow</div>
                <WorkflowSection
                  fields={{
                    waiting_on: task.waiting_on ?? null,
                    next_checkin_date: task.next_checkin_date ?? null,
                    promised_to: task.promised_to ?? null,
                    promise_date: task.promise_date ?? null,
                  } as WorkflowFields}
                  onChange={(patch) => {
                    updateTask.mutate({ id: task.id, fields: patch as Record<string, unknown> })
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── Intelligence Tab — GH #35 ── */}
          <div
            className={tabAnimating === 'intelligence' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'intelligence' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-xl)' }}
          >
            <TaskIntelligence task={task} />
          </div>

          {/* ── Details Tab ── */}
          <div
            className={tabAnimating === 'details' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'details' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-xl)' }}
          >

            {/* Row: Watchers + Reminder */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <FieldBlock label="Watchers" icon={Users} noContainer>
                <WatchersPicker value={task.watchers || ''} onChange={(v) => handleFieldUpdate('watchers', v || null)} />
              </FieldBlock>
              <FieldBlock label="Reminder" icon={Bell}>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={task.reminder_days ?? ''}
                  placeholder="e.g. 2"
                  onChange={(e) => handleFieldUpdate('reminder_days', e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-transparent outline-none"
                  style={{ color: 'var(--ink)', fontSize: 'var(--value-size)' }}
                />
              </FieldBlock>
            </div>

            {/* Row: Recurrence (single field) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <FieldBlock label="Recurrence" icon={RefreshCw}>
                <InlineSelect
                  value={task.recurrence || 'none'}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'biweekly', label: 'Biweekly' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                  onChange={(v) => handleFieldUpdate('recurrence', v === 'none' ? null : v)}
                />
              </FieldBlock>
              <div>
                {task.recurrence && task.recurrence !== 'none' && (
                  <span style={{ fontSize: '10px', color: 'var(--teal)', opacity: 0.8 }}>
                    Auto-creates next task when completed
                  </span>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div>
              <label className="flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)', fontSize: 'var(--label-size)' }}>
                <ClipboardList size={11} strokeWidth={1.5} absoluteStrokeWidth />
                Instructions
              </label>
              <EditableTextarea
                value={task.instructions || ''}
                onSave={(v) => handleFieldUpdate('instructions', v || null)}
                placeholder="Step-by-step instructions, protocols, or notes..."
              />
            </div>

            {/* Dependencies — S14: clicking a blocker/blocked task swaps the
                panel to it instead of dead-ending on a no-op handler. */}
            <TaskDependenciesSection task={task} onFieldUpdate={handleFieldUpdate} onOpenTask={(t) => setSwapTask(t)} />

            {/* Handoffs */}
            <CollapsibleSection
              title="Handoffs"
              icon={<ArrowRightLeft size={11} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />}
              defaultOpen={false}
              storageKey={`task-handoffs-${task.id}`}
            >
              <HandoffSection taskId={task.id} currentAssignee={task.assignee} />
            </CollapsibleSection>

            {/* Related Decisions */}
            {task.project_id && (
              <CollapsibleSection
                title="Related Decisions"
                icon={<Scale size={11} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--gold)', opacity: 0.85 }} />}
                defaultOpen={false}
                storageKey={`task-decisions-${task.id}`}
              >
                <ProjectDecisionsSection projectSlug={task.project_id} />
              </CollapsibleSection>
            )}

            {/* Files */}
            <CollapsibleSection
              title="Files"
              icon={<FileText size={11} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />}
              defaultOpen={false}
              storageKey={`task-files-${task.id}`}
            >
              <FileUpload entityType="task" entityId={task.id} />
              <div style={{ marginTop: 'var(--sp-md)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--sp-md)' }}>
                <TaskFilesSection taskId={task.id} />
              </div>
            </CollapsibleSection>

            {/* Meta info */}
            <div className="flex items-center gap-3 text-[10px] pt-2 border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
              {task.source && <span>Source: {task.source}</span>}
              {task.created_at && <span>Created {formatRelativeTime(task.created_at)}</span>}
              {task.completed_at && <span>Completed {formatRelativeTime(task.completed_at)}</span>}
            </div>
          </div>

          {/* ── Activity Tab ── */}
          <div
            className={tabAnimating === 'activity' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'activity' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-sm)' }}
          >
            <TaskActivityFeed taskId={task.id} />
          </div>

          {/* T-50 Files tab — dedicated surface mirrors ProjectDetail Files */}
          <div
            className={tabAnimating === 'files' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'files' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-md)' }}
          >
            <FileUpload entityType="task" entityId={task.id} />
          </div>

        </div>

        {/* Mobile-only bottom bar — thumb-reach actions. Nick 2026-06-11: the
            old single "Done" button only CLOSED the panel — in a task app
            "Done" reads as "complete the task", so his tap completed nothing.
            Now: ✓ Complete actually completes (with undo, then closes);
            Close is labeled as what it is. Swipe-right-to-dismiss still works. */}
        <div className="task-detail-done-bar" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (!isTaskDone(task)) {
                handleStatusChange('done')
                onClose()
              } else {
                handleStatusChange('todo')
              }
            }}
            className="task-detail-done-btn"
            aria-label={isTaskDone(task) ? 'Reopen task' : 'Complete task'}
            style={{ flex: 2 }}
          >
            {isTaskDone(task) ? '↩ Reopen' : '✓ Complete'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="task-detail-close-btn"
            aria-label="Close task panel"
            style={{ flex: 1 }}
          >
            Close
          </button>
        </div>

        </div>{/* end inner scroll container */}
      </motion.div>
    </>
  )
}

// ── Description Field ─────────────────────────────────────
// Ghost empty state (one "Add description…" line, no box).
// Click → editor opens with toolbar + focus border. Autosave on blur.
// Content state: plain prose, no resting border; editor border appears
// only when isEditing (i.e. the ProseMirror is focused).

function DescriptionField({
  descriptionJson,
  descriptionText,
  onUpdate,
}: {
  descriptionJson: string | null
  descriptionText: string | null
  onUpdate: (json: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const isEmpty = !descriptionJson && !descriptionText

  // Click the ghost line OR the read-only prose to enter editing mode.
  const handleClick = () => {
    if (!isEditing) setIsEditing(true)
  }

  return (
    <div>
      <label
        className="flex items-center"
        style={{ gap: 'var(--sp-xs)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)', marginBottom: 'var(--sp-xs)' }}
      >
        Description
      </label>

      {/* Ghost empty line — shown only when empty AND not editing */}
      {isEmpty && !isEditing && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Add description"
          onClick={handleClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
          className="cursor-text rounded transition-colors hov-opacity"
          style={{
            fontSize: 'var(--value-size)',
            color: 'var(--slate)',
            opacity: 'var(--ink-hint)',
            fontStyle: 'italic',
            padding: '4px 2px',
            '--hov-opacity': '0.85',
          } as React.CSSProperties}
        >
          Add description…
        </div>
      )}

      {/* Rich text editor — border + toolbar appear only while editing.
          We pass noBorder so the editor's own border doesn't double-render.
          The wrapper div carries the border controlled by isEditing state.
          Always rendered (not conditional) so Tiptap keeps its internal
          state; we use display:none on the wrapper when empty + not editing. */}
      <div
        onClick={handleClick}
        style={
          isEmpty && !isEditing
            ? { display: 'none' }
            : {
                border: isEditing ? '1px solid var(--teal)' : '1px solid transparent',
                borderRadius: 'var(--radius-lg)',
                transition: 'border-color 0.15s',
                cursor: isEmpty ? 'text' : undefined,
              }
        }
      >
        <Suspense fallback={<div style={{ height: 80, padding: 'var(--sp-md)', opacity: 0.85, fontSize: 'var(--text-small)' }}>Loading editor...</div>}>
          <RichTextEditor
            content={descriptionJson}
            plainTextFallback={descriptionText}
            onUpdate={onUpdate}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            noBorder
            placeholder="Add a description..."
          />
        </Suspense>
      </div>
    </div>
  )
}

// ── Watchers Picker ──────────────────────────────────────
function WatchersPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const slugs = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  const allPeople = [...directors, ...getAllMembers()].filter(p => p.slug)
  const uniquePeople = allPeople.filter((p, i) => allPeople.findIndex(x => x.slug === p.slug) === i)
  const available = uniquePeople.filter(p => !slugs.includes(p.slug!))

  const addWatcher = (slug: string) => {
    onChange([...slugs, slug].join(','))
    setOpen(false)
  }

  const removeWatcher = (slug: string) => {
    onChange(slugs.filter(s => s !== slug).join(','))
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="flex flex-wrap items-center gap-1.5" ref={ref} style={{ position: 'relative' }}>
      {slugs.map(slug => {
        const p = getPersonInfo(slug)
        return (
          <span
            key={slug}
            className="flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full text-[10px]"
            style={{ backgroundColor: 'var(--teal-active)', color: 'var(--teal)' }}
          >
            <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="2xs" />
            {p.name.split(' ')[0]}
            <button
              onClick={() => removeWatcher(slug)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 0, lineHeight: 1 }}
            >
              <X size={9} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </span>
        )
      })}
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] px-1.5 py-0.5 rounded-full"
        style={{ background: 'none', border: '1px dashed var(--border-subtle)', cursor: 'pointer', color: 'var(--slate)', opacity: 'var(--ink-label)' }}
      >
        + Add
      </button>

      {open && available.length > 0 && (
        <div
          className="absolute z-20 rounded-lg shadow-lg border"
          style={{
            top: '100%',
            left: 0,
            marginTop: '4px',
            backgroundColor: 'var(--cream)',
            borderColor: 'var(--border-subtle)',
            maxHeight: '200px',
            overflowY: 'auto',
            minWidth: '180px',
          }}
        >
          {available.map(person => {
            const slug = person.slug!
            const p = getPersonInfo(slug)
            return (
              <button
                key={slug}
                onClick={() => addWatcher(slug)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', borderBottom: '1px solid var(--border-subtle)' }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--teal-hover)')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="xs" />
                {p.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Overview Activity Peek ───────────────────────────────────
// Shows 3 newest activity entries in the Overview tab + a "view all →"
// button that switches to the Activity tab. Does NOT duplicate the filter
// pills (those live in the full Activity tab only).
// Uses the same ['task-activity', taskId] cache key as TaskActivityFeed —
// no duplicate network request.

function OverviewActivityPeek({
  taskId,
  onViewAll,
}: {
  taskId: string
  onViewAll: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
          Recent activity
        </span>
        <button
          type="button"
          onClick={onViewAll}
          style={{ fontSize: 'var(--label-size)', color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
        >
          view all →
        </button>
      </div>
      {/* N4 — xs avatars (20px): Nick wants the Overview peek tighter. */}
      <TaskActivityFeed taskId={taskId} peekCount={3} hidePills avatarSize="xs" />
    </div>
  )
}

// ── Project Decisions Section ───────────────────────────────
// Used in the Details tab's Related Decisions collapsible.

const DECISIONS_SENTIMENT_BADGE: Record<string, { color: string; bg: string }> = {
  positive: { color: 'var(--teal)', bg: 'var(--teal-active)' },
  negative: { color: 'var(--maroon)', bg: 'rgba(128,0,0,0.08)' },
  neutral: { color: 'var(--slate)', bg: 'rgba(100,116,139,0.08)' },
  pending: { color: 'var(--gold)', bg: 'var(--gold-active)' },
}

function ProjectDecisionsSection({ projectSlug }: { projectSlug: string }) {
  const { data: decisions = [] } = useDecisions(projectSlug)

  if (decisions.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
        No decisions linked to this project.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {decisions.slice(0, 5).map((d: DecisionRow) => {
        const sentiment = d.outcome_sentiment || 'pending'
        const badge = DECISIONS_SENTIMENT_BADGE[sentiment] || DECISIONS_SENTIMENT_BADGE.pending
        const tags = parseTagsString(d.tags)

        return (
          <div
            key={d.id}
            className="p-2.5 rounded-lg"
            style={{ background: 'var(--gold-hover)', border: `1px solid ${withAlpha(ACCENT_GOLD, 10)}` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Scale size={11} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--gold)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--ink)' }}>
                {d.title}
              </span>
              <span
                className="text-[10px] px-1 py-0.5 rounded-full ml-auto"
                style={{ fontWeight: 'var(--label-weight)', color: badge.color, backgroundColor: badge.bg }}
              >
                {sentiment}
              </span>
            </div>
            {d.outcome && (
              <p style={{ fontSize: 'var(--label-size)', color: 'var(--teal)', margin: '2px 0 0 0' }}>
                {d.outcome}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                {formatRelativeTime(d.created_at)}
              </span>
              {tags.map(tag => (
                <span
                  key={tag}
                  className="text-[10px] px-1 py-0.5 rounded-full"
                  style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-hover)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )
      })}
      {decisions.length > 5 && (
        <p className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)', textAlign: 'center' }}>
          + {decisions.length - 5} more decisions
        </p>
      )}
    </div>
  )
}

// ── Detail Key Links ────────────────────────────────────
// Reads task-owned stored links from GET /api/tasks/:id/links and renders
// them as Mode-A labeled chips (authoritative stored type → brand glyph).
// Inherited project links are shown read-only in a separate sub-section.
// The 3-slot key_link_* WRITE path stays in KeyLinksEditor until P3/P4.

function DetailKeyLinks({
  task,
  onUpdate,
}: {
  task: TaskRow
  onUpdate: (fields: Record<string, string | null>) => void
}) {
  // Inherited project links from the links table (read-only, visually separated).
  // Task-own links are no longer shown read-only here — they are already
  // covered by KeyLinksEditor below (slots backfilled 1:1 from links table).
  const { data: linksData } = useTaskLinks(task.id)
  // Sort: type-priority (displayRank) primary, sort_order as tiebreaker.
  // Mirrors PB sections.py render order so both surfaces agree by construction.
  const projectLinks = [...(linksData?.projectLinks ?? [])].sort(
    (a, b) => displayRank(a.type) - displayRank(b.type) || a.sort_order - b.sort_order
  )

  // 3-slot key_link_* for the WRITE path (add/edit/remove) — kept until P3/P4.
  const slotLinks = [
    { url: task.key_link_1, desc: task.key_link_1_desc },
    { url: task.key_link_2, desc: task.key_link_2_desc },
    { url: task.key_link_3, desc: task.key_link_3_desc },
  ]

  // email_link (v74, PB email-triage capture) was synced + returned by
  // /api/tasks but rendered NOWHERE until 2026-06-10 — the short_title class
  // again. System-populated, so it renders as a read-only Gmail chip rather
  // than occupying an editable key-link slot.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {task.email_link && (
        <LinkChip
          url={task.email_link}
          type={gmailKind(task.email_link) === 'draft' ? 'gmail_draft' : 'gmail_thread'}
          label={shortLabelForUrl(task.email_link)}
          stopPropagation={true}
        />
      )}

      {/* Inherited project links — read-only, visually separated. */}
      {projectLinks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            Project links
          </span>
          <div className="flex flex-wrap gap-2">
            {projectLinks.map((link) => (
              <StoredLinkChip key={link.id} link={link} />
            ))}
          </div>
        </div>
      )}

      {/* 3-slot write path — editable until P3/P4 lands. */}
      <KeyLinksEditor
        links={slotLinks}
        onSave={(next) => {
          onUpdate({
            key_link_1: next[0]?.url || null,
            key_link_1_desc: next[0]?.desc || null,
            key_link_2: next[1]?.url || null,
            key_link_2_desc: next[1]?.desc || null,
            key_link_3: next[2]?.url || null,
            key_link_3_desc: next[2]?.desc || null,
          })
        }}
      />
    </div>
  )
}

// ── Task Files Section ──────────────────────────────────
interface TaskFile { id: string; task_id: string; filename: string; url: string; file_type: string; uploaded_by: string | null; created_at: string }

function TaskFilesSection({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [filename, setFilename] = useState('')
  const [url, setUrl] = useState('')

  const { data: files = [] } = useQuery<TaskFile[]>({
    queryKey: ['task-files', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/files`)
      const json = await res.json() as { data: TaskFile[] }
      return json.data
    },
    staleTime: 30_000,
  })

  const addFile = useMutation({
    mutationFn: async (input: { filename: string; url: string }) => {
      const res = await fetch(`/api/tasks/${taskId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-files', taskId] })
      setShowAdd(false)
      setFilename('')
      setUrl('')
    },
  })

  const deleteFile = useMutation({
    mutationFn: async (fileId: string) => {
      await fetch(`/api/task-files/${fileId}/delete`, { method: 'POST' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-files', taskId] }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)', fontSize: 'var(--label-size)' }}>
          Attachments ({files.length})
        </span>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
          style={{ background: 'none', border: '1px solid var(--teal)', color: 'var(--teal)', cursor: 'pointer', opacity: 0.8 }}
        >
          <Plus size={11} strokeWidth={1.5} absoluteStrokeWidth />
          Add Link
        </button>
      </div>

      {showAdd && (
        <div className="flex flex-col gap-2 p-3 rounded-lg mb-3" style={{ backgroundColor: 'var(--ice)', border: '1px solid var(--border-subtle)' }}>
          <input
            autoFocus
            value={filename}
            onChange={e => setFilename(e.target.value)}
            placeholder="File name (e.g. Protocol v2.docx)"
            className="text-xs px-2 py-1.5 rounded border bg-transparent"
            style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)' }}
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="URL (paste link to document)"
            className="text-xs px-2 py-1.5 rounded border bg-transparent"
            style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)' }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { if (filename && url) addFile.mutate({ filename, url }) }}
              disabled={!filename || !url}
              className="text-[11px] px-3 py-1 rounded-lg font-medium"
              style={{ backgroundColor: 'var(--teal-solid)', color: 'var(--ink-bright, #fff)', border: 'none', cursor: 'pointer', opacity: filename && url ? 1 : 0.85 }}
            >
              Add
            </button>
            <button
              onClick={() => { setShowAdd(false); setFilename(''); setUrl('') }}
              className="text-[11px] px-3 py-1 rounded-lg"
              style={{ background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--slate)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {files.length > 0 ? (
        <div className="flex flex-col gap-1">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--ice)' }}>
              <Link2 size={13} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--teal)', flexShrink: 0 }} />
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-xs truncate"
                style={{ color: 'var(--ink)', textDecoration: 'none' }}
              >
                {f.filename}
              </a>
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                <ExternalLink size={12} strokeWidth={1.5} absoluteStrokeWidth />
              </a>
              <button
                onClick={() => deleteFile.mutate(f.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.75, padding: '2px' }}
              >
                <Trash2 size={12} strokeWidth={1.5} absoluteStrokeWidth />
              </button>
            </div>
          ))}
        </div>
      ) : !showAdd ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-xl) var(--sp-lg)' }}>
          <Upload size={28} style={{ color: 'var(--slate)', opacity: 0.75, margin: '0 auto var(--sp-sm)' }} />
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', margin: 0 }}>
            No attachments yet. Click "Add Link" to attach a document.
          </p>
        </div>
      ) : null}
    </div>
  )
}

// ── Overview Quick Add ──────────────────────────────────────
//
// Single compact row at idle: [COMMENT|NOTE pills] [full-width input].
// No icons left of the input, no indentation.
//
// When focused or has content (composing), the textarea grows to 2 rows
// and a Slack-style action row appears BELOW the box:
//   left: quiet icon-buttons (attach, @, emoji, @me lock, Hermes)
//   right: Post button
//
// Mobile: whole component sticks to the panel's scroll-container bottom.
function OverviewQuickAdd({
  taskId,
  taskTitle,
  projectSlug,
  primaryFolder,
  onJumpToTab,
  onContentChange,
}: {
  taskId: string
  taskTitle?: string | null
  projectSlug?: string | null
  primaryFolder?: string | null
  onJumpToTab: (tab: Tab) => void
  onContentChange?: (hasContent: boolean) => void
}) {
  const [mode, setMode] = useState<'note' | 'comment'>('comment')
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [forHermes, setForHermes] = useState(false)
  const [meOnly, setMeOnly] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useIsMobile()
  const { typingPeers, broadcastTyping } = useTyping('task', taskId)
  const appendCh = (ch: string) => appendCharToInput(textareaRef, ch, setText)
  const postUpdate = usePostTaskUpdate(taskId)
  const { showSuccess } = useToast()
  const { launch: protocolLaunch } = useProtocolLaunch()
  const queryClient = useQueryClient()

  // Composing = focused OR has text — drives textarea rows + action row visibility.
  const composing = focused || text.trim().length > 0

  // T-04 inline file drop — same presigned-R2 flow as FileUpload.
  const uploadToCompose = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const urlRes = await fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', context: { type: 'task', id: taskId } }),
      })
      const urlData = await urlRes.json() as { data?: { uploadUrl?: string; key?: string } }
      if (!urlData.data?.uploadUrl || !urlData.data?.key) throw new Error('presign failed')
      await fetch(urlData.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      const doneRes = await fetch('/api/upload/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: urlData.data.key, filename: file.name, contentType: file.type, sizeBytes: file.size, entityType: 'task', entityId: taskId }),
      })
      const doneData = await doneRes.json() as { data?: { url?: string } }
      queryClient.invalidateQueries({ queryKey: ['attachments', 'task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task-files', taskId] })
      const link = doneData.data?.url ?? `/api/files/${urlData.data.key}`
      setText((prev) => (prev ? `${prev}\n[${file.name}](${link})` : `[${file.name}](${link})`))
    } catch (err) {
      console.error('compose upload failed', err)
    } finally {
      setUploading(false)
    }
  }, [taskId, queryClient])

  // N1.22 — short strings on phones: the idle one-row input is narrow next
  // to the mode pills, and the long placeholder clipped to "@mention a".
  const PLACEHOLDERS = isMobile
    ? { note: 'Log progress…', comment: '@hermes or @teammate…' }
    : {
        note: 'Log progress, blockers, thoughts…',
        comment: '@mention a teammate or @hermes for AI help',
      }
  const TOOLTIPS = {
    note: 'Informal progress log — visible to the team',
    comment: 'Talk to teammates — @mention works',
  }

  function reset() {
    setText('')
    setForHermes(false)
    setMeOnly(false)
  }

  async function submitComment(content: string) {
    const body = meOnly ? `@me ${content}` : content
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: body }),
    })
    if (!res.ok) throw new Error('comment failed')
    if (forHermes) {
      fetch('/api/pb/dispatch/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          task_title: taskTitle ?? null,
          project_slug: projectSlug ?? null,
          comment: content,
          comment_type: 'action',
        }),
      }).catch(() => { /* fire-and-forget */ })
    }
    queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] })
    queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] })
    queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    // ── @workon: seeded project launch ────────────────────────────────────────
    // CRITICAL SEED ISOLATION: this branch MUST return before submitComment runs.
    // The seed must NEVER reach /api/tasks/:id/comments or /api/pb/dispatch/add
    // — those are team-visible endpoints. The early `return` below enforces this.
    if (/^@workon\b/i.test(v)) {
      const seed = v.replace(/^@workon\s*/i, '').trim()
      const origin = detectOrigin()
      const folder = primaryFolder ?? ''
      fetch('/api/launch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: 'workon', seed, origin, project_slug: projectSlug ?? null }),
      })
        .then((res) => { if (!res.ok) throw new Error(`launch-log ${res.status}`) })
        .then(() => {
          if (origin === 'computer' && folder) {
            return protocolLaunch(buildSeededWorkOnUri(folder, seed), {
              copyText: folder,
              successMessage: 'Launching Claude in this project…',
              copyMessage: 'Launching… (folder copied as backup)',
            })
          }
          showSuccess(origin === 'computer' ? 'No project folder set for this task' : 'Sent to home — check Telegram')
        })
        .then(() => reset())
        .catch((e) => { console.error('@workon failed:', e) })
      return
    }
    if (mode === 'note') {
      postUpdate.mutate(
        { content: v, update_type: 'progress' },
        { onSuccess: () => { showSuccess('Note added'); reset() } },
      )
    } else {
      submitComment(v)
        .then(() => { showSuccess('Comment posted'); reset() })
        .catch(() => { /* leave text so user can retry */ })
    }
  }

  return (
    <div
      className={isMobile ? 'task-detail-sticky' : undefined}
      style={{
        // Mobile: stick to panel's scroll-container bottom so iOS keyboard
        // doesn't push it out of reach.
        ...(isMobile ? {
          position: 'sticky' as const,
          bottom: 0,
          background: 'var(--cream)',
          paddingBottom: 'calc(var(--sp-sm) + env(safe-area-inset-bottom))',
          paddingLeft: 'var(--sp-lg)',
          paddingRight: 'var(--sp-lg)',
          marginLeft: 'calc(-1 * var(--sp-lg))',
          marginRight: 'calc(-1 * var(--sp-lg))',
          paddingTop: 'var(--sp-sm)',
          zIndex: 1,
          boxShadow: '0 -6px 16px rgba(0,0,0,0.08)',
        } : null),
      }}
    >
      <form onSubmit={handleSubmit}>
        {/* ── Idle row: [COMMENT|NOTE pills] [textarea] ── */}
        <div
          className="flex items-center gap-2"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            Array.from(e.dataTransfer.files || []).forEach(uploadToCompose)
          }}
          style={{
            outline: dragOver ? '2px dashed var(--teal)' : 'none',
            outlineOffset: '2px',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {/* Segmented mode pills */}
          <div
            className="inline-flex rounded-full overflow-hidden flex-shrink-0"
            style={{ background: 'var(--hover-subtle)' }}
            role="tablist"
            aria-label="Quick add mode"
          >
            {(['comment', 'note'] as const).map((m) => {
              const isActive = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={isActive ? "true" : "false"}
                  onClick={() => setMode(m)}
                  title={TOOLTIPS[m]}
                  className="cursor-pointer inline-flex items-center gap-1 transition-all"
                  style={{
                    fontSize: '10px',
                    fontWeight: isActive ? 600 : 400,
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: isActive ? 'var(--teal-active)' : 'transparent',
                    color: isActive ? 'var(--teal)' : 'var(--slate)',
                    border: 'none',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m === 'comment' ? <MessageSquare size={9} strokeWidth={1.5} absoluteStrokeWidth /> : <ScrollText size={9} strokeWidth={1.5} absoluteStrokeWidth />}
                  {m}
                </button>
              )
            })}
          </div>

          {/* Full-width input — no icons left of it */}
          <input
            ref={fileInputRef as unknown as React.RefObject<HTMLInputElement>}
            type="file"
            multiple
            onChange={(e) => { Array.from(e.target.files || []).forEach(uploadToCompose); e.target.value = '' }}
            style={{ display: 'none' }}
          />
          {/* MentionInput (Rule 7) — N1c: the raw textarea here had no
              @-typeahead. dropdownPosition='below': this composer sits near
              the top of the panel's scroll container, so an upward menu
              would clip. */}
          <MentionInput
            inputRef={textareaRef}
            value={text}
            rows={composing ? 2 : 1}
            dropdownPosition="below"
            onChange={(v) => {
              setText(v)
              const hasContent = v.trim().length > 0
              broadcastTyping(hasContent)
              onContentChange?.(hasContent)
            }}
            onPaste={(e) => {
              const fileItem = Array.from(e.clipboardData?.items || []).find((it) => it.kind === 'file')
              if (fileItem) { e.preventDefault(); const f = fileItem.getAsFile(); if (f) uploadToCompose(f) }
            }}
            placeholder={PLACEHOLDERS[mode]}
            onFocus={(e) => {
              setFocused(true)
              e.currentTarget.style.borderColor = 'var(--teal)'
            }}
            onBlur={(e) => {
              // Delay so toolbar button clicks register before composing goes false
              setTimeout(() => setFocused(false), 150)
              e.currentTarget.style.borderColor = 'var(--border-subtle)'
              broadcastTyping(false)
              onContentChange?.(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            style={{
              fontSize: 'var(--value-size)',
              color: 'var(--ink)',
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: composing ? '7px 10px' : '4px 10px',
              lineHeight: 1.5,
              transition: 'border-color 0.15s, padding 0.1s',
              minHeight: composing ? undefined : 28,
              outline: 'none',
              resize: 'none',
            }}
          />
        </div>

        {/* ── Composing action row (Slack-style): below the textarea ── */}
        {composing && (
          <div
            className="flex items-center gap-1"
            style={{ marginTop: 6 }}
          >
            {/* Left: quiet icon-buttons */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Attach file"
              title="Attach file (drop or paste an image too)"
              className="flex-shrink-0 inline-flex items-center justify-center"
              style={composerIconBtn}
            >
              {uploading
                ? <Loader2 size={12} strokeWidth={1.5} absoluteStrokeWidth className="animate-spin" />
                : <Paperclip size={12} strokeWidth={1.5} absoluteStrokeWidth />}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => appendCh('@')}
              aria-label="Mention teammate"
              title="@mention a teammate"
              className="flex-shrink-0 inline-flex items-center justify-center"
              style={composerIconBtn}
            >
              <AtSign size={12} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => appendCh(':')}
              aria-label="Add emoji"
              title="Add emoji (:emoji:)"
              className="flex-shrink-0 inline-flex items-center justify-center"
              style={composerIconBtn}
            >
              <Smile size={12} strokeWidth={1.5} absoluteStrokeWidth />
            </button>

            {/* @me lock — ROW 81: shared MeLockToggle (unified with SmartCompose) */}
            <MeLockToggle
              locked={meOnly}
              onToggle={() => setMeOnly((v) => !v)}
            />

            {/* Hermes toggle — only relevant for comments, pill style */}
            {mode === 'comment' && (
              <button
                type="button"
                role="switch"
                aria-checked={forHermes ? "true" : "false"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setForHermes((v) => !v)}
                aria-label={forHermes ? 'Hermes notified — click to remove' : 'Notify Hermes AI assistant'}
                title="Route to Hermes AI"
                className="flex-shrink-0 inline-flex items-center gap-1"
                style={{
                  height: 22,
                  paddingLeft: 6,
                  paddingRight: 6,
                  borderRadius: 'var(--radius-sm)',
                  border: forHermes
                    ? `1px solid ${withAlpha(ACCENT_GOLD, 40)}`
                    : '1px solid var(--border-subtle)',
                  background: forHermes ? 'var(--gold-active)' : 'transparent',
                  color: forHermes ? 'var(--gold)' : 'var(--slate)',
                  opacity: forHermes ? 1 : 0.70,
                  fontWeight: forHermes ? 600 : 400,
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 'var(--radius-circle)',
                    background: forHermes ? 'var(--gold)' : 'var(--slate)',
                    flexShrink: 0,
                    opacity: forHermes ? 1 : 0.70,
                  }}
                />
                Hermes
              </button>
            )}

            {/* Spacer pushes Post + See-all to the right */}
            <span style={{ flex: 1 }} />

            {/* See all link */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onJumpToTab('activity')}
              style={{
                fontSize: '10px',
                color: 'var(--slate)',
                opacity: 0.55,
                background: 'none',
                border: 'none',
                padding: '0 4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Jump to full Activity tab"
            >
              See all →
            </button>

            {/* Post button — only when there's content */}
            {text.trim() && (
              <button
                type="submit"
                aria-label={mode === 'comment'
                  ? (forHermes ? 'Post comment and notify Hermes' : 'Post comment')
                  : 'Add note'}
                title={`${mode === 'comment' ? (forHermes ? 'Post + dispatch to Hermes' : 'Post comment') : 'Add note'} · Ctrl+Enter`}
                className="flex-shrink-0 inline-flex items-center justify-center"
                style={{
                  background: forHermes && mode === 'comment' ? 'var(--gold)' : 'var(--teal-solid)',
                  color: 'var(--ink-bright, #fff)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'background-color 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Send size={11} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
                Post
              </button>
            )}
          </div>
        )}

        {/* Typing indicator */}
        <TypingIndicator slugs={typingPeers} className="self-start" style={{ marginTop: 2 }} />
      </form>
    </div>
  )
}

// ── Compact Assignee Row ────────────────────────────────────
// Small inline avatar + name + ▾ affordance — same visual weight as the
// Status/Priority/Project/Due selects in the header field row.
function CompactAssigneeRow({ value, onChange }: { value?: string | null; onChange: (v: string) => void }) {
  const person = value ? getPersonInfo(value) : null
  const allPeople = [...directors, ...getAllMembers()].filter(p => p.slug)
  const uniquePeople = allPeople.filter((p, i) => allPeople.findIndex(x => x.slug === p.slug) === i)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={person ? `Assignee: ${person.name} — change` : 'Assign task'}
        aria-expanded={open ? "true" : "false"}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 'var(--radius-full)',
          cursor: 'pointer',
          padding: '3px 10px 3px 6px',
          fontSize: 'var(--label-size)',
          color: 'var(--ink)',
          fontFamily: 'inherit',
          transition: 'background 0.12s, border-color 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-subtle)' }}
        onMouseLeave={(e) => {
          if (document.activeElement !== e.currentTarget) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--teal)'
          e.currentTarget.style.background = 'transparent'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {person ? (
          <>
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" />
            <span style={{ fontWeight: 500 }}>{person.name.split(' ')[0]}</span>
          </>
        ) : (
          <>
            <User size={11} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--slate)', opacity: 0.85 }} aria-hidden="true" />
            <span style={{ color: 'var(--slate)', opacity: 0.85 }}>Unassigned</span>
          </>
        )}
        <span aria-hidden="true" style={{ fontSize: 9, color: 'var(--slate)', opacity: 0.70, marginLeft: 1 }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Select assignee"
          className="absolute z-20 rounded-lg shadow-lg border"
          style={{
            top: '100%',
            left: 0,
            marginTop: 4,
            backgroundColor: 'var(--cream)',
            borderColor: 'var(--border-subtle)',
            maxHeight: 220,
            overflowY: 'auto',
            minWidth: 180,
          }}
        >
          <button
            role="option"
            aria-selected={!value ? "true" : "false"}
            onClick={() => { onChange(''); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px]"
            style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--slate)', opacity: 0.85 }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--teal-hover)')}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Unassigned
          </button>
          {uniquePeople.map(p => {
            const info = getPersonInfo(p.slug!)
            return (
              <button
                key={p.slug}
                role="option"
                aria-selected={value === p.slug ? "true" : "false"}
                onClick={() => { onChange(p.slug!); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px]"
                style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--ink)' }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--teal-hover)')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Avatar name={info.name} initials={info.initials} photoUrl={info.photoUrl} size="xs" />
                {info.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Shared icon-button style for the composing action row (OverviewQuickAdd)
const composerIconBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--slate)',
  opacity: 0.70,
  cursor: 'pointer',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
