import { useState, useEffect, useMemo } from 'react'
import { portalTitle } from '../../constants/pageLabels'
import { Link } from 'react-router-dom'
import { useOpenParam } from '../../hooks/useOpenParam'
import {
  Scale,
  Plus,
  FolderKanban,
  Tag,
  List,
  GitCommitVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import FilterLinks from '../../components/ui/FilterLinks'
import SectionHead from '../../components/ui/SectionHead'
import { SegmentedToggle } from '../../components/ui/SegmentedToggle'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { FaceDisc, Who } from '../../components/today/skin'
import InlineSelect from '../../components/InlineSelect'
import { Button } from '../../components/ui/Button'
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
import { SleekTable, SleekRow, type SleekColumn, type SleekSort } from '../../components/table/SleekRows'
import type { DecisionRow } from '../../hooks/useApiData'
import { ICON_PROPS } from '../../lib/iconProps'

// ── Constants ────────────────────────────────────────────────

const OUTCOME_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'var(--sk-t2)' },
  { value: 'recorded', label: 'Recorded', color: 'var(--sk-t3)' },
  { value: 'revisited', label: 'Revisited', color: 'var(--slate)' },
]

type DecisionSortKey = 'title' | 'outcome_status' | 'decided_by' | 'project' | 'created_at'

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
    // md and up: the date gutter (110px left of each card) lives INSIDE this
    // container (pl-[118px]), so the dates cannot hang past the page band at
    // any width. Only the line moves with it; dot and card keep their offsets.
    <div className="relative pl-8 md:pl-[118px]" style={{ paddingTop: '4px' }}>
      <div
        className="absolute left-3 md:left-[98px] top-0 bottom-0"
        style={{ width: '2px', backgroundColor: 'var(--sk-line)' }}
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
            {/* md and up: the date sits in the container's own gutter left of
                the line (x=8). A phone has no gutter (pl-8), so there it sits
                above the card, in flow; in a gutter it started at x=-54 and
                read 'or 16'. */}
            <div
              className="mb-1 md:mb-0 md:absolute md:left-[-110px] md:top-[2px] md:w-[75px] md:text-right"
              style={{
                fontSize: 'var(--text-micro)',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
              }}
            >
              {formatShortDate(decision.created_at)}
            </div>
            <div className="p-3 sk-mat" style={{ borderRadius: 'var(--radius-lg)' }}>
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
                      color: 'var(--job-accent)',
                      backgroundColor: 'color-mix(in srgb, var(--job-accent) 6%, transparent)',
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
                    color: 'var(--job-accent)',
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
                    color: 'var(--job-accent)',
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
    }, {
      // Keep the typed outcome until the Hub has it; a failed save is toasted
      // by the failed-write floor (lib/writeFailures) and the text stays.
      onSuccess: () => setOutcome(''),
    })
  }

  return (
    <div className="sk-mat" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Scale {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t3)' }} />
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
              <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={20} variant="brand" />
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
                color: 'var(--job-accent)',
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
            background: 'color-mix(in srgb, var(--job-wants) 6%, transparent)',
            borderTop: '1px solid var(--sk-line)',
            borderLeft: '3px solid var(--job-wants)',
            color: 'var(--ink)',
            fontSize: 'var(--text-small)',
            fontWeight: 500,
            textAlign: 'left',
          }}
        >
          <Scale {...ICON_PROPS} size={13} style={{ color: 'var(--job-wants)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            Made {days} days ago · Record outcome
          </span>
          <span aria-hidden="true" style={{ color: 'var(--job-wants)' }}>→</span>
        </button>
      ) : (
      <div
        className="p-4"
        style={{
          background: 'color-mix(in srgb, var(--job-wants) 6%, transparent)',
          borderTop: '1px solid var(--sk-line)',
          borderLeft: '3px solid var(--job-wants)',
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
            border: '1px solid var(--field-edge)',
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
              background: outcome.trim() ? 'var(--job-accent)' : 'var(--sk-line)',
              color: outcome.trim() ? 'var(--sk-card)' : 'var(--slate)',
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

// ── Decisions list (sleek rows) ──────────────────────────────

const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(OUTCOME_OPTIONS.map((o) => [o.value, o.label]))

function DecisionDetail({ decision, projects, tags }: { decision: DecisionRow; projects: { slug: string; title: string }[]; tags: string[] }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{ padding: 'var(--sp-xs) var(--sp-lg) var(--sp-lg) 34px' }}>
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
            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>Rationale:{' '}</span>
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
            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>Context:{' '}</span>
            {decision.context}
          </p>
        )}
        {decision.outcome && (
          <p
            style={{
              fontSize: 'var(--text-small)',
              color: 'var(--ink)',
              lineHeight: 1.5,
              margin: '0 0 var(--sp-sm)',
              paddingLeft: 'var(--sp-md)',
              borderLeft: '2px solid var(--sk-line2)',
            }}
          >
            <span style={{ fontWeight: 500 }}>Outcome:</span>{' '}
            {decision.outcome}
          </p>
        )}
        {tags.length > 2 && (
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 'var(--sp-sm)' }}>
            <Tag {...ICON_PROPS} size={11} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
            {tags.map((tag) => (
              <span key={tag} className="tk-tag tk-n">{tag}</span>
            ))}
          </div>
        )}
        <SimilarDecisionsPanel decisionId={decision.id} projects={projects} />
      </div>
    </motion.div>
  )
}

// First two tags and a +N; the desktop cell and the phone `line` slot share it.
const tagsCell = (d: DecisionRow) => {
  const tags = parseTagsString(d.tags)
  const extra = tags.length - 2
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
      {tags.slice(0, 2).map((tag) => (
        <span key={tag} className="tk-tag tk-n" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 74 }}>{tag}</span>
      ))}
      {extra > 0 && <span className="sr-m">+{extra}</span>}
    </span>
  )
}

function DecisionsList({
  decisions,
  projects,
  projectMap,
  sort,
  onSort,
  expandedId,
  onToggleExpand,
  onStatusChange,
  focusedIndex,
}: {
  decisions: DecisionRow[]
  projects: { slug: string; title: string }[]
  projectMap: Map<string, string>
  sort: SleekSort
  onSort: (next: SleekSort) => void
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onStatusChange: (decision: DecisionRow, newStatus: string) => void
  focusedIndex: number
}) {
  const columns = useMemo<SleekColumn<DecisionRow>[]>(() => [
    {
      key: 'title', label: 'Title', width: 'minmax(0,1fr)', sortable: true, phone: 'title',
      render: (d) => (
        <div className="sr-tt" title={d.rationale || d.title}>
          <span className="sr-m" aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
            {expandedId === d.id ? <ChevronDown {...ICON_PROPS} size={12} /> : <ChevronRight {...ICON_PROPS} size={12} />}
          </span>
          <span className="sr-x">{d.title}</span>
          {d.outcome_sentiment && d.outcome_sentiment !== 'pending' && (
            <span style={{ flexShrink: 0 }}>
              <SentimentBadge sentiment={d.outcome_sentiment} />
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'tags', label: 'Tags', width: '170px', minTableWidth: 800, phone: 'line',
      renderPhone: (d) => (parseTagsString(d.tags).length === 0 ? null : tagsCell(d)),
      render: tagsCell,
    },
    {
      key: 'decided_by', label: 'Decided by', width: '120px', sortable: true, minTableWidth: 720, phone: 'line',
      render: (d) => (d.decided_by ? <span className="sr-m sr-hi" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}><Who value={d.decided_by} /></span> : <span className="sr-m">—</span>),
      renderPhone: (d) => (d.decided_by ? <span className="sr-m sr-hi" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}><Who value={d.decided_by} /></span> : null),
    },
    {
      key: 'project', label: 'Project', width: '170px', sortable: true, interactive: true, minTableWidth: 900, phone: 'line',
      render: (d) => {
        const title = d.project_slug ? projectMap.get(d.project_slug) : null
        return title ? (
          <Link to={PATHS.project(d.project_slug!)} className="sr-m sr-hi sr-x sr-open" title={title}>{title}</Link>
        ) : <span className="sr-m">—</span>
      },
      renderPhone: (d) => {
        const title = d.project_slug ? projectMap.get(d.project_slug) : null
        return title ? <Link to={PATHS.project(d.project_slug!)} className="sr-m sr-hi sr-x sr-open">{title}</Link> : null
      },
    },
    {
      key: 'created_at', label: 'Date', width: '84px', sortable: true, align: 'end', phone: 'line',
      render: (d) => <span className="sr-m" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRelativeTime(d.created_at)}</span>,
    },
    {
      key: 'outcome_status', label: 'Outcome', width: '112px', sortable: true, interactive: true, phone: 'line',
      render: (d) => {
        const v = d.outcome_status || 'pending'
        return (
          <InlineSelect
            value={v}
            options={OUTCOME_OPTIONS}
            onChange={(val) => onStatusChange(d, val)}
            alwaysShowChevron
            display={<span className="tk-pill"><i />{OUTCOME_LABEL[v] ?? v}</span>}
          />
        )
      },
    },
  ], [expandedId, projectMap, onStatusChange])

  return (
    <SleekTable columns={columns} sort={sort} onSort={onSort} defaultSortLabel="Newest first">
      {decisions.map((d, i) => (
        // S1: anchor for deep-link scroll-to (?open=<id>).
        <div key={d.id} id={`decision-${d.id}`} style={{ scrollMarginTop: '96px' }}>
          <SleekRow
            row={d}
            data={{ 'decision-id': d.id }}
            cursor={focusedIndex === i}
            expanded={expandedId === d.id}
            onClick={() => onToggleExpand(d.id)}
          >
            <AnimatePresence initial={false}>
              {expandedId === d.id && <DecisionDetail decision={d} projects={projects} tags={parseTagsString(d.tags)} />}
            </AnimatePresence>
          </SleekRow>
        </div>
      ))}
    </SleekTable>
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
  // Newest first until a header is clicked; a header cycles asc, desc, cleared.
  const [sort, setSort] = useState<SleekSort>(null)
  const sortKey = (sort?.key ?? 'created_at') as DecisionSortKey
  const sortAsc = sort ? sort.dir === 'asc' : false

  const { data: rawAllDecisions = [], isLoading, isError, refetch } = useDecisions(
    undefined,
    filterTag || undefined
  )
  // Strip QA fixtures (test decision, test_delete_, etc) before any rendering.
  const allDecisions = useMemo(
    () => rawAllDecisions.filter(d => isProductionVisible(d.title)),
    [rawAllDecisions]
  )
  // #507 follow-up opt-out: reviewDecisions/tagCounts are secondary
  // enrichments (the "Record outcome?" prompt section, the tag-filter pill
  // row) that already gate on `.length > 0` -- a failure here just hides
  // that optional section, same as "none yet," with no false claim. The
  // page's core content (allDecisions, below) gets the real isError branch.
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
    document.title = portalTitle('Decisions', pendingCount > 0 ? `${pendingCount} pending` : undefined)
  }, [pendingCount])

  return (
    <div className="content-container">
      <PageHeader
        title="Decision Log"
        subtitle={`${pendingCount} pending review, ${recordedCount} with outcomes`}
        count={filteredDecisions.length}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <SegmentedToggle
              ariaLabel="Decision view"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'list', label: 'List', icon: <List {...ICON_PROPS} size={14} /> },
                { value: 'timeline', label: 'Timeline', icon: <GitCommitVertical {...ICON_PROPS} size={14} /> },
              ]}
            />
            <Button
              variant="primary"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2"
              style={{
                gap: '0.5rem',
                padding: '8px 16px',
                borderRadius: 'var(--radius-lg)',
                fontSize: 'var(--text-small)',
                fontWeight: 500,
              }}
            >
              <Plus {...ICON_PROPS} size={16} />
              Log Decision
            </Button>
          </div>
        }
      >
        {/* Filter bar: stable minHeight prevents reflow as tagCounts load */}
        <div className="flex items-center gap-3 flex-wrap" style={{ minHeight: '36px' }}>
          <FilterLinks
            ariaLabel="Decision status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'recorded', label: 'Recorded' },
              { value: 'revisited', label: 'Revisited' },
            ]}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decisions..."
            className="px-3 py-1.5 outline-none"
            style={{
              fontSize: 'var(--text-small)',
              color: 'var(--ink)',
              border: '1px solid var(--field-edge)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--sk-card)',
              minWidth: 220,
              flex: '0 1 260px',
            }}
          />
        </div>
        {tagCounts.length > 0 && allDecisions.length >= 15 && (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <FilterLinks
              ariaLabel="Decision tag"
              value={filterTag}
              onChange={(v) => setFilterTag(filterTag === v ? '' : v)}
              options={tagCounts.slice(0, 12).map((tc) => ({ value: tc.tag, label: tc.tag, count: tc.count }))}
            />
            {filterTag && (
              <div className="tk-fsel">
                <button type="button" onClick={() => setFilterTag('')} style={{ color: 'var(--sk-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  Clear filter
                </button>
              </div>
            )}
          </div>
        )}
      </PageHeader>

      {reviewDecisions.length > 0 && !filterStatus && !filterTag && (
        <div className="mt-8">
          <SectionHead title="Record outcome?" count={reviewDecisions.length} />
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
        <SectionHead
          title={filterTag
            ? `Tagged: ${filterTag}`
            : filterStatus
            ? `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} decisions`
            : 'All decisions'}
        />

        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : isError ? (
          <EmptyState
            icon={<Scale size={40} />}
            title="Couldn't load decisions"
            subtitle="Something went wrong fetching the decision log."
            action={{ label: 'Retry', onClick: () => refetch() }}
          />
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
          <DecisionsList
            decisions={filteredDecisions}
            projects={projects}
            projectMap={projectMap}
            sort={sort}
            onSort={setSort}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
            onStatusChange={handleStatusChange}
            focusedIndex={focusedIndex}
          />
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
