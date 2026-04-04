import { useMemo } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'
import type { Publication } from '../data/types'

interface PublicationTimelineProps {
  publications: Publication[]
}

export default function PublicationTimeline({ publications }: PublicationTimelineProps) {
  const ref = useScrollReveal<HTMLDivElement>()

  const yearData = useMemo(() => {
    const counts: Record<number, { published: number; review: number; prep: number }> = {}

    // Get year range
    const years = publications.map((p) => p.year)
    const minYear = Math.min(...years)
    const maxYear = Math.max(...years)

    for (let y = minYear; y <= maxYear; y++) {
      counts[y] = { published: 0, review: 0, prep: 0 }
    }

    publications.forEach((p) => {
      if (!counts[p.year]) counts[p.year] = { published: 0, review: 0, prep: 0 }
      if (p.status === 'Published') counts[p.year].published++
      else if (p.status === 'In Review') counts[p.year].review++
      else counts[p.year].prep++
    })

    return Object.entries(counts)
      .map(([year, data]) => ({
        year: Number(year),
        ...data,
        total: data.published + data.review + data.prep,
      }))
      .sort((a, b) => a.year - b.year)
  }, [publications])

  const maxTotal = Math.max(...yearData.map((d) => d.total), 1)

  return (
    <div ref={ref} className="fade-in-up">
      <div className="flex items-end gap-2 sm:gap-3" style={{ height: '160px' }}>
        {yearData.map((d) => {
          const publishedHeight = (d.published / maxTotal) * 100
          const reviewHeight = (d.review / maxTotal) * 100
          const prepHeight = (d.prep / maxTotal) * 100

          return (
            <div
              key={d.year}
              className="flex-1 flex flex-col items-center gap-1 group"
            >
              {/* Bar */}
              <div
                className="w-full relative flex flex-col justify-end rounded-t-sm overflow-hidden transition-all duration-300"
                style={{ height: '120px' }}
              >
                {/* Published */}
                <div
                  className="w-full transition-all duration-500 ease-out"
                  style={{
                    height: `${publishedHeight}%`,
                    background: 'var(--gold)',
                    opacity: 0.9,
                  }}
                />
                {/* In Review */}
                {reviewHeight > 0 && (
                  <div
                    className="w-full"
                    style={{
                      height: `${reviewHeight}%`,
                      background: 'var(--gold)',
                      opacity: 0.5,
                    }}
                  />
                )}
                {/* In Prep */}
                {prepHeight > 0 && (
                  <div
                    className="w-full"
                    style={{
                      height: `${prepHeight}%`,
                      background: 'var(--gold)',
                      opacity: 0.25,
                    }}
                  />
                )}

                {/* Count label on hover */}
                {d.total > 0 && (
                  <div
                    className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      fontSize: '11px',
                      color: 'var(--gold)',
                      fontWeight: 600,
                    }}
                  >
                    {d.total}
                  </div>
                )}
              </div>

              {/* Year label */}
              <span
                className="text-center"
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  writingMode: yearData.length > 8 ? 'vertical-rl' : undefined,
                  transform: yearData.length > 8 ? 'rotate(180deg)' : undefined,
                }}
              >
                {yearData.length > 8 ? `'${String(d.year).slice(2)}` : d.year}
              </span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--gold)', opacity: 0.9 }} />
          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
            Published
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--gold)', opacity: 0.4 }} />
          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
            In Review / Prep
          </span>
        </div>
      </div>
    </div>
  )
}
