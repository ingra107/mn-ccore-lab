import { ExternalLink, BookOpen } from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'

interface Publication {
  authors: string
  title: string
  journal: string
  year: number
  doi?: string
}

const samplePubs: Publication[] = [
  {
    authors: 'Ingraham NE, Collins C, Dudley RA, et al.',
    title:
      'Provider-Level Variation in Lung-Protective Ventilation Practices in the ICU',
    journal: 'American Journal of Respiratory and Critical Care Medicine',
    year: 2025,
    doi: 'https://doi.org/',
  },
  {
    authors: 'Ingraham NE, Tignanelli CJ, et al.',
    title:
      'Ventilation Mode Transitions and Outcomes in Mechanically Ventilated ICU Patients',
    journal: 'JAMIA',
    year: 2025,
    doi: 'https://doi.org/',
  },
  {
    authors: 'Mesfin N, Ingraham NE, et al.',
    title:
      'Chronic Critical Illness in ARDS: Incidence, Risk Factors, and Outcomes',
    journal: 'CHEST',
    year: 2025,
    doi: 'https://doi.org/',
  },
  {
    authors: 'Ingraham NE, Bromley E, et al.',
    title:
      'Association of General Decision-Making Style with Lung-Protective Ventilation Adherence',
    journal: 'In preparation',
    year: 2026,
  },
]

export default function Publications() {
  const pubsRef = useScrollRevealGroup('.fade-in-up', 100)

  return (
    <>
      {/* Header */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <h1
          className="text-4xl sm:text-5xl mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--ink)',
          }}
        >
          Publications
        </h1>
        <p
          className="text-lg max-w-2xl"
          style={{ color: 'var(--slate)' }}
        >
          Selected publications from MN-CCORE lab members. Full publication list
          coming soon.
        </p>
      </section>

      <SectionDivider />

      {/* Publication List */}
      <section
        className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        ref={pubsRef}
      >
        {/* Coming soon notice */}
        <div
          className="fade-in-up mb-12 p-6 rounded-lg text-center"
          style={{
            background: 'var(--ice)',
            border: '1px solid rgba(201, 168, 76, 0.15)',
          }}
        >
          <BookOpen
            size={24}
            className="mx-auto mb-3"
            style={{ color: 'var(--gold)' }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--ink)' }}
          >
            Full publication list coming soon
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: 'var(--slate)' }}
          >
            Below are selected recent publications and works in progress
          </p>
        </div>

        <div className="space-y-4">
          {samplePubs.map((pub) => (
            <div
              key={pub.title}
              className="fade-in-up card p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Journal + Year */}
                <div className="flex-shrink-0 flex sm:flex-col items-center sm:items-start gap-2 sm:w-48">
                  <span
                    className="text-xs font-medium px-2 py-1 rounded"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(201, 168, 76, 0.1)',
                      color: 'var(--gold)',
                    }}
                  >
                    {pub.year}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontStyle: 'italic',
                      color: 'var(--slate)',
                    }}
                  >
                    {pub.journal}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm mb-2"
                    style={{ color: 'var(--slate)' }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {pub.authors.split(',')[0]}
                    </span>
                    {pub.authors.includes(',') &&
                      `, ${pub.authors.split(',').slice(1).join(',')}`}
                  </p>
                  <h3
                    className="text-base font-semibold leading-tight mb-2"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: 'var(--ink)',
                    }}
                  >
                    {pub.title}
                  </h3>
                  {pub.doi && (
                    <a
                      href={pub.doi}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer inline-flex items-center gap-1 text-xs transition-colors duration-200"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--maroon)',
                      }}
                    >
                      DOI <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
