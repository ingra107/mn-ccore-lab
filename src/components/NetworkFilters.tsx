import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Filter, X } from 'lucide-react'
import type { Publication } from '../data/types'
import { ICON_PROPS } from '../lib/iconProps'
import { withAlpha } from '../lib/taskGrouping'
import { topicLabel } from '../lib/topics'
import { isPublished } from '../lib/publicationCounts'
import { yearBounds, effectiveYearRange, withYearRange, type NetworkFilterState } from '../lib/networkFilters'

export type { NetworkFilterState }

interface NetworkFiltersProps {
  publications: Publication[]
  filters: NetworkFilterState
  onChange: (filters: NetworkFilterState) => void
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="cursor-pointer inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        fontSize: '11px',
        minHeight: '28px',
        background: active ? withAlpha('var(--job-brand)', 90) : 'var(--hover-medium)',
        color: active ? '#0f1923' : 'rgba(255, 255, 255, 0.6)',
        border: active
          ? `1px solid ${withAlpha('var(--job-brand)', 60)}`
          : '1px solid var(--hover-medium)',
        transitionProperty: 'background-color, color, border-color',
        transitionDuration: '150ms',
        transitionTimingFunction: 'ease',
      }}
      whileTap={{ scale: 0.95 }}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  )
}

export default function NetworkFilters({
  publications,
  filters,
  onChange,
}: NetworkFiltersProps) {
  const bounds = useMemo(() => yearBounds(publications), [publications])
  const topics = useMemo(
    () => [...new Set(publications.filter(isPublished).flatMap((p) => p.topics))].sort(
      (a, b) => topicLabel(a).localeCompare(topicLabel(b))
    ),
    [publications]
  )
  const range = effectiveYearRange(filters, bounds)
  const yearOptions = useMemo(() => {
    if (!bounds) return []
    const out: number[] = []
    for (let y = bounds.max; y >= bounds.min; y--) out.push(y)
    return out
  }, [bounds])

  const hasFilters =
    filters.yearRange !== null ||
    filters.activeTopics.length > 0 ||
    filters.mnccoreOnly

  const clearAll = () => {
    onChange({
      yearRange: null,
      activeTopics: [],
      mnccoreOnly: false,
    })
  }

  // Year selects, not range sliders: a 60px slider over ~90 years moved
  // about a year per pixel, so one tap on a phone jumped to the end.
  const yearSelectStyle: React.CSSProperties = {
    fontSize: '12px',
    minHeight: '32px',
    padding: '0 6px',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    colorScheme: 'dark',
    cursor: 'pointer',
  }

  const toggleTopic = (topic: string) => {
    const newTopics = filters.activeTopics.includes(topic)
      ? filters.activeTopics.filter((t) => t !== topic)
      : [...filters.activeTopics, topic]
    onChange({ ...filters, activeTopics: newTopics })
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg"
      style={{
        // The graph panel is dark in both themes; PANEL_BG flips light and washed this gray.
        background: 'rgba(255, 255, 255, 0.06)',
        border: `1px solid ${withAlpha('var(--job-brand)', 12)}`,
      }}
    >
      {/* Filter icon */}
      <Filter {...ICON_PROPS}
        size={14}
        style={{ color: withAlpha('var(--job-brand)', 50), flexShrink: 0 }}
      />

      {/* Year range */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs"
          style={{
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '11px',
          }}
        >
          Years
        </span>
        {bounds && range && (
          <>
            <select
              value={range[0]}
              onChange={(e) => {
                const start = Number(e.target.value)
                onChange(withYearRange(filters, [start, Math.max(start, range[1])], bounds))
              }}
              className="tabular-nums"
              style={yearSelectStyle}
              aria-label="Start year"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span aria-hidden style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '11px' }}>to</span>
            <select
              value={range[1]}
              onChange={(e) => {
                const end = Number(e.target.value)
                onChange(withYearRange(filters, [Math.min(range[0], end), end], bounds))
              }}
              className="tabular-nums"
              style={yearSelectStyle}
              aria-label="End year"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Divider */}
      <div
        className="hidden sm:block"
        style={{
          width: '1px',
          height: '20px',
          background: 'color-mix(in srgb, var(--job-brand) 15%, transparent)',
        }}
      />

      {/* Topic pills */}
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t) => (
          <Pill
            key={t}
            label={topicLabel(t)}
            active={filters.activeTopics.includes(t)}
            onClick={() => toggleTopic(t)}
          />
        ))}
      </div>

      {/* Divider */}
      <div
        className="hidden sm:block"
        style={{
          width: '1px',
          height: '20px',
          background: 'color-mix(in srgb, var(--job-brand) 15%, transparent)',
        }}
      />

      {/* MNCCORE toggle */}
      <motion.button
        type="button"
        onClick={() => onChange({ ...filters, mnccoreOnly: !filters.mnccoreOnly })}
        className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
        style={{
          fontSize: '11px',
          minHeight: '28px',
          background: filters.mnccoreOnly
            ? withAlpha('var(--job-brand)', 90)
            : 'var(--hover-medium)',
          color: filters.mnccoreOnly ? '#0f1923' : 'rgba(255, 255, 255, 0.6)',
          border: filters.mnccoreOnly
            ? `1px solid ${withAlpha('var(--job-brand)', 60)}`
            : '1px solid var(--hover-medium)',
          transitionProperty: 'background-color, color, border-color',
          transitionDuration: '150ms',
        }}
        whileTap={{ scale: 0.95 }}
        aria-pressed={filters.mnccoreOnly}
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: filters.mnccoreOnly ? '#0f1923' : 'var(--job-brand)' }}
        />
        MNCCORE Only
      </motion.button>

      {/* Clear button */}
      {hasFilters && (
        <motion.button
          type="button"
          onClick={clearAll}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ml-auto"
          style={{
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.5)',
            background: 'transparent',
            border: `1px solid ${withAlpha('var(--job-brand)', 15)}`,
          }}
        >
          <X {...ICON_PROPS} size={10} />
          Clear
        </motion.button>
      )}
    </div>
  )
}
