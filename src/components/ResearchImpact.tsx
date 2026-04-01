import { useMemo } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { usePublications } from '../hooks/useApiData'
import PublicationTimeline from './PublicationTimeline'

// Journals considered "high impact" for display
const HIGH_IMPACT_JOURNALS = [
  'New England Journal of Medicine',
  'The Lancet Infectious Diseases',
  'The Lancet Respiratory Medicine',
  'Lancet Respiratory Medicine',
  'Lancet Healthy Longevity',
  'Intensive Care Medicine',
  'JAMA Network Open',
  'Annals of Surgery',
  'Critical Care Medicine',
  'American Journal of Respiratory and Critical Care Medicine',
]

export default function ResearchImpact() {
  const { data: publications = [] } = usePublications()
  const headingRef = useScrollReveal<HTMLDivElement>()
  const journalsRef = useScrollReveal<HTMLDivElement>()

  const publishedPubs = publications.filter((p) => p.status === 'Published')

  const journalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    publishedPubs.forEach((p) => {
      const j = p.journal
      counts[j] = (counts[j] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [publishedPubs])

  const highImpactCount = publishedPubs.filter((p) =>
    HIGH_IMPACT_JOURNALS.some((j) => p.journal.includes(j))
  ).length

  return (
    <section className="section-ink relative py-10 sm:py-14">
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: '1px', background: 'var(--gold)', opacity: 0.3 }}
      />

      <div className="content-container">
        <div ref={headingRef} className="fade-in-up text-center mb-8 sm:mb-10">
          <h2
            className="text-2xl sm:text-3xl mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            Research Output
          </h2>
          <p
            className="text-sm"
            style={{ color: 'rgba(255, 255, 255, 0.6)' }}
          >
            {publishedPubs.length} published papers across {Object.keys(
              publishedPubs.reduce((acc, p) => ({ ...acc, [p.journal]: true }), {} as Record<string, boolean>)
            ).length} journals
            {highImpactCount > 0 && ` \u00B7 ${highImpactCount} in high-impact journals`}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Publication timeline */}
          <div>
            <h3
              className="text-sm mb-4 text-center"
              style={{
                fontFamily: 'var(--font-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '11px',
              }}
            >
              Publications by Year
            </h3>
            <PublicationTimeline publications={publications} />
          </div>

          {/* Journal distribution */}
          <div ref={journalsRef} className="fade-in-up">
            <h3
              className="text-sm mb-4 text-center"
              style={{
                fontFamily: 'var(--font-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '11px',
              }}
            >
              Top Journals
            </h3>
            <div className="space-y-2">
              {journalCounts.map(([journal, count]) => {
                const isHighImpact = HIGH_IMPACT_JOURNALS.some((j) => journal.includes(j))
                const widthPercent = (count / journalCounts[0][1]) * 100
                return (
                  <div key={journal} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-xs truncate"
                          style={{
                            color: isHighImpact ? 'var(--gold)' : 'rgba(255, 255, 255, 0.7)',
                            fontFamily: 'var(--font-body)',
                            fontWeight: isHighImpact ? 500 : 400,
                          }}
                        >
                          {journal}
                        </span>
                      </div>
                      <div
                        className="h-1 rounded-full transition-all duration-700"
                        style={{
                          width: `${widthPercent}%`,
                          background: isHighImpact
                            ? 'var(--gold)'
                            : 'rgba(255, 255, 255, 0.2)',
                          opacity: isHighImpact ? 0.8 : 0.6,
                        }}
                      />
                    </div>
                    <span
                      className="flex-shrink-0 text-xs"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        color: 'rgba(255, 255, 255, 0.5)',
                        minWidth: '20px',
                        textAlign: 'right',
                      }}
                    >
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: '1px', background: 'var(--gold)', opacity: 0.3 }}
      />
    </section>
  )
}
