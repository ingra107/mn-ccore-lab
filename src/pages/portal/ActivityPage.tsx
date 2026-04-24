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
import InlineSelect from '../../components/InlineSelect'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { isProductionVisibleActivity } from '../../lib/isProductionVisible'

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
  const [filterPerson, setFilterPerson] = useState('')
  const { data: rawActivity = [], isLoading } = useActivity(200)
  const allActivity = useMemo(
    () => rawActivity.filter((a) => isProductionVisibleActivity({ description: a.description })),
    [rawActivity],
  )

  // Unique actors for person filter
  const actors = useMemo(() => {
    const slugs = [...new Set(allActivity.map(a => a.actor).filter(Boolean))] as string[]
    return slugs.map(slug => ({ slug, name: getPersonInfo(slug).name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allActivity])

  // Most active person
  const mostActive = useMemo(() => {
    if (allActivity.length === 0) return null
    const counts = new Map<string, number>()
    for (const a of allActivity) {
      if (a.actor) counts.set(a.actor, (counts.get(a.actor) || 0) + 1)
    }
    let best = '', max = 0
    for (const [slug, count] of counts) {
      if (count > max) { best = slug; max = count }
    }
    return best ? getPersonInfo(best).name.split(' ')[0] : null
  }, [allActivity])

  const filtered = useMemo(() => {
    let result = allActivity
    if (filterType) result = result.filter((a) => a.type === filterType)
    if (filterPerson) result = result.filter((a) => a.actor === filterPerson)
    return result
  }, [allActivity, filterType, filterPerson])

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
  useEffect(() => { setFocusedIndex(-1) }, [filterType, filterPerson])

  return (
    <div>
      <PageHeader
        icon={<ActivityIcon size={20} />}
        title="Activity"
        subtitle={`${filtered.length}${filterType || filterPerson ? ` of ${allActivity.length}` : ''} recent actions${mostActive ? ` · Most active: ${mostActive}` : ''}`}
        count={allActivity.length}
        actions={
          <div className="flex items-center gap-2">
            <InlineSelect
              value={filterPerson}
              options={[{ value: '', label: 'All People' }, ...actors.map(a => ({ value: a.slug, label: a.name }))]}
              onChange={setFilterPerson}
              alwaysShowChevron
            />
            <InlineSelect
              value={filterType}
              options={typeOptions}
              onChange={setFilterType}
              alwaysShowChevron
            />
          </div>
        }
      />

      {/* H-05: compressed activity feed — single row per entry. CLS fix (C8): reserve viewport height */}
      <div className="mt-5 flex flex-col gap-6" style={{ minHeight: 'calc(100vh - 240px)' }}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xl)' }}>
            {[1, 2, 3].map((groupIdx) => (
              <div key={groupIdx}>
                <div style={{ marginBottom: 'var(--sp-sm)' }}>
                  <TextSkeleton lines={1} widths={['120px']} />
                </div>
                {/* Skeleton rows match actual 36px activity row (avatar + text) */}
                <div style={{ borderLeft: '2px solid var(--border-subtle)', paddingLeft: 'var(--sp-md)' }}>
                  {Array.from({ length: 8 }).map((_, rowIdx) => (
                    <div
                      key={rowIdx}
                      aria-hidden="true"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-sm)',
                        minHeight: 36,
                        paddingTop: 'var(--sp-xs)',
                        paddingBottom: 'var(--sp-xs)',
                        paddingLeft: 'var(--sp-md)',
                        paddingRight: 'var(--sp-md)',
                        opacity: 0.85,
                      }}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', flexShrink: 0 }} />
                      <div style={{ flex: 1, height: 10, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }} />
                      <div style={{ width: 60, height: 10, background: 'var(--surface-2)', borderRadius: 'var(--radius-full)' }} />
                      <div style={{ width: 40, height: 10, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }} />
                    </div>
                  ))}
                </div>
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
                <motion.div className="flex flex-col border-l-2" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-subtle)', paddingLeft: 'var(--sp-md)' }} variants={staggerContainer} initial="hidden" animate="visible">
                  {items.map((item) => {
                    const person = item.actor ? getPersonInfo(item.actor) : null
                    const isFocused = focusedIndex === flatIndex
                    flatIndex++
                    return (
                      /* Single-row layout: 24px avatar + action text + type badge + relative time */
                      <motion.div
                        key={item.id}
                        variants={staggerItem}
                        className={`flex items-center gap-2 px-3 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors${isFocused ? ' task-row-focused' : ''}`}
                        style={{ minHeight: 36, paddingTop: 'var(--sp-xs)', paddingBottom: 'var(--sp-xs)' }}
                      >
                        {person ? (
                          <ActivityAvatar slug={item.actor!} />
                        ) : (
                          <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24, backgroundColor: 'var(--ice)' }}>
                            <span style={{ fontSize: 'var(--text-micro)', color: 'var(--slate)' }}>SYS</span>
                          </div>
                        )}
                        <p className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--ink)', lineHeight: 1.35 }}>
                          {person && <span style={{ fontWeight: 500 }}>{person.name} </span>}
                          {item.description}
                        </p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize flex-shrink-0" style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-hover)' }}>
                          {item.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--slate)', opacity: 0.75, minWidth: 48, textAlign: 'right' }}>
                          {formatRelativeTime(item.timestamp)}
                        </span>
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
            title={filterType ? 'No matches for that filter' : 'A quiet day in the lab'}
            subtitle={filterType
              ? `Nothing matches the ${typeOptions.find(o => o.value === filterType)?.label.toLowerCase()} filter right now. Try 'All' or pick a different type.`
              : 'Task completions, status changes, comments, and project updates will stream in here as the team works.'}
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
      style={{ width: 24, height: 24, flexShrink: 0, position: 'relative' }}
      onMouseEnter={hoverCard.handlers.onMouseEnter}
      onMouseLeave={hoverCard.handlers.onMouseLeave}
    >
      <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="tight" variant="ice" />
      <HoverCard data={data} isVisible={hoverCard.isVisible} position={hoverCard.position} cardRef={hoverCard.cardRef} cardHandlers={hoverCard.cardHandlers} />
    </div>
  )
}
