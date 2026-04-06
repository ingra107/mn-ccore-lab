import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Activity as ActivityIcon } from 'lucide-react'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { useActivity } from '../../hooks/useApiData'
import Avatar from '../../components/Avatar'
import HoverCard from '../../components/HoverCard'
import type { HoverCardData } from '../../components/HoverCard'
import { useHoverCard } from '../../hooks/useHoverCard'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { getPersonInfo, getMemberBySlug, directors } from '../../data/team'
import { formatRelativeTime, formatMediumDate } from '../../lib/dateUtils'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { staggerContainer, staggerItem } from '../../lib/animations'

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
  const { data: allActivity = [], isLoading } = useActivity(200)

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

  const [focusedIndex, setFocusedIndex] = useState(-1)

  useListKeyboardNav({
    itemCount: filtered.length,
    focusedIndex,
    setFocusedIndex,
  })

  // Reset focus when filter changes
  useEffect(() => { setFocusedIndex(-1) }, [filterType])

  return (
    <div>
      <PageHeader
        icon={<ActivityIcon size={20} />}
        title="Activity"
        subtitle={`${allActivity.length} recent actions across the lab`}
        count={allActivity.length}
        actions={
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-full border px-3 py-1.5 text-xs"
            style={{
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
        }
      />

      {/* Activity feed */}
      <div className="mt-5 flex flex-col gap-6">
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div style={{ marginBottom: 8 }}>
                  <TextSkeleton lines={1} widths={['120px']} />
                </div>
                <TextSkeleton lines={4} widths={['100%', '90%', '85%', '70%']} />
              </div>
            ))}
          </div>
        )}
        {!isLoading && (() => {
          let flatIndex = 0
          return grouped.map(([date, items]) => {
            const today = new Date().toISOString().split('T')[0]
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
            const isToday = date === today
            const isYesterday = date === yesterday
            const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : formatMediumDate(date)
            return (
              <div key={date}>
                <h3 className="text-sm font-normal mb-2" style={{ color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
                  {label}
                </h3>
                <motion.div className="flex flex-col gap-1 pl-4 border-l-2" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-subtle)' }} variants={staggerContainer} initial="hidden" animate="visible">
                  {items.map((item) => {
                    const person = item.actor ? getPersonInfo(item.actor) : null
                    const isFocused = focusedIndex === flatIndex
                    flatIndex++
                    return (
                      <motion.div key={item.id} variants={staggerItem} className={`flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors${isFocused ? ' task-row-focused' : ''}`}>
                        {person ? (
                          <ActivityAvatar slug={item.actor!} />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--ice)' }}>
                            <span className="text-[8px]" style={{ color: 'var(--slate)' }}>SYS</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: 'var(--ink)' }}>
                            {person && <span className="font-medium">{person.name} </span>}
                            {item.description}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize" style={{ color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.06)' }}>
                              {item.type}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.4 }}>
                              {formatRelativeTime(item.timestamp)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              </div>
            )
          })
        })()}
        {!isLoading && grouped.length === 0 && (
          <EmptyState
            icon={<ActivityIcon size={40} />}
            title={filterType ? 'No matching activity' : 'No activity yet'}
            subtitle={filterType
              ? `No ${typeOptions.find(o => o.value === filterType)?.label.toLowerCase()} activity found. Try a different filter.`
              : 'Task completions, status changes, comments, and project updates will stream here as the team works.'}
          />
        )}
      </div>
    </div>
  )
}

function ActivityAvatar({ slug }: { slug: string }) {
  const p = getPersonInfo(slug)
  const hoverCard = useHoverCard()
  const dir = directors.find(d => d.slug === slug)
  const member = getMemberBySlug(slug)
  const data: HoverCardData = { type: 'member', name: p.name, role: dir?.role || member?.role, photoUrl: p.photoUrl, initials: p.initials }

  return (
    <div
      ref={hoverCard.triggerRef as React.RefObject<HTMLDivElement>}
      style={{ width: 28, height: 28, flexShrink: 0 }}
      onMouseEnter={hoverCard.handlers.onMouseEnter}
      onMouseLeave={hoverCard.handlers.onMouseLeave}
    >
      <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="sm" variant="ice" className="!w-7 !h-7 !min-w-0 !min-h-0 !text-[8px]" />
      <HoverCard data={data} isVisible={hoverCard.isVisible} position={hoverCard.position} cardRef={hoverCard.cardRef} cardHandlers={hoverCard.cardHandlers} />
    </div>
  )
}
