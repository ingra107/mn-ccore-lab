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
import { formatRelativeTime, formatMediumDate, localDateKey } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import EmptyState from '../../components/EmptyState'
import InlineSelect from '../../components/InlineSelect'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { isProductionVisibleActivity } from '../../lib/isProductionVisible'
import { ICON_PROPS } from '../../lib/iconProps'
import { QueryErrorNote } from '../../components/QueryErrorNote'

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
  // T-23 type filter is now multi-select via chip strip (OR semantics).
  // Shift-click a chip to add/remove; plain click selects just that one.
  // Person filter stays as InlineSelect (too many members for chips).
  const [filterTypes, setFilterTypes] = useState<string[]>([])
  const toggleType = (t: string, multi: boolean) => {
    setFilterTypes((prev) => {
      if (multi) return prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
      return prev.length === 1 && prev[0] === t ? [] : [t]
    })
  }
  const [filterPerson, setFilterPerson] = useState('')
  // S5: windowed load — render a bounded page, "Load more" reveals the next
  // chunk. The page previously rendered all 200 rows at ~14.7K px tall.
  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const { data: rawActivity = [], isLoading, isError, refetch } = useActivity(200)
  const allActivity = useMemo(
    () => rawActivity.filter((a) => isProductionVisibleActivity({ description: a.description })),
    [rawActivity],
  )

  // S5: an actor is "real" only if it resolves to a person. Empty / literal
  // 'anonymous' rows (legacy unauthed writes) are system rows, not people.
  const isRealActor = (actor: string | null | undefined): actor is string =>
    !!actor && actor !== 'anonymous'

  // Unique actors for person filter
  const actors = useMemo(() => {
    const slugs = [...new Set(allActivity.map(a => a.actor).filter(isRealActor))]
    return slugs.map(slug => ({ slug, name: getPersonInfo(slug).name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allActivity])

  // Most active person
  const mostActive = useMemo(() => {
    if (allActivity.length === 0) return null
    const counts = new Map<string, number>()
    for (const a of allActivity) {
      if (isRealActor(a.actor)) counts.set(a.actor, (counts.get(a.actor) || 0) + 1)
    }
    let best = '', max = 0
    for (const [slug, count] of counts) {
      if (count > max) { best = slug; max = count }
    }
    return best ? getPersonInfo(best).name.split(' ')[0] : null
  }, [allActivity])

  const filteredAll = useMemo(() => {
    let result = allActivity
    if (filterTypes.length > 0) result = result.filter((a) => filterTypes.includes(a.type))
    if (filterPerson) result = result.filter((a) => a.actor === filterPerson)
    return result
  }, [allActivity, filterTypes, filterPerson])

  // S5: bound the rendered set to the current window.
  const filtered = useMemo(() => filteredAll.slice(0, visibleCount), [filteredAll, visibleCount])
  const hasMore = filteredAll.length > filtered.length

  // Counts per type for chip labels — full pool, not filtered
  const countByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of allActivity) m[a.type] = (m[a.type] || 0) + 1
    return m
  }, [allActivity])

  // Group by VIEWER-LOCAL date. activity_log.timestamp is a bare D1 UTC string
  // (`YYYY-MM-DD HH:MM:SS`, no `T`/zone). The old `.split('T')[0]` (a) never
  // split — the bare format has no `T`, so every row got a unique key and the
  // day grouping silently broke — and (b) would have grouped by UTC day anyway.
  // parseDbUtc treats the string as UTC; localDateKey buckets by the viewer's
  // own calendar day (matching the Today/Yesterday labels just below).
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const item of filtered) {
      const date = localDateKey(parseDbUtc(item.timestamp))
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

  // Reset focus + window when filter changes
  useEffect(() => { setFocusedIndex(-1); setVisibleCount(PAGE_SIZE) }, [filterTypes, filterPerson])

  return (
    <PageContainer>
      <PageHeader
        icon={<ActivityIcon {...ICON_PROPS} size={20} />}
        title="Activity"
        subtitle={`${filteredAll.length}${filterTypes.length > 0 || filterPerson ? ` of ${allActivity.length}` : ''} recent actions${mostActive ? ` · Most active: ${mostActive}` : ''}`}
        count={allActivity.length}
        actions={
          <div className="flex items-center gap-2">
            <InlineSelect
              value={filterPerson}
              options={[{ value: '', label: 'All People' }, ...actors.map(a => ({ value: a.slug, label: a.name }))]}
              onChange={setFilterPerson}
              alwaysShowChevron
            />
          </div>
        }
      />

      {/* T-23 per-type chip strip. Plain click = single; shift-click = multi. */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterTypes([])}
          className="rounded-full px-3 py-1 text-xs border transition-colors"
          style={{
            borderColor: filterTypes.length === 0 ? 'var(--teal)' : 'var(--border-subtle)',
            color: filterTypes.length === 0 ? 'var(--teal)' : 'var(--slate)',
            background: filterTypes.length === 0 ? 'var(--teal-hover)' : 'transparent',
            cursor: 'pointer',
          }}
        >
          All ({allActivity.length})
        </button>
        {typeOptions.filter(o => o.value !== '').map((o) => {
          const count = countByType[o.value] || 0
          if (count === 0) return null
          const active = filterTypes.includes(o.value)
          return (
            <button
              key={o.value}
              onClick={(e) => toggleType(o.value, e.shiftKey)}
              className="rounded-full px-3 py-1 text-xs border transition-colors"
              style={{
                borderColor: active ? 'var(--teal)' : 'var(--border-subtle)',
                color: active ? 'var(--teal)' : 'var(--slate)',
                background: active ? 'var(--teal-hover)' : 'transparent',
                cursor: 'pointer',
              }}
              title="Shift-click for multi-select"
            >
              {o.label} ({count})
            </button>
          )
        })}
      </div>

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
            const today = localDateKey()
            const yesterday = localDateKey(new Date(Date.now() - 86400000))
            const isToday = date === today
            const isYesterday = date === yesterday
            const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : formatMediumDate(date)
            return (
              <div key={date}>
                <h3
                  className="text-sm font-normal mb-2 sticky top-0 z-10 py-1"
                  style={{ color: isToday ? 'var(--teal)' : 'var(--ink)', background: 'var(--page-bg)' }}
                >
                  {label}
                </h3>
                <motion.div className="flex flex-col border-l-2" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-subtle)', paddingLeft: 'var(--sp-md)' }} variants={staggerContainer} initial="hidden" animate="visible">
                  {items.map((item) => {
                    const person = isRealActor(item.actor) ? getPersonInfo(item.actor) : null
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
                        {/* S5: drop the redundant type pill when a type filter is active. */}
                        {filterTypes.length === 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize flex-shrink-0" style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-hover)' }}>
                            {item.type.replace('_', ' ')}
                          </span>
                        )}
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
        {!isLoading && isError && (
          <div className="flex items-center justify-center py-10">
            <QueryErrorNote label="activity feed" onRetry={() => refetch()} />
          </div>
        )}
        {!isLoading && !isError && grouped.length === 0 && (
          <EmptyState
            icon={<ActivityIcon size={40} />}
            title={filterTypes.length > 0 ? 'No matches for that filter' : 'A quiet day in the lab'}
            subtitle={filterTypes.length > 0
              ? `Nothing matches the selected type filter${filterTypes.length > 1 ? 's' : ''}. Try 'All' or pick a different type.`
              : 'Task completions, status changes, comments, and project updates will stream in here as the team works.'}
          />
        )}
        {/* S5: windowed load — reveal the next chunk instead of one 14.7K-px page. */}
        {!isLoading && hasMore && (
          <div className="flex justify-center pt-1">
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="rounded-full px-4 py-1.5 text-xs border transition-colors"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--slate)', background: 'transparent', cursor: 'pointer' }}
            >
              Load more ({filteredAll.length - filtered.length} more)
            </button>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

function ActivityAvatar({ slug }: { slug: string }) {
  const p = getPersonInfo(slug)
  const { triggerRef, isVisible, position, cardRef, cardHandlers, handlers } = useHoverCard()
  const dir = directors.find(d => d.slug === slug)
  const member = getMemberBySlug(slug)
  const data: HoverCardData = { type: 'member', name: p.name, role: dir?.role || member?.role, photoUrl: p.photoUrl, initials: p.initials }

  return (
    <div
      ref={triggerRef as React.RefObject<HTMLDivElement>}
      style={{ width: 24, height: 24, flexShrink: 0, position: 'relative' }}
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
    >
      <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="tight" variant="ice" />
      <HoverCard data={data} isVisible={isVisible} position={position} cardRef={cardRef} cardHandlers={cardHandlers} />
    </div>
  )
}
