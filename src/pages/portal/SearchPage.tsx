import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Search, CheckSquare, FolderKanban, Users, Lightbulb,
  MessageSquare, Activity, ArrowRight, X,
} from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import { formatBrandName } from '../../components/BrandName'

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

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

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
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
              color: 'var(--ink)',
              margin: '0 0 8px',
              textAlign: 'center',
            }}
          >
            Search Everything
          </h1>
          <p className="text-sm mb-6" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>
            Full-text search across tasks, projects, meetings, ideas, and more
          </p>
          <div className="w-full max-w-lg relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.4 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks, projects, meetings, ideas..."
              className="w-full rounded-xl border px-4 py-3.5 pl-11 text-sm outline-none"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', borderColor: 'var(--border-light)', backgroundColor: 'var(--ice)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            />
          </div>
          <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
            {['tasks', 'projects', 'meetings', 'ideas', 'comments', 'activity'].map((t) => (
              <span key={t} className="text-[10px] px-2.5 py-1 rounded-full border capitalize" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-light)', opacity: 0.4 }}>
                {t}
              </span>
            ))}
          </div>
          <p className="text-[10px] mt-4" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.3 }}>
            Powered by D1 full-text search
          </p>
        </div>
      ) : (
        <>
          <SectionHeader icon={Search} title="Search" subtitle="Find anything across the lab" />
          <div className="mt-5 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.4 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks, projects, meetings, ideas..."
              className="w-full rounded-xl border px-4 py-3 pl-11 text-sm outline-none"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', borderColor: 'var(--border-light)', backgroundColor: 'var(--ice)' }}
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
          <div className="text-center py-12 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
            Searching...
          </div>
        )}

        {!isLoading && debouncedQuery.length >= 2 && results.length === 0 && (
          <div className="text-center py-12">
            <Search size={32} style={{ color: 'var(--slate)', opacity: 0.2, margin: '0 auto 8px' }} />
            <p className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
              No results for "{debouncedQuery}"
            </p>
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <div className="flex flex-col gap-6">
            <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
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
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)', color: config.color }}>
                      {config.label}s ({items.length})
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {items.map((item) => (
                      <Link
                        key={item.id}
                        to={item.url || '#'}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-colors hover:shadow-sm"
                        style={{ borderColor: 'var(--border-light)', textDecoration: 'none' }}
                      >
                        <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.color + '14' }}>
                          <Icon size={14} style={{ color: config.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                            {formatBrandName(item.title)}
                          </p>
                          {item.subtitle && (
                            <p className="text-[10px] truncate mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
                              {formatBrandName(item.subtitle)}
                            </p>
                          )}
                        </div>
                        <ArrowRight size={14} style={{ color: 'var(--slate)', opacity: 0.2, flexShrink: 0 }} />
                      </Link>
                    ))}
                  </div>
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
