import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { List, BookOpen, Copy, X } from 'lucide-react'
import { usePublications } from '../hooks/useApiData'
import PublicationFilters from '../components/PublicationFilters'
import PublicationSearch from '../components/PublicationSearch'
import PubRow from '../components/public/PubRow'
import PublicationLibrary from '../components/PublicationLibrary'
import { PublicHead, SecHead } from '../components/public/PublicParts'
import { areaById } from '../lib/researchAreas'
import { usePageMeta } from '../hooks/usePageMeta'
import { getAllMembers } from '../data/team'
import { resolveBylineAuthors } from '../lib/authorAvatars'
import { countPublications } from '../lib/publicationCounts'
import { planPublicationsPage, RECENT_COUNT } from '../lib/publicationsPage'

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
  // #906 — "All pubs" collapses to the 10 most-recent by default, with a
  // "View all" toggle revealing everything in place (design principle #3).
  // Only meaningful with no active filter/search — that branch already
  // shows a flat, unbounded, matched list (the right behavior for "find
  // the thing I searched for", not "browse the curated recent set").
  const [showAllPubs, setShowAllPubs] = useState(false)
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

  const activeArea = areaById(searchParams.get('area'))
  const [showAllKey, setShowAllKey] = useState(false)

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

  // Published only by default, one card per paper, bars from every filter
  // but the year: lib/publicationsPage owns all three rules. Featured reuses
  // Publication.featured, the field Home's Selected work reads (#906).
  const plan = useMemo(
    () => planPublicationsPage(publications, {
      years: activeYears,
      statuses: activeStatuses,
      topics: activeTopics,
      area: activeArea ?? null,
      search: searchTerm,
    }),
    [publications, activeYears, activeStatuses, activeTopics, activeArea, searchTerm]
  )
  const { pool, beforeYear, filtered, barYears, featured: featuredPubs, key: keyPubs, recent: recentPubs } = plan

  const hasFilters =
    activeYears.length > 0 ||
    activeStatuses.length > 0 ||
    activeTopics.length > 0 ||
    !!activeArea

  // Group by year for the "View all" view
  const years = useMemo(
    () =>
      [...new Set(filtered.map((p) => p.year))].sort((a, b) => b - a),
    [filtered]
  )

  const counts = useMemo(() => countPublications(publications), [publications])
  const pipelineCount = counts.inReview + counts.inPreparation
  const labMembers = useMemo(() => getAllMembers(), [])

  const journalCount = new Set(filtered.map((p) => p.journal).filter(Boolean)).size
  // Lab-wide: a paper counts when its first author resolves to ANY lab member
  // (same byline match the author column uses).
  const firstAuthorCount = filtered.filter((p) => !!resolveBylineAuthors(p, labMembers)[0]?.member).length
  const thisYear = new Date().getFullYear()
  const thisYearCount = filtered.filter((p) => p.year === thisYear).length
  const KEY_SHOWN = 8
  const keyShown = showAllKey ? keyPubs : keyPubs.slice(0, KEY_SHOWN)
  const barCount = (year: number) => beforeYear.filter((p) => p.year === year).length
  const yearMax = Math.max(1, ...barYears.slice(0, 12).map(barCount))

  // Copy feedback: the label says what happened, and a refused clipboard
  // write (permission denied) is caught instead of thrown.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyBibliography = async () => {
    const bib = filtered.map((p) => `${p.authors}. ${p.title}. ${p.journal} (${p.year}).${p.doi ? ` doi:${p.doi}` : ''}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(bib)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => setCopyState('idle'), 2500)
  }

  return (
    <div className="content-container pub-foot">
      <PublicHead
        kicker="Publications"
        title={<>The <em>published</em> work.</>}
        lede={`Papers from MN-CCORE lab members${pipelineCount > 0 ? `, with ${pipelineCount} more in review or in preparation` : ''}. Open any paper for its abstract and links.`}
        small
      />

      {/* Year distribution: a bar is a filter. Fixed-height slot prevents CLS (H-15). */}
      <div className="pub-ybars" style={{ height: 70 }}>
        {(barYears.length > 1 || activeYears.length > 0) && barYears.slice(0, 12).reverse().map((year) => {
          const count = barCount(year)
          const on = activeYears.includes(year)
          return (
            <button key={year} type="button" onClick={() => handleYearToggle(year)} className={on ? 'pub-on' : undefined} title={`${year}: ${count} papers`} aria-pressed={on}>
              <i style={{ height: `${Math.max((count / yearMax) * 44, 3)}px` }} />
              <span>{String(year).slice(2)}</span>
            </button>
          )
        })}
      </div>

      {filtered.length > 0 && (
        <div className="pub-stats">
          <span><b>{filtered.length}</b> papers</span>
          <span><b>{journalCount}</b> journals</span>
          <span><b>{firstAuthorCount}</b> with a lab first author</span>
          <span><b>{thisYearCount}</b> in {thisYear}</span>
          <button
            type="button"
            className="pub-btn pub-sm"
            onClick={() => { void copyBibliography() }}
          >
            <Copy size={13} aria-hidden="true" />
            <span aria-live="polite">
              {copyState === 'copied'
                ? `Copied ${filtered.length}`
                : copyState === 'failed'
                  ? 'Copy failed: select and copy by hand'
                  : `Copy bibliography (${filtered.length})`}
            </span>
          </button>
        </div>
      )}

      {/* Featured: lab-wide picks via Publication.featured (#906), the same
          field Home's Selected work reads. Every list is PubRow: one card. */}
      {featuredPubs.length > 0 && (
        <section>
          <SecHead title="Featured" count={featuredPubs.length} />
          <div className="pub-card" style={{ padding: 8, marginTop: 12 }}>
            {featuredPubs.map((pub) => <PubRow key={pub.id} pub={pub} />)}
          </div>
        </section>
      )}

      {/* In high-impact journals: the first few, the rest in place. */}
      {keyPubs.length > 0 && (
        <section>
          <SecHead
            title="In high-impact journals"
            count={keyPubs.length}
            right={keyPubs.length > KEY_SHOWN ? (
              <button type="button" onClick={() => setShowAllKey((v) => !v)} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
                {showAllKey ? 'Show fewer' : `Show all ${keyPubs.length}`}
              </button>
            ) : undefined}
          />
          <div className="pub-card" style={{ padding: 8, marginTop: 12 }}>
            {keyShown.map((pub) => <PubRow key={pub.id} pub={pub} />)}
          </div>
        </section>
      )}

      {/* Search + filters + list */}
      <section style={{ minHeight: '800px' }}>
        <SecHead title="All papers" count={filtered.length === pool.length ? pool.length : `${filtered.length} of ${pool.length}`} />
        <div className="flex items-center gap-3 mb-4" style={{ marginTop: 14 }}>
          <div className="flex-1">
            <PublicationSearch value={searchTerm} onChange={setSearchTerm} resultCount={filtered.length} />
          </div>
          <div className="pub-seg" role="group" aria-label="View">
            <button type="button" className={viewMode === 'list' ? 'pub-on' : undefined} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}>
              <List size={13} aria-hidden="true" /> List
            </button>
            <button type="button" className={viewMode === 'library' ? 'pub-on' : undefined} onClick={() => setViewMode('library')} aria-pressed={viewMode === 'library'}>
              <BookOpen size={13} aria-hidden="true" /> Library
            </button>
          </div>
        </div>

        {activeArea && (
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="pub-chip pub-on" onClick={() => updateParams('area', [])} aria-label={`Clear area filter: ${activeArea.label}`}>
              Area: {activeArea.label}<X size={12} aria-hidden="true" />
            </button>
          </div>
        )}

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
            totalCount={pool.length}
          />
        </div>

        {viewMode === 'library' ? (
          <PublicationLibrary publications={filtered} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--sk-t2)' }}>
            <p className="text-lg mb-2" style={{ fontFamily: 'var(--font-display)' }}>No publications match your filters.</p>
            <p className="text-sm">Try adjusting your search or filter criteria.</p>
          </div>
        ) : hasFilters || searchTerm ? (
          <div className="pub-card" style={{ padding: 8 }}>
            {filtered.map((pub) => <PubRow key={pub.id} pub={pub} />)}
          </div>
        ) : !showAllPubs ? (
          /* #906 — 10 most-recent by default; "View all" reveals the full
             grouped-by-year view in place (design principle #3). */
          <>
            {recentPubs.length > 0 && (
              <div className="pub-card" style={{ padding: 8 }}>
                {recentPubs.map((pub) => <PubRow key={pub.id} pub={pub} />)}
              </div>
            )}
            {filtered.length > RECENT_COUNT && (
              <div className="mt-6 text-center">
                <button type="button" className="pub-btn" onClick={() => setShowAllPubs(true)}>
                  View all {filtered.length} papers
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <button type="button" className="pub-btn" onClick={() => setShowAllPubs(false)}>
                Show recent only
              </button>
            </div>
            {years.map((year) => {
              const n = filtered.filter((p) => p.year === year).length
              return (
                <div key={year} className="mb-8 sm:mb-12">
                  <div className="pub-yhd">
                    <span className="pub-yr" style={{ width: 'auto' }}>{year}</span>
                    <span className="pub-yrule" />
                    <span className="pub-meta">{n} {n === 1 ? 'paper' : 'papers'}</span>
                  </div>
                  <div className="pub-card" style={{ padding: 8 }}>
                    {filtered.filter((p) => p.year === year).map((pub) => <PubRow key={pub.id} pub={pub} />)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </section>
    </div>
  )
}
