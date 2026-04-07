import { useState, useEffect, useRef } from 'react'
import {
  X, Circle, Clock, User, Flag, Scale,
  CalendarDays, FolderKanban, ArrowRightLeft,
  FileText, MessageSquare, Upload, Eye,
} from 'lucide-react'
import CollapsibleSection from '../CollapsibleSection'
import { useUpdateTask, useUpdateTaskStatus, useAcknowledgeTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { TaskRow } from '../../lib/api'

// ── Detail sub-modules ──────────────────────────────────────
import { FieldBlock, EditableTitle, EditableTextarea, StatusSelect, PrioritySelect, AssigneeSelect, DateInput, ProjectSelect } from './detail/FieldControls'
import { TaskDependenciesSection } from './detail/TaskDependencies'
import { SubtaskSection } from './detail/SubtaskSection'
import { HandoffSection } from './detail/HandoffSection'
import { TaskComments, TaskActivity, ProjectDecisionsSection } from './detail/TaskComments'

type Tab = 'overview' | 'details' | 'files' | 'comments'

const TABS: { key: Tab; label: string; icon: typeof Circle }[] = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'details', label: 'Details', icon: Flag },
  { key: 'files', label: 'Files', icon: FileText },
  { key: 'comments', label: 'Comments', icon: MessageSquare },
]

interface TaskDetailPanelProps {
  task: TaskRow | null
  onClose: () => void
}

export default function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const updateTask = useUpdateTask()
  const updateStatus = useUpdateTaskStatus()
  const ackTask = useAcknowledgeTask()
  const { showUndo } = useUndoToast()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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
    const prev = task.status
    updateStatus.mutate({ id: task.id, status })
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked' }
    showUndo(`Status → ${labels[status] || status}`, () => updateStatus.mutate({ id: task.id, status: prev }))
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{ backgroundColor: 'rgba(15, 25, 35, 0.3)' }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
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
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--slate)', opacity: 0.55 }}>
            Task Detail
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Always visible: Title + Status */}
        <div className="px-5 pt-5 pb-3 flex flex-col gap-4">
          <EditableTitle
            value={task.title || task.description}
            onSave={(v) => handleFieldUpdate('title', v)}
          />

          <StatusSelect value={task.status} onChange={handleStatusChange} />
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
        <div className="p-5 flex flex-col gap-5">

          {/* ── Overview Tab ── */}
          <div style={{ display: activeTab === 'overview' ? 'flex' : 'none', flexDirection: 'column', gap: '20px' }}>
            {/* Assignee */}
            <FieldBlock label="Assignee" icon={User}>
              <AssigneeSelect value={task.assignee} onChange={(v) => handleFieldUpdate('assignee', v)} />
            </FieldBlock>

            {/* Acknowledge button */}
            {task.assignee && !task.acknowledged_at && task.status !== 'done' && (
              <button
                onClick={() => ackTask.mutate(task.id)}
                disabled={ackTask.isPending}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200"
                style={{
                  background: 'rgba(201,168,76,0.08)',
                  color: 'var(--gold)',
                  border: '1px solid rgba(201,168,76,0.2)',
                  cursor: 'pointer',
                  width: 'fit-content',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--gold)', flexShrink: 0 }} />
                {ackTask.isPending ? 'Acknowledging...' : 'Acknowledge Assignment'}
              </button>
            )}
            {task.acknowledged_at && (
              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                <Clock size={10} />
                Acknowledged {formatRelativeTime(task.acknowledged_at)}
                {task.acknowledged_by ? ` by ${task.acknowledged_by}` : ''}
              </div>
            )}

            {/* Description (brief) */}
            <div>
              <label className="block text-[11px] mb-1.5" style={{ color: 'var(--slate)', opacity: 0.65, fontWeight: 500 }}>
                Description
              </label>
              <EditableTextarea
                value={task.description || ''}
                onSave={(v) => handleFieldUpdate('description', v)}
                placeholder="Add a description..."
              />
            </div>

            {/* Priority */}
            <FieldBlock label="Priority" icon={Flag}>
              <PrioritySelect value={task.priority} onChange={(v) => handleFieldUpdate('priority', v)} />
            </FieldBlock>

            {/* Subtasks */}
            <SubtaskSection taskId={task.id} />
          </div>

          {/* ── Details Tab ── */}
          <div style={{ display: activeTab === 'details' ? 'flex' : 'none', flexDirection: 'column', gap: '20px' }}>
            <FieldBlock label="Due Date" icon={CalendarDays}>
              <DateInput value={task.due_date || ''} onChange={(v) => handleFieldUpdate('due_date', v || null)} />
            </FieldBlock>

            <FieldBlock label="Project" icon={FolderKanban}>
              <ProjectSelect value={task.project_id || ''} onChange={(v) => handleFieldUpdate('project_id', v || null)} />
            </FieldBlock>

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

            {/* Meta info */}
            <div className="flex items-center gap-3 text-[10px] pt-2 border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--slate)', opacity: 0.5 }}>
              {task.source && <span>Source: {task.source}</span>}
              {task.created_at && <span>Created {formatRelativeTime(task.created_at)}</span>}
              {task.completed_at && <span>Completed {formatRelativeTime(task.completed_at)}</span>}
            </div>

            {/* Activity */}
            <CollapsibleSection
              title="Activity"
              icon={<Clock size={11} style={{ color: 'var(--slate)', opacity: 0.55 }} />}
              defaultOpen={false}
              storageKey="task-activity"
            >
              <TaskActivity taskId={task.id} />
            </CollapsibleSection>
          </div>

          {/* ── Files Tab ── */}
          <div style={{ display: activeTab === 'files' ? 'flex' : 'none', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <Upload size={32} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
              <p style={{ fontSize: '13px', color: 'var(--slate)', opacity: 0.6, margin: 0 }}>
                No attachments yet
              </p>
              <button
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-colors mx-auto"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--teal)',
                  border: '1px solid var(--teal)',
                  cursor: 'pointer',
                  opacity: 0.8,
                }}
                onClick={() => {
                  // Placeholder — file upload requires R2 or external storage
                  alert('File upload coming soon. For now, paste a link in the description or comments.')
                }}
              >
                <Upload size={14} />
                Upload File
              </button>
            </div>
          </div>

          {/* ── Comments Tab ── */}
          <div style={{ display: activeTab === 'comments' ? 'flex' : 'none', flexDirection: 'column', gap: '20px' }}>
            <TaskComments taskId={task.id} taskTitle={task.title} projectSlug={task.project_id} />
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
