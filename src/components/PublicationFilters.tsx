import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
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

interface PublicationFiltersProps {
  publications: Publication[]
  activeYears: number[]
  activeStatuses: string[]
  activeTopics: string[]
  onYearToggle: (year: number) => void
  onStatusToggle: (status: string) => void
  onTopicToggle: (topic: string) => void
  onClearAll: () => void
  resultCount: number
  totalCount: number
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
      className="cursor-pointer inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
      style={{
        fontFamily: 'var(--font-mono)',
        minHeight: '32px',
        background: active ? 'var(--gold)' : 'var(--ice)',
        color: active ? '#0f1923' : 'var(--slate)',
        border: 'none',
        transitionProperty: 'background-color, color',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease',
      }}
      whileTap={{ scale: 0.95 }}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  )
}

export default function PublicationFilters({
  publications,
  activeYears,
  activeStatuses,
  activeTopics,
  onYearToggle,
  onStatusToggle,
  onTopicToggle,
  onClearAll,
  resultCount,
  totalCount,
}: PublicationFiltersProps) {
  const years = [...new Set(publications.map((p) => p.year))].sort(
    (a, b) => b - a
  )
  const statuses = ['Published', 'In Review', 'In Preparation']
  const topics = [
    ...new Set(publications.flatMap((p) => p.topics)),
  ].sort((a, b) => topicLabel(a).localeCompare(topicLabel(b)))

  const hasFilters =
    activeYears.length > 0 ||
    activeStatuses.length > 0 ||
    activeTopics.length > 0

  return (
    <div
      className="card p-4 sm:p-5"
      style={{ border: '1px solid rgba(201, 168, 76, 0.12)' }}
    >
      {/* Year row */}
      <FilterRow label="Year">
        {years.map((y) => (
          <Pill
            key={y}
            label={String(y)}
            active={activeYears.includes(y)}
            onClick={() => onYearToggle(y)}
          />
        ))}
      </FilterRow>

      {/* Status row */}
      <FilterRow label="Status">
        {statuses.map((s) => (
          <Pill
            key={s}
            label={s}
            active={activeStatuses.includes(s)}
            onClick={() => onStatusToggle(s)}
          />
        ))}
      </FilterRow>

      {/* Topic row */}
      <FilterRow label="Topic">
        {topics.map((t) => (
          <Pill
            key={t}
            label={topicLabel(t)}
            active={activeTopics.includes(t)}
            onClick={() => onTopicToggle(t)}
          />
        ))}
      </FilterRow>

      {/* Result count + clear */}
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid rgba(201, 168, 76, 0.25)' }}>
        <span
          className="text-xs"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--slate)',
          }}
        >
          Showing {resultCount} of {totalCount} publication
          {totalCount !== 1 ? 's' : ''}
        </span>

        <AnimatePresence>
          {hasFilters && (
            <motion.button
              type="button"
              onClick={onClearAll}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--slate)',
                background: 'transparent',
                border: '1px solid rgba(201, 168, 76, 0.2)',
                minHeight: '32px',
                transitionProperty: 'border-color, color',
                transitionDuration: '200ms',
              }}
            >
              <X size={12} aria-hidden="true" />
              Clear filters
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function FilterRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 last:mb-0 flex flex-wrap items-center gap-2">
      <span
        className="text-xs uppercase flex-shrink-0"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          letterSpacing: '0.05em',
          color: 'var(--slate)',
          minWidth: '50px',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}
