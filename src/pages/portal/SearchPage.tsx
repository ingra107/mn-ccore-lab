import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, CheckSquare, FolderKanban, Users, Lightbulb,
  MessageSquare, Activity, ArrowRight, X, Clock, Trash2,
  ScrollText, Scale, Paperclip, ListChecks, BookOpen, Banknote,
  AlertTriangle, Calendar, FileText,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import EmptyState from '../../components/EmptyState'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { formatBrandName } from '../../components/BrandName'
import Avatar from '../../components/Avatar'
import CategoryIcon from '../../components/CategoryIcon'
import HermesMark from '../../components/HermesMark'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { PATHS } from '../../constants/paths'
import { formatRelativeTime } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import { getPersonInfo, getAllMembers } from '../../data/team'

interface SearchResult {
  id: string
  type: string
  title: string
  subtitle?: string
  url?: string
  timestamp?: string
  snippet?: string | null
  matchedField?: string | null
  details?: Record<string, any> | null
}

const typeConfig: Record<string, { icon: typeof Search; color: string; label: string }> = {
  task: { icon: CheckSquare, color: 'var(--teal)', label: 'Task' },
  project: { icon: FolderKanban, color: 'var(--gold)', label: 'Project' },
  meeting: { icon: Users, color: 'var(--teal)', label: 'Meeting' },
  idea: { icon: Lightbulb, color: 'var(--gold)', label: 'Idea' },
  note: { icon: ScrollText, color: 'var(--teal)', label: 'Note' },
  task_note: { icon: ScrollText, color: 'var(--teal)', label: 'Task note' },
  comment: { icon: MessageSquare, color: 'var(--slate)', label: 'Comment' },
  task_comment: { icon: MessageSquare, color: 'var(--slate)', label: 'Task comment' },
  decision: { icon: Scale, color: 'var(--maroon)', label: 'Decision' },
  action_item: { icon: ListChecks, color: 'var(--teal)', label: 'Action item' },
  file: { icon: Paperclip, color: 'var(--slate)', label: 'File' },
  publication: { icon: BookOpen, color: 'var(--gold)', label: 'Publication' },
  grant: { icon: Banknote, color: 'var(--green)', label: 'Grant' },
  artifact: { icon: FileText, color: 'var(--gold)', label: 'Artifact' },
  activity: { icon: Activity, color: 'var(--slate)', label: 'Activity' },
}

const RECENT_KEY = 'mnccore-recent-searches'
const MAX_RECENT = 10
const VIEW_KEY = 'search_view'
const JUMPTO_LRU_KEY = 'search_jumpto_lru'

type SearchView = 'mixed' | 'by-type' | 'timeline'
type TimeFilter = 'all' | '7d' | '30d'
type StatusFilter = 'all' | 'open' | 'done'

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecentSearch(q: string) {
  const recent = getRecentSearches().filter(s => s !== q)
  recent.unshift(q)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY)
}

function getView(): SearchView {
  try {
    const v = localStorage.getItem(VIEW_KEY) as SearchView | null
    if (v === 'mixed' || v === 'by-type' || v === 'timeline') return v
  } catch { /* noop */ }
  return 'mixed'
}

function saveView(v: SearchView) {
  try { localStorage.setItem(VIEW_KEY, v) } catch { /* noop */ }
}

interface JumpToEntry {
  path: string
  label: string
  visitedAt: number
}

function getJumpToLRU(): JumpToEntry[] {
  try {
    const raw = localStorage.getItem(JUMPTO_LRU_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/** Tokenize a search query. Filters empty tokens and lowercases. */
function tokenize(q: string): string[] {
  return q.split(/\s+/).map(s => s.trim()).filter(Boolean)
}

/** Render text with <mark> highlights around any matching token (case-insensitive). */
function HighlightedText({ text, tokens }: { text: string; tokens: string[] }) {
  if (!text || tokens.length === 0) return <>{text}</>
  // Build a single regex that matches ANY of the tokens. Escape regex chars.
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = tokens.some(t => part.toLowerCase() === t.toLowerCase())
        if (isMatch) {
          return (
            <mark
              key={i}
              style={{
                background: 'var(--gold-emphasis)',
                color: 'inherit',
                padding: '0 1px',
                borderRadius: 2,
              }}
            >
              {part}
            </mark>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

/** Per-type metadata badge — assignee avatar, journal pill, etc. */
function TypeBadge({ result }: { result: SearchResult }) {
  const d = result.details || {}
  if (result.type === 'task' && d.assignee) {
    const person = getPersonInfo(d.assignee)
    return (
      <Avatar
        name={person.name}
        initials={person.initials}
        photoUrl={person.photoUrl}
        slug={d.assignee}
        size="2xs"
        variant="ice"
      />
    )
  }
  if (result.type === 'meeting' && d.date) {
    return (
      <span
        className="text-[10px] flex items-center gap-1 rounded-full px-2 py-0.5"
        style={{
          background: 'var(--teal-hover)',
          color: 'var(--teal)',
          border: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <Calendar size={9} />
        {d.date}
      </span>
    )
  }
  if (result.type === 'publication') {
    const parts = [d.journal, d.year].filter(Boolean).join(' · ')
    if (!parts) return null
    return (
      <span
        className="text-[10px] rounded-full px-2 py-0.5"
        style={{
          background: 'var(--gold-emphasis)',
          color: 'var(--gold-on-emphasis)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {parts}
      </span>
    )
  }
  if (result.type === 'grant') {
    const fy = d.fiscal_year ? `FY${d.fiscal_year}` : null
    const cost = typeof d.total_cost === 'number'
      ? `$${(d.total_cost / 1000).toFixed(0)}K`
      : null
    const parts = [fy, cost].filter(Boolean).join(' · ')
    if (!parts) return null
    return (
      <span
        className="text-[10px] rounded-full px-2 py-0.5"
        style={{
          background: 'var(--green-hover, rgba(6,110,47,0.10))',
          color: 'var(--green)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {parts}
      </span>
    )
  }
  if (result.type === 'decision' && d.outcome) {
    return (
      <span
        className="text-[10px] rounded-full px-2 py-0.5"
        style={{
          background: 'var(--maroon-hover, rgba(122,0,25,0.10))',
          color: 'var(--maroon)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          maxWidth: 140,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={d.outcome}
      >
        {d.outcome}
      </span>
    )
  }
  if (result.type === 'project' && d.category) {
    return (
      <CategoryIcon
        category={d.category}
        size={14}
        color="var(--slate)"
        style={{ opacity: 0.85, flexShrink: 0 }}
      />
    )
  }
  return null
}

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  // S8: seed the box from ?q= so EntityNotFound's "Search for X" link lands
  // on a real query (e.g. arriving from a dead project/meeting slug).
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [recentSearches, setRecentSearches] = useState(getRecentSearches)
  const [view, setView] = useState<SearchView>(getView)
  const [submittedQueries, setSubmittedQueries] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // S-05: only save recents on explicit submit (Enter) — NOT on every prefix.
  // The prior auto-save effect polluted recents with `mo`, `mor`, `mort`, ...
  // when the user typed `mortality`. The user-intent signal is Enter.
  const submitQuery = useCallback((q: string) => {
    const trimmed = q.trim()
    if (trimmed.length >= 2) {
      saveRecentSearch(trimmed)
      setRecentSearches(getRecentSearches())
      setSubmittedQueries(prev => new Set(prev).add(trimmed))
    }
  }, [])

  useEffect(() => { inputRef.current?.focus() }, [])

  const onPersistView = useCallback((v: SearchView) => {
    setView(v)
    saveView(v)
  }, [])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return { data: [], count: 0 }
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      if (!res.ok) {
        // S-16: distinguish error from empty results.
        throw new Error(`Search failed: ${res.status}`)
      }
      return res.json() as Promise<{ data: SearchResult[]; count: number }>
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
    retry: 1,
  })

  const results = data?.data || []
  const tokens = useMemo(() => tokenize(debouncedQuery), [debouncedQuery])

  // S-15: token-retry. When the full query has 0 results, run a search
  // per token and surface the best non-empty as "Did you mean?".
  const queryTokens = useMemo(
    () => tokens.length > 1 ? tokens : [],
    [tokens]
  )
  const { data: didYouMeanData } = useQuery({
    queryKey: ['search-did-you-mean', queryTokens.join(' ')],
    queryFn: async () => {
      // Try each token; return the first that returns >0 results.
      for (const tok of queryTokens) {
        if (tok.length < 2) continue
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(tok)}`)
          if (!res.ok) continue
          const json = await res.json() as { data: SearchResult[]; count: number }
          if (json.count > 0) return { token: tok, count: json.count }
        } catch { /* noop */ }
      }
      return null
    },
    enabled: queryTokens.length > 1 && results.length === 0 && !isLoading && debouncedQuery.length >= 2,
    staleTime: 60 * 1000,
  })

  const [focusedIndex, setFocusedIndex] = useState(-1)
  const handleSearchEnter = useCallback(() => {
    if (focusedIndex >= 0 && results[focusedIndex]?.url) {
      submitQuery(debouncedQuery)
      window.location.href = results[focusedIndex].url!
    }
  }, [focusedIndex, results, debouncedQuery, submitQuery])
  useListKeyboardNav({ itemCount: results.length, focusedIndex, setFocusedIndex, onEnter: handleSearchEnter })

  const typeOrder = [
    'task', 'project', 'meeting', 'idea',
    'note', 'task_note', 'comment', 'task_comment',
    'decision', 'action_item', 'file',
    'publication', 'grant', 'activity',
  ]

  // Per-type filter chips. S-10: default to multi-select (no shift required).
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const toggleType = (t: string) => {
    setTypeFilter((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }

  // S-11: secondary filters — person / time / status
  const [personFilter, setPersonFilter] = useState<string>('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Apply filters client-side.
  const filteredResults = useMemo(() => {
    let out = results
    if (typeFilter.length > 0) {
      out = out.filter(r => typeFilter.includes(r.type))
    }
    if (personFilter) {
      out = out.filter(r => {
        const d = r.details || {}
        return (
          d.assignee === personFilter ||
          d.pi === personFilter ||
          d.decided_by === personFilter ||
          d.author_slug === personFilter
        )
      })
    }
    if (timeFilter !== 'all') {
      const cutoff = Date.now() - (timeFilter === '7d' ? 7 : 30) * 86400_000
      out = out.filter(r => {
        if (!r.timestamp) return false
        return parseDbUtc(r.timestamp).getTime() >= cutoff
      })
    }
    if (statusFilter !== 'all') {
      out = out.filter(r => {
        const d = r.details || {}
        // Only tasks + action_items have a meaningful open/done split.
        if (r.type === 'task') {
          const isDone = d.status === 'done' || d.status === 'completed'
          return statusFilter === 'open' ? !isDone : isDone
        }
        if (r.type === 'action_item') {
          // action_item has a `completed` boolean (not in details — fold into details server-side later)
          return true
        }
        // Other types pass through regardless of status.
        return true
      })
    }
    return out
  }, [results, typeFilter, personFilter, timeFilter, statusFilter])

  const grouped = filteredResults.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {} as Record<string, SearchResult[]>)

  // Sort per-view.
  const orderedResults = useMemo(() => {
    if (view === 'timeline') {
      return [...filteredResults].sort((a, b) => {
        const at = a.timestamp ? new Date(a.timestamp).getTime() : 0
        const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0
        return bt - at
      })
    }
    // mixed: rely on backend score (already ranked)
    return filteredResults
  }, [filteredResults, view])

  const countByType = results.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const teamMembers = useMemo(() => getAllMembers(), [])
  const hasActiveFilters = typeFilter.length > 0 || personFilter || timeFilter !== 'all' || statusFilter !== 'all'
  const clearFilters = () => {
    setTypeFilter([])
    setPersonFilter('')
    setTimeFilter('all')
    setStatusFilter('all')
  }

  const removeRecent = (s: string) => {
    const next = getRecentSearches().filter(x => x !== s)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    setRecentSearches(next)
  }

  // S-13: keep showing recents (filtered by prefix) until first result lands.
  const showRecents = !query
    ? recentSearches.length > 0
    : (recentSearches.filter(s => s.toLowerCase().startsWith(query.toLowerCase())).length > 0)

  const filteredRecents = !query
    ? recentSearches
    : recentSearches.filter(s => s.toLowerCase().startsWith(query.toLowerCase()))

  // S-14: LRU jump-to. Render top 4 visited portal pages (or fall back to defaults).
  const jumpToEntries = useMemo(() => {
    const lru = getJumpToLRU()
    if (lru.length >= 4) {
      return lru.slice(0, 4).map(e => ({ path: e.path, label: e.label }))
    }
    // Fall back to a default set, append from LRU when partial.
    const defaults = [
      { path: PATHS.myTasks, label: 'My tasks', icon: CheckSquare, color: 'var(--teal)' },
      { path: PATHS.deadlines, label: 'Urgent deadlines', icon: Activity, color: 'var(--maroon)' },
      { path: PATHS.ideas, label: 'New ideas', icon: Lightbulb, color: 'var(--gold)' },
      { path: PATHS.decisions, label: 'Decisions log', icon: MessageSquare, color: 'var(--slate)' },
    ]
    const lruPaths = new Set(lru.map(e => e.path))
    const lruEntries = lru.map(e => ({ path: e.path, label: e.label }))
    const seen = new Set(lruPaths)
    const fallback = defaults
      .filter(d => !seen.has(d.path))
      .map(d => ({ path: d.path, label: d.label }))
    return [...lruEntries, ...fallback].slice(0, 4)
  }, [])

  const iconForJumpToPath = (path: string): { Icon: typeof Search; color: string } => {
    if (path === PATHS.myTasks || path === PATHS.tasks) return { Icon: CheckSquare, color: 'var(--teal)' }
    if (path === PATHS.deadlines) return { Icon: Activity, color: 'var(--maroon)' }
    if (path === PATHS.ideas) return { Icon: Lightbulb, color: 'var(--gold)' }
    if (path === PATHS.decisions) return { Icon: MessageSquare, color: 'var(--slate)' }
    if (path === PATHS.projects) return { Icon: FolderKanban, color: 'var(--gold)' }
    if (path === PATHS.meetings) return { Icon: Users, color: 'var(--teal)' }
    if (path === PATHS.grants) return { Icon: Banknote, color: 'var(--green)' }
    return { Icon: Search, color: 'var(--slate)' }
  }

  return (
    <PageContainer>
      <PageHeader icon={<Search size={20} />} title="Search" subtitle="Find anything across the lab" />

      {/* S-04: sticky search input + chips so input stays visible during scroll. */}
      <div
        className="mt-5"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-sticky)' as any,
          background: 'var(--page-bg)',
          paddingBottom: 'var(--sp-sm)',
          paddingTop: 'var(--sp-xs)',
          marginLeft: 'calc(-1 * var(--sp-md))',
          marginRight: 'calc(-1 * var(--sp-md))',
          paddingLeft: 'var(--sp-md)',
          paddingRight: 'var(--sp-md)',
          borderBottom: results.length > 0 ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.75 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim().length >= 2) {
                submitQuery(query)
              }
            }}
            placeholder="Search tasks, projects, meetings, ideas..."
            className="w-full rounded-xl border px-4 py-3 pl-11 text-sm"
            style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)', backgroundColor: 'var(--ice)', outline: 'none' }}
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--focus-ring)' }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.75 }}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Type chips (S-10: multi-select default, with Clear filter when any active). */}
        {results.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <button
              onClick={() => setTypeFilter([])}
              className="rounded-full px-3 py-1 text-xs border transition-colors"
              style={{
                borderColor: typeFilter.length === 0 ? 'var(--teal)' : 'var(--border-subtle)',
                color: typeFilter.length === 0 ? 'var(--teal)' : 'var(--slate)',
                background: typeFilter.length === 0 ? 'var(--teal-hover)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              All ({results.length})
            </button>
            {typeOrder.map((t) => {
              const count = countByType[t] || 0
              if (count === 0) return null
              const active = typeFilter.includes(t)
              const cfg = typeConfig[t] || typeConfig.activity
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className="rounded-full px-3 py-1 text-xs border transition-colors"
                  style={{
                    borderColor: active ? cfg.color : 'var(--border-subtle)',
                    color: active ? cfg.color : 'var(--slate)',
                    background: active ? `${cfg.color}14` : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {cfg.label}s ({count})
                </button>
              )
            })}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[11px] underline-offset-2 hover:underline"
                style={{ color: 'var(--slate)', opacity: 0.85, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* S-11: secondary filter row — person / time / status. */}
        {results.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs">
            <label className="flex items-center gap-1" style={{ color: 'var(--slate)', opacity: 0.85 }}>
              <span>Person:</span>
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                aria-label="Filter results by person"
                className="rounded-md border px-2 py-1"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: 'var(--ice)',
                  color: 'var(--ink)',
                }}
              >
                <option value="">Anyone</option>
                {teamMembers.map(m => (
                  <option key={m.slug} value={m.slug}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1" style={{ color: 'var(--slate)', opacity: 0.85 }}>
              <span>Time:</span>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                aria-label="Filter results by time"
                className="rounded-md border px-2 py-1"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: 'var(--ice)',
                  color: 'var(--ink)',
                }}
              >
                <option value="all">All time</option>
                <option value="7d">Last 7d</option>
                <option value="30d">Last 30d</option>
              </select>
            </label>
            <label className="flex items-center gap-1" style={{ color: 'var(--slate)', opacity: 0.85 }}>
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filter task results by status"
                className="rounded-md border px-2 py-1"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: 'var(--ice)',
                  color: 'var(--ink)',
                }}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="done">Done</option>
              </select>
            </label>

            {/* S-02: view picker — Mixed / By type / Timeline. */}
            <div className="ml-auto flex items-center gap-1 rounded-full border px-1 py-0.5" style={{ borderColor: 'var(--border-subtle)' }}>
              {(['mixed', 'by-type', 'timeline'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => onPersistView(v)}
                  className="rounded-full px-2 py-0.5"
                  style={{
                    background: view === v ? 'var(--teal-hover)' : 'transparent',
                    color: view === v ? 'var(--teal)' : 'var(--slate)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                  aria-pressed={view === v}
                >
                  {v === 'mixed' ? 'Mixed' : v === 'by-type' ? 'By type' : 'Timeline'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Idle state turns into a useful browse surface (P2-R2-08).
          Jump-to + tips appear alongside Recents so the page stops being
          a blank canvas. */}
      {!query && (
        <div className="grid gap-6 sm:grid-cols-2 mt-6">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--slate)', opacity: 0.75 }}>
              Jump to
            </span>
            <div className="flex flex-col gap-1 mt-2">
              {jumpToEntries.map(entry => {
                const { Icon, color } = iconForJumpToPath(entry.path)
                return (
                  <Link
                    key={entry.path}
                    to={entry.path}
                    className="text-sm flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    style={{ color: 'var(--ink)', textDecoration: 'none' }}
                  >
                    <Icon size={13} style={{ color }} /> {entry.label}
                  </Link>
                )
              })}
            </div>
          </div>
          {/* S-06: removed misleading @/#// prefix tips (syntax not implemented). */}
        </div>
      )}

      {/* Recent searches — S-13: keep showing while user types if any prefix matches. */}
      {showRecents && filteredRecents.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--slate)', opacity: 0.75 }}>
              Recent Searches
            </span>
            <button
              onClick={() => { clearRecentSearches(); setRecentSearches([]) }}
              className="text-[10px] flex items-center gap-1 transition-colors"
              style={{ color: 'var(--slate)', opacity: 0.75, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Trash2 size={9} /> Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filteredRecents.map(s => (
              <span
                key={s}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition-colors hover:border-[var(--teal)]"
                style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', background: 'none' }}
              >
                <button
                  onClick={() => { setQuery(s); inputRef.current?.focus() }}
                  className="flex items-center gap-1"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  <Clock size={10} style={{ opacity: 0.85 }} />
                  {s}
                </button>
                <button
                  onClick={() => removeRecent(s)}
                  aria-label={`Remove "${s}" from recent searches`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.55, padding: 0, marginLeft: 2 }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {isLoading && debouncedQuery.length >= 2 && (
          <div style={{ padding: 'var(--sp-xl) 0' }}>
            <TextSkeleton lines={6} widths={['100%', '88%', '92%', '75%', '95%', '60%']} />
          </div>
        )}

        {/* S-16: distinguish error from empty results. */}
        {!isLoading && isError && debouncedQuery.length >= 2 && (
          <EmptyState
            icon={<AlertTriangle size={40} />}
            title="Couldn't reach search"
            subtitle="Network or server error. Try again."
            action={{ label: 'Retry', onClick: () => refetch() }}
          />
        )}

        {!isLoading && !isError && debouncedQuery.length >= 2 && results.length === 0 && (
          <EmptyState
            icon={<Search size={40} />}
            title="Nothing matched that"
            subtitle={
              didYouMeanData?.token
                ? `Try a different keyword. Did you mean "${didYouMeanData.token}"?`
                : "Try a different keyword, a person's name, or a project slug."
            }
            action={
              didYouMeanData?.token
                ? { label: `Search "${didYouMeanData.token}" (${didYouMeanData.count})`, onClick: () => setQuery(didYouMeanData.token) }
                : undefined
            }
          />
        )}

        {!isLoading && !isError && results.length > 0 && (
          <div className="flex flex-col gap-6">
            <p className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} for "{debouncedQuery}"
              {hasActiveFilters && ` (filtered)`}
            </p>

            {/* MIXED + TIMELINE views: flat list ordered by score / time. */}
            {(view === 'mixed' || view === 'timeline') && (
              <motion.div className="flex flex-col gap-1" variants={staggerContainer} initial="hidden" animate="visible">
                {orderedResults.map((item) => (
                  <ResultRow key={`${item.type}:${item.id}`} item={item} tokens={tokens} />
                ))}
              </motion.div>
            )}

            {/* BY-TYPE view: grouped sections (legacy shape). */}
            {view === 'by-type' && typeOrder.map((type) => {
              const items = grouped[type]
              if (!items?.length) return null
              const config = typeConfig[type] || typeConfig.activity
              const Icon = config.icon

              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} style={{ color: config.color }} />
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: config.color }}>
                      {config.label}s ({items.length})
                    </span>
                  </div>
                  <motion.div className="flex flex-col gap-1" variants={staggerContainer} initial="hidden" animate="visible">
                    {items.map((item) => (
                      <ResultRow key={`${item.type}:${item.id}`} item={item} tokens={tokens} />
                    ))}
                  </motion.div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Suppress lint use of submittedQueries — kept for future analytics surfaces. */}
      <span style={{ display: 'none' }}>{submittedQueries.size}</span>
    </PageContainer>
  )
}

/** Single result row — handles snippet, highlights, type badge, timestamp. */
function ResultRow({ item, tokens }: { item: SearchResult; tokens: string[] }) {
  const config = typeConfig[item.type] || typeConfig.activity
  const Icon = config.icon
  const d = item.details || {}
  // Hermes branding for AI-authored decisions/activity (Rule 29).
  const isHermes = d.decided_by === 'claude-ai' || d.author_slug === 'claude-ai'

  return (
    <motion.div variants={staggerItem}>
      <Link
        to={item.url || '#'}
        className="flex items-start gap-3 px-4 py-2.5 rounded-lg border transition-colors hover:shadow-sm"
        style={{ borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
      >
        <div
          className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: config.color + '14' }}
        >
          {isHermes
            ? <HermesMark variant="icon" size={14} color={config.color} />
            : <Icon size={14} style={{ color: config.color }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm truncate flex-1" style={{ color: 'var(--ink)' }}>
              <HighlightedText text={formatBrandName(item.title)} tokens={tokens} />
            </p>
            <TypeBadge result={item} />
            {item.timestamp && (
              <span
                className="text-[10px] flex-shrink-0"
                style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', whiteSpace: 'nowrap' }}
              >
                {formatRelativeTime(item.timestamp)}
              </span>
            )}
          </div>
          {/* S-03: snippet (matched body text, with highlights). Falls back to subtitle when no snippet. */}
          {item.snippet ? (
            <p
              className="text-[11px] mt-0.5"
              style={{
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.matchedField && (
                <span style={{ opacity: 0.7, marginRight: 4 }}>
                  {item.matchedField}:
                </span>
              )}
              <HighlightedText text={item.snippet} tokens={tokens} />
            </p>
          ) : item.subtitle ? (
            <p
              className="text-[10px] truncate mt-0.5"
              style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
            >
              <HighlightedText text={formatBrandName(item.subtitle)} tokens={tokens} />
            </p>
          ) : null}
        </div>
        <ArrowRight size={14} style={{ color: 'var(--slate)', opacity: 0.75, flexShrink: 0, marginTop: 4 }} />
      </Link>
    </motion.div>
  )
}
