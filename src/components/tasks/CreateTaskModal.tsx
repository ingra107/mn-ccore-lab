import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Sparkles, FileText, Shield, DollarSign, BarChart3, ClipboardList } from 'lucide-react'
import { useTeam, useProjects } from '../../hooks/useApiData'
import { suggestTaskFields, type AutofillSuggestions, type FieldSuggestion } from '../../lib/taskAutofill'

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

const TASK_TEMPLATES = [
  {
    icon: FileText,
    label: 'Paper Review',
    title: 'Review manuscript: ',
    description: '1. Read full manuscript\n2. Check methods and statistics\n3. Review figures and tables\n4. Write reviewer comments\n5. Submit review',
    priority: 'high',
  },
  {
    icon: Shield,
    label: 'IRB Submission',
    title: 'Submit IRB protocol: ',
    description: '1. Complete ETHOS application\n2. Upload protocol document\n3. Attach consent forms\n4. Add personnel and training docs\n5. Submit to IRB for review',
    priority: 'high',
  },
  {
    icon: DollarSign,
    label: 'Grant Deadline',
    title: 'Prepare grant submission: ',
    description: '1. Finalize specific aims\n2. Complete research strategy\n3. Update biosketch and other support\n4. Prepare budget and justification\n5. Internal review and submission',
    priority: 'urgent',
  },
  {
    icon: BarChart3,
    label: 'Data Analysis',
    title: 'Run analysis: ',
    description: '1. Pull and clean dataset\n2. Run primary analysis\n3. Sensitivity analyses\n4. Generate figures and tables\n5. Write methods and results sections',
    priority: 'medium',
  },
  {
    icon: ClipboardList,
    label: 'Meeting Prep',
    title: 'Prepare for meeting: ',
    description: '1. Review agenda and prior notes\n2. Prepare updates on assigned items\n3. Draft discussion points\n4. Compile any documents to share',
    priority: 'medium',
  },
]

const selectStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--ink)',
  backgroundColor: 'var(--cream)',
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

  // Autofill suggestions
  const [suggestions, setSuggestions] = useState<AutofillSuggestions>({
    project: null,
    priority: null,
    assignee: null,
  })
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runAutofill = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const result = suggestTaskFields(value, projects, team)
        setSuggestions(result)
      }, 300)
    },
    [projects, team],
  )

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTitle(value)
    setAcceptedFields(new Set()) // reset accepted on new typing
    runAutofill(value)
  }

  const acceptSuggestion = (suggestion: FieldSuggestion) => {
    if (suggestion.field === 'project') {
      setProjectId(suggestion.value)
    } else if (suggestion.field === 'priority') {
      setPriority(suggestion.value)
    } else if (suggestion.field === 'assignee') {
      setAssignee(suggestion.value)
    }
    setAcceptedFields((prev) => new Set(prev).add(suggestion.field))
  }

  // Collect visible suggestions (not already accepted)
  const visibleSuggestions = (
    [suggestions.project, suggestions.priority, suggestions.assignee].filter(
      (s): s is FieldSuggestion => s !== null && !acceptedFields.has(s.field),
    )
  )

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
    setSuggestions({ project: null, priority: null, assignee: null })
    setAcceptedFields(new Set())
    onClose()
  }

  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape
  useEffect(() => {
    if (!open || !modalRef.current) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = modalRef.current!.querySelectorAll<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15, 25, 35, 0.5)' }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-label="Create new task"
        aria-modal="true"
        data-testid="create-task-modal"
        className="rounded-xl shadow-xl border w-full max-w-lg mx-4 card-elevated"
        style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border-light)' }}
        >
          <h3
            className="text-lg"
            style={{ fontWeight: 400, color: 'var(--ink)' }}
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

        {/* Template strip */}
        <div className="flex gap-1.5 px-5 pt-3 pb-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TASK_TEMPLATES.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setTitle(t.title)
                  setDescription(t.description)
                  setPriority(t.priority)
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium flex-shrink-0 transition-colors"
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  color: 'var(--slate)',
                  opacity: 0.7,
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)'; e.currentTarget.style.opacity = '1' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--slate)'; e.currentTarget.style.opacity = '0.7' }}
              >
                <Icon size={11} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 pt-3 flex flex-col gap-3.5">
          {/* Title */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              Title *
            </label>
            <input
              type="text"
              data-testid="task-title-input"
              value={title}
              onChange={handleTitleChange}
              placeholder="e.g., Complete BMI subgroup analysis for AJRCCM revision"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
              style={{
                ...selectStyle,
                borderColor: 'var(--border-light)',
              }}
              autoFocus
            />
            {/* Autofill suggestion chips */}
            {visibleSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <Sparkles size={12} style={{ color: 'var(--teal)', opacity: 0.6, flexShrink: 0 }} />
                {visibleSuggestions.map((s) => (
                  <button
                    key={s.field}
                    type="button"
                    onClick={() => acceptSuggestion(s)}
                    className="rounded-full px-2.5 py-0.5 transition-colors"
                    style={{
                      fontSize: '11px',
                      lineHeight: '18px',
                      color: 'var(--teal)',
                      border: '1px solid var(--teal)',
                      background: 'transparent',
                      cursor: 'pointer',
                      opacity: 0.85,
                      whiteSpace: 'nowrap',
                      maxWidth: '220px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={`Set ${s.field}: ${s.label}`}
                  >
                    {s.field === 'project' && '\u{1F4C1} '}
                    {s.field === 'priority' && '\u{26A1} '}
                    {s.field === 'assignee' && '\u{1F464} '}
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
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
                style={{ color: 'var(--slate)' }}
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
                style={{ color: 'var(--slate)' }}
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
                style={{ color: 'var(--slate)' }}
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
                style={{ color: 'var(--slate)' }}
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
            <p className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.4 }}>
              Tasks can also be created from meetings and project pages
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm transition-colors"
              style={{
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
              data-testid="task-submit"
              disabled={!title.trim() || !assignee}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
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
