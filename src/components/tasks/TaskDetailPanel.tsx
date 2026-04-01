import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, Circle, Clock, CheckCircle2, AlertTriangle, Send,
  CalendarDays, FolderKanban, User, Flag, MessageSquare, Ban,
  ListChecks, Plus, Trash2, ArrowRightLeft, Check,
} from 'lucide-react'
import Avatar from '../Avatar'
import ReactionBar from '../ReactionBar'
import { getPersonInfo } from '../../data/team'
import { useTeam, useSubtasks, useHandoffs } from '../../hooks/useApiData'
import { useUpdateTask, useUpdateTaskStatus, useCreateSubtask, useToggleSubtask, useDeleteSubtask, useCreateHandoff, useAcknowledgeHandoff } from '../../hooks/useMutations'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { TaskRow } from '../../lib/api'

interface TaskDetailPanelProps {
  task: TaskRow | null
  onClose: () => void
}

const statusOptions = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'var(--teal)' },
  { value: 'done', label: 'Done', icon: CheckCircle2, color: 'var(--green, #22c55e)' },
  { value: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'var(--maroon)' },
]

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'var(--slate)' },
  { value: 'medium', label: 'Medium', color: 'var(--gold)' },
  { value: 'high', label: 'High', color: 'var(--orange)' },
  { value: 'urgent', label: 'Urgent', color: 'var(--maroon)' },
]

export default function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const updateTask = useUpdateTask()
  const updateStatus = useUpdateTaskStatus()

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
    updateStatus.mutate({ id: task.id, status })
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
          <span className="text-xs uppercase tracking-wider" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
            Task Detail
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Title — editable */}
          <EditableTitle
            value={task.title || task.description}
            onSave={(v) => handleFieldUpdate('title', v)}
          />

          {/* Status */}
          <FieldBlock label="Status" icon={Circle}>
            <StatusSelect value={task.status} onChange={handleStatusChange} />
          </FieldBlock>

          {/* Priority */}
          <FieldBlock label="Priority" icon={Flag}>
            <PrioritySelect value={task.priority} onChange={(v) => handleFieldUpdate('priority', v)} />
          </FieldBlock>

          {/* Assignee */}
          <FieldBlock label="Assignee" icon={User}>
            <AssigneeSelect value={task.assignee} onChange={(v) => handleFieldUpdate('assignee', v)} />
          </FieldBlock>

          {/* Handoff */}
          <HandoffSection taskId={task.id} currentAssignee={task.assignee} />

          {/* Due Date */}
          <FieldBlock label="Due Date" icon={CalendarDays}>
            <DateInput value={task.due_date || ''} onChange={(v) => handleFieldUpdate('due_date', v || null)} />
          </FieldBlock>

          {/* Project */}
          <FieldBlock label="Project" icon={FolderKanban}>
            <ProjectSelect value={task.project_id || ''} onChange={(v) => handleFieldUpdate('project_id', v || null)} />
          </FieldBlock>

          {/* Blocked By (only show when status is blocked) */}
          {task.status === 'blocked' && (
            <FieldBlock label="Blocked By" icon={Ban}>
              <BlockedBySelect value={task.blocked_by || ''} onChange={(v) => handleFieldUpdate('blocked_by', v || null)} />
            </FieldBlock>
          )}

          {/* Description — editable */}
          <div>
            <label className="block text-[11px] mb-1.5" style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', opacity: 0.65, fontWeight: 500 }}>
              Description
            </label>
            <EditableTextarea
              value={task.description || ''}
              onSave={(v) => handleFieldUpdate('description', v)}
              placeholder="Add a description..."
            />
          </div>

          {/* Subtasks / Checklist */}
          <SubtaskChecklist taskId={task.id} />

          {/* Meta info */}
          <div className="flex items-center gap-3 text-[10px] pt-2 border-t" style={{ borderColor: 'var(--border-subtle)', fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>
            {task.source && <span>Source: {task.source}</span>}
            {task.created_at && <span>Created {formatRelativeTime(task.created_at)}</span>}
            {task.completed_at && <span>Completed {formatRelativeTime(task.completed_at)}</span>}
          </div>

          {/* Comments */}
          <TaskComments taskId={task.id} taskTitle={task.title} projectSlug={task.project_id} />

          {/* Activity */}
          <TaskActivity taskId={task.id} />
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

// ── Field Block Wrapper ──────────────────────────────────────

function FieldBlock({ label, icon: Icon, children }: { label: string; icon: typeof Circle; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <label className="flex items-center gap-1.5 text-[11px] pt-1.5 shrink-0 w-[88px]" style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', opacity: 0.65, fontWeight: 500 }}>
        <Icon size={12} style={{ opacity: 0.7 }} />
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ── Editable Title ───────────────────────────────────────────

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const save = () => {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className="w-full text-lg font-semibold outline-none border-b-2 pb-1"
        style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', borderColor: 'var(--teal)', background: 'none' }}
      />
    )
  }

  return (
    <h3
      onClick={() => setEditing(true)}
      className="text-lg font-semibold cursor-text hover:bg-black/[0.02] dark:hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
      style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}
    >
      {value}
    </h3>
  )
}

// ── Editable Textarea ────────────────────────────────────────

function EditableTextarea({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = () => {
    if (draft !== value) onSave(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        rows={3}
        className="w-full text-sm outline-none border rounded-md px-3 py-2 resize-none"
        style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', borderColor: 'var(--teal)', background: 'none' }}
      />
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="text-sm cursor-text hover:bg-black/[0.02] dark:hover:bg-white/[0.04] rounded px-3 py-2 -mx-1 transition-colors min-h-[60px]"
      style={{ fontFamily: 'var(--font-sans)', color: value ? 'var(--ink)' : 'var(--slate)', opacity: value ? 1 : 0.5, whiteSpace: 'pre-wrap' }}
    >
      {value || placeholder}
    </div>
  )
}

// ── Status Select ────────────────────────────────────────────

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {statusOptions.map((s) => {
        const Icon = s.icon
        const active = value === s.value
        return (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border transition-colors"
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: active ? 600 : 400,
              color: active ? s.color : 'var(--slate)',
              borderColor: active ? s.color : 'var(--border-light)',
              backgroundColor: active ? `color-mix(in srgb, ${s.color} 8%, transparent)` : 'transparent',
              cursor: 'pointer',
              opacity: active ? 1 : 0.7,
            }}
          >
            <Icon size={12} />
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Priority Select ──────────────────────────────────────────

function PrioritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {priorityOptions.map((p) => {
        const active = value === p.value
        return (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border transition-colors"
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: active ? 600 : 400,
              color: active ? p.color : 'var(--slate)',
              borderColor: active ? p.color : 'var(--border-light)',
              backgroundColor: active ? `color-mix(in srgb, ${p.color} 8%, transparent)` : 'transparent',
              cursor: 'pointer',
              opacity: active ? 1 : 0.7,
            }}
          >
            <Flag size={10} />
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Assignee Select ──────────────────────────────────────────

function AssigneeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: team = [] } = useTeam()
  const person = getPersonInfo(value)
  const members = team.filter((m) => m.slug).sort((a, b) => a.name.localeCompare(b.name))

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border px-2 py-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{ borderColor: 'var(--border-light)', cursor: 'pointer', background: 'none' }}
      >
        <div style={{ width: 28, height: 28 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-7 !h-7 !min-w-0 !min-h-0 !text-[8px]" />
        </div>
        <span className="text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}>{person.name}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--slate)', opacity: 0.5 }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[200px] max-h-[240px] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }}>
          {members.map((m) => {
            const slug = m.slug!
            const mp = getPersonInfo(slug)
            const selected = slug === value
            return (
              <button
                key={slug}
                onClick={() => { onChange(slug); setOpen(false) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                <div style={{ width: 24, height: 24 }}>
                  <Avatar name={mp.name} initials={mp.initials} photoUrl={mp.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[7px]" />
                </div>
                <span className="flex-1">{m.name}</span>
                {selected && <Check size={14} style={{ color: 'var(--teal)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Date Input ───────────────────────────────────────────────

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isOverdue = value && new Date(value + 'T23:59:59') < new Date()

  const formatted = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => inputRef.current?.showPicker()}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{
          fontFamily: 'var(--font-body)',
          color: isOverdue ? 'var(--maroon)' : formatted ? 'var(--ink)' : 'var(--slate)',
          fontWeight: isOverdue ? 600 : 400,
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          opacity: formatted ? 1 : 0.6,
        }}
      >
        {formatted || 'Set date...'}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 0.4 }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

// ── Project Select ───────────────────────────────────────────

function ProjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: projectList = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) return []
      const data = await res.json()
      return data.data as { slug: string; title: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const current = projectList.find((p) => p.slug === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{
          fontFamily: 'var(--font-body)',
          color: current ? 'var(--teal)' : 'var(--slate)',
          cursor: 'pointer',
          background: current ? 'rgba(45,138,138,0.06)' : 'none',
          border: 'none',
          opacity: current ? 1 : 0.6,
        }}
      >
        <FolderKanban size={13} style={{ opacity: 0.7 }} />
        {current ? current.title : 'No project'}
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--slate)', opacity: 0.4 }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[240px] max-h-[280px] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }}>
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 0.6 }}
          >
            No project
            {!value && <Check size={14} style={{ color: 'var(--teal)', marginLeft: 'auto' }} />}
          </button>
          {projectList.map((p) => {
            const selected = p.slug === value
            return (
              <button
                key={p.slug}
                onClick={() => { onChange(p.slug); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                <span className="flex-1 truncate">{p.title}</span>
                {selected && <Check size={14} style={{ color: 'var(--teal)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Blocked By Select ────────────────────────────────────────

function BlockedBySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: team = [] } = useTeam()
  const members = team.filter((m) => m.slug).sort((a, b) => a.name.localeCompare(b.name))
  const person = value ? getPersonInfo(value) : null

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
          style={{
            fontFamily: 'var(--font-body)',
            color: value ? 'var(--maroon)' : 'var(--slate)',
            cursor: 'pointer',
            background: value ? 'rgba(122,0,25,0.04)' : 'none',
            border: 'none',
            opacity: value ? 1 : 0.6,
          }}
        >
          {person ? (
            <>
              <div style={{ width: 20, height: 20 }}>
                <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
              </div>
              {person.name}
            </>
          ) : 'Select who is blocking...'}
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--slate)', opacity: 0.4 }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {value && (
          <button onClick={() => onChange('')} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 0.4 }}>
            &times;
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[200px] max-h-[240px] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }}>
          {members.map((m) => {
            const slug = m.slug!
            const mp = getPersonInfo(slug)
            return (
              <button
                key={slug}
                onClick={() => { onChange(slug); setOpen(false) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                <div style={{ width: 20, height: 20 }}>
                  <Avatar name={mp.name} initials={mp.initials} photoUrl={mp.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
                </div>
                <span className="flex-1">{m.name}</span>
                {slug === value && <Check size={14} style={{ color: 'var(--maroon)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Subtask Checklist ────────────────────────────────────────

function SubtaskChecklist({ taskId }: { taskId: string }) {
  const { data: subtasks = [] } = useSubtasks(taskId)
  const createSubtask = useCreateSubtask(taskId)
  const toggleSubtask = useToggleSubtask(taskId)
  const deleteSubtask = useDeleteSubtask(taskId)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const completed = subtasks.filter((s) => s.completed).length
  const total = subtasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const allDone = total > 0 && completed === total

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    createSubtask.mutate(newTitle.trim())
    setNewTitle('')
    inputRef.current?.focus()
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] mb-2" style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', opacity: 0.65, fontWeight: 500 }}>
        <ListChecks size={12} style={{ opacity: 0.7 }} />
        Subtasks ({completed}/{total})
      </label>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(201, 168, 76, 0.15)', overflow: 'hidden', marginBottom: '0.75rem' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: allDone ? 'var(--teal)' : 'var(--gold)', borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      )}

      {/* Subtask list */}
      <div className="flex flex-col gap-0.5 mb-2">
        <AnimatePresence initial={false}>
          {subtasks.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.15 }}
              className="group flex items-center gap-2 py-1.5 px-1 -mx-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
            >
              {/* Toggle button */}
              <button
                onClick={() => toggleSubtask.mutate(s.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
              >
                {s.completed ? (
                  <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} />
                ) : (
                  <Circle size={16} style={{ color: 'var(--slate)', opacity: 0.3 }} />
                )}
              </button>

              {/* Title */}
              <span
                className="flex-1 text-sm min-w-0 truncate"
                style={{
                  fontFamily: 'var(--font-sans)',
                  color: s.completed ? 'var(--slate)' : 'var(--ink)',
                  textDecoration: s.completed ? 'line-through' : 'none',
                  opacity: s.completed ? 0.5 : 1,
                }}
              >
                {s.title}
              </span>

              {/* Delete button (visible on hover) */}
              <button
                onClick={() => deleteSubtask.mutate(s.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--slate)', flexShrink: 0 }}
              >
                <Trash2 size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add subtask input */}
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <Plus size={14} style={{ color: 'var(--slate)', opacity: 0.3, flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add subtask..."
          className="flex-1 text-sm outline-none bg-transparent py-1"
          style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', border: 'none' }}
        />
      </form>
    </div>
  )
}

// ── Handoff Recipient Select ─────────────────────────────────

function HandoffRecipientSelect({ value, onChange, members }: { value: string; onChange: (v: string) => void; members: { slug?: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const person = value ? getPersonInfo(value) : null

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border px-2 py-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{ borderColor: 'rgba(45,138,138,0.25)', cursor: 'pointer', background: 'none' }}
      >
        {person ? (
          <>
            <div style={{ width: 24, height: 24 }}>
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[7px]" />
            </div>
            <span className="text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}>{person.name}</span>
          </>
        ) : (
          <span className="text-sm px-1" style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', opacity: 0.5 }}>Select team member...</span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--teal)', opacity: 0.6 }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[200px] max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }}>
          {members.map((m) => {
            const slug = m.slug!
            const mp = getPersonInfo(slug)
            const selected = slug === value
            return (
              <button
                type="button"
                key={slug}
                onClick={() => { onChange(slug); setOpen(false) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                <div style={{ width: 22, height: 22 }}>
                  <Avatar name={mp.name} initials={mp.initials} photoUrl={mp.photoUrl} size="sm" variant="ice" className="!w-[22px] !h-[22px] !min-w-0 !min-h-0 !text-[7px]" />
                </div>
                <span className="flex-1">{m.name}</span>
                {selected && <Check size={14} style={{ color: 'var(--teal)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Handoff Section ─────────────────────────────────────────

function HandoffSection({ taskId, currentAssignee }: { taskId: string; currentAssignee: string }) {
  const [showForm, setShowForm] = useState(false)
  const [toSlug, setToSlug] = useState('')
  const [situation, setSituation] = useState('')
  const [background, setBackground] = useState('')
  const [assessment, setAssessment] = useState('')
  const [recommendation, setRecommendation] = useState('')

  const { data: team = [] } = useTeam()
  const { data: handoffs = [] } = useHandoffs(taskId)
  const createHandoff = useCreateHandoff(taskId)
  const acknowledgeHandoff = useAcknowledgeHandoff(taskId)

  const members = team.filter((m) => m.slug && m.slug !== currentAssignee).sort((a, b) => a.name.localeCompare(b.name))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!toSlug || !situation.trim()) return
    createHandoff.mutate({
      to_slug: toSlug,
      situation: situation.trim(),
      background: background.trim() || undefined,
      assessment: assessment.trim() || undefined,
      recommendation: recommendation.trim() || undefined,
    })
    setShowForm(false)
    setToSlug('')
    setSituation('')
    setBackground('')
    setAssessment('')
    setRecommendation('')
  }

  const inputStyle = {
    fontFamily: 'var(--font-sans)',
    color: 'var(--ink)',
    borderColor: 'var(--border-light)',
    backgroundColor: 'var(--cream)',
    fontSize: '13px',
  }

  const labelStyle = {
    fontFamily: 'var(--font-body)',
    fontSize: '11px' as const,
    fontWeight: 500,
    color: 'var(--slate)',
    opacity: 0.6,
    marginBottom: '4px',
    display: 'block' as const,
  }

  return (
    <div>
      {showForm ? (
        <form onSubmit={handleSubmit}>
          <div className="p-4 rounded-xl" style={{ background: 'rgba(45,138,138,0.04)', border: '1px solid rgba(45,138,138,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft size={14} style={{ color: 'var(--teal)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--teal)' }}>
                Handoff to...
              </span>
            </div>

            {/* To: team member dropdown */}
            <div className="mb-3">
              <label style={labelStyle}>To</label>
              <HandoffRecipientSelect value={toSlug} onChange={setToSlug} members={members} />
            </div>

            {/* Situation (required) */}
            <div className="mb-3">
              <label style={labelStyle}>Situation <span style={{ color: 'var(--maroon)' }}>*</span></label>
              <textarea
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="What is the current state of this task?"
                required
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            {/* Background (optional) */}
            <div className="mb-3">
              <label style={labelStyle}>Background</label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="What context does the next person need?"
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            {/* Assessment (optional) */}
            <div className="mb-3">
              <label style={labelStyle}>Assessment</label>
              <textarea
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                placeholder="What's your assessment of where things stand?"
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            {/* Recommendation (optional) */}
            <div className="mb-3">
              <label style={labelStyle}>Recommendation</label>
              <textarea
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                placeholder="What do you recommend as next steps?"
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!toSlug || !situation.trim() || createHandoff.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: (!toSlug || !situation.trim()) ? 'var(--border-light)' : 'var(--teal)',
                  color: (!toSlug || !situation.trim()) ? 'var(--slate)' : 'white',
                  border: 'none',
                  cursor: (!toSlug || !situation.trim()) ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  opacity: createHandoff.isPending ? 0.6 : 1,
                }}
              >
                <ArrowRightLeft size={12} />
                {createHandoff.isPending ? 'Sending...' : 'Send Handoff'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 rounded-md text-xs"
                style={{ background: 'none', border: '1px solid var(--border-light)', cursor: 'pointer', color: 'var(--slate)', fontFamily: 'var(--font-sans)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
          style={{
            fontFamily: 'var(--font-sans)',
            color: 'var(--teal)',
            background: 'rgba(45,138,138,0.06)',
            border: '1px solid rgba(45,138,138,0.15)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          <ArrowRightLeft size={12} />
          Hand Off
        </button>
      )}

      {/* Handoff History Timeline */}
      {handoffs.length > 0 && (
        <div className="mt-3">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
            <ArrowRightLeft size={10} />
            Handoff History ({handoffs.length})
          </label>
          <div className="flex flex-col gap-2">
            {handoffs.map((h) => {
              const from = getPersonInfo(h.from_slug)
              const to = getPersonInfo(h.to_slug)
              return (
                <div key={h.id} className="p-3 rounded-lg" style={{ background: 'rgba(45,138,138,0.03)', borderLeft: '3px solid var(--teal)' }}>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                      <div style={{ width: 20, height: 20 }}>
                        <Avatar name={from.name} initials={from.initials} photoUrl={from.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[6px]" />
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: 'var(--ink)' }}>{from.name}</span>
                    </div>
                    <ArrowRightLeft size={10} style={{ color: 'var(--teal)', opacity: 0.5 }} />
                    <div className="flex items-center gap-1">
                      <div style={{ width: 20, height: 20 }}>
                        <Avatar name={to.name} initials={to.initials} photoUrl={to.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[6px]" />
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: 'var(--ink)' }}>{to.name}</span>
                    </div>
                    <span className="text-[9px] ml-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>
                      {formatRelativeTime(h.created_at)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 text-[12px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                    <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font-sans)', fontSize: '10px' }}>S:</span> {h.situation}</p>
                    {h.background && <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font-sans)', fontSize: '10px' }}>B:</span> {h.background}</p>}
                    {h.assessment && <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font-sans)', fontSize: '10px' }}>A:</span> {h.assessment}</p>}
                    {h.recommendation && <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font-sans)', fontSize: '10px' }}>R:</span> {h.recommendation}</p>}
                  </div>
                  <div className="mt-2">
                    {h.acknowledged ? (
                      <span className="flex items-center gap-1 text-[10px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', opacity: 0.6 }}>
                        <Check size={10} /> Acknowledged {h.acknowledged_at ? formatRelativeTime(h.acknowledged_at) : ''}
                      </span>
                    ) : (
                      <button
                        onClick={() => acknowledgeHandoff.mutate(h.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors"
                        style={{
                          fontFamily: 'var(--font-sans)',
                          color: 'var(--gold)',
                          background: 'rgba(201,168,76,0.08)',
                          border: '1px solid rgba(201,168,76,0.2)',
                          cursor: 'pointer',
                        }}
                      >
                        <Check size={10} /> Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Task Comments ────────────────────────────────────────────

interface TaskComment {
  id: string
  task_id: string
  author_slug: string
  content: string
  created_at: string
}

function TaskComments({ taskId, taskTitle, projectSlug }: { taskId: string; taskTitle?: string; projectSlug?: string | null }) {
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [forClaude, setForClaude] = useState(false)

  const { data: comments = [] } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/comments`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as TaskComment[]
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    addComment.mutate(newComment.trim())
    // Also add to dispatch queue if @claude toggle is on
    if (forClaude) {
      fetch('/api/pb/dispatch/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          task_title: taskTitle || null,
          project_slug: projectSlug || null,
          comment: newComment.trim(),
          comment_type: 'action',
        }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['dispatch-pending'] })
      }).catch(() => {})
    }
    setNewComment('')
    setForClaude(false)
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
        <MessageSquare size={10} />
        Comments ({comments.length})
      </label>

      {/* Comment list */}
      <div className="flex flex-col gap-2 mb-3">
        {comments.map((c) => {
          const person = getPersonInfo(c.author_slug)
          return (
            <div key={c.id} className="flex gap-2">
              <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[7px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{person.name}</span>
                  <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>{formatRelativeTime(c.created_at)}</span>
                </div>
                <p className="text-sm mt-0.5" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{c.content}</p>
                <ReactionBar targetType="task_comment" targetId={c.id} compact />
              </div>
            </div>
          )
        })}
      </div>

      {/* Add comment */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 rounded-md border px-3 py-1.5 text-sm outline-none"
            style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)', backgroundColor: 'var(--cream)', color: 'var(--ink)' }}
          />
          {newComment.trim() && (
            <button type="submit" className="p-1.5 rounded-md" style={{ backgroundColor: forClaude ? 'var(--gold)' : 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s' }}>
              <Send size={14} />
            </button>
          )}
        </div>
        {newComment.trim() && (
          <button
            type="button"
            onClick={() => setForClaude(!forClaude)}
            className="flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full transition-colors"
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '9px', fontWeight: 600,
              background: forClaude ? 'rgba(201,168,76,0.15)' : 'rgba(100,116,139,0.06)',
              color: forClaude ? 'var(--gold)' : 'var(--slate)',
              border: `1px solid ${forClaude ? 'rgba(201,168,76,0.3)' : 'rgba(100,116,139,0.1)'}`,
              cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.3px',
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: forClaude ? 'var(--gold)' : 'var(--slate)',
              opacity: forClaude ? 1 : 0.3,
            }} />
            {forClaude ? 'For Claude' : '@ Claude'}
          </button>
        )}
      </form>
    </div>
  )
}

// ── Task Activity Log ────────────────────────────────────────

function TaskActivity({ taskId }: { taskId: string }) {
  const { data: activity = [] } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/activity`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as { id: string; description: string; actor: string | null; timestamp: string }[]
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })

  if (activity.length === 0) return null

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
        Activity
      </label>
      <div className="flex flex-col gap-1">
        {activity.slice(0, 8).map((a) => (
          <div key={a.id} className="flex items-start gap-2 py-0.5">
            <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--teal)', opacity: 0.3 }} />
            <span className="text-[11px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>{a.description}</span>
            <span className="text-[9px] ml-auto flex-shrink-0" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.3 }}>{formatRelativeTime(a.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
