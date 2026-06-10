import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { emailToSlug } from '../lib/emailSlug'
import InlineSelect from './InlineSelect'
import InlineAssigneePicker from './InlineAssigneePicker'
import Field from './ui/Field'
import Modal from './ui/Modal'

/** S15: optional prefill (e.g. promoting an Idea into a project). */
export interface CreateProjectPrefill {
  title?: string
  description?: string
  pi?: string
}

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  prefill?: CreateProjectPrefill
  onCreate: (project: {
    title: string
    category?: string
    stage?: string
    description?: string
    pi?: string
  }) => void
}

// Hub canonical 3-bucket categories (Stage 4 #12-followup, 2026-05-08).
// 'Peripheral Brain' option is gated to Nick only — checked at render time.
// Legacy 4-bucket values (clif/lab/nate-mesfin/mentee) may still exist on
// soft-deleted rows; CategoryIcon keeps fallback arms for those.
const CATEGORIES_BASE = [
  { value: 'MNCCORE', label: 'MN-CCORE', color: 'var(--teal)' },
  { value: 'CLIF', label: 'CLIF', color: 'var(--maroon)' },
]
const CATEGORY_PERIPHERAL_BRAIN = { value: 'Peripheral Brain', label: 'Peripheral Brain', color: 'var(--slate)' }

// Email-based Nick check — mirrors isNick() in api/routes/projects.ts.
function checkIsNick(email: string): boolean {
  return email === 'ingra107@umn.edu' || email === 'nicholas.ingraham@gmail.com'
}

// 7-stage UI ladder including Revisions (added 2026-04-23, GH #26).
// Values are D1 lowercase canonical; labels are Title Case for display.
const STAGES = [
  { value: 'idea', label: 'Idea' },
  { value: 'data_collection', label: 'Data Collection' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'writing', label: 'Writing' },
  { value: 'review', label: 'Review' },
  { value: 'revisions', label: 'Revisions' },
  { value: 'published', label: 'Published' },
]


export default function CreateProjectModal({ open, onClose, prefill, onCreate }: CreateProjectModalProps) {
  const { user } = useAuth()

  const isNick = checkIsNick(user.email)
  const categories = isNick ? [...CATEGORIES_BASE, CATEGORY_PERIPHERAL_BRAIN] : CATEGORIES_BASE

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('MNCCORE')
  const [stage, setStage] = useState('idea')
  const [pi, setPi] = useState(emailToSlug(user.email))
  const [description, setDescription] = useState('')

  // S15: seed the form from prefill whenever the modal opens (e.g. promoting
  // an approved idea). Re-runs on open so a second promotion gets fresh values.
  useEffect(() => {
    if (!open) return
    setTitle(prefill?.title ?? '')
    setDescription(prefill?.description ?? '')
    setPi(prefill?.pi ?? emailToSlug(user.email))
    setCategory('MNCCORE')
    setStage('idea')
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCategory('MNCCORE')
    setStage('idea')
    setPi(emailToSlug(user.email))
    setDescription('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Project"
      maxWidth="lg"
      footer={
        <>
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
            form="create-project-form"
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
        </>
      }
    >
      <form
        id="create-project-form"
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.requestSubmit()
          }
        }}
        className="flex flex-col gap-3.5"
      >
        {/* Title */}
        <Field label="Title" required htmlFor="project-title">
          <input
            id="project-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Ventilator Liberation Prediction Model"
            className="w-full outline-none focus:ring-0"
            style={{
              fontSize: 'var(--text-small)',
              color: 'var(--ink)',
              background: 'transparent',
              border: 'none',
            }}
            aria-required="true"
            autoFocus
          />
        </Field>

        {/* Category + Stage row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="create-project-category" noContainer>
            <InlineSelect value={category} options={categories} onChange={setCategory} />
          </Field>
          <Field label="Stage" htmlFor="create-project-stage" noContainer>
            <InlineSelect value={stage} options={STAGES} onChange={setStage} />
          </Field>
        </div>

        {/* PI */}
        <Field label="PI" noContainer>
          <InlineAssigneePicker value={pi} onChange={setPi} />
        </Field>

        {/* Description */}
        <Field label="Description" hint="Optional — brief project description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief project description..."
            rows={3}
            className="w-full outline-none resize-none"
            style={{
              fontSize: 'var(--text-small)',
              color: 'var(--ink)',
              background: 'transparent',
              border: 'none',
            }}
          />
        </Field>

        {/* Submit hint */}
        {!title.trim() && (
          <p id="project-submit-hint" className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.85 }}>
            Title is required.
          </p>
        )}
      </form>
    </Modal>
  )
}
