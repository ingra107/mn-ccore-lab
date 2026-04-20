/**
 * HeartbeatDivider — lightweight section divider that uses the lab's
 * heartbeat-line motif at low opacity instead of a flat horizontal rule.
 *
 * Drop-in replacement for `<div className="border-t" />` in portal pages
 * where a moment of brand expression doesn't hurt (top of Personal,
 * between major dashboard cards, before footer attribution, etc).
 *
 * Defaults to a 480px-wide gold trace at low opacity, no animation.
 */
import HeartbeatLine from './HeartbeatLine'

interface Props {
  width?: number | string
  opacity?: number
  bpm?: number
  /** When `true`, the trace animates at the given bpm (default false — quiet). */
  animated?: boolean
  className?: string
}

export default function HeartbeatDivider({
  width = '100%',
  opacity = 0.35,
  bpm = 60,
  animated = false,
  className,
}: Props) {
  return (
    <div className={className} style={{ width, opacity, lineHeight: 0 }} aria-hidden="true">
      <HeartbeatLine
        variant={animated ? 'slow' : 'static'}
        bpm={bpm}
        glow={animated}
        height={28}
        strokeWidth={1.25}
        color="var(--gold)"
      />
    </div>
  )
}
