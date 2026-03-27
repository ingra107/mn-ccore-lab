import { useState, useMemo } from 'react'
import { useActivity } from '../../hooks/useApiData'
import Avatar from '../../components/Avatar'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime, formatMediumDate } from '../../lib/dateUtils'
import SectionHeader from '../../components/SectionHeader'

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'task', label: 'Tasks' },
  { value: 'comment', label: 'Comments' },
  { value: 'project', label: 'Projects' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'idea', label: 'Ideas' },
]

export default function ActivityPage() {
  const [filterType, setFilterType] = useState('')
  const { data: allActivity = [] } = useActivity(100)

  const filtered = useMemo(() => {
    if (!filterType) return allActivity
    return allActivity.filter((a) => a.type === filterType)
  }, [allActivity, filterType])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const item of filtered) {
      const date = item.timestamp.split('T')[0]
      const list = map.get(date) || []
      list.push(item)
      map.set(date, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  return (
    <div>
      <SectionHeader title="Activity" subtitle="Recent actions across the lab" />

      {/* Filters */}
      <div className="mt-5 flex items-center gap-3">
        {typeOptions.map((opt) => {
          const active = filterType === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className="px-3 py-1.5 rounded-md text-sm border transition-colors"
              style={{
                borderColor: active ? 'var(--teal)' : 'var(--border-light)',
                backgroundColor: active ? 'rgba(45,138,138,0.1)' : 'transparent',
                color: active ? 'var(--teal)' : 'var(--slate)',
                fontFamily: 'var(--font-sans)',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Activity feed */}
      <div className="mt-5 flex flex-col gap-6">
        {grouped.map(([date, items]) => {
          const isToday = date === new Date().toISOString().split('T')[0]
          return (
            <div key={date}>
              <h3 className="text-sm font-semibold mb-2" style={{ fontFamily: 'var(--font-display)', color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
                {isToday ? 'Today' : formatMediumDate(date)}
              </h3>
              <div className="flex flex-col gap-1 pl-4 border-l-2" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-light)' }}>
                {items.map((item) => {
                  const person = item.actor ? getPersonInfo(item.actor) : null
                  return (
                    <div key={item.id} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-black/[0.02] transition-colors">
                      {person ? (
                        <div style={{ width: 28, height: 28, flexShrink: 0 }}>
                          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-7 !h-7 !min-w-0 !min-h-0 !text-[8px]" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--ice)' }}>
                          <span className="text-[8px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}>SYS</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                          {person && <span className="font-medium">{person.name} </span>}
                          {item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.06)' }}>
                            {item.type}
                          </span>
                          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>
                            {formatRelativeTime(item.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {grouped.length === 0 && (
          <div className="text-center py-16 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
            No activity yet
          </div>
        )}
      </div>
    </div>
  )
}
