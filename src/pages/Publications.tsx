import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Award, List, BookOpen, Copy } from 'lucide-react'
import { usePublications } from '../hooks/useApiData'
import type { Publication } from '../data/types'
import PublicationFilters from '../components/PublicationFilters'
import PublicationSearch from '../components/PublicationSearch'
import PublicationCard from '../components/PublicationCard'
import PublicationLibrary from '../components/PublicationLibrary'
import SectionDivider from '../components/SectionDivider'
import PageLayout from '../components/PageLayout'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'

// High-impact journal names for the "Key Publications" section
const KEY_JOURNALS = [
  'New England Journal of Medicine',
  'The Lancet Infectious Diseases',
  'The Lancet Respiratory Medicine',
  'Lancet Respiratory Medicine',
  'Lancet Healthy Longevity',
  'Intensive Care Medicine',
  'JAMA Network Open',
  'Annals of Surgery',
  'Critical Care Medicine',
]

function parseYears(param: string | null): number[] {
  if (!param) return []
  return param.split(',').map(Number).filter(Boolean)
}

function parseList(param: string | null): string[] {
  if (!param) return []
  return param.split(',').filter(Boolean)
}

export default function Publications() {
  usePageMeta(
    'Publications | MN-CCORE Lab',
    'Selected publications from MN-CCORE lab members including research on lung-protective ventilation, CLIF data standards, COVID-19 immunomodulation, and critical care outcomes.'
  )

  // Live D1 data in production, static fallback in dev
  const { data: publications = [] } = usePublications()

  const [viewMode, setViewMode] = useState<'list' | 'library'>('list')
  const [searchParams, setSearchParams] = useSearchParams()

  // Parse filter state from URL
  const activeYears = useMemo(
    () => parseYears(searchParams.get('year')),
    [searchParams]
  )
  const activeStatuses = useMemo(
    () => parseList(searchParams.get('status')),
    [searchParams]
  )
  const activeTopics = useMemo(
    () => parseList(searchParams.get('topic')),
    [searchParams]
  )

  const [searchTerm, setSearchTerm] = useState('')

  // URL param helpers
  const updateParams = useCallback(
    (key: string, values: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (values.length === 0) {
            next.delete(key)
          } else {
            next.set(key, values.join(','))
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const handleYearToggle = useCallback(
    (year: number) => {
      const next = activeYears.includes(year)
        ? activeYears.filter((y) => y !== year)
        : [...activeYears, year]
      updateParams('year', next.map(String))
    },
    [activeYears, updateParams]
  )

  const handleStatusToggle = useCallback(
    (status: string) => {
      const next = activeStatuses.includes(status)
        ? activeStatuses.filter((s) => s !== status)
        : [...activeStatuses, status]
      updateParams('status', next)
    },
    [activeStatuses, updateParams]
  )

  const handleTopicToggle = useCallback(
    (topic: string) => {
      const next = activeTopics.includes(topic)
        ? activeTopics.filter((t) => t !== topic)
        : [...activeTopics, topic]
      updateParams('topic', next)
    },
    [activeTopics, updateParams]
  )

  const handleClearAll = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  // Filter + search
  const filtered = useMemo(() => {
    let result: Publication[] = publications

    if (activeYears.length > 0) {
      result = result.filter((p) => activeYears.includes(p.year))
    }
    if (activeStatuses.length > 0) {
      result = result.filter((p) => activeStatuses.includes(p.status))
    }
    if (activeTopics.length > 0) {
      result = result.filter((p) =>
        p.topics.some((t) => activeTopics.includes(t))
      )
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.authors.toLowerCase().includes(q) ||
          p.journal.toLowerCase().includes(q) ||
          (p.abstract && p.abstract.toLowerCase().includes(q))
      )
    }

    return result
  }, [publications, activeYears, activeStatuses, activeTopics, searchTerm])

  const hasFilters =
    activeYears.length > 0 ||
    activeStatuses.length > 0 ||
    activeTopics.length > 0

  // Group by year for default view
  const years = useMemo(
    () =>
      [...new Set(filtered.map((p) => p.year))].sort((a, b) => b - a),
    [filtered]
  )

  const keyPubs = useMemo(
    () =>
      publications.filter(
        (p) =>
          p.status === 'Published' &&
          KEY_JOURNALS.some((j) => p.journal.includes(j))
      ),
    [publications]
  )

  const pubsRef = useScrollRevealGroup('.fade-in-up', 80)

  return (
    <PageLayout>
      {/* Header */}
      <section className="pt-4 pb-6 sm:pb-8 content-container">
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl mb-3 sm:mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Publications
        </h1>
        <p
          className="text-base sm:text-lg max-w-2xl"
          style={{ color: 'var(--slate)' }}
        >
          {publications.filter((p) => p.status === 'Published').length} published
          papers from MN-CCORE lab members. Click any paper to view its abstract
          and links.
        </p>

        {/* Year distribution mini-chart */}
        {years.length > 1 && (
          <div className="flex items-end gap-1 mt-3" style={{ height: 32 }}>
            {years.slice(0, 8).reverse().map(year => {
              const count = filtered.filter(p => p.year === year).length
              const max = Math.max(...years.map(y => filtered.filter(p => p.year === y).length), 1)
              return (
                <button
                  key={year}
                  onClick={() => handleYearToggle(year)}
                  className="flex flex-col items-center gap-0.5"
                  style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                  title={`${year}: ${count} publications`}
                >
                  <div
                    className="rounded-sm transition-all"
                    style={{
                      width: 20,
                      height: `${Math.max((count / max) * 24, 2)}px`,
                      backgroundColor: activeYears.includes(year) ? 'var(--gold)' : 'rgba(201,168,76,0.3)',
                    }}
                  />
                  <span className="text-[7px]" style={{ color: activeYears.includes(year) ? 'var(--gold)' : 'var(--slate)', opacity: activeYears.includes(year) ? 1 : 0.4 }}>
                    {String(year).slice(2)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Export bibliography */}
        {filtered.length > 0 && (
          <button
            onClick={() => {
              const bib = filtered.map(p => `${p.authors}. ${p.title}. ${p.journal} (${p.year}).${p.doi ? ` doi:${p.doi}` : ''}`).join('\n\n')
              navigator.clipboard.writeText(bib)
            }}
            className="inline-flex items-center gap-1 mt-3 text-[11px] px-2.5 py-1 rounded transition-colors"
            style={{ color: 'var(--slate)', background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer', opacity: 0.5 }}
          >
            <Copy size={10} />
            Copy bibliography ({filtered.length})
          </button>
        )}
      </section>

      {/* Key Publications */}
      {keyPubs.length > 0 && (
        <div className="section-ink">
          <section className="py-6 sm:py-8 content-container">
            <div className="flex items-center gap-2 mb-4">
              <Award size={16} style={{ color: 'var(--gold)' }} aria-hidden="true" />
              <h2
                className="text-sm"
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--gold)',
                  fontSize: '12px',
                }}
              >
                Key Publications in High-Impact Journals
              </h2>
            </div>
            <div className="space-y-2">
              {keyPubs.map((pub) => (
                <div
                  key={pub.id}
                  className="flex items-start gap-3 py-2 px-3 rounded-lg transition-colors duration-200"
                  style={{ background: 'rgba(201, 168, 76, 0.04)' }}
                >
                  <span
                    className="flex-shrink-0 text-xs mt-0.5 px-1.5 py-0.5 rounded"
                    style={{
                      background: 'rgba(201, 168, 76, 0.12)',
                      color: 'var(--gold)',
                      fontSize: '10px',
                    }}
                  >
                    {pub.year}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium leading-snug"
                      style={{ color: '#ffffff' }}
                    >
                      {pub.title}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}
                    >
                      {pub.journal}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <SectionDivider />

      {/* Search + Filters + List */}
      <section
        className="py-8 sm:py-12 lg:py-16 content-container"
        ref={pubsRef}
      >
        {/* Search + View Toggle */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <PublicationSearch
              value={searchTerm}
              onChange={setSearchTerm}
              resultCount={filtered.length}
            />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: viewMode === 'list' ? 'rgba(45,138,138,0.1)' : 'transparent',
                color: viewMode === 'list' ? 'var(--teal)' : 'var(--slate)',
                border: `1px solid ${viewMode === 'list' ? 'var(--teal)' : 'var(--border-light)'}`,
                cursor: 'pointer',
                opacity: viewMode === 'list' ? 1 : 0.55,
              }}
            >
              <List size={12} />
              List
            </button>
            <button
              onClick={() => setViewMode('library')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: viewMode === 'library' ? 'rgba(45,138,138,0.1)' : 'transparent',
                color: viewMode === 'library' ? 'var(--teal)' : 'var(--slate)',
                border: `1px solid ${viewMode === 'library' ? 'var(--teal)' : 'var(--border-light)'}`,
                cursor: 'pointer',
                opacity: viewMode === 'library' ? 1 : 0.55,
              }}
            >
              <BookOpen size={12} />
              Library
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <PublicationFilters
            publications={publications}
            activeYears={activeYears}
            activeStatuses={activeStatuses}
            activeTopics={activeTopics}
            onYearToggle={handleYearToggle}
            onStatusToggle={handleStatusToggle}
            onTopicToggle={handleTopicToggle}
            onClearAll={handleClearAll}
            resultCount={filtered.length}
            totalCount={publications.length}
          />
        </div>

        {/* Publication list / library */}
        {viewMode === 'library' ? (
          <PublicationLibrary publications={filtered} />
        ) : filtered.length === 0 ? (
          <div
            className="text-center py-12"
            style={{ color: 'var(--slate)' }}
          >
            <p className="text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              No publications match your filters.
            </p>
            <p className="text-sm">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        ) : hasFilters || searchTerm ? (
          /* Flat list when filters/search active */
          <div className="space-y-3 sm:space-y-4">
            {filtered.map((pub) => (
              <div key={pub.id} className="fade-in-up">
                <PublicationCard pub={pub} />
              </div>
            ))}
          </div>
        ) : (
          /* Grouped by year (default) */
          years.map((year) => (
            <div key={year} className="mb-8 sm:mb-12">
              <h2
                className="fade-in-up text-lg sm:text-xl mb-4 sm:mb-6 flex items-center gap-3"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                <span>{year}</span>
                <span
                  className="flex-1 h-px"
                  style={{ background: 'rgba(201, 168, 76, 0.3)' }}
                />
                <span
                  className="text-xs font-normal"
                  style={{
                    color: 'var(--slate)',
                  }}
                >
                  {filtered.filter((p) => p.year === year).length} paper
                  {filtered.filter((p) => p.year === year).length !== 1
                    ? 's'
                    : ''}
                </span>
              </h2>
              <div className="space-y-3 sm:space-y-4">
                {filtered
                  .filter((p) => p.year === year)
                  .map((pub) => (
                    <div key={pub.id} className="fade-in-up">
                      <PublicationCard pub={pub} />
                    </div>
                  ))}
              </div>
            </div>
          ))
        )}
      </section>
    </PageLayout>
  )
}
