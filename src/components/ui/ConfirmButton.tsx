import type { ReactNode } from 'react'
import { useArmedConfirm } from '../../hooks/useArmedConfirm'

/**
 * ConfirmButton — a .tk-btn that asks before it acts. The first tap arms it
 * (the label changes to `confirmLabel` and, for `tone="danger"`, it turns the
 * danger color); a second tap within 5s runs `onConfirm`. Use it for any
 * one-tap action that throws away state or starts something you cannot take
 * back (Settings danger zone, Lab reset, launch re-fire).
 */
interface ConfirmButtonProps {
  onConfirm: () => void
  children: ReactNode
  /** Shown while armed, e.g. "Reset?". */
  confirmLabel: string
  /** danger = destroys saved state (red has that job); accent = starts something. */
  tone?: 'danger' | 'accent'
  /** Accessible name at rest when the visible label is not enough. */
  ariaLabel?: string
  className?: string
}

export default function ConfirmButton({
  onConfirm,
  children,
  confirmLabel,
  tone = 'danger',
  ariaLabel,
  className = 'tk-btn tk-sm',
}: ConfirmButtonProps) {
  const { armed, trigger } = useArmedConfirm()
  const armedStyle: React.CSSProperties | undefined = armed
    ? tone === 'danger'
      ? { color: 'var(--job-danger)', boxShadow: 'inset 0 0 0 1px var(--job-danger)' }
      : { color: 'var(--job-accent)', boxShadow: 'inset 0 0 0 1px var(--job-accent)' }
    : undefined
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => { e.stopPropagation(); trigger(onConfirm) }}
      aria-label={armed ? `${confirmLabel} Tap again to confirm` : ariaLabel}
      data-armed={armed ? 'true' : undefined}
      style={armedStyle}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
