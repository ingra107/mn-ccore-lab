import { Link } from 'react-router-dom'
import { Newspaper, ArrowRight } from 'lucide-react'
import { useDigest } from '../hooks/useApiData'
import type { DigestPaper } from '../hooks/useApiData'

function relevanceColor(score: number): string {
  if (score >= 80) return 'var(--teal)'
  if (score >= 60) return 'var(--gold)'
  return 'var(--slate)'
}

function relevanceBg(score: number): string {
  if (score >= 80) return 'rgba(45,138,138,0.12)'
  if (score >= 60) return 'rgba(201,168,76,0.12)'
  return 'rgba(44,62,80,0.08)'
}

function topicPill(topic: string) {
  return (
    <span
      key={topic}
      className="inline-block px-2 py-0.5 rounded-full text-xs"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.02em',
        background: 'rgba(201,168,76,0.08)',
        color: 'var(--slate)',
        border: '1px solid rgba(201,168,76,0.12)',
        whiteSpace: 'nowrap',
      }}
    >
      {topic}
    </span>
  )
}

function PaperCard({ paper }: { paper: DigestPaper }) {
  const topics: string[] = paper.topics ? JSON.parse(paper.topics) : []
  const score = Math.round(paper.relevance_score * 100)
  const displayTitle =
    paper.title.length > 100 ? paper.title.slice(0, 97) + '...' : paper.title

  return (
    <div
      className="card p-4 sm:p-5 flex flex-col"
      style={{ minHeight: '160px' }}
    >
      {/* Top row: relevance badge + journal */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            background: relevanceBg(score),
            color: relevanceColor(score),
          }}
        >
          {score}%
        </span>
        {paper.journal && (
          <span
            className="text-xs truncate"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--slate)',
              fontStyle: 'italic',
              maxWidth: '60%',
              textAlign: 'right',
            }}
          >
            {paper.journal}
          </span>
        )}
      </div>

      {/* Title */}
      <h4
        className="text-sm font-medium mb-3 leading-snug flex-1"
        style={{
          fontFamily: 'var(--font-body)',
          color: 'var(--ink)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {displayTitle}
      </h4>

      {/* Topics */}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto">
          {topics.slice(0, 2).map((t) => topicPill(t))}
        </div>
      )}
    </div>
  )
}

export default function LatestDigest() {
  const { data: papers = [] } = useDigest({ limit: 4 })

  // Don't render if no data
  if (!papers || papers.length === 0) return null

  const totalText =
    papers.length >= 4 ? 'Browse all papers' : `Browse ${papers.length} papers`

  return (
    <div style={{ background: 'var(--ice)' }}>
      <section className="py-8 sm:py-12 content-container">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Newspaper
                size={20}
                strokeWidth={1.5}
                style={{ color: 'var(--gold)' }}
                aria-hidden="true"
              />
              <h2
                className="text-xl sm:text-2xl"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                Latest Research Digest
              </h2>
            </div>
            <p
              className="text-sm sm:text-base"
              style={{ color: 'var(--slate)' }}
            >
              Today's PubMed papers relevant to our work
            </p>
          </div>
          <Link
            to="/digest"
            className="hidden sm:flex items-center gap-1.5 text-xs transition-colors duration-200"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--gold)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {totalText} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>

        {/* Paper cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {papers.slice(0, 4).map((paper) => (
            <PaperCard key={paper.id} paper={paper} />
          ))}
        </div>

        {/* Mobile link */}
        <div className="mt-6 text-center sm:hidden">
          <Link
            to="/digest"
            className="inline-flex items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-80"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--gold)',
              textDecoration: 'none',
            }}
          >
            {totalText}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  )
}
