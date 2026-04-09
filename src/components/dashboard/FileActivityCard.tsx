import { useMemo } from 'react'
import { FileCode } from 'lucide-react'
import { useFileActivityHeatmap } from '../../hooks/useApiData'
import BentoCard from './BentoCard'

interface HeatmapDay {
  date: string
  total_events: number
}

export default function FileActivityCard() {
  const { data, isLoading } = useFileActivityHeatmap(90)

  const days: HeatmapDay[] = (data as HeatmapDay[] | undefined) ?? []

  const { grid, totalThisWeek } = useMemo(() => {
    // Build a 13 weeks x 7 days grid (91 cells)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Map of date -> total_events for quick lookup
    const dayMap = new Map<string, number>()
    for (const d of days) {
      dayMap.set(d.date, d.total_events)
    }

    // Build grid: 13 columns (weeks) x 7 rows (days of week)
    // Start from 90 days ago, aligned to Sunday
    const startDate = new Date(today.getTime() - 90 * 86400000)
    // Align to previous Sunday
    const dayOfWeek = startDate.getDay()
    const alignedStart = new Date(startDate.getTime() - dayOfWeek * 86400000)

    const weeks: { date: string; events: number; isToday: boolean }[][] = []
    let weekThisWeek = 0
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    for (let w = 0; w < 13; w++) {
      const week: { date: string; events: number; isToday: boolean }[] = []
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(alignedStart.getTime() + (w * 7 + d) * 86400000)
        const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`
        const events = dayMap.get(dateStr) ?? 0
        const isToday = dateStr === todayStr

        // Count this week's total
        if (w === 12) weekThisWeek += events

        week.push({ date: dateStr, events, isToday })
      }
      weeks.push(week)
    }

    return { grid: weeks, totalThisWeek: weekThisWeek }
  }, [days])

  // Color intensity by total_events
  function getCellColor(events: number, isToday: boolean): string {
    if (isToday) return 'rgba(45,138,138,1)'
    if (events === 0) return 'var(--border-subtle)'
    if (events <= 5) return 'rgba(45,138,138,0.25)'
    if (events <= 20) return 'rgba(45,138,138,0.5)'
    return 'rgba(45,138,138,0.8)'
  }

  return (
    <BentoCard
      title="File Activity"
      icon={FileCode}
      size="span-2"
      subtitle={isLoading ? 'Loading...' : `${totalThisWeek} files this week`}
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 rounded" style={{ background: 'var(--border-subtle)', width: `${50 + i * 15}%` }} />
          ))}
        </div>
      ) : (
        <div>
          {/* Heatmap grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(13, 1fr)',
              gridTemplateRows: 'repeat(7, 1fr)',
              gap: 2,
            }}
          >
            {/* Render column by column (week by week), row by row (day) */}
            {Array.from({ length: 7 }, (_, dayIdx) =>
              grid.map((week, weekIdx) => {
                const cell = week[dayIdx]
                if (!cell) return null
                return (
                  <div
                    key={`${weekIdx}-${dayIdx}`}
                    title={`${cell.date}: ${cell.events} events`}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 2,
                      backgroundColor: getCellColor(cell.events, cell.isToday),
                      transition: 'background-color 150ms ease',
                      gridColumn: weekIdx + 1,
                      gridRow: dayIdx + 1,
                    }}
                  />
                )
              })
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 mt-2 justify-end">
            <span className="text-[9px]" style={{ color: 'var(--slate)', opacity: 0.5 }}>Less</span>
            {[0, 3, 10, 25].map((v, i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  backgroundColor: getCellColor(v, false),
                }}
              />
            ))}
            <span className="text-[9px]" style={{ color: 'var(--slate)', opacity: 0.5 }}>More</span>
          </div>
        </div>
      )}
    </BentoCard>
  )
}
