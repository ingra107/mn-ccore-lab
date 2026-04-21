import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import {
  X, Circle, Clock, User, Flag, Scale,
  CalendarDays, FolderKanban, ArrowRightLeft,
  FileText, MessageSquare, Upload, Eye, ScrollText,
  Users, Bell, ClipboardList, Link2, Trash2, Plus, ExternalLink, RefreshCw, Copy, Check,
  ChevronUp, ChevronDown, Send,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import CollapsibleSection from '../CollapsibleSection'
import FileUpload from '../FileUpload'
const RichTextEditor = lazy(() => import('../RichTextEditor'))
import { useUpdateTask, useUpdateTaskStatus, useAcknowledgeTask, usePostTaskUpdate } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { useUndoToast } from '../UndoToast'
import { formatRelativeTime } from '../../lib/dateUtils'
import { getPersonInfo, getAllMembers, directors } from '../../data/team'
import Avatar from '../Avatar'
import type { TaskRow } from '../../lib/api'
import { PATHS } from '../../constants/paths'

// ── Detail sub-modules ──────────────────────────────────────
import { FieldBlock, EditableTitle, EditableTextarea, StatusSelect, PrioritySelect, AssigneeSelect, DateInput, ProjectSelect } from './detail/FieldControls'
import { TaskDependenciesSection } from './detail/TaskDependencies'
import { SubtaskSection } from './detail/SubtaskSection'
import { HandoffSection } from './detail/HandoffSection'
import { TaskComments, ProjectDecisionsSection } from './detail/TaskComments'
import { TaskUpdateFeed } from './detail/TaskUpdateFeed'
import { TaskActivityFeed } from './detail/TaskActivityFeed'
import KeyLinksEditor from '../KeyLinksEditor'

type Tab = 'overview' | 'notes' | 'comments' | 'activity' | 'details'

const TABS: { key: Tab; label: string; icon: typeof Circle }[] = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'notes', label: 'Notes', icon: ScrollText },
  { key: 'comments', label: 'Comments', icon: MessageSquare },
  { key: 'activity', label: 'Activity', icon: Clock },
  { key: 'details', label: 'Details', icon: Flag },
]

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
  const qc = useQueryClient()

  // Parent pages hold selectedTask as a state snapshot. After a mutation
  // the ['tasks', ...] cache updates but that snapshot goes stale (GH #7).
  // Subscribe to the cache and surface the freshest row for this task id.
  const [liveTask, setLiveTask] = useState<TaskRow | null>(taskProp)
  useEffect(() => { setLiveTask(taskProp) }, [taskProp])
  useEffect(() => {
    if (!taskProp?.id) return
    const findFresh = (): TaskRow | null => {
      const queries = qc.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
      for (const [, data] of queries) {
        const fresh = data?.find(t => t.id === taskProp.id)
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
  }, [qc, taskProp?.id])
  const task = liveTask ?? taskProp
  const ackTask = useAcknowledgeTask()
  const { showUndo } = useUndoToast()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
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

  // Swipe-to-dismiss removed 2026-04-20 (P1-R2-07). On Pixel 5 the gesture
  // fired but the panel never moved (inert), and the iOS Safari edge-swipe-back
  // conflict was unsolvable in pure web. Replaced by enlarged X (top-right),
  // sticky "Done" pill at panel bottom on mobile, and tap-outside-backdrop.
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

  return (
    <>
      {/* Backdrop — tap to dismiss (mobile primary) + visual scrim. */}
      <div
        data-testid="detail-backdrop"
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: 'rgba(15, 25, 35, 0.3)',
          transition: 'opacity 200ms ease-out',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="task-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        className="fixed right-0 top-0 h-full z-50 overflow-y-auto shadow-2xl task-detail-panel card-elevated"
        style={{
          // Min 420 keeps date/title columns un-truncated on desktop;
          // 40vw scales gracefully on big monitors; cap 640 prevents
          // dwarfing the underlying list. P2-R2-02.
          width: 'clamp(420px, 40vw, 640px)',
          maxWidth: '90vw',
          backgroundColor: 'var(--cream)',
          borderLeft: '1px solid var(--border-subtle)',
          animation: reduceMotion ? 'none' : 'slideIn 200ms ease-out',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}>
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            Task Detail
          </span>
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
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={onNext}
                  disabled={!onNext}
                  title="Next task (Alt+↓)"
                  style={{ background: 'none', border: 'none', cursor: onNext ? 'pointer' : 'default', color: 'var(--slate)', padding: '2px', opacity: onNext ? 'var(--ink-hint)' : 0.15 }}
                >
                  <ChevronDown size={14} />
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
              {copied ? <Check size={14} /> : <Copy size={14} />}
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
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Always visible: Title + Status */}
        <div className="px-5 pt-5 pb-3 flex flex-col gap-4">
          <div id="task-detail-title" tabIndex={-1} style={{ outline: 'none' }}>
            <EditableTitle
              value={task.title || task.description}
              onSave={(v) => handleFieldUpdate('title', v)}
            />
          </div>

          <StatusSelect value={task.status} onChange={handleStatusChange} />

          {/* Task age + source info */}
          <div className="flex items-center gap-2 flex-wrap">
            {task.created_at && (
              <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                Created {formatRelativeTime(task.created_at)}
              </span>
            )}
            {task.source && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--teal-active)', color: 'var(--teal)' }}>
                {task.source}
              </span>
            )}
            {(task as any).recurrence && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--gold-active)', color: 'var(--gold)' }}>
                <RefreshCw size={8} style={{ display: 'inline', marginRight: 2 }} />
                {(task as any).recurrence}
              </span>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b px-5" style={{ borderColor: 'var(--border-subtle)' }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-colors"
              style={{
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
              <Icon size={13} />
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

            {/* Acknowledge button (compact) */}
            {task.assignee && !task.acknowledged_at && task.status !== 'done' && (
              <button
                onClick={() => ackTask.mutate(task.id)}
                disabled={ackTask.isPending}
                className="flex items-center gap-2 rounded-lg text-xs font-medium transition-all duration-200"
                style={{
                  background: 'var(--gold-active)',
                  color: 'var(--gold)',
                  border: '1px solid rgba(201,168,76,0.2)',
                  cursor: 'pointer',
                  width: 'fit-content',
                  padding: '6px 12px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', backgroundColor: 'var(--gold)', flexShrink: 0 }} />
                {ackTask.isPending ? 'Acknowledging...' : 'Acknowledge Assignment'}
              </button>
            )}
            {task.acknowledged_at && (
              <div className="flex items-center gap-2" style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                <Clock size={10} />
                Acknowledged {formatRelativeTime(task.acknowledged_at)}
                {task.acknowledged_by ? ` by ${task.acknowledged_by}` : ''}
              </div>
            )}

            {/* Row 1: Assignee + Priority */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <FieldBlock label="Assignee" icon={User} noContainer>
                <AssigneeSelect value={task.assignee} onChange={(v) => handleFieldUpdate('assignee', v)} />
              </FieldBlock>
              <FieldBlock label="Priority" icon={Flag} noContainer>
                <PrioritySelect value={task.priority} onChange={(v) => handleFieldUpdate('priority', v)} />
              </FieldBlock>
            </div>

            {/* Row 2: Due Date + Project */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
              <FieldBlock label="Due Date" icon={CalendarDays}>
                <DateInput value={task.due_date || ''} onChange={(v) => handleFieldUpdate('due_date', v || null)} />
              </FieldBlock>
              <FieldBlock label="Project" icon={FolderKanban} noContainer>
                <ProjectSelect value={task.project_id || ''} onChange={(v) => handleFieldUpdate('project_id', v || null)} />
              </FieldBlock>
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

            {/* Description (rich text, resizable) */}
            <div>
              <label className="flex items-center" style={{ gap: 'var(--sp-xs)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)', marginBottom: 'var(--sp-xs)' }}>
                Description
              </label>
              <div className="description-editor-wrapper">
                <Suspense fallback={<div style={{ height: 120, padding: 'var(--sp-lg)', opacity: 0.85, fontSize: 'var(--text-small)' }}>Loading editor...</div>}>
                  <RichTextEditor
                    content={task.description_json || null}
                    plainTextFallback={task.description}
                    onUpdate={(json) => {
                      handleFieldUpdate('description_json', json)
                    }}
                    placeholder="Add a description..."
                  />
                </Suspense>
              </div>
            </div>

            {/* Subtasks */}
            <SubtaskSection taskId={task.id} />

            {/* P2-01 follow-up: quick add inline so users don't have to tab
                over to Notes / Comments for a fast capture. Mode toggle
                makes the difference between the two surfaces explicit. */}
            <OverviewQuickAdd
              taskId={task.id}
              taskTitle={task.title}
              projectSlug={task.project_id}
              onJumpToTab={(tab) => setActiveTab(tab)}
            />
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
                <select
                  value={task.recurrence || 'none'}
                  onChange={(e) => handleFieldUpdate('recurrence', e.target.value === 'none' ? null : e.target.value)}
                  className="w-full bg-transparent outline-none"
                  style={{ color: 'var(--ink)', fontSize: 'var(--value-size)', cursor: 'pointer', border: 'none' }}
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
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
                <ClipboardList size={11} />
                Instructions
              </label>
              <EditableTextarea
                value={task.instructions || ''}
                onSave={(v) => handleFieldUpdate('instructions', v || null)}
                placeholder="Step-by-step instructions, protocols, or notes..."
              />
            </div>

            {/* Dependencies */}
            <TaskDependenciesSection task={task} onFieldUpdate={handleFieldUpdate} onOpenTask={() => {}} />

            {/* Handoffs */}
            <CollapsibleSection
              title="Handoffs"
              icon={<ArrowRightLeft size={11} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />}
              defaultOpen={false}
              storageKey={`task-handoffs-${task.id}`}
            >
              <HandoffSection taskId={task.id} currentAssignee={task.assignee} />
            </CollapsibleSection>

            {/* Related Decisions */}
            {task.project_id && (
              <CollapsibleSection
                title="Related Decisions"
                icon={<Scale size={11} style={{ color: 'var(--gold)', opacity: 0.85 }} />}
                defaultOpen={false}
                storageKey={`task-decisions-${task.id}`}
              >
                <ProjectDecisionsSection projectSlug={task.project_id} />
              </CollapsibleSection>
            )}

            {/* Files */}
            <CollapsibleSection
              title="Files"
              icon={<FileText size={11} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />}
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

          {/* ── Notes Tab ── */}
          <div
            className={tabAnimating === 'notes' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'notes' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-lg)' }}
          >
            <TaskUpdateFeed taskId={task.id} />
          </div>

          {/* ── Comments Tab ── */}
          <div
            className={tabAnimating === 'comments' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'comments' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-xl)' }}
          >
            <TaskComments taskId={task.id} taskTitle={task.title} projectSlug={task.project_id} />
          </div>

          {/* ── Activity Tab ── */}
          <div
            className={tabAnimating === 'activity' ? 'task-detail-tab-content' : ''}
            style={{ display: activeTab === 'activity' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-sm)' }}
          >
            <TaskActivityFeed taskId={task.id} />
          </div>

        </div>

        {/* Mobile-only Done pill — replaces removed swipe-to-dismiss.
            Hidden on desktop where Esc + click-outside are sufficient. */}
        <div className="task-detail-done-bar">
          <button
            type="button"
            onClick={onClose}
            className="task-detail-done-btn"
            aria-label="Done — close task"
          >
            Done
          </button>
        </div>

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .dark .task-detail-panel {
            background-color: var(--cream) !important;
            background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
            border-color: var(--border-subtle) !important;
          }
          .dark .task-detail-panel select {
            color-scheme: dark;
          }
          .task-detail-done-bar { display: none; }
          @media (max-width: 767px) {
            .task-detail-panel .p-5 {
              padding: 1rem !important;
            }
            /* Enlarge close-button hit target to 44×44 for thumb reach. */
            .task-detail-panel .task-detail-close {
              min-width: 44px !important;
              min-height: 44px !important;
            }
            /* Sticky Done bar at panel bottom. */
            .task-detail-done-bar {
              display: block;
              position: sticky;
              bottom: 0;
              padding: 12px;
              background: color-mix(in oklch, var(--cream) 95%, transparent);
              backdrop-filter: blur(8px);
              border-top: 1px solid var(--border-subtle);
              z-index: 20;
            }
            .task-detail-done-btn {
              width: 100%;
              min-height: 48px;
              border-radius: var(--radius-lg);
              border: none;
              background: var(--teal-solid);
              color: #fff;
              font-weight: var(--weight-ui, 500);
              font-size: 15px;
              cursor: pointer;
            }
          }
        `}</style>
      </div>
    </>
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
              <X size={9} />
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

// ── Detail Key Links ────────────────────────────────────
// DetailKeyLinkRow (read-only row with copy button) is superseded by
// KeyLinksEditor. Editor handles display + add/edit/remove inline.

function DetailKeyLinks({
  task,
  onUpdate,
}: {
  task: TaskRow
  onUpdate: (fields: Record<string, string | null>) => void
}) {
  const links = [
    { url: task.key_link_1, desc: task.key_link_1_desc },
    { url: task.key_link_2, desc: task.key_link_2_desc },
    { url: task.key_link_3, desc: task.key_link_3_desc },
  ]

  return (
    <KeyLinksEditor
      links={links}
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
          <Plus size={11} />
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
              <Link2 size={13} style={{ color: 'var(--teal)', flexShrink: 0 }} />
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
                <ExternalLink size={12} />
              </a>
              <button
                onClick={() => deleteFile.mutate(f.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.75, padding: '2px' }}
              >
                <Trash2 size={12} />
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
// Surfaces a single fast-capture input on the Overview tab so users
// don't have to tab over to Notes / Comments. Mode toggle keeps the
// Phase 27 "three distinct surfaces" decision visible — the placeholder
// changes to make it crystal-clear what each one is for.
function OverviewQuickAdd({
  taskId,
  taskTitle,
  projectSlug,
  onJumpToTab,
}: {
  taskId: string
  taskTitle?: string | null
  projectSlug?: string | null
  onJumpToTab: (tab: Tab) => void
}) {
  const [mode, setMode] = useState<'note' | 'comment'>('comment')
  const [text, setText] = useState('')
  const [forHermes, setForHermes] = useState(false)
  const postUpdate = usePostTaskUpdate(taskId)
  const { showSuccess } = useToast()
  const queryClient = useQueryClient()

  const PLACEHOLDERS = {
    note: 'Pulled cohort, n=412 after exclusions. APACHE>25 worked. Stuck on merge — using ENC_ID not HOSP_ID',
    comment: '@emma can you double-check the propensity score weights? @hermes pull recent JAMA papers on this',
  }
  const TOOLTIPS = {
    note: 'Private progress log — lab-notebook style',
    comment: 'Talk to teammates — @mention works',
  }

  function reset() {
    setText('')
    setForHermes(false)
  }

  async function submitComment(content: string) {
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error('comment failed')
    if (forHermes) {
      // Same dispatch hand-off as the Comments tab (TaskComments.tsx).
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
      style={{
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 'var(--sp-lg)',
        marginTop: 'var(--sp-sm)',
      }}
    >
      <label
        className="flex items-center gap-1.5 mb-1.5"
        style={{
          color: 'var(--slate)',
          opacity: 'var(--ink-label)',
          fontWeight: 'var(--label-weight)',
          fontSize: 'var(--label-size)',
        }}
      >
        <Plus size={11} />
        Quick add
      </label>

      {/* Segmented mode pills — single shared fill makes "modes of one input"
          obvious. Tooltip on each pill replaces the helper-line below the
          textarea (per design ticket § 0 Ask 1). */}
      <div className="flex items-center mb-2">
        <div
          className="inline-flex rounded-md overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)' }}
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
                aria-selected={isActive}
                onClick={() => setMode(m)}
                title={TOOLTIPS[m]}
                className="cursor-pointer inline-flex items-center gap-1 transition-all"
                style={{
                  fontSize: '10px',
                  fontWeight: isActive ? 600 : 400,
                  padding: '3px 10px',
                  background: isActive ? 'var(--teal-active)' : 'transparent',
                  color: isActive ? 'var(--teal)' : 'var(--slate)',
                  border: 'none',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {m === 'comment' ? <MessageSquare size={10} /> : <ScrollText size={10} />}
                {m}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => onJumpToTab(mode === 'comment' ? 'comments' : 'notes')}
          className="ml-auto cursor-pointer inline-flex items-center gap-1"
          style={{
            fontSize: '10px',
            color: 'var(--slate)',
            opacity: 0.65,
            background: 'none',
            border: 'none',
            padding: '3px 4px',
          }}
          title={`Jump to full ${mode === 'comment' ? 'Comments' : 'Notes'} tab`}
        >
          See all →
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDERS[mode]}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            className="flex-1 rounded-md border text-sm outline-none resize-none"
            style={{
              fontSize: 'var(--value-size)',
              color: 'var(--ink)',
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '8px 10px',
              lineHeight: 1.5,
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--teal)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
          />
          {text.trim() && (
            <button
              type="submit"
              className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
              style={{
                background: forHermes && mode === 'comment' ? 'var(--gold)' : 'var(--teal-solid)',
                color: 'var(--ink-bright, #fff)',
                border: 'none',
                transition: 'background-color 0.15s',
              }}
              title={`${mode === 'comment' ? (forHermes ? 'Post + dispatch to Hermes' : 'Post comment') : 'Add note'} · Ctrl+Enter`}
            >
              <Send size={14} />
            </button>
          )}
        </div>

        {/* Hermes toggle — only relevant on comments. Shows up after typing. */}
        {mode === 'comment' && text.trim() && (
          <button
            type="button"
            onClick={() => setForHermes((v) => !v)}
            className="flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full transition-colors"
            style={{
              fontSize: '10px',
              fontWeight: 600,
              background: forHermes ? 'var(--gold-emphasis)' : 'rgba(100,116,139,0.06)',
              color: forHermes ? 'var(--gold)' : 'var(--slate)',
              border: `1px solid ${forHermes ? 'rgba(201,168,76,0.3)' : 'rgba(100,116,139,0.1)'}`,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 'var(--radius-circle)',
                background: forHermes ? 'var(--gold)' : 'var(--slate)',
                opacity: forHermes ? 1 : 0.85,
              }}
            />
            {forHermes ? 'For Hermes' : '@ Hermes'}
          </button>
        )}
      </form>
    </div>
  )
}
