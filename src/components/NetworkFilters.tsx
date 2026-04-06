import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Filter, X } from 'lucide-react'
import type { Publication } from '../data/types'

const TOPIC_DISPLAY: Record<string, string> = {
  clif: 'CLIF',
  covid: 'COVID-19',
  ventilation: 'Ventilation',
  'decision-making': 'Decision-Making',
  quality: 'Quality',
  sepsis: 'Sepsis',
  disparities: 'Disparities',
}

function topicLabel(topic: string): string {
  return TOPIC_DISPLAY[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1)
}

export interface NetworkFilterState {
  yearRange: [number, number]
  activeTopics: string[]
  mnccoreOnly: boolean
}

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
        background: active ? 'rgba(201, 168, 76, 0.9)' : 'rgba(255, 255, 255, 0.08)',
        color: active ? '#0f1923' : 'rgba(255, 255, 255, 0.6)',
        border: active
          ? '1px solid rgba(201, 168, 76, 0.6)'
          : '1px solid rgba(255, 255, 255, 0.1)',
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
  const publishedPubs = useMemo(
    () => publications.filter((p) => p.status === 'Published'),
    [publications]
  )

  const { minYear, maxYear, topics } = useMemo(() => {
    const years = publishedPubs.map((p) => p.year)
    const allTopics = [...new Set(publishedPubs.flatMap((p) => p.topics))].sort(
      (a, b) => topicLabel(a).localeCompare(topicLabel(b))
    )
    return {
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      topics: allTopics,
    }
  }, [publishedPubs])

  const hasFilters =
    filters.yearRange[0] !== minYear ||
    filters.yearRange[1] !== maxYear ||
    filters.activeTopics.length > 0 ||
    filters.mnccoreOnly

  const clearAll = () => {
    onChange({
      yearRange: [minYear, maxYear],
      activeTopics: [],
      mnccoreOnly: false,
    })
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
        background: 'rgba(15, 25, 35, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(201, 168, 76, 0.12)',
      }}
    >
      {/* Filter icon */}
      <Filter
        size={14}
        style={{ color: 'rgba(201, 168, 76, 0.5)', flexShrink: 0 }}
      />

      {/* Year range */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs"
          style={{
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '10px',
            textTransform: 'uppercase',
          }}
        >
          Years
        </span>
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={filters.yearRange[0]}
          onChange={(e) =>
            onChange({
              ...filters,
              yearRange: [
                Math.min(Number(e.target.value), filters.yearRange[1]),
                filters.yearRange[1],
              ],
            })
          }
          className="network-range-slider"
          style={{ width: '60px', accentColor: '#c9a84c' }}
          aria-label="Start year"
        />
        <span
          className="text-xs tabular-nums"
          style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '11px',
            minWidth: '55px',
            textAlign: 'center',
          }}
        >
          {filters.yearRange[0]}-{String(filters.yearRange[1]).slice(2)}
        </span>
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={filters.yearRange[1]}
          onChange={(e) =>
            onChange({
              ...filters,
              yearRange: [
                filters.yearRange[0],
                Math.max(Number(e.target.value), filters.yearRange[0]),
              ],
            })
          }
          className="network-range-slider"
          style={{ width: '60px', accentColor: '#c9a84c' }}
          aria-label="End year"
        />
      </div>

      {/* Divider */}
      <div
        className="hidden sm:block"
        style={{
          width: '1px',
          height: '20px',
          background: 'rgba(201, 168, 76, 0.15)',
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
          background: 'rgba(201, 168, 76, 0.15)',
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
            ? 'rgba(201, 168, 76, 0.9)'
            : 'rgba(255, 255, 255, 0.08)',
          color: filters.mnccoreOnly ? '#0f1923' : 'rgba(255, 255, 255, 0.6)',
          border: filters.mnccoreOnly
            ? '1px solid rgba(201, 168, 76, 0.6)'
            : '1px solid rgba(255, 255, 255, 0.1)',
          transitionProperty: 'background-color, color, border-color',
          transitionDuration: '150ms',
        }}
        whileTap={{ scale: 0.95 }}
        aria-pressed={filters.mnccoreOnly}
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: filters.mnccoreOnly ? '#0f1923' : '#c9a84c' }}
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
            border: '1px solid rgba(201, 168, 76, 0.15)',
          }}
        >
          <X size={10} />
          Clear
        </motion.button>
      )}
    </div>
  )
}
