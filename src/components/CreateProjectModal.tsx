import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useAllProjectProducts } from '../hooks/useProjectProducts'
import { createCategoryOptions } from '../constants/categories'
import { MANUSCRIPT_LADDER_FALLBACK, ladderFor } from '../lib/products'
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
    /** The first product's kind (the project's home product). */
    kind?: string
    /** A stage on that kind's ladder. */
    stage?: string
    description?: string
    pi?: string
  }) => void
}

// Hub canonical 3-bucket categories (Stage 4 #12-followup, 2026-05-08); the
// 'Peripheral Brain' option is the site admin's only (createCategoryOptions).
// Legacy 4-bucket values (clif/lab/nate-mesfin/mentee) may still exist on
// soft-deleted rows; CategoryIcon keeps fallback arms for those.

// "Ask the kind" (Nick, 2026-10-12): a project is born with its first product,
// so the form asks what that product is (default a manuscript) and offers that
// kind's own ladder. Both lists come from the Worker's kind table (the same
// read the list views use); the form holds no copy of kind data, and the
// Worker seeds the home product from the pair (schema-v129).
const DEFAULT_KIND = 'manuscript'


export default function CreateProjectModal({ open, onClose, prefill, onCreate }: CreateProjectModalProps) {
  const { user } = useAuth()

  const categories = createCategoryOptions(user.canShowAllProjects)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('MNCCORE')
  const [kind, setKind] = useState(DEFAULT_KIND)
  const [stage, setStage] = useState('')
  const [pi, setPi] = useState(user.slug)

  const { data: productData } = useAllProjectProducts()
  const kinds = useMemo(() => productData?.kinds ?? [], [productData])
  const kindOptions = useMemo(
    () => (kinds.length > 0 ? kinds.map((k) => ({ value: k.kind, label: k.label })) : [{ value: DEFAULT_KIND, label: 'Manuscript' }]),
    [kinds],
  )
  const ladder = useMemo(() => {
    const own = ladderFor(kinds, kind)
    return own.length > 0 ? own : kind === DEFAULT_KIND ? [...MANUSCRIPT_LADDER_FALLBACK] : []
  }, [kinds, kind])
  const stageOptions = useMemo(() => ladder.map((s) => ({ value: s.stage, label: s.label })), [ladder])
  // The stage always sits on the chosen kind's ladder: a kind change (or the
  // ladder arriving) resets it to the first rung.
  const effectiveStage = stageOptions.some((o) => o.value === stage) ? stage : (stageOptions[0]?.value ?? '')
  const [description, setDescription] = useState('')

  // S15: seed the form from prefill whenever the modal opens (e.g. promoting
  // an approved idea). Re-runs on open so a second promotion gets fresh values.
  useEffect(() => {
    if (!open) return
    setTitle(prefill?.title ?? '')
    setDescription(prefill?.description ?? '')
    setPi(prefill?.pi ?? user.slug)
    setCategory('MNCCORE')
    setKind(DEFAULT_KIND)
    setStage('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onCreate({
      title: title.trim(),
      category,
      kind,
      stage: effectiveStage || undefined,
      description: description.trim() || undefined,
      pi: pi.trim() || undefined,
    })

    // Reset form
    setTitle('')
    setCategory('MNCCORE')
    setKind(DEFAULT_KIND)
    setStage('')
    setPi(user.slug)
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
              backgroundColor: !title.trim() ? 'var(--border-subtle)' : 'var(--job-accent-solid)',
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

        {/* Category */}
        <Field label="Category" htmlFor="create-project-category" noContainer>
          <InlineSelect value={category} options={categories} onChange={setCategory} />
        </Field>

        {/* The first product: what it is, and where it stands on its ladder */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First product" htmlFor="create-project-kind" hint="What this project makes first" noContainer>
            <InlineSelect value={kind} options={kindOptions} onChange={setKind} />
          </Field>
          <Field label="Stage" htmlFor="create-project-stage" noContainer>
            <InlineSelect value={effectiveStage} options={stageOptions} onChange={setStage} />
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
