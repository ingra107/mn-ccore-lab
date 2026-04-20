import { RotateCcw } from 'lucide-react'
import { parseCarriedForward } from '../../lib/textUtils'
import { formatBrandName } from '../BrandName'

/** Renders a task title with `[Carried forward]` lifted into a compact chip.
 *  Use in every row, card, peek, and timeline label so the prefix never
 *  shows as literal text (P2-01). */
export default function TaskTitle({
  title,
  fallback,
  maxChars,
  showChip = true,
  className,
  style,
}: {
  title: string | null | undefined
  fallback?: string | null
  maxChars?: number
  showChip?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const raw = title || fallback || ''
  const { isCarried, clean, daysCarried } = parseCarriedForward(raw)
  const display = formatBrandName(clean)
  const truncated = maxChars && display.length > maxChars
    ? display.slice(0, maxChars) + '…'
    : display

  return (
    <span className={className} style={style}>
      {isCarried && showChip && (
        <span
          className="inline-flex items-center gap-0.5 align-middle"
          style={{
            fontSize: 'var(--text-micro)',
            fontWeight: 'var(--weight-ui)',
            color: 'var(--gold)',
            background: 'color-mix(in oklch, var(--gold) 12%, transparent)',
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
            marginRight: 6,
            lineHeight: 1.1,
          }}
          title={daysCarried ? `Carried forward ${daysCarried} days` : 'Carried forward'}
          aria-label={daysCarried ? `Carried forward ${daysCarried} days` : 'Carried forward'}
        >
          <RotateCcw size={10} aria-hidden="true" />
          {daysCarried ? `${daysCarried}d` : ''}
        </span>
      )}
      {truncated}
    </span>
  )
}
