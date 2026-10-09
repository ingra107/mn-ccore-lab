import HeartbeatLine from '../../../components/HeartbeatLine'

/** The loading state while a tab's page chunk arrives (same pulse as PageLoader). */
export function TabFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]" role="status" aria-label="Loading">
      <HeartbeatLine width={140} height={40} color="var(--gold)" ariaLabel="Loading" />
    </div>
  )
}
