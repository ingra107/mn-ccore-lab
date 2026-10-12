import type React from 'react'

/**
 * FilterLinks — the ONE filter row: sentence-case text links, the active one
 * in full ink with a teal underline, the rest gray (Today's filter voice, .tk-flt).
 * It replaces the bordered radius-full filter pills each page used to draw
 * inline. Pair it with SegmentedToggle for view switches.
 *
 * `tone="overdue"` is for the one option whose JOB is overdue (red); `tone="stale"`
 * puts the count in the stale color. Any other option stays gray. A zero count is
 * not shown.
 */
export interface FilterLinkOption<T extends string> {
  value: T
  label: string
  /** Muted count after the label. */
  count?: number
  tone?: 'overdue' | 'stale'
  title?: string
}

interface FilterLinksProps<T extends string> {
  options: FilterLinkOption<T>[]
  /** One value, or the set of pressed values for a multi-select row. */
  value: T | readonly T[]
  onChange: (value: T, e: React.MouseEvent) => void
  ariaLabel?: string
  className?: string
  /** id of the region these links filter (aria-controls). */
  controls?: string
}

export function FilterLinks<T extends string>({ options, value, onChange, ariaLabel, className, controls }: FilterLinksProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={`tk-flt${className ? ` ${className}` : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={Array.isArray(value) ? (value as readonly T[]).includes(o.value) : value === o.value}
          data-tone={o.tone}
          title={o.title}
          aria-controls={controls}
          onClick={(e) => onChange(o.value, e)}
        >
          {o.label}
          {!!o.count && <span className="tk-cnt">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export default FilterLinks
