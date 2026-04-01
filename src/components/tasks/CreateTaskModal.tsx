import { useState } from 'react'
import { X } from 'lucide-react'
import { useTeam, useProjects } from '../../hooks/useApiData'

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  onCreate: (task: {
    title: string
    description: string
    assignee: string
    project_id?: string
    due_date?: string
    priority?: string
  }) => void
}

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '13px',
  color: 'var(--ink)',
  backgroundColor: 'white',
  borderColor: 'var(--border-light)',
}

export default function CreateTaskModal({ open, onClose, onCreate }: CreateTaskModalProps) {
  const { data: team = [] } = useTeam()
  const { data: projects = [] } = useProjects()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')

  const memberOptions = team
    .filter((m) => m.slug)
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !assignee) return

    onCreate({
      title: title.trim(),
      description: description.trim() || title.trim(),
      assignee,
      project_id: projectId || undefined,
      due_date: dueDate || undefined,
      priority,
    })

    // Reset form
    setTitle('')
    setDescription('')
    setAssignee('')
    setProjectId('')
    setDueDate('')
    setPriority('medium')
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15, 25, 35, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-xl border w-full max-w-lg mx-4"
        style={{ backgroundColor: 'white', borderColor: 'var(--border-light)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border-light)' }}
        >
          <h3
            className="text-lg"
            style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, color: 'var(--ink)' }}
          >
            Create New Task
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          {/* Title */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}
            >
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Complete BMI subgroup analysis for AJRCCM revision"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
              style={{
                ...selectStyle,
                borderColor: 'var(--border-light)',
              }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details..."
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 resize-none"
              style={selectStyle}
            />
          </div>

          {/* Owner + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}
              >
                Owner * <span style={{ fontWeight: 400, opacity: 0.5 }}>(responsible)</span>
              </label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full rounded-md border px-2.5 py-2 text-sm"
                style={selectStyle}
              >
                <option value="">Select owner...</option>
                {memberOptions.map((m) => (
                  <option key={m.slug} value={m.slug}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}
              >
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-md border px-2.5 py-2 text-sm"
                style={selectStyle}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Project + Due Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}
              >
                Project <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border px-2.5 py-2 text-sm"
                style={selectStyle}
              >
                <option value="">No Project</option>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}
              >
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border px-2.5 py-2 text-sm"
                style={selectStyle}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-[10px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>
              Tasks can also be created from meetings and project pages
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm transition-colors"
              style={{
                fontFamily: 'var(--font-sans)',
                color: 'var(--slate)',
                cursor: 'pointer',
                background: 'none',
                border: '1px solid var(--border-light)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !assignee}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                fontFamily: 'var(--font-sans)',
                backgroundColor: !title.trim() || !assignee ? 'var(--border-light)' : 'var(--teal)',
                color: !title.trim() || !assignee ? 'var(--slate)' : 'white',
                cursor: !title.trim() || !assignee ? 'not-allowed' : 'pointer',
                border: 'none',
              }}
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
