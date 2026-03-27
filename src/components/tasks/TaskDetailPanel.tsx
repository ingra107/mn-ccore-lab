import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Circle, Clock, CheckCircle2, AlertTriangle, Send,
  CalendarDays, FolderKanban, User, Flag, MessageSquare,
} from 'lucide-react'
import Avatar from '../Avatar'
import { getPersonInfo } from '../../data/team'
import { useTeam } from '../../hooks/useApiData'
import { useUpdateTask, useUpdateTaskStatus } from '../../hooks/useMutations'
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
  { value: 'high', label: 'High', color: '#c2410c' },
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
        className="fixed right-0 top-0 h-full z-50 overflow-y-auto shadow-2xl"
        style={{
          width: 'min(480px, 90vw)',
          backgroundColor: 'white',
          borderLeft: '1px solid var(--border-light)',
          animation: 'slideIn 200ms ease-out',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b" style={{ backgroundColor: 'white', borderColor: 'var(--border-light)' }}>
          <span className="text-xs uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
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

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <FieldBlock label="Status" icon={Circle}>
              <StatusSelect value={task.status} onChange={handleStatusChange} />
            </FieldBlock>
            <FieldBlock label="Priority" icon={Flag}>
              <PrioritySelect value={task.priority} onChange={(v) => handleFieldUpdate('priority', v)} />
            </FieldBlock>
          </div>

          {/* Assignee */}
          <FieldBlock label="Assignee" icon={User}>
            <AssigneeSelect value={task.assignee} onChange={(v) => handleFieldUpdate('assignee', v)} />
          </FieldBlock>

          {/* Due Date */}
          <FieldBlock label="Due Date" icon={CalendarDays}>
            <DateInput value={task.due_date || ''} onChange={(v) => handleFieldUpdate('due_date', v || null)} />
          </FieldBlock>

          {/* Project */}
          <FieldBlock label="Project" icon={FolderKanban}>
            <ProjectSelect value={task.project_id || ''} onChange={(v) => handleFieldUpdate('project_id', v || null)} />
          </FieldBlock>

          {/* Description — editable */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
              Description
            </label>
            <EditableTextarea
              value={task.description || ''}
              onSave={(v) => handleFieldUpdate('description', v)}
              placeholder="Add a description..."
            />
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 text-[10px] pt-2 border-t" style={{ borderColor: 'var(--border-light)', fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>
            {task.source && <span>Source: {task.source}</span>}
            {task.created_at && <span>Created {formatRelativeTime(task.created_at)}</span>}
            {task.completed_at && <span>Completed {formatRelativeTime(task.completed_at)}</span>}
          </div>

          {/* Comments */}
          <TaskComments taskId={task.id} />

          {/* Activity */}
          <TaskActivity taskId={task.id} />
        </div>

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    </>
  )
}

// ── Field Block Wrapper ──────────────────────────────────────

function FieldBlock({ label, icon: Icon, children }: { label: string; icon: typeof Circle; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
        <Icon size={10} />
        {label}
      </label>
      {children}
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
      className="text-lg font-semibold cursor-text hover:bg-black/[0.02] rounded px-1 -mx-1 py-0.5 transition-colors"
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
      className="text-sm cursor-text hover:bg-black/[0.02] rounded px-3 py-2 -mx-1 transition-colors min-h-[60px]"
      style={{ fontFamily: 'var(--font-sans)', color: value ? 'var(--ink)' : 'var(--slate)', opacity: value ? 1 : 0.5, whiteSpace: 'pre-wrap' }}
    >
      {value || placeholder}
    </div>
  )
}

// ── Status Select ────────────────────────────────────────────

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = statusOptions.find((s) => s.value === value) || statusOptions[0]
  const Icon = current.icon

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border px-3 py-2 text-sm pl-8 cursor-pointer"
        style={{ fontFamily: 'var(--font-sans)', color: current.color, borderColor: 'var(--border-light)', backgroundColor: 'white', fontWeight: 500 }}
      >
        {statusOptions.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <Icon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: current.color }} />
    </div>
  )
}

// ── Priority Select ──────────────────────────────────────────

function PrioritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = priorityOptions.find((p) => p.value === value) || priorityOptions[1]

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border px-3 py-2 text-sm cursor-pointer"
      style={{ fontFamily: 'var(--font-sans)', color: current.color, borderColor: 'var(--border-light)', backgroundColor: 'white', fontWeight: 500 }}
    >
      {priorityOptions.map((p) => (
        <option key={p.value} value={p.value}>{p.label}</option>
      ))}
    </select>
  )
}

// ── Assignee Select ──────────────────────────────────────────

function AssigneeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: team = [] } = useTeam()
  const person = getPersonInfo(value)
  const members = team.filter((m) => m.slug).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 24, height: 24 }}>
        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[7px]" />
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border px-2.5 py-2 text-sm cursor-pointer"
        style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', borderColor: 'var(--border-light)', backgroundColor: 'white' }}
      >
        {members.map((m) => (
          <option key={m.slug} value={m.slug}>{m.name}</option>
        ))}
      </select>
    </div>
  )
}

// ── Date Input ───────────────────────────────────────────────

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isOverdue = value && new Date(value + 'T23:59:59') < new Date()

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border px-3 py-2 text-sm"
        style={{
          fontFamily: 'var(--font-sans)',
          color: isOverdue ? 'var(--maroon)' : 'var(--ink)',
          fontWeight: isOverdue ? 600 : 400,
          borderColor: isOverdue ? 'var(--maroon)' : 'var(--border-light)',
          backgroundColor: 'white',
          cursor: 'pointer',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="text-xs px-2 py-1 rounded"
          style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 0.5 }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ── Project Select ───────────────────────────────────────────

function ProjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border px-3 py-2 text-sm cursor-pointer"
      style={{ fontFamily: 'var(--font-sans)', color: value ? 'var(--ink)' : 'var(--slate)', borderColor: 'var(--border-light)', backgroundColor: 'white' }}
    >
      <option value="">No project</option>
      {projectList.map((p) => (
        <option key={p.slug} value={p.slug}>{p.title}</option>
      ))}
    </select>
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

function TaskComments({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')

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
    setNewComment('')
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
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
                  <span className="text-[9px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>{formatRelativeTime(c.created_at)}</span>
                </div>
                <p className="text-sm mt-0.5" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{c.content}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add comment */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 rounded-md border px-3 py-1.5 text-sm outline-none"
          style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)' }}
        />
        {newComment.trim() && (
          <button type="submit" className="p-1.5 rounded-md" style={{ backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}>
            <Send size={14} />
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
      <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
        Activity
      </label>
      <div className="flex flex-col gap-1">
        {activity.slice(0, 8).map((a) => (
          <div key={a.id} className="flex items-start gap-2 py-0.5">
            <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--teal)', opacity: 0.3 }} />
            <span className="text-[11px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>{a.description}</span>
            <span className="text-[9px] ml-auto flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.3 }}>{formatRelativeTime(a.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
