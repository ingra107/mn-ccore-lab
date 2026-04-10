import { useState, useEffect, useRef } from 'react'
import {
  X, Circle, Clock, User, Flag, Scale,
  CalendarDays, FolderKanban, ArrowRightLeft,
  FileText, MessageSquare, Upload, Eye, ScrollText,
  Users, Bell, ClipboardList, Link2, Trash2, Plus, ExternalLink, RefreshCw, Copy, Check,
  ChevronUp, ChevronDown, FolderOpen, Play, Clipboard,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import CollapsibleSection from '../CollapsibleSection'
import FileUpload from '../FileUpload'
import RichTextEditor from '../RichTextEditor'
import { useUpdateTask, useUpdateTaskStatus, useAcknowledgeTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { formatRelativeTime } from '../../lib/dateUtils'
import { getPersonInfo, getAllMembers, directors } from '../../data/team'
import Avatar from '../Avatar'
import type { TaskRow } from '../../lib/api'

// ── Detail sub-modules ──────────────────────────────────────
import { FieldBlock, EditableTitle, EditableTextarea, StatusSelect, PrioritySelect, AssigneeSelect, DateInput, ProjectSelect } from './detail/FieldControls'
import { TaskDependenciesSection } from './detail/TaskDependencies'
import { SubtaskSection } from './detail/SubtaskSection'
import { HandoffSection } from './detail/HandoffSection'
import { TaskComments, ProjectDecisionsSection } from './detail/TaskComments'
import { TaskUpdateFeed } from './detail/TaskUpdateFeed'
import { TaskActivityFeed } from './detail/TaskActivityFeed'

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

export default function TaskDetailPanel({ task, onClose, onPrev, onNext }: TaskDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const updateTask = useUpdateTask()
  const updateStatus = useUpdateTaskStatus()
  const ackTask = useAcknowledgeTask()
  const { showUndo } = useUndoToast()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [copied, setCopied] = useState(false)

  // Close on Escape, navigate on Alt+Up/Down
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.altKey && e.key === 'ArrowUp' && onPrev) { e.preventDefault(); onPrev() }
      if (e.altKey && e.key === 'ArrowDown' && onNext) { e.preventDefault(); onNext() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, onPrev, onNext])

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
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked' }
    showUndo(`Status → ${labels[status] || status}`, () => updateStatus.mutate({ id: task.id, status: prev }))
  }

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="detail-backdrop"
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{ backgroundColor: 'rgba(15, 25, 35, 0.3)' }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="task-detail-panel"
        className="fixed right-0 top-0 h-full z-50 overflow-y-auto shadow-2xl task-detail-panel card-elevated"
        style={{
          width: 'min(480px, 90vw)',
          backgroundColor: 'var(--cream)',
          borderLeft: '1px solid var(--border-light)',
          animation: 'slideIn 200ms ease-out',
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
                const url = `${window.location.origin}/tasks?open=${task.id}`
                navigator.clipboard.writeText(url).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }}
              title="Copy task link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--slate)', padding: '4px', opacity: copied ? 1 : 'var(--ink-hint)', transition: 'all 150ms' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button data-testid="close-detail-panel" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Always visible: Title + Status */}
        <div className="px-5 pt-5 pb-3 flex flex-col gap-4">
          <EditableTitle
            value={task.title || task.description}
            onSave={(v) => handleFieldUpdate('title', v)}
          />

          <StatusSelect value={task.status} onChange={handleStatusChange} />

          {/* Task age + source info */}
          <div className="flex items-center gap-2 flex-wrap">
            {task.created_at && (
              <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                Created {formatRelativeTime(task.created_at)}
              </span>
            )}
            {task.source && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(45,138,138,0.08)', color: 'var(--teal)' }}>
                {task.source}
              </span>
            )}
            {(task as any).recurrence && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(201,168,76,0.08)', color: 'var(--gold)' }}>
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
                opacity: activeTab === key ? 1 : 0.6,
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
          <div style={{ display: activeTab === 'overview' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-xl)' }}>

            {/* Acknowledge button (compact) */}
            {task.assignee && !task.acknowledged_at && task.status !== 'done' && (
              <button
                onClick={() => ackTask.mutate(task.id)}
                disabled={ackTask.isPending}
                className="flex items-center gap-2 rounded-lg text-xs font-medium transition-all duration-200"
                style={{
                  background: 'rgba(201,168,76,0.08)',
                  color: 'var(--gold)',
                  border: '1px solid rgba(201,168,76,0.2)',
                  cursor: 'pointer',
                  width: 'fit-content',
                  padding: '6px 12px',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--gold)', flexShrink: 0 }} />
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

            {/* Description (rich text, resizable) */}
            <div>
              <label className="flex items-center" style={{ gap: 'var(--sp-xs)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)', marginBottom: 'var(--sp-xs)' }}>
                Description
              </label>
              <div className="description-editor-wrapper">
                <RichTextEditor
                  content={task.description_json || null}
                  plainTextFallback={task.description}
                  onUpdate={(json) => {
                    handleFieldUpdate('description_json', json)
                  }}
                  placeholder="Add a description..."
                />
              </div>
            </div>

            {/* Subtasks */}
            <SubtaskSection taskId={task.id} />
          </div>

          {/* ── Details Tab ── */}
          <div style={{ display: activeTab === 'details' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-xl)' }}>

            {/* Key Links (full width) */}
            <DetailKeyLinks task={task} />

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
              icon={<ArrowRightLeft size={11} style={{ color: 'var(--slate)', opacity: 0.55 }} />}
              defaultOpen={false}
              storageKey={`task-handoffs-${task.id}`}
            >
              <HandoffSection taskId={task.id} currentAssignee={task.assignee} />
            </CollapsibleSection>

            {/* Related Decisions */}
            {task.project_id && (
              <CollapsibleSection
                title="Related Decisions"
                icon={<Scale size={11} style={{ color: 'var(--gold)', opacity: 0.7 }} />}
                defaultOpen={false}
                storageKey={`task-decisions-${task.id}`}
              >
                <ProjectDecisionsSection projectSlug={task.project_id} />
              </CollapsibleSection>
            )}

            {/* Files */}
            <CollapsibleSection
              title="Files"
              icon={<FileText size={11} style={{ color: 'var(--slate)', opacity: 0.55 }} />}
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
          <div style={{ display: activeTab === 'notes' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
            <TaskUpdateFeed taskId={task.id} />
          </div>

          {/* ── Comments Tab ── */}
          <div style={{ display: activeTab === 'comments' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-xl)' }}>
            <TaskComments taskId={task.id} taskTitle={task.title} projectSlug={task.project_id} />
          </div>

          {/* ── Activity Tab ── */}
          <div style={{ display: activeTab === 'activity' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            <TaskActivityFeed taskId={task.id} />
          </div>

        </div>

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .dark .task-detail-panel {
            background-color: #162535 !important;
            border-color: rgba(201, 168, 76, 0.12) !important;
          }
          .dark .task-detail-panel select {
            color-scheme: dark;
          }
          @media (max-width: 640px) {
            .task-detail-panel .p-5 {
              padding: 1rem !important;
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
            style={{ backgroundColor: 'rgba(45,138,138,0.1)', color: 'var(--teal)' }}
          >
            <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="sm" className="!w-[16px] !h-[16px] !min-w-0 !min-h-0 !text-[7px]" />
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
                onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(45,138,138,0.05)')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="sm" className="!w-[20px] !h-[20px] !min-w-0 !min-h-0 !text-[8px]" />
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

function DetailKeyLinkRow({ url, label }: { url: string; label?: string | null }) {
  const [copied, setCopied] = useState(false)

  const isLocalPath = url.startsWith('file:///') || url.startsWith('C:') || (url.startsWith('/') && !url.startsWith('//'))
  const isBat = url.endsWith('.bat') || url.endsWith('.cmd') || url.endsWith('.ps1')
  const isHttp = url.startsWith('http')

  let Icon = ExternalLink
  let href = url
  let typeLabel = 'Link'
  if (isBat) {
    Icon = Play
    const cleanPath = url.replace('file:///', '')
    href = `mnccore://launch/${cleanPath}`
    typeLabel = 'Script'
  } else if (isLocalPath) {
    Icon = FolderOpen
    const cleanPath = url.replace('file:///', '')
    href = `mnccore://open/${cleanPath}`
    typeLabel = 'Folder'
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--ice)' }}>
      <a
        href={href}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        style={{ color: 'var(--teal)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
      >
        <Icon size={14} />
      </a>
      <div className="flex-1 min-w-0">
        <a
          href={href}
          target={isHttp ? '_blank' : undefined}
          rel={isHttp ? 'noopener noreferrer' : undefined}
          className="text-xs truncate block"
          style={{ color: 'var(--ink)', textDecoration: 'none' }}
          title={url}
        >
          {label || url}
        </a>
        <span className="text-[9px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          {typeLabel}
        </span>
      </div>
      <button
        onClick={handleCopy}
        title="Copy link"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: copied ? 'var(--green)' : 'var(--slate)',
          opacity: copied ? 1 : 'var(--ink-hint)',
          padding: '2px',
          transition: 'all 150ms',
        }}
      >
        {copied ? <Check size={12} /> : <Clipboard size={12} />}
      </button>
    </div>
  )
}

function DetailKeyLinks({ task }: { task: TaskRow }) {
  const links = [
    { url: task.key_link_1, desc: task.key_link_1_desc },
    { url: task.key_link_2, desc: task.key_link_2_desc },
    { url: task.key_link_3, desc: task.key_link_3_desc },
  ].filter(l => l.url)

  if (links.length === 0) return null

  return (
    <div>
      <label className="flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)', fontSize: 'var(--label-size)' }}>
        <Link2 size={11} />
        Key Links
      </label>
      <div className="flex flex-col gap-1">
        {links.map((l, i) => (
          <DetailKeyLinkRow key={i} url={l.url!} label={l.desc} />
        ))}
      </div>
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
              style={{ backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer', opacity: filename && url ? 1 : 0.4 }}
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.3, padding: '2px' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : !showAdd ? (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <Upload size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 8px' }} />
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', margin: 0 }}>
            No attachments yet. Click "Add Link" to attach a document.
          </p>
        </div>
      ) : null}
    </div>
  )
}
