import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { emailToSlug } from '../lib/emailSlug'
import InlineSelect from './InlineSelect'
import InlineAssigneePicker from './InlineAssigneePicker'

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (project: {
    title: string
    category?: string
    stage?: string
    description?: string
    pi?: string
  }) => void
}

// Hub canonical categories (R10 + Phase 36b). Legacy values like 'research',
// 'clinical' were pre-R10 drift — removed here so new projects only get
// canonical values.
const CATEGORIES = [
  { value: 'clif', label: 'CLIF', color: 'var(--maroon)' },
  { value: 'lab', label: 'Lab', color: 'var(--teal)' },
  { value: 'nate-mesfin', label: 'Mesfin Lab', color: 'var(--gold)' },
  { value: 'mentee', label: 'Mentee', color: 'var(--slate)' },
]

// 7-stage UI ladder including Revisions (added 2026-04-23, GH #26).
const STAGES = [
  { value: 'Idea', label: 'Idea' },
  { value: 'Data Collection', label: 'Data Collection' },
  { value: 'Analysis', label: 'Analysis' },
  { value: 'Writing', label: 'Writing' },
  { value: 'Review', label: 'Review' },
  { value: 'Revisions', label: 'Revisions' },
  { value: 'Published', label: 'Published' },
]

const selectStyle: React.CSSProperties = {
  fontSize: 'var(--value-size)',
  color: 'var(--ink)',
  backgroundColor: 'var(--cream)',
  borderColor: 'var(--border-subtle)',
}

export default function CreateProjectModal({ open, onClose, onCreate }: CreateProjectModalProps) {
  const { user } = useAuth()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('research')
  const [stage, setStage] = useState('Idea')
  const [pi, setPi] = useState(emailToSlug(user.email))
  const [description, setDescription] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        const form = modalRef.current?.querySelector('form')
        if (form) form.requestSubmit()
        return
      }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onCreate({
      title: title.trim(),
      category,
      stage,
      description: description.trim() || undefined,
      pi: pi.trim() || undefined,
    })

    // Reset form
    setTitle('')
    setCategory('research')
    setStage('Idea')
    setPi(emailToSlug(user.email))
    setDescription('')
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create new project"
        className="rounded-xl shadow-xl border w-full max-w-lg mx-4 card-elevated"
        style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <h3
            className="text-lg"
            style={{ fontWeight: 400, color: 'var(--ink)' }}
          >
            New Project
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 'var(--sp-xs)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          {/* Title */}
          <div>
            <label
              htmlFor="project-title"
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              Title *
            </label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Ventilator Liberation Prediction Model"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
              style={{
                ...selectStyle,
                borderColor: 'var(--border-subtle)',
              }}
              aria-required="true"
              autoFocus
            />
          </div>

          {/* Category + Stage row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="create-project-category"
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--slate)' }}
              >
                Category
              </label>
              <InlineSelect value={category} options={CATEGORIES} onChange={setCategory} />
            </div>
            <div>
              <label
                htmlFor="create-project-stage"
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--slate)' }}
              >
                Stage
              </label>
              <InlineSelect value={stage} options={STAGES} onChange={setStage} />
            </div>
          </div>

          {/* PI */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              PI
            </label>
            <InlineAssigneePicker value={pi} onChange={setPi} />
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              Description <span style={{ fontWeight: 400, opacity: 'var(--ink-label)' }}>(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief project description..."
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 resize-none"
              style={selectStyle}
            />
          </div>

          {/* Submit */}
          {!title.trim() && (
            <p id="project-submit-hint" className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.85 }}>
              Title is required.
            </p>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm transition-colors"
              style={{
                color: 'var(--slate)',
                cursor: 'pointer',
                background: 'none',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              aria-describedby={!title.trim() ? 'project-submit-hint' : undefined}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: !title.trim() ? 'var(--border-subtle)' : 'var(--gold)',
                color: !title.trim() ? 'var(--slate)' : 'var(--ink)',
                cursor: !title.trim() ? 'not-allowed' : 'pointer',
                border: 'none',
                fontWeight: 600,
              }}
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
