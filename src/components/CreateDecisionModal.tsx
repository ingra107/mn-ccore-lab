import { useState, useMemo, useRef, useEffect } from 'react'
import { Scale, X, History, Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSimilarDecisions } from '../hooks/useApiData'
import { useCreateDecision } from '../hooks/useMutations'
import { useToast } from '../hooks/useToast'
import { useDebounce } from '../hooks/useDebounce'
import SentimentBadge from './SentimentBadge'
import { parseTagsString } from '../lib/tagUtils'

// ── Tag auto-suggestion ──────────────────────────────────────

const TAG_KEYWORDS: Record<string, string[]> = {
  statistics: ['regression', 'model', 'p-value', 'analysis', 'coefficient', 'variable', 'sample size', 'power', 'hypothesis', 'bayesian', 'anova', 't-test', 'logistic', 'linear', 'cox', 'survival', 'hazard', 'odds ratio', 'confidence interval'],
  IRB: ['consent', 'irb', 'ethics', 'protocol', 'amendment', 'human subjects', 'hipaa', 'phi', 'de-identified', 'waiver'],
  methodology: ['method', 'approach', 'design', 'framework', 'procedure', 'technique', 'algorithm', 'pipeline', 'workflow', 'protocol'],
  collaboration: ['partner', 'collaborat', 'co-pi', 'consortium', 'multi-site', 'external', 'letter of support', 'subcontract', 'mou'],
  'data-sharing': ['data sharing', 'data use', 'dua', 'repository', 'open data', 'access', 'transfer', 'de-identified'],
  infrastructure: ['server', 'database', 'pipeline', 'deploy', 'system', 'architecture', 'cloud', 'storage', 'backup'],
  hiring: ['hire', 'recruit', 'position', 'candidate', 'postdoc', 'fellow', 'student', 'research assistant', 'coordinator'],
  funding: ['grant', 'budget', 'funding', 'nih', 'nsf', 'r01', 'r21', 'k23', 'award', 'supplement', 'no-cost extension'],
  publication: ['manuscript', 'paper', 'journal', 'submission', 'revision', 'reviewer', 'figure', 'table', 'abstract', 'draft'],
  'study-design': ['rct', 'randomized', 'cohort', 'case-control', 'observational', 'prospective', 'retrospective', 'cross-sectional', 'inclusion', 'exclusion', 'enrollment'],
}

function suggestTags(text: string): string[] {
  if (!text || text.length < 3) return []
  const lower = text.toLowerCase()
  const suggested: string[] = []
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      suggested.push(tag)
    }
  }
  return suggested
}

// ────────────────────────────────────────────────────────────

interface Props {
  projects: { slug: string; title: string }[]
  onCreate: ReturnType<typeof useCreateDecision>
  onClose: () => void
}

export default function CreateDecisionModal({ projects, onCreate, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [context, setContext] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [tags, setTags] = useState('')
  const [linkedProjectSlugs, setLinkedProjectSlugs] = useState<string[]>([])
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const { showSuccess } = useToast()

  // Decision replay -- search for similar past decisions as user types
  const debouncedTitle = useDebounce(title, 500)
  const { data: similarDecisions = [] } = useSimilarDecisions(debouncedTitle)

  // Auto-suggest tags based on decision text
  const fullText = `${title} ${rationale} ${context}`
  const suggestedTags = useMemo(() => suggestTags(fullText), [fullText])
  const currentTags = parseTagsString(tags)
  const newSuggestions = suggestedTags.filter((t) => !currentTags.includes(t))

  // Filtered projects for linking
  const filteredProjects = projectSearchQuery
    ? projects.filter((p) => p.title.toLowerCase().includes(projectSearchQuery.toLowerCase()) || p.slug.toLowerCase().includes(projectSearchQuery.toLowerCase()))
    : projects.slice(0, 8)

  function addTag(tag: string) {
    const existing = parseTagsString(tags)
    if (!existing.includes(tag)) {
      setTags(existing.length > 0 ? `${tags}, ${tag}` : tag)
    }
  }

  function toggleLinkedProject(slug: string) {
    setLinkedProjectSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  function handleSubmit() {
    if (!title.trim()) return
    onCreate.mutate({
      title: title.trim(),
      rationale: rationale.trim() || undefined,
      context: context.trim() || undefined,
      project_slug: projectSlug || undefined,
      tags: tags.trim() || undefined,
      linked_projects: linkedProjectSlugs.length > 0 ? linkedProjectSlugs.join(',') : undefined,
    }, {
      onSuccess: () => showSuccess('Decision logged'),
    })
    onClose()
  }

  const modalRef = useRef<HTMLDivElement>(null)

  // Keep a live ref to handleSubmit so the keydown handler always calls the
  // latest closure (with the current title/rationale/etc. state). The effect
  // is keyed on [onClose] only — without this ref, Ctrl+Enter would invoke
  // the first-render handleSubmit closure where title='' and early-return.
  const handleSubmitRef = useRef(handleSubmit)
  handleSubmitRef.current = handleSubmit

  // Focus trap + Escape
  useEffect(() => {
    if (!modalRef.current) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmitRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = modalRef.current!.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handler)
    modalRef.current.querySelector<HTMLElement>('input')?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const labelStyle = {
    fontSize: '10px',
    color: 'var(--slate)',
    opacity: 0.85,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: '4px',
  }

  const inputStyle = {
    width: '100%',
    fontSize: 'var(--value-size)',
    color: 'var(--ink)',
    background: 'var(--cream)',
    border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--sp-sm) var(--sp-md)',
    outline: 'none',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Record Decision"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
        style={{ backgroundColor: 'var(--cream)', border: '1px solid rgba(201,168,76,0.15)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <Scale size={18} style={{ color: 'var(--gold)' }} />
            <h3 style={{ fontWeight: 500, fontSize: '17px', color: 'var(--ink)', margin: 0 }}>
              Log a Decision
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 'var(--sp-xs)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label htmlFor="decision-title" style={labelStyle}>Decision Title</label>
            <input
              id="decision-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What was decided?"
              style={inputStyle}
              aria-required="true"
              autoFocus
            />
            {similarDecisions.length > 0 && (
              <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--gold-hover)', border: '1px dashed rgba(201,168,76,0.2)' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <History size={12} style={{ color: 'var(--gold)' }} />
                  <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--gold)' }}>
                    Similar past decisions
                  </span>
                </div>
                {similarDecisions.map(d => (
                  <div key={d.id} className="py-2" style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <p style={{ fontSize: 'var(--value-size)', fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
                        {d.title}
                      </p>
                      {d.outcome_sentiment && d.outcome_sentiment !== 'pending' && (
                        <SentimentBadge sentiment={d.outcome_sentiment} />
                      )}
                    </div>
                    {d.outcome && (
                      <p style={{ fontSize: '12px', color: 'var(--teal)', marginTop: 2, marginBottom: 0 }}>
                        Outcome: {d.outcome}
                      </p>
                    )}
                    <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Rationale</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why was this decision made?"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Context</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="What were the alternatives considered?"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div className="flex gap-4">
            <div style={{ flex: 1 }}>
              <label htmlFor="create-decision-project" style={labelStyle}>Primary Project (optional)</label>
              <select
                id="create-decision-project"
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value)}
                style={{ ...inputStyle, padding: '8px 10px' }}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.title}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Tags (comma-separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. statistics, methodology"
                style={inputStyle}
              />
              {/* Tag auto-suggestions */}
              {newSuggestions.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Suggested:
                  </span>
                  {newSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="text-[10px] px-1.5 py-0.5 rounded-full transition-colors"
                      style={{
                        color: 'var(--teal)',
                        backgroundColor: 'var(--teal-hover)',
                        border: '1px dashed rgba(45,138,138,0.2)',
                        cursor: 'pointer',
                      }}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Linked Projects */}
          <div>
            <label style={labelStyle}>Linked Projects (optional)</label>
            <div className="relative">
              <div className="flex items-center gap-1" style={{ ...inputStyle, padding: 'var(--sp-xs) var(--sp-sm)', flexWrap: 'wrap' }}>
                {linkedProjectSlugs.map((slug) => {
                  const projTitle = projects.find((p) => p.slug === slug)?.title || slug
                  return (
                    <span
                      key={slug}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                      style={{ backgroundColor: 'var(--teal-active)', color: 'var(--teal)' }}
                    >
                      {projTitle}
                      <button
                        type="button"
                        onClick={() => toggleLinkedProject(slug)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: '0 2px', fontSize: '10px' }}
                      >
                        x
                      </button>
                    </span>
                  )
                })}
                <input
                  type="text"
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  placeholder={linkedProjectSlugs.length > 0 ? 'Add more...' : 'Search projects...'}
                  style={{
                    flex: 1,
                    minWidth: '120px',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: 'var(--value-size)',
                    color: 'var(--ink)',
                    padding: 'var(--sp-xs)',
                  }}
                />
              </div>
              {projectSearchQuery && filteredProjects.length > 0 && (
                <div
                  className="absolute z-10 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--cream)', border: '1px solid var(--border-subtle)', maxHeight: '150px', overflowY: 'auto' }}
                >
                  {filteredProjects.filter((p) => !linkedProjectSlugs.includes(p.slug)).map((p) => (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => { toggleLinkedProject(p.slug); setProjectSearchQuery('') }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                      style={{
                        color: 'var(--ink)',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <Search size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px', opacity: 0.85 }} />
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          {!title.trim() && (
            <p id="decision-submit-hint" className="text-[11px] mr-auto" style={{ color: 'var(--slate)', opacity: 0.85 }}>
              Decision title is required.
            </p>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--slate)', background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            aria-describedby={!title.trim() ? 'decision-submit-hint' : undefined}
            className="cursor-pointer px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: title.trim() ? 'var(--teal-solid)' : 'var(--ice)',
              color: title.trim() ? 'var(--ink-bright, #fff)' : 'var(--slate)',
              border: 'none',
              opacity: title.trim() ? 1 : 0.85,
            }}
            whileTap={{ scale: 0.95 }}
          >
            Log Decision
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
