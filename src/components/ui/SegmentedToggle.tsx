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
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** horizontal-scroll when options overflow (a narrow pane, a phone). */
  scrollable?: boolean
  className?: string
  ariaLabel?: string
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  className,
  ariaLabel,
}: SegmentedToggleProps<T>) {
  const cls = ['tk-seg', scrollable ? 'tk-seg-scroll' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <div role="tablist" aria-label={ariaLabel} className={cls}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.label}
          className={value === opt.value ? 'tk-on' : undefined}
        >
          {opt.icon}{opt.label}
        </button>
      ))}
    </div>
  )
}

export default SegmentedToggle
