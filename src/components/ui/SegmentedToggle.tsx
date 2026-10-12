import type { ReactNode } from 'react'

/**
 * SegmentedToggle — the ONE segmented control: Today's tray (.tk-seg), the
 * active segment one surface step brighter. Use it wherever a 2-5 option
 * view/mode toggle is needed. There is no second skin: the bordered-pill
 * variants (accent tint, uppercase, tall) were deleted 2026-10-12 so a page
 * cannot draw the pre-redesign toggle. .tk-seg works on any page, not only
 * under .tk (src/index.css).
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Tooltip; defaults to the label. */
  title?: string
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** horizontal-scroll when options overflow (a narrow pane, a phone). */
  scrollable?: boolean
  className?: string
  ariaLabel?: string
  /** Tabs that own panels: sets id `${idPrefix}-tab-${value}`, aria-controls
   *  `${idPrefix}-tabpanel-${value}`, and arrow/Home/End keys move the selection. */
  idPrefix?: string
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  className,
  ariaLabel,
  idPrefix,
}: SegmentedToggleProps<T>) {
  const cls = ['tk-seg', scrollable ? 'tk-seg-scroll' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <div role="tablist" aria-label={ariaLabel} className={cls}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-tab-${opt.value}` : undefined}
          aria-controls={idPrefix ? `${idPrefix}-tabpanel-${opt.value}` : undefined}
          tabIndex={idPrefix ? (value === opt.value ? 0 : -1) : undefined}
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          onKeyDown={idPrefix ? (e) => {
            const last = options.length - 1
            const next = e.key === 'ArrowRight' ? (i + 1) % options.length
              : e.key === 'ArrowLeft' ? (i - 1 + options.length) % options.length
              : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
            if (next < 0) return
            e.preventDefault()
            onChange(options[next].value)
            setTimeout(() => document.getElementById(`${idPrefix}-tab-${options[next].value}`)?.focus(), 0)
          } : undefined}
          title={opt.title ?? opt.label}
          className={value === opt.value ? 'tk-on' : undefined}
        >
          {opt.icon}{opt.label}
        </button>
      ))}
    </div>
  )
}

export default SegmentedToggle
