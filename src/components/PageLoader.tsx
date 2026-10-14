import HeartbeatLine from './HeartbeatLine'

/**
 * The one "waiting for the page" screen: the lab's own ECG pulse (P1-10)
 * instead of a generic spinner. HeartbeatLine is reduced-motion safe (pauses
 * fully drawn) and shares the favicon trace.
 *
 * Used for the route Suspense fallback AND the session check in RequireAuth, so
 * a cold load shows ONE waiting screen in one place, not a dark splash and then
 * a different loader. It follows the theme (no fixed dark surface).
 */
export default function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3" role="status" aria-label={label}>
        <HeartbeatLine width={180} height={48} color="var(--sk-t3)" ariaLabel={label} />
      </div>
    </div>
  )
}
