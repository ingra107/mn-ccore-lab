import { useEffect, useRef } from 'react'
import {
  X, Circle, Clock, User, Flag, Scale,
  CalendarDays, FolderKanban, ArrowRightLeft,
} from 'lucide-react'
import CollapsibleSection from '../CollapsibleSection'
import { useUpdateTask, useUpdateTaskStatus } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { TaskRow } from '../../lib/api'

// ── Detail sub-modules ──────────────────────────────────────
import { FieldBlock, EditableTitle, EditableTextarea, StatusSelect, PrioritySelect, AssigneeSelect, DateInput, ProjectSelect } from './detail/FieldControls'
import { TaskDependenciesSection } from './detail/TaskDependencies'
import { SubtaskSection } from './detail/SubtaskSection'
import { HandoffSection } from './detail/HandoffSection'
import { TaskComments, TaskActivity, ProjectDecisionsSection } from './detail/TaskComments'

interface TaskDetailPanelProps {
  task: TaskRow | null
  onClose: () => void
}

export default function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const updateTask = useUpdateTask()
  const updateStatus = useUpdateTaskStatus()
  const { showUndo } = useUndoToast()

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
        className="fixed right-0 top-0 h-full z-50 overflow-y-auto shadow-2xl task-detail-panel"
        style={{
          width: 'min(480px, 90vw)',
          backgroundColor: 'var(--cream)',
          borderLeft: '1px solid var(--border-light)',
          animation: 'slideIn 200ms ease-out',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}>
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--slate)', opacity: 0.5 }}>
            Task Detail
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Title — editable (always visible) */}
          <EditableTitle
            value={task.title || task.description}
            onSave={(v) => handleFieldUpdate('title', v)}
          />

          {/* Status (always visible) */}
          <FieldBlock label="Status" icon={Circle}>
            <StatusSelect value={task.status} onChange={handleStatusChange} />
          </FieldBlock>

          {/* Assignee (always visible) */}
          <FieldBlock label="Assignee" icon={User}>
            <AssigneeSelect value={task.assignee} onChange={(v) => handleFieldUpdate('assignee', v)} />
          </FieldBlock>

          {/* Description (always visible) */}
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

          {/* Details — collapsible, opens by default when fields have values */}
          <CollapsibleSection
            title="Details"
            icon={<Flag size={11} style={{ color: 'var(--slate)', opacity: 0.5 }} />}
            defaultOpen={!!(task.priority && task.priority !== 'medium') || !!task.due_date || !!task.project_id || task.status === 'blocked'}
            storageKey={`task-details-${task.id}`}
          >
            <div className="flex flex-col gap-4">
              <FieldBlock label="Priority" icon={Flag}>
                <PrioritySelect value={task.priority} onChange={(v) => handleFieldUpdate('priority', v)} />
              </FieldBlock>

              <FieldBlock label="Due Date" icon={CalendarDays}>
                <DateInput value={task.due_date || ''} onChange={(v) => handleFieldUpdate('due_date', v || null)} />
              </FieldBlock>

              <FieldBlock label="Project" icon={FolderKanban}>
                <ProjectSelect value={task.project_id || ''} onChange={(v) => handleFieldUpdate('project_id', v || null)} />
              </FieldBlock>

            </div>
          </CollapsibleSection>

          {/* Dependencies — blocker/blocking task links */}
          <TaskDependenciesSection task={task} onFieldUpdate={handleFieldUpdate} onOpenTask={(t) => { /* re-open with new task handled by parent */ }} />

          {/* Subtasks — collapsible with count badge */}
          <SubtaskSection taskId={task.id} />

          {/* Handoffs — collapsible */}
          <CollapsibleSection
            title="Handoffs"
            icon={<ArrowRightLeft size={11} style={{ color: 'var(--slate)', opacity: 0.5 }} />}
            defaultOpen={false}
            storageKey={`task-handoffs-${task.id}`}
          >
            <HandoffSection taskId={task.id} currentAssignee={task.assignee} />
          </CollapsibleSection>

          {/* Related Decisions — show decisions linked to this task's project */}
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
          <div className="flex items-center gap-3 text-[10px] pt-2 border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--slate)', opacity: 0.4 }}>
            {task.source && <span>Source: {task.source}</span>}
            {task.created_at && <span>Created {formatRelativeTime(task.created_at)}</span>}
            {task.completed_at && <span>Completed {formatRelativeTime(task.completed_at)}</span>}
          </div>

          {/* Comments (always visible — most used) */}
          <TaskComments taskId={task.id} taskTitle={task.title} projectSlug={task.project_id} />

          {/* Activity — collapsible */}
          <CollapsibleSection
            title="Activity"
            icon={<Clock size={11} style={{ color: 'var(--slate)', opacity: 0.5 }} />}
            defaultOpen={false}
            storageKey="task-activity"
          >
            <TaskActivity taskId={task.id} />
          </CollapsibleSection>
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
