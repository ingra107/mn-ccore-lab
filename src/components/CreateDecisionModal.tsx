import { useState, useMemo, useRef } from 'react'
import { Scale, History, Search } from 'lucide-react'
import { useSimilarDecisions } from '../hooks/useApiData'
import { useCreateDecision } from '../hooks/useMutations'
import { useToast } from '../hooks/useToast'
import { useDebounce } from '../hooks/useDebounce'
import SentimentBadge from './SentimentBadge'
import InlineSelect from './InlineSelect'
import { Button } from './ui/Button'
import Modal from './ui/Modal'
import { parseTagsString } from '../lib/tagUtils'
import { parseDbUtc } from '../lib/time'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

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
  open?: boolean
}

export default function CreateDecisionModal({ projects, onCreate, onClose, open = true }: Props) {
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

  // Keep a live ref to handleSubmit so the onExtraKeyDown handler always calls
  // the latest closure (with the current title/rationale/etc. state).
  const handleSubmitRef = useRef(handleSubmit)
  handleSubmitRef.current = handleSubmit

  const handleExtraKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmitRef.current()
    }
  }

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
    border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--sp-sm) var(--sp-md)',
    outline: 'none',
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log a Decision"
      maxWidth="md"
      variant="modal"
      animated
      icon={<Scale {...ICON_PROPS} size={18} style={{ color: 'var(--gold)' }} />}
      onExtraKeyDown={handleExtraKeyDown}
      footer={
        <>
          {!title.trim() && (
            <p id="decision-submit-hint" style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85, marginRight: 'auto' }}>
              Decision title is required.
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!title.trim()}
            aria-describedby={!title.trim() ? 'decision-submit-hint' : undefined}
          >
            Log Decision
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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
            <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--gold-hover)', border: `1px dashed ${withAlpha(ACCENT_GOLD, 20)}` }}>
              <div className="flex items-center gap-1.5 mb-2">
                <History {...ICON_PROPS} size={12} style={{ color: 'var(--gold)' }} />
                <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--gold)' }}>
                  Similar past decisions
                </span>
              </div>
              {similarDecisions.map(d => (
                <div key={d.id} className="py-2" style={{ borderBottom: `1px solid ${withAlpha(ACCENT_GOLD, 6)}` }}>
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
                    {parseDbUtc(d.created_at).toLocaleDateString()}
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
            <label style={labelStyle}>Primary Project (optional)</label>
            <InlineSelect
              value={projectSlug}
              options={[{ value: '', label: 'No project' }, ...projects.map(p => ({ value: p.slug, label: p.title }))]}
              onChange={setProjectSlug}
            />
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
                    <Search {...ICON_PROPS} size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px', opacity: 0.85 }} />
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
