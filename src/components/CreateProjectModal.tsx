import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

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

const CATEGORIES = [
  { value: 'research', label: 'Research' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'quality-improvement', label: 'Quality Improvement' },
  { value: 'education', label: 'Education' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'clif', label: 'CLIF' },
  { value: 'lab', label: 'Lab' },
  { value: 'nate', label: 'Mesfin Lab' },
  { value: 'mentee', label: 'Mentee' },
]

const STAGES = [
  { value: 'Idea', label: 'Idea' },
  { value: 'Data Collection', label: 'Data Collection' },
  { value: 'Analysis', label: 'Analysis' },
  { value: 'Writing', label: 'Writing' },
  { value: 'Review', label: 'Review' },
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
  const [pi, setPi] = useState(user.email?.split('@')[0] || '')
  const [description, setDescription] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap
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
    setPi(user.email?.split('@')[0] || '')
    setDescription('')
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
              style={{ color: 'var(--slate)' }}
            >
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Ventilator Liberation Prediction Model"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
              style={{
                ...selectStyle,
                borderColor: 'var(--border-subtle)',
              }}
              autoFocus
            />
          </div>

          {/* Category + Stage row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--slate)' }}
              >
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border px-2.5 py-2 text-sm"
                style={selectStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--slate)' }}
              >
                Stage
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full rounded-md border px-2.5 py-2 text-sm"
                style={selectStyle}
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* PI */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--slate)' }}
            >
              PI <span style={{ fontWeight: 400, opacity: 'var(--ink-label)' }}>(slug, e.g. nick)</span>
            </label>
            <input
              type="text"
              value={pi}
              onChange={(e) => setPi(e.target.value)}
              placeholder="nick"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
              style={{
                ...selectStyle,
                borderColor: 'var(--border-subtle)',
              }}
            />
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
