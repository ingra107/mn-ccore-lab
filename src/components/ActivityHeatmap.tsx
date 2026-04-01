import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

interface ActivityHeatmapProps {
  slug?: string
  days?: number
}

const DAY_SIZE = 12
const DAY_GAP = 2
const CELL = DAY_SIZE + DAY_GAP

export default function ActivityHeatmap({ slug, days = 90 }: ActivityHeatmapProps) {
  const { data: heatmapData = {} } = useQuery({
    queryKey: ['activity-heatmap', slug, days],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (slug) params.set('slug', slug)
      params.set('days', String(days))
      const res = await fetch(`/api/activity/heatmap?${params}`)
      if (!res.ok) return {}
      const json = await res.json()
      return json.data as Record<string, number>
    },
    staleTime: 5 * 60 * 1000,
  })

  // Build grid: weeks as columns, days as rows (Sun=0 at top)
  const { cells, weeks, maxCount, totalContributions } = useMemo(() => {
    const end = new Date()
    const start = new Date(end.getTime() - days * 86400000)
    const cellList: { date: string; count: number; dayOfWeek: number; weekIndex: number }[] = []
    let maxC = 0
    let total = 0

    const d = new Date(start)
    // Align to start of week (Sunday)
    d.setDate(d.getDate() - d.getDay())

    let weekIdx = 0
    while (d <= end) {
      const iso = d.toISOString().split('T')[0]
      const count = heatmapData[iso] || 0
      if (count > maxC) maxC = count
      total += count
      cellList.push({ date: iso, count, dayOfWeek: d.getDay(), weekIndex: weekIdx })

      d.setDate(d.getDate() + 1)
      if (d.getDay() === 0) weekIdx++
    }

    return { cells: cellList, weeks: weekIdx + 1, maxCount: maxC, totalContributions: total }
  }, [heatmapData, days])

  const getColor = (count: number) => {
    if (count === 0) return 'var(--border-light)'
    if (maxCount === 0) return 'var(--border-light)'
    const intensity = count / maxCount
    if (intensity > 0.75) return 'var(--teal)'
    if (intensity > 0.5) return 'rgba(45,138,138,0.7)'
    if (intensity > 0.25) return 'rgba(45,138,138,0.4)'
    return 'rgba(45,138,138,0.2)'
  }

  const monthLabels = useMemo(() => {
    const labels: { label: string; weekIndex: number }[] = []
    let lastMonth = -1
    for (const cell of cells) {
      if (cell.dayOfWeek !== 0) continue
      const month = new Date(cell.date + 'T12:00:00').getMonth()
      if (month !== lastMonth) {
        lastMonth = month
        labels.push({
          label: new Date(cell.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }),
          weekIndex: cell.weekIndex,
        })
      }
    }
    return labels
  }, [cells])

  const svgWidth = weeks * CELL + 20
  const svgHeight = 7 * CELL + 20

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
          {totalContributions} contribution{totalContributions !== 1 ? 's' : ''} in the last {days} days
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.3 }}>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
            <div
              key={intensity}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: intensity === 0 ? 'var(--border-light)' : `rgba(45,138,138,${0.2 + intensity * 0.8})`,
              }}
            />
          ))}
          <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.3 }}>More</span>
        </div>
      </div>

      {/* Heatmap SVG */}
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text key={i} x={m.weekIndex * CELL} y={10} fontSize={9} fontFamily="var(--font-sans)" fill="var(--slate)" opacity={0.4}>
              {m.label}
            </text>
          ))}

          {/* Day cells */}
          {cells.map((cell, i) => (
            <rect
              key={i}
              x={cell.weekIndex * CELL}
              y={cell.dayOfWeek * CELL + 14}
              width={DAY_SIZE}
              height={DAY_SIZE}
              rx={2}
              fill={getColor(cell.count)}
              style={{ transition: 'fill 150ms ease' }}
            >
              <title>{cell.date}: {cell.count} contribution{cell.count !== 1 ? 's' : ''}</title>
            </rect>
          ))}
        </svg>
      </div>
    </div>
  )
}
