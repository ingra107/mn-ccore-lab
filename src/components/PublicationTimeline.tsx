import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
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

    const entries = Object.entries(counts)
      .map(([year, data]) => ({
        yearFull: Number(year),
        ...data,
        total: data.published + data.review + data.prep,
      }))
      .sort((a, b) => a.yearFull - b.yearFull)

    return entries.map(e => ({
      ...e,
      year: entries.length > 8 ? `'${String(e.yearFull).toString().slice(2)}` : String(e.yearFull),
    }))
  }, [publications])

  return (
    <div ref={ref} className="fade-in-up">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={yearData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="year"
            tick={{ fill: 'rgba(255, 255, 255, 0.6)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgba(255, 255, 255, 0.6)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              color: 'var(--ink)',
            }}
            labelStyle={{ color: 'var(--ink)', fontWeight: 500 }}
          />
          <Bar dataKey="published" stackId="pubs" fill="var(--gold)" fillOpacity={0.9} radius={[0, 0, 0, 0]} name="Published" />
          <Bar dataKey="review" stackId="pubs" fill="var(--gold)" fillOpacity={0.45} name="In Review" />
          <Bar dataKey="prep" stackId="pubs" fill="var(--gold)" fillOpacity={0.25} radius={[3, 3, 0, 0]} name="In Prep" />
        </BarChart>
      </ResponsiveContainer>

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
