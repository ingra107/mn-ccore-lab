import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { publications } from '../data/publications'

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Published':
      return 'badge-published'
    case 'In Review':
      return 'badge-review'
    case 'In Preparation':
      return 'badge-preparation'
    default:
      return 'badge-active'
  }
}

export default function FeaturedResearch() {
  const featured = publications.filter((p) => p.featured)
  const nonFeatured = publications.filter((p) => !p.featured)

  // Fill grid to always show 3 cards
  const spotlightCards = [...featured]
  if (spotlightCards.length < 3) {
    const latest = nonFeatured
      .sort((a, b) => b.year - a.year)
      .slice(0, 3 - spotlightCards.length)
    spotlightCards.push(...latest)
  }

  const totalCount = publications.length

  return (
    <section
      className="py-12 sm:py-16 lg:py-20"
      style={{ background: 'linear-gradient(135deg, var(--ice) 0%, var(--gold-light) 100%)' }}
    >
      <div className="content-container">
        {/* Header */}
        <div className="mb-8 sm:mb-12 max-w-2xl">
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl mb-3 sm:mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Featured Research
          </h2>
          <p
            className="text-base sm:text-lg"
            style={{ color: 'var(--slate)' }}
          >
            Highlighted publications advancing critical care science and
            multi-center data infrastructure.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {spotlightCards.map((pub) => (
            <div
              key={pub.id}
              className="card p-5 sm:p-6 flex flex-col cursor-default"
              style={{ minHeight: '260px' }}
            >
              {/* Top badges row */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className="inline-block px-2 py-0.5 rounded text-xs"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--gold)',
                    color: 'var(--ink)',
                  }}
                >
                  {pub.year}
                </span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(pub.status)}`}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {pub.status}
                </span>
              </div>

              {/* Title */}
              <h3
                className="text-base font-semibold mb-2 leading-snug"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--ink)',
                }}
              >
                {pub.title}
              </h3>

              {/* Authors */}
              <p
                className="text-sm mb-1 truncate"
                style={{ color: 'var(--slate)' }}
              >
                {pub.authors}
              </p>

              {/* Journal */}
              <p
                className="text-sm italic mb-3"
                style={{ color: 'var(--slate)' }}
              >
                {pub.journal}
              </p>

              {/* Abstract preview */}
              {pub.abstract && (
                <p
                  className="text-sm mb-4 flex-1"
                  style={{
                    color: 'var(--slate)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {pub.abstract}
                </p>
              )}

              {/* Read more link */}
              <div className="mt-auto pt-2">
                <Link
                  to="/publications"
                  className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer transition-opacity duration-200 hover:opacity-80"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: 'var(--gold)',
                    textDecoration: 'none',
                  }}
                >
                  Read more
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* View all link */}
        <div className="mt-8 sm:mt-10 text-center">
          <Link
            to="/publications"
            className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer transition-opacity duration-200 hover:opacity-80"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--gold)',
              textDecoration: 'none',
            }}
          >
            View all {totalCount} publications
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
