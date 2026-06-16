import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, FileText, Shield, DollarSign, BarChart3, ClipboardList } from 'lucide-react'
import { useTeam, useProjects } from '../../hooks/useApiData'
import { suggestTaskFields, type AutofillSuggestions, type FieldSuggestion } from '../../lib/taskAutofill'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import InlineAssigneePicker from '../InlineAssigneePicker'
import InlineSelect from '../InlineSelect'
import { Button } from '../ui/Button'
import Modal from '../ui/Modal'
import { todayCivil } from '../../lib/time'
import { ICON_PROPS } from '../../lib/iconProps'

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
  fontSize: 'var(--value-size)',
  color: 'var(--ink)',
  backgroundColor: 'var(--cream)',
  borderColor: 'var(--border-subtle)',
}

export default function CreateTaskModal({ open, onClose, onCreate }: CreateTaskModalProps) {
  const { data: team = [] } = useTeam()
  const { data: projects = [] } = useProjects()
  const { user } = useAuth()
  const defaultAssignee = user?.email ? emailToSlug(user.email) : ''

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState(defaultAssignee)
  const [assigneeTouched, setAssigneeTouched] = useState(false)
  const [projectId, setProjectId] = useState('')
  // Due date defaults to today's LOCAL civil date (viewer zone). Via todayCivil()
  // — never a raw new Date().toISOString() (the R20/R21 time-discipline lint
  // hard-fails that). `dueTouched` lets a user clear/change it without the
  // open-effect re-stamping today over their choice.
  const [dueDate, setDueDate] = useState<string>(() => todayCivil())
  const [dueTouched, setDueTouched] = useState(false)
  const [priority, setPriority] = useState('medium')

  // When modal opens, re-derive default assignee if user hasn't touched it
  useEffect(() => {
    if (open && !assigneeTouched) setAssignee(defaultAssignee)
  }, [open, defaultAssignee, assigneeTouched])

  // When the modal (re)opens, default the due date to today unless the user has
  // edited it this session. Re-stamps today on each fresh open so a modal opened
  // yesterday and reopened today shows today, not the stale day.
  useEffect(() => {
    if (open && !dueTouched) setDueDate(todayCivil())
  }, [open, dueTouched])

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

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
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
    setAssignee(defaultAssignee)
    setAssigneeTouched(false)
    setProjectId('')
    setDueDate(todayCivil())
    setDueTouched(false)
    setPriority('medium')
    setSuggestions({ project: null, priority: null, assignee: null })
    setAcceptedFields(new Set())
    onClose()
  }, [title, description, assignee, projectId, dueDate, priority, defaultAssignee, onCreate, onClose])

  const handleSubmitRef = useRef(handleSubmit)
  handleSubmitRef.current = handleSubmit

  const handleExtraKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmitRef.current()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Task"
      maxWidth="md"
      variant="responsive"
      onExtraKeyDown={handleExtraKeyDown}
      footer={
        <div className="flex items-center gap-2 w-full">
          {(!title.trim() || !assignee) && (
            <p id="task-submit-hint" className="text-[11px] mr-auto" style={{ color: 'var(--slate)', opacity: 0.85 }}>
              {!title.trim() && !assignee
                ? 'Title and owner are required.'
                : !title.trim()
                  ? 'Title is required.'
                  : 'Owner is required.'}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            data-testid="task-submit"
            disabled={!title.trim() || !assignee}
            aria-describedby={!title.trim() || !assignee ? 'task-submit-hint' : undefined}
            onClick={() => handleSubmitRef.current()}
          >
            Create Task
          </Button>
        </div>
      }
    >
      {/* Template strip — horizontally scrollable */}
      <div
        className="flex gap-1.5 pb-1.5 overflow-x-auto"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          flexWrap: 'nowrap',
          marginBottom: '12px',
        }}
      >
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
                opacity: 0.85,
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)'; e.currentTarget.style.opacity = '1' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--slate)'; e.currentTarget.style.opacity = '0.7' }}
            >
              <Icon {...ICON_PROPS} size={11} />
              {t.label}
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {/* Title */}
        <div>
          <label
            htmlFor="task-title"
            className="block text-xs font-medium mb-1"
            style={{ color: 'var(--slate)' }}
          >
            Title *
          </label>
          <input
            id="task-title"
            type="text"
            data-testid="task-title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder="e.g., Complete BMI subgroup analysis for AJRCCM revision"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
            style={{
              ...selectStyle,
              borderColor: 'var(--border-subtle)',
            }}
            aria-required="true"
            autoFocus
          />
          {/* Autofill suggestion chips */}
          {visibleSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Sparkles {...ICON_PROPS} size={12} style={{ color: 'var(--teal)', opacity: 0.85, flexShrink: 0 }} />
              {visibleSuggestions.map((s) => (
                <button
                  key={s.field}
                  type="button"
                  onClick={() => acceptSuggestion(s)}
                  className="rounded-full px-2.5 py-0.5 transition-colors"
                  style={{
                    fontSize: 'var(--label-size)',
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
            htmlFor="task-description"
            className="block text-xs font-medium mb-1"
            style={{ color: 'var(--slate)' }}
          >
            Description
          </label>
          <textarea
            id="task-description"
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
              id="task-assignee-label"
              htmlFor="task-assignee"
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              Owner * <span style={{ fontWeight: 400, opacity: 'var(--ink-label)' }}>(responsible)</span>
            </label>
            <div
              id="task-assignee"
              aria-required="true"
              role="group"
              aria-labelledby="task-assignee-label"
            >
              <InlineAssigneePicker
                value={assignee}
                onChange={(slug) => { setAssignee(slug); setAssigneeTouched(true) }}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="task-priority"
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              Priority
            </label>
            <InlineSelect
              value={priority}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
              onChange={setPriority}
              size="md"
              alwaysShowChevron
            />
          </div>
        </div>

        {/* Project + Due Date row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="task-project"
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              Project <span style={{ fontWeight: 400, opacity: 'var(--ink-label)' }}>(optional)</span>
            </label>
            <InlineSelect
              value={projectId}
              options={[{ value: '', label: 'No Project' }, ...projects.map((p) => ({ value: p.slug, label: p.title })
              )]}
              onChange={setProjectId}
              size="md"
              alwaysShowChevron
            />
          </div>
          <div>
            <label
              htmlFor="task-due-date"
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              Due Date
            </label>
            <input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); setDueTouched(true) }}
              className="w-full rounded-md border px-2.5 py-2 text-sm"
              style={selectStyle}
            />
          </div>
        </div>

        <p className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          Tasks can also be created from meetings and project pages
        </p>
      </form>
    </Modal>
  )
}
