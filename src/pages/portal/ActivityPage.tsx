import { useState, useMemo } from 'react'
import { Activity as ActivityIcon } from 'lucide-react'
import { useActivity } from '../../hooks/useApiData'
import Avatar from '../../components/Avatar'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime, formatMediumDate } from '../../lib/dateUtils'
import SectionHeader from '../../components/SectionHeader'

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'task', label: 'Tasks' },
  { value: 'comment', label: 'Comments' },
  { value: 'project_update', label: 'Updates' },
  { value: 'project', label: 'Projects' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'idea', label: 'Ideas' },
]

export default function ActivityPage() {
  const [filterType, setFilterType] = useState('')
  const { data: allActivity = [] } = useActivity(200)

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionHeader title="Activity" subtitle="Recent actions across the lab" />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-full border px-3 py-1.5 text-xs mt-2"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: filterType ? 'var(--teal)' : 'var(--slate)',
            backgroundColor: filterType ? 'rgba(45,138,138,0.06)' : 'transparent',
            borderColor: filterType ? 'var(--teal)' : 'var(--border-light)',
            cursor: 'pointer',
            appearance: 'none' as const,
            WebkitAppearance: 'none' as const,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            paddingRight: '24px',
          }}
        >
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Activity feed */}
      <div className="mt-5 flex flex-col gap-6">
        {grouped.map(([date, items]) => {
          const today = new Date().toISOString().split('T')[0]
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
          const isToday = date === today
          const isYesterday = date === yesterday
          const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : formatMediumDate(date)
          return (
            <div key={date}>
              <h3 className="text-sm font-semibold mb-2" style={{ fontFamily: 'var(--font-display)', color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
                {label}
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
          <div className="text-center py-16">
            <ActivityIcon size={40} style={{ color: 'var(--border-light)', margin: '0 auto 12px' }} />
            <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              {filterType ? 'No matching activity' : 'No activity yet'}
            </p>
            <p className="text-xs mt-1 max-w-xs mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
              {filterType
                ? `No ${typeOptions.find(o => o.value === filterType)?.label.toLowerCase()} activity found. Try a different filter.`
                : 'Activity from tasks, meetings, project updates, and ideas will appear here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
