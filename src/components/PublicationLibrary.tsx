import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Publication } from '../data/types'

const JOURNAL_COLORS: Record<string, string> = {
  'Critical Care Medicine': 'var(--maroon)',
  'Intensive Care Medicine': 'var(--teal)',
  'JAMA Network Open': 'var(--gold)',
  'Chest': 'var(--orange)',
  'Annals of the American Thoracic Society': 'var(--green)',
}

function getJournalAccent(journal: string): string {
  for (const [key, color] of Object.entries(JOURNAL_COLORS)) {
    if (journal.includes(key)) return color
  }
  return 'var(--slate)'
}

interface PublicationLibraryProps {
  publications: Publication[]
}

export default function PublicationLibrary({ publications }: PublicationLibraryProps) {
  const grouped = useMemo(() => {
    const map = new Map<number, Publication[]>()
    for (const pub of publications) {
      const year = pub.year
      if (!map.has(year)) map.set(year, [])
      map.get(year)!.push(pub)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [publications])

  return (
    <div className="flex flex-col gap-8">
      {grouped.map(([year, pubs]) => (
        <div key={year}>
          <div className="flex items-center gap-3 mb-3">
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              {year}
            </span>
            <span
              style={{
                fontSize: 'var(--label-size)',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
              }}
            >
              {pubs.length} paper{pubs.length !== 1 ? 's' : ''}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(201, 168, 76, 0.2)' }} />
          </div>

          {/* Horizontal scroll */}
          <div
            className="flex gap-4 pb-2"
            style={{
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
            }}
          >
            {pubs.map((pub) => {
              const accent = getJournalAccent(pub.journal)
              const link = pub.doi ? `https://doi.org/${pub.doi}` : pub.pubmed ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pubmed}` : null

              return (
                <a
                  key={pub.id}
                  href={link || `/publications/${pub.id}`}
                  target={link ? '_blank' : undefined}
                  rel={link ? 'noopener noreferrer' : undefined}
                  className="flex-shrink-0 rounded-xl transition-all duration-200"
                  style={{
                    width: '180px',
                    height: '260px',
                    scrollSnapAlign: 'start',
                    background: `linear-gradient(135deg, var(--ice) 0%, color-mix(in srgb, ${accent} 8%, var(--ice)) 100%)`,
                    border: '1px solid var(--border-subtle)',
                    padding: '16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {/* Accent stripe */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '3px',
                      background: accent,
                      opacity: 0.7,
                    }}
                  />

                  {/* Journal */}
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: accent,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '8px',
                      lineHeight: 1.3,
                    }}
                  >
                    {pub.journal.length > 40 ? pub.journal.slice(0, 38) + '...' : pub.journal}
                  </span>

                  {/* Title */}
                  <p
                    style={{
                      fontSize: '12px',
                      fontWeight: 'var(--label-weight)',
                      color: 'var(--ink)',
                      lineHeight: 1.4,
                      margin: 0,
                      flex: 1,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {pub.title}
                  </p>

                  {/* Footer: first author + link icon */}
                  <div className="flex items-end justify-between mt-2" style={{ minHeight: '20px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--slate)',
                        opacity: 0.7,
                      }}
                    >
                      {pub.authors.split(',')[0]?.trim() || ''}
                    </span>
                    {link && (
                      <ExternalLink size={11} style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)', flexShrink: 0 }} />
                    )}
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
