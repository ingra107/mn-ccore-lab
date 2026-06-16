import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useOpenParam } from '../../hooks/useOpenParam'
import {
  Scale,
  Plus,
  AlertTriangle,
  FolderKanban,
  Tag,
  List,
  GitCommitVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { useDecisions, useDecisionsForReview, useDecisionTags } from '../../hooks/useApiData'
import { isProductionVisible } from '../../lib/isProductionVisible'
import { useCreateDecision, useUpdateDecisionOutcome } from '../../hooks/useMutations'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { useUndoToast } from '../../components/UndoToast'
import { useProjects } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, formatRelativeTime } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import { parseTagsString } from '../../lib/tagUtils'
import { SENTIMENT_CONFIG } from '../../components/SentimentBadge'
import { PATHS } from '../../constants/paths'
import SentimentBadge from '../../components/SentimentBadge'
import SimilarDecisionsPanel from '../../components/SimilarDecisionsPanel'
import CreateDecisionModal from '../../components/CreateDecisionModal'
import { ColumnHeader, TableContainer } from '../../components/table'
import type { DecisionRow } from '../../hooks/useApiData'
import { ICON_PROPS } from '../../lib/iconProps'

// ── Constants ────────────────────────────────────────────────

// P2-11: Outcome moved to right-most data column. In a decision log,
// outcome IS the answer — it shouldn't be buried in the middle.
const GRID_TEMPLATE =
  'minmax(200px, 3fr) 160px 120px 140px 100px 140px 80px'

const OUTCOME_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'var(--gold)' },
  { value: 'recorded', label: 'Recorded', color: 'var(--teal)' },
  { value: 'revisited', label: 'Revisited', color: 'var(--slate)' },
]

type DecisionSortKey =
  | 'title'
  | 'outcome_status'
  | 'decided_by'
  | 'project'
  | 'created_at'

// ── Decision Timeline ────────────────────────────────────────

function DecisionTimeline({
  decisions,
  projects,
}: {
  decisions: DecisionRow[]
  projects: { slug: string; title: string }[]
}) {
  // P3-09: group decisions by month-year so the timeline reads as a
  // narrative arc, not a flat dump of dots.
  const grouped = (() => {
    const sorted = [...decisions].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const buckets = new Map<string, DecisionRow[]>()
    for (const d of sorted) {
      const dt = parseDbUtc(d.created_at)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      const list = buckets.get(key) ?? []
      list.push(d)
      buckets.set(key, list)
    }
    const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
    return [...buckets.entries()].map(([key, items]) => {
      const [year, month] = key.split('-').map(Number)
      return { key, label: monthFmt.format(new Date(year, month - 1, 1)), items }
    })
  })()

  return (
    <div className="relative pl-8" style={{ paddingTop: '4px' }}>
      <div
        className="absolute left-3 top-0 bottom-0"
        style={{ width: '2px', backgroundColor: 'var(--gold-hover)' }}
      />
      {grouped.map((group) => (
        <div key={group.key}>
          <div
            className="relative mb-3"
            style={{
              fontSize: 'var(--text-label)',
              fontWeight: 'var(--weight-ui)',
              color: 'var(--slate)',
              opacity: 'var(--ink-label)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: '12px',
            }}
          >
            <span
              className="absolute"
              style={{
                left: '-29px',
                top: '4px',
                width: '18px',
                height: '4px',
                background: 'var(--slate)',
                opacity: 0.4,
                borderRadius: 'var(--radius-sm)',
              }}
            />
            {group.label} · {group.items.length}
          </div>
      {group.items.map((decision) => {
        const sentiment = decision.outcome_sentiment || 'pending'
        const config = SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.pending
        const tags = parseTagsString(decision.tags)
        const projTitle = decision.project_slug
          ? projects.find((p) => p.slug === decision.project_slug)?.title
          : null
        return (
          <div key={decision.id} className="relative mb-6">
            <div
              className="absolute rounded-full"
              style={{
                left: '-25px',
                top: '6px',
                width: '10px',
                height: '10px',
                backgroundColor: config.color,
                border: '2px solid var(--cream)',
                boxShadow: `0 0 0 2px ${config.bg}`,
              }}
            />
            <div
              className="absolute text-right"
              style={{
                left: '-110px',
                top: '2px',
                width: '75px',
                fontSize: 'var(--text-micro)',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
              }}
            >
              {formatShortDate(decision.created_at)}
            </div>
            <div
              className="p-3"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  style={{
                    fontWeight: 'var(--weight-heading)',
                    fontSize: 'var(--text-base)',
                    color: 'var(--ink)',
                  }}
                >
                  {decision.title}
                </span>
                <SentimentBadge sentiment={sentiment} />
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5"
                    style={{
                      fontSize: 'var(--text-micro)',
                      fontWeight: 400,
                      color: 'var(--teal)',
                      backgroundColor: 'var(--teal-hover)',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {decision.outcome && (
                <p
                  style={{
                    fontSize: 'var(--text-small)',
                    color: 'var(--teal)',
                    marginTop: '4px',
                    marginBottom: 0,
                  }}
                >
                  Outcome: {decision.outcome}
                </p>
              )}
              {projTitle && (
                <Link
                  to={PATHS.project(decision.project_slug!)}
                  className="flex items-center gap-1 mt-1"
                  style={{
                    fontSize: 'var(--text-label)',
                    color: 'var(--teal)',
                    textDecoration: 'none',
                    opacity: 0.85,
                  }}
                >
                  <FolderKanban {...ICON_PROPS} size={10} />
                  {projTitle}
                </Link>
              )}
            </div>
          </div>
        )
      })}
        </div>
      ))}
    </div>
  )
}

// ── Review Card ──────────────────────────────────────────────

function ReviewCard({
  decision,
  projects,
  updateOutcome,
}: {
  decision: DecisionRow
  projects: { slug: string; title: string }[]
  updateOutcome: ReturnType<typeof useUpdateDecisionOutcome>
}) {
  const [outcome, setOutcome] = useState('')
  const [sentiment, setSentiment] = useState('neutral')
  // S21: the outcome form is collapsed by default — a one-line "Record outcome →"
  // prompt that expands on click. Eight always-expanded textareas stacked before
  // any content was a chore-wall; logging the decisions first is the priority.
  const [formOpen, setFormOpen] = useState(false)
  const person = decision.decided_by ? getPersonInfo(decision.decided_by) : null
  const projectTitle = decision.project_slug
    ? projects.find((p) => p.slug === decision.project_slug)?.title
    : null
  const days = Math.floor(
    (new Date().getTime() - parseDbUtc(decision.created_at).getTime()) /
      (1000 * 60 * 60 * 24)
  )

  function handleSave() {
    if (!outcome.trim()) return
    updateOutcome.mutate({
      id: decision.id,
      outcome: outcome.trim(),
      outcome_status: 'recorded',
      outcome_sentiment: sentiment,
    })
    setOutcome('')
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}
    >
      <div className="p-4" style={{ background: 'var(--surface-1)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Scale {...ICON_PROPS} size={14} style={{ color: 'var(--gold)' }} />
          <span
            style={{
              fontWeight: 'var(--weight-heading)',
              fontSize: 'var(--text-md)',
              color: 'var(--ink)',
            }}
          >
            {decision.title}
          </span>
        </div>
        {decision.rationale && (
          <p
            style={{
              fontSize: 'var(--text-small)',
              color: 'var(--slate)',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {decision.rationale}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {person && (
            <span className="flex items-center gap-1.5">
              <Avatar
                name={person.name}
                initials={person.initials}
                photoUrl={person.photoUrl}
                size="xs"
                variant="gold"
              />
              <span style={{ fontSize: 'var(--text-label)', color: 'var(--slate)' }}>
                {person.name.split(' ')[0]}
              </span>
            </span>
          )}
          {projectTitle && (
            <Link
              to={PATHS.project(decision.project_slug!)}
              className="flex items-center gap-1"
              style={{
                fontSize: 'var(--text-label)',
                color: 'var(--teal)',
                textDecoration: 'none',
              }}
            >
              <FolderKanban {...ICON_PROPS} size={11} />
              {projectTitle}
            </Link>
          )}
        </div>
      </div>
      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full p-3 flex items-center gap-2 cursor-pointer"
          style={{
            background: 'var(--gold-hover)',
            borderTop: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--gold)',
            color: 'var(--ink)',
            fontSize: 'var(--text-small)',
            fontWeight: 500,
            textAlign: 'left',
          }}
        >
          <Scale {...ICON_PROPS} size={13} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            Made {days} days ago · Record outcome
          </span>
          <span aria-hidden="true" style={{ color: 'var(--gold)' }}>→</span>
        </button>
      ) : (
      <div
        className="p-4"
        style={{
          background: 'var(--gold-hover)',
          borderTop: '1px solid var(--border-subtle)',
          borderLeft: '3px solid var(--gold)',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-small)',
            color: 'var(--ink)',
            marginBottom: '10px',
            fontWeight: 500,
          }}
        >
          This decision was made {days} days ago. What was the outcome?
        </p>
        <textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Describe the outcome..."
          rows={3}
          style={{
            width: '100%',
            fontSize: 'var(--text-small)',
            color: 'var(--ink)',
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--sp-sm) var(--sp-md)',
            outline: 'none',
            resize: 'vertical',
            marginBottom: '8px',
          }}
        />
        <div className="flex items-center gap-3">
          <InlineSelect
            value={sentiment}
            options={[
              { value: 'positive', label: 'Positive outcome' },
              { value: 'neutral', label: 'Neutral outcome' },
              { value: 'negative', label: 'Negative outcome' },
            ]}
            onChange={setSentiment}
            alwaysShowChevron
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!outcome.trim()}
            className="cursor-pointer px-4 py-1.5"
            style={{
              background: outcome.trim() ? 'var(--gold)' : 'var(--gold-hover)',
              color: outcome.trim() ? 'var(--ink)' : 'var(--slate)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-small)',
              fontWeight: 500,
              opacity: outcome.trim() ? 1 : 0.85,
            }}
          >
            Save Outcome
          </button>
        </div>
      </div>
      )}
    </div>
  )
}

// ── Decision Row (columnar) ──────────────────────────────────

function DecisionRowItem({
  decision,
  projects,
  projectMap,
  isExpanded,
  onToggleExpand,
  onStatusChange,
  focused,
}: {
  decision: DecisionRow
  projects: { slug: string; title: string }[]
  projectMap: Map<string, string>
  isExpanded: boolean
  onToggleExpand: () => void
  onStatusChange: (decision: DecisionRow, newStatus: string) => void
  focused: boolean
}) {
  const person = decision.decided_by ? getPersonInfo(decision.decided_by) : null
  const projectTitle = decision.project_slug
    ? projectMap.get(decision.project_slug) || null
    : null
  const tags = parseTagsString(decision.tags)
  const visibleTags = tags.slice(0, 2)
  const extraTags = tags.length - visibleTags.length

  return (
    <div
      // S1: anchor for deep-link scroll-to (?open=<id>).
      id={`decision-${decision.id}`}
      style={{
        borderBottom: '1px solid var(--row-separator, var(--border-subtle))',
        background: focused ? 'var(--hover-subtle)' : 'transparent',
        scrollMarginTop: '96px',
      }}
    >
      <div
        className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        style={{
          display: 'grid',
          gridTemplateColumns: GRID_TEMPLATE,
          padding: `var(--row-padding-y, 8px) var(--sp-lg)`,
          alignItems: 'center',
          minHeight: 'var(--row-height, 44px)',
          boxSizing: 'border-box' as const,
          gap: 'var(--sp-sm)',
        }}
      >
        <div
         
          onClick={onToggleExpand}
          className="task-title-clickable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            minWidth: 0,
            borderRadius: 'var(--radius-sm)',
            padding: '2px 4px',
            margin: '-2px -4px',
            transition: 'background var(--transition-fast) ease',
          }}
          title={decision.rationale || decision.title}
        >
          <span
            style={{
              color: 'var(--slate)',
              opacity: 'var(--ink-label)',
              flexShrink: 0,
              display: 'inline-flex',
            }}
          >
            {isExpanded ? <ChevronDown {...ICON_PROPS} size={12} /> : <ChevronRight {...ICON_PROPS} size={12} />}
          </span>
          <span
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-heading)',
              color: 'var(--ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {decision.title}
          </span>
          {decision.outcome_sentiment &&
            decision.outcome_sentiment !== 'pending' && (
              <span style={{ flexShrink: 0 }}>
                <SentimentBadge sentiment={decision.outcome_sentiment} />
              </span>
            )}
        </div>
        <div

          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexWrap: 'nowrap',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {visibleTags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 'var(--text-micro)',
                fontWeight: 400,
                color: 'var(--slate)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '1px 6px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 70,
              }}
            >
              {tag}
            </span>
          ))}
          {extraTags > 0 && (
            <span
              style={{
                fontSize: 'var(--text-micro)',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
              }}
            >
              +{extraTags}
            </span>
          )}
        </div>
        <div
         
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: 0,
          }}
        >
          {person ? (
            <>
              <Avatar
                name={person.name}
                initials={person.initials}
                photoUrl={person.photoUrl}
                size="xs"
                variant="gold"
              />
              <span
                style={{
                  fontSize: 'var(--text-small)',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {person.name.split(' ')[0]}
              </span>
            </>
          ) : (
            <span
              style={{
                fontSize: 'var(--text-small)',
                color: 'var(--slate)',
                opacity: 'var(--ink-hint)',
              }}
            >
              —
            </span>
          )}
        </div>
        <div
         
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {projectTitle ? (
            <Link
              to={PATHS.project(decision.project_slug!)}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 hover:underline"
              style={{
                fontSize: 'var(--text-small)',
                // Drop --ink-label (0.55): teal at 0.55 on white = 2.1:1
                // FAIL. Full opacity teal = 5.8:1 AA pass.
                color: 'var(--teal)',
                textDecoration: 'none',
              }}
            >
              <FolderKanban {...ICON_PROPS} size={11} style={{ flexShrink: 0 }} />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {projectTitle}
              </span>
            </Link>
          ) : (
            <span
              style={{
                fontSize: 'var(--text-small)',
                color: 'var(--slate)',
                opacity: 'var(--ink-hint)',
              }}
            >
              —
            </span>
          )}
        </div>
        <div
         
          style={{
            fontSize: 'var(--text-small)',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {formatRelativeTime(decision.created_at)}
        </div>
        {/* Outcome — right-most pill (P2-11). Chevron always visible: this
            is the high-signal cell and the dropdown affordance is the action. */}
        <div onClick={(e) => e.stopPropagation()}>
          <InlineSelect
            value={decision.outcome_status || 'pending'}
            options={OUTCOME_OPTIONS}
            onChange={(val) => onStatusChange(decision, val)}
            alwaysShowChevron
          />
        </div>
        <div />
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding:
                  'var(--sp-md) var(--sp-lg) var(--sp-lg) calc(var(--sp-lg) + 20px)',
                background: 'var(--surface-1)',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              {decision.rationale && (
                <p
                  style={{
                    fontSize: 'var(--text-small)',
                    color: 'var(--slate)',
                    lineHeight: 1.5,
                    marginTop: 0,
                    marginBottom: 'var(--sp-sm)',
                  }}
                >
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                    Rationale:{' '}
                  </span>
                  {decision.rationale}
                </p>
              )}
              {decision.context && (
                <p
                  style={{
                    fontSize: 'var(--text-small)',
                    color: 'var(--slate)',
                    lineHeight: 1.5,
                    marginTop: 0,
                    marginBottom: 'var(--sp-sm)',
                  }}
                >
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                    Context:{' '}
                  </span>
                  {decision.context}
                </p>
              )}
              {decision.outcome && (
                <div
                  className="px-3 py-2"
                  style={{
                    background: 'var(--teal-hover)',
                    borderLeft: '3px solid var(--teal)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--sp-sm)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 'var(--text-small)',
                      color: 'var(--ink)',
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>Outcome:</span>{' '}
                    {decision.outcome}
                  </p>
                </div>
              )}
              {tags.length > 2 && (
                <div
                  className="flex items-center gap-1.5 flex-wrap"
                  style={{ marginBottom: 'var(--sp-sm)' }}
                >
                  <Tag {...ICON_PROPS}
                    size={11}
                    style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
                  />
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 'var(--text-micro)',
                        color: 'var(--slate)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1px 6px',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <SimilarDecisionsPanel decisionId={decision.id} projects={projects} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────

export default function DecisionsPage() {
  const [filterTag, setFilterTag] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<DecisionSortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  const { data: rawAllDecisions = [], isLoading } = useDecisions(
    undefined,
    filterTag || undefined
  )
  // Strip QA fixtures (test decision, test_delete_, etc) before any rendering.
  const allDecisions = useMemo(
    () => rawAllDecisions.filter(d => isProductionVisible(d.title)),
    [rawAllDecisions]
  )
  const { data: reviewDecisions = [] } = useDecisionsForReview()
  const { data: projects = [] } = useProjects()
  const { data: tagCounts = [] } = useDecisionTags()
  const createDecision = useCreateDecision()
  const updateOutcome = useUpdateDecisionOutcome()
  const { showUndo } = useUndoToast()

  const projectMap = useMemo(() => {
    const map = new Map<string, string>()
    projects.forEach((p) => map.set(p.slug, p.title))
    return map
  }, [projects])

  const handleStatusChange = (decision: DecisionRow, newStatus: string) => {
    const prevStatus = decision.outcome_status || 'pending'
    if (prevStatus === newStatus) return
    const statusLabels: Record<string, string> = {
      pending: 'Pending',
      recorded: 'Recorded',
      revisited: 'Revisited',
    }
    updateOutcome.mutate({
      id: decision.id,
      outcome: decision.outcome || '',
      outcome_status: newStatus,
    })
    showUndo(`Status → ${statusLabels[newStatus] || newStatus}`, () =>
      updateOutcome.mutate({
        id: decision.id,
        outcome: decision.outcome || '',
        outcome_status: prevStatus,
      })
    )
  }

  const handleSort = (key: string) => {
    const k = key as DecisionSortKey
    if (sortKey === k) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(k)
      setSortAsc(
        k === 'title' || k === 'decided_by' || k === 'project' ? true : false
      )
    }
  }

  const filteredDecisions = useMemo(() => {
    const base = allDecisions.filter((d) => {
      if (filterStatus && d.outcome_status !== filterStatus) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const text = `${d.title} ${d.rationale || ''} ${d.outcome || ''} ${
          d.tags || ''
        } ${d.context || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })

    const sorted = [...base].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'title':
          av = a.title.toLowerCase()
          bv = b.title.toLowerCase()
          break
        case 'outcome_status':
          av = a.outcome_status || 'pending'
          bv = b.outcome_status || 'pending'
          break
        case 'decided_by':
          av = (a.decided_by || '').toLowerCase()
          bv = (b.decided_by || '').toLowerCase()
          break
        case 'project':
          av = (
            a.project_slug ? projectMap.get(a.project_slug) || '' : ''
          ).toLowerCase()
          bv = (
            b.project_slug ? projectMap.get(b.project_slug) || '' : ''
          ).toLowerCase()
          break
        case 'created_at':
        default:
          av = new Date(a.created_at).getTime()
          bv = new Date(b.created_at).getTime()
          break
      }
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })

    return sorted
  }, [allDecisions, filterStatus, searchQuery, sortKey, sortAsc, projectMap])

  const pendingCount = allDecisions.filter(
    (d) => d.outcome_status === 'pending'
  ).length
  const recordedCount = allDecisions.filter(
    (d) => d.outcome_status !== 'pending'
  ).length

  // S1: consume `?open=<decisionId>` deep-links (search emits
  // /portal/decisions?open=<id>). Force list view (rows only render there),
  // expand the target, and scroll it into view once decisions have loaded.
  useOpenParam(
    'open',
    (id) => {
      setViewMode('list')
      setExpandedId(id)
      requestAnimationFrame(() => {
        const el = document.getElementById(`decision-${id}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    { ready: !isLoading },
  )

  // Consume `?create=true` deep-links (⌘K "Log Decision") — open the create
  // modal then strip the param. Consumer half of the create=true class.
  useOpenParam('create', () => setShowCreate(true))

  useListKeyboardNav({
    itemCount: viewMode === 'list' ? filteredDecisions.length : 0,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !showCreate) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setShowCreate(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCreate])

  useEffect(() => {
    document.title =
      pendingCount > 0
        ? `Decisions (${pendingCount} pending) | MN-CCORE`
        : 'Decisions | MN-CCORE'
    return () => {
      document.title = 'MN-CCORE Lab Hub'
    }
  }, [pendingCount])

  return (
    <div className="content-container">
      <PageHeader
        icon={<Scale {...ICON_PROPS} size={20} />}
        title="Decision Log"
        subtitle={`${pendingCount} pending review, ${recordedCount} with outcomes`}
        count={allDecisions.length}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div
              className="flex items-center overflow-hidden"
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <button
                onClick={() => setViewMode('list')}
                className="px-3 py-1.5"
                style={{
                  fontSize: 'var(--text-small)',
                  fontWeight: 500,
                  color: viewMode === 'list' ? 'var(--teal)' : 'var(--slate)',
                  backgroundColor:
                    viewMode === 'list' ? 'var(--teal-active)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <List {...ICON_PROPS}
                  size={14}
                  style={{
                    display: 'inline',
                    verticalAlign: '-2px',
                    marginRight: '4px',
                  }}
                />
                List
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className="px-3 py-1.5"
                style={{
                  fontSize: 'var(--text-small)',
                  fontWeight: 500,
                  color: viewMode === 'timeline' ? 'var(--teal)' : 'var(--slate)',
                  backgroundColor:
                    viewMode === 'timeline' ? 'var(--teal-active)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <GitCommitVertical {...ICON_PROPS}
                  size={14}
                  style={{
                    display: 'inline',
                    verticalAlign: '-2px',
                    marginRight: '4px',
                  }}
                />
                Timeline
              </button>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2"
              style={{
                backgroundColor: 'var(--teal-solid)',
                color: 'var(--ink-bright, #fff)',
                border: 'none',
                borderRadius: 'var(--radius-lg)',
                fontSize: 'var(--text-small)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Plus {...ICON_PROPS} size={16} />
              Log Decision
            </button>
          </div>
        }
      >
        {/* Filter bar: stable minHeight prevents reflow as tagCounts load */}
        <div className="flex items-center gap-3 flex-wrap" style={{ minHeight: '36px' }}>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: '', label: 'All' },
              { key: 'pending', label: 'Pending' },
              { key: 'recorded', label: 'Recorded' },
              { key: 'revisited', label: 'Revisited' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className="px-3 py-1.5"
                style={{
                  fontSize: 'var(--text-small)',
                  fontWeight: 500,
                  color: filterStatus === f.key ? 'var(--teal)' : 'var(--slate)',
                  backgroundColor:
                    filterStatus === f.key ? 'var(--teal-active)' : 'transparent',
                  border: `1px solid ${
                    filterStatus === f.key
                      ? 'var(--teal-emphasis)'
                      : 'var(--border-subtle)'
                  }`,
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decisions..."
            className="px-3 py-1.5 outline-none"
            style={{
              fontSize: 'var(--text-small)',
              color: 'var(--ink)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-1)',
              minWidth: 220,
              flex: '0 1 260px',
            }}
          />
        </div>
        {tagCounts.length > 0 && allDecisions.length >= 15 && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <Tag {...ICON_PROPS}
              size={12}
              style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
            />
            {filterTag && (
              <button
                onClick={() => setFilterTag('')}
                className="px-2 py-0.5"
                style={{
                  fontSize: 'var(--text-micro)',
                  fontWeight: 500,
                  color: 'var(--maroon)',
                  backgroundColor: 'var(--maroon-hover)',
                  border: '1px solid var(--maroon-emphasis)',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                }}
              >
                Clear filter
              </button>
            )}
            {tagCounts.slice(0, 12).map((tc) => (
              <button
                key={tc.tag}
                onClick={() => setFilterTag(filterTag === tc.tag ? '' : tc.tag)}
                className="px-2 py-0.5"
                style={{
                  fontSize: 'var(--text-micro)',
                  fontWeight: 500,
                  color:
                    filterTag === tc.tag ? 'var(--ink-bright, #fff)' : 'var(--teal)',
                  backgroundColor:
                    filterTag === tc.tag ? 'var(--teal-solid)' : 'var(--teal-hover)',
                  border: `1px solid ${
                    filterTag === tc.tag ? 'var(--teal)' : 'var(--teal-emphasis)'
                  }`,
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                }}
              >
                {tc.tag} ({tc.count})
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {reviewDecisions.length > 0 && !filterStatus && !filterTag && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle {...ICON_PROPS} size={16} style={{ color: 'var(--gold)' }} />
            <h2
              style={{
                fontWeight: 500,
                fontSize: 'var(--text-md)',
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              Record outcome?
            </h2>
            <span
              className="px-2 py-0.5"
              style={{
                fontSize: 'var(--text-small)',
                backgroundColor: 'var(--gold-emphasis)',
                color: 'var(--gold)',
                borderRadius: 'var(--radius-full)',
              }}
            >
              {reviewDecisions.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {reviewDecisions.map((decision) => (
              <ReviewCard
                key={decision.id}
                decision={decision}
                projects={projects}
                updateOutcome={updateOutcome}
              />
            ))}
          </div>
        </div>
      )}

      {/* minHeight on outer table section prevents CLS when loading→data transition */}
      <div className="mt-8" style={{ minHeight: '400px' }}>
        <h2
          style={{
            fontWeight: 500,
            fontSize: 'var(--text-md)',
            color: 'var(--ink)',
            marginBottom: 'var(--sp-md)',
          }}
        >
          {filterTag
            ? `Tagged: ${filterTag}`
            : filterStatus
            ? `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} Decisions`
            : 'All Decisions'}
        </h2>

        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filteredDecisions.length === 0 ? (
          <EmptyState
            icon={<Scale size={40} />}
            title="No decisions logged yet"
            subtitle="The best ones come from messy arguments — record yours with N so nobody has to remember who said what, or when."
            action={{ label: 'Log Decision', onClick: () => setShowCreate(true) }}
          />
        ) : viewMode === 'timeline' ? (
          <DecisionTimeline decisions={filteredDecisions} projects={projects} />
        ) : (
          <TableContainer ariaLabel="Decisions">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: GRID_TEMPLATE,
                padding: 'var(--sp-sm) var(--sp-lg)',
                borderBottom: '1px solid var(--border-subtle)',
                gap: 'var(--sp-sm)',
              }}
            >
              {(
                [
                  { label: 'Title', key: 'title', align: 'left' },
                  { label: 'Tags', key: 'title', align: 'left', noSort: true },
                  { label: 'Decided By', key: 'decided_by', align: 'left' },
                  { label: 'Project', key: 'project', align: 'left' },
                  { label: 'Date', key: 'created_at', align: 'right' },
                  { label: 'Outcome', key: 'outcome_status', align: 'left' },
                ] as Array<{
                  label: string
                  key: DecisionSortKey
                  align: 'left' | 'right'
                  noSort?: boolean
                }>
              ).map((col, i) =>
                col.noSort ? (
                  <div
                    key={`${col.label}-${i}`}
                    className="col-header"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                  </div>
                ) : (
                  <div key={`${col.label}-${i}`}>
                    <ColumnHeader
                      label={col.label}
                      sortKey={col.key}
                      currentSort={sortKey}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align={col.align}
                    />
                  </div>
                )
              )}
              <div />
            </div>

            <div>
              {filteredDecisions.map((decision, i) => (
                <DecisionRowItem
                  key={decision.id}
                  decision={decision}
                  projects={projects}
                  projectMap={projectMap}
                  isExpanded={expandedId === decision.id}
                  onToggleExpand={() =>
                    setExpandedId(expandedId === decision.id ? null : decision.id)
                  }
                  onStatusChange={handleStatusChange}
                  focused={focusedIndex === i}
                />
              ))}
            </div>

            {filteredDecisions.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-xl)',
                  padding: 'var(--sp-sm) var(--sp-lg)',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--surface-1)',
                }}
              >
                {[
                  { label: 'Total', value: filteredDecisions.length },
                  { label: 'Pending', value: pendingCount, color: 'var(--gold)' },
                  { label: 'Recorded', value: recordedCount, color: 'var(--teal)' },
                ].map((s) => (
                  // Parent opacity compounds with gold/teal count → fails AA.
                  // Use --muted (no opacity). r7 2026-04-22.
                  <span
                    key={s.label}
                    style={{
                      fontSize: 'var(--text-label)',
                      color: 'var(--muted)',
                    }}
                  >
                    {s.label}{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: (s as { color?: string }).color || 'var(--slate)',
                      }}
                    >
                      {s.value}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </TableContainer>
        )}
      </div>

      <CreateDecisionModal
        open={showCreate}
        projects={projects}
        onCreate={createDecision}
        onClose={() => setShowCreate(false)}
      />
    </div>
  )
}

export { SimilarDecisionsPanel }
