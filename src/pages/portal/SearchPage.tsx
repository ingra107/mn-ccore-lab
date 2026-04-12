import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, CheckSquare, FolderKanban, Users, Lightbulb,
  MessageSquare, Activity, ArrowRight, X, Clock, Trash2,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { formatBrandName } from '../../components/BrandName'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'

interface SearchResult {
  id: string
  type: string
  title: string
  subtitle?: string
  url?: string
}

const typeConfig: Record<string, { icon: typeof Search; color: string; label: string }> = {
  task: { icon: CheckSquare, color: 'var(--teal)', label: 'Task' },
  project: { icon: FolderKanban, color: 'var(--gold)', label: 'Project' },
  meeting: { icon: Users, color: 'var(--teal)', label: 'Meeting' },
  idea: { icon: Lightbulb, color: 'var(--gold)', label: 'Idea' },
  comment: { icon: MessageSquare, color: 'var(--slate)', label: 'Comment' },
  activity: { icon: Activity, color: 'var(--slate)', label: 'Activity' },
}

const RECENT_KEY = 'mnccore-recent-searches'
const MAX_RECENT = 5

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

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [recentSearches, setRecentSearches] = useState(getRecentSearches)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Save search when results come back
  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      saveRecentSearch(debouncedQuery)
      setRecentSearches(getRecentSearches())
    }
  }, [debouncedQuery])

  useEffect(() => { inputRef.current?.focus() }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return { data: [], count: 0 }
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      if (!res.ok) return { data: [], count: 0 }
      return res.json() as Promise<{ data: SearchResult[]; count: number }>
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  })

  const results = data?.data || []
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const handleSearchEnter = useCallback(() => {
    if (focusedIndex >= 0 && results[focusedIndex]?.url) {
      window.location.href = results[focusedIndex].url!
    }
  }, [focusedIndex, results])
  useListKeyboardNav({ itemCount: results.length, focusedIndex, setFocusedIndex, onEnter: handleSearchEnter })

  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {} as Record<string, SearchResult[]>)

  const typeOrder = ['task', 'project', 'meeting', 'idea', 'comment', 'activity']

  const hasResults = results.length > 0 || (debouncedQuery.length >= 2 && isLoading)
  const showCentered = !hasResults && debouncedQuery.length < 2

  return (
    <div>
      {/* Centered hero when no query */}
      {showCentered ? (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '50vh', paddingTop: '8vh' }}>
          {/* H-02: replaced inline 36px h1 with shared PageHeader component */}
          <PageHeader icon={<Search size={20} />} title="Search Everything" subtitle="Full-text search across tasks, projects, meetings, ideas, and more" />
          <div className="w-full max-w-lg relative mt-4">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.4 }} />
            {/* M-05: focus ring using --focus-ring token, WCAG-compliant teal */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks, projects, meetings, ideas..."
              className="w-full rounded-xl border px-4 py-3.5 pl-11 text-sm"
              style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)', backgroundColor: 'var(--ice)', boxShadow: 'var(--shadow-card)', outline: 'none' }}
              onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--focus-ring), var(--shadow-card)' }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'var(--shadow-card)' }}
            />
          </div>
          <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
          {['tasks', 'projects', 'meetings', 'ideas', 'comments', 'activity'].map((t) => (
            <span key={t} className="text-[10px] px-2.5 py-1 rounded-full border capitalize" style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', opacity: 0.4 }}>
              {t}
            </span>
          ))}
          </div>
          <p className="text-[10px] mt-4" style={{ color: 'var(--slate)', opacity: 0.3 }}>
            Powered by D1 full-text search
          </p>

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div className="mt-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--slate)', opacity: 0.4 }}>
                  Recent Searches
                </span>
                <button
                  onClick={() => { clearRecentSearches(); setRecentSearches([]) }}
                  className="text-[10px] flex items-center gap-1 transition-colors"
                  style={{ color: 'var(--slate)', opacity: 0.3, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Trash2 size={9} /> Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map(s => (
                  <button
                    key={s}
                    onClick={() => { setQuery(s); inputRef.current?.focus() }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition-colors hover:border-[var(--teal)]"
                    style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', background: 'none', cursor: 'pointer' }}
                  >
                    <Clock size={10} style={{ opacity: 0.4 }} />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>
      ) : (
        <>
          <PageHeader icon={<Search size={20} />} title="Search" subtitle="Find anything across the lab" />
            {/* M-05: focus ring using --focus-ring token */}
          <div className="mt-5 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.4 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.4 }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </>
      )}

      <div className="mt-6">
        {isLoading && debouncedQuery.length >= 2 && (
          <div style={{ padding: 'var(--sp-xl) 0' }}>
            <TextSkeleton lines={6} widths={['100%', '88%', '92%', '75%', '95%', '60%']} />
          </div>
        )}

        {!isLoading && debouncedQuery.length >= 2 && results.length === 0 && (
          <EmptyState
            icon={<Search size={40} />}
            title="Nothing matched"
            subtitle="Try different keywords, or check if the item exists under a different name."
          />
        )}

        {!isLoading && results.length > 0 && (
          <div className="flex flex-col gap-6">
            <p className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} for "{debouncedQuery}"
            </p>

            {typeOrder.map((type) => {
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
                      <motion.div key={item.id} variants={staggerItem}>
                        <Link
                          to={item.url || '#'}
                          className="flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-colors hover:shadow-sm"
                          style={{ borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
                        >
                          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.color + '14' }}>
                            <Icon size={14} style={{ color: config.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate" style={{ color: 'var(--ink)' }}>
                              {formatBrandName(item.title)}
                            </p>
                            {item.subtitle && (
                              <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                                {formatBrandName(item.subtitle)}
                              </p>
                            )}
                          </div>
                          <ArrowRight size={14} style={{ color: 'var(--slate)', opacity: 0.2, flexShrink: 0 }} />
                        </Link>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state handled by centered hero above */}
      </div>
    </div>
  )
}
