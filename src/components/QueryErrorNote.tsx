/**
 * QueryErrorNote — small inline "<label> unavailable — retry" note for a
 * widget-level query that failed.
 *
 * Distinct from QueryState (src/components/QueryState.tsx), which replaces
 * a whole page's main content with a full block (skeleton / error / empty).
 * QueryErrorNote is for a query feeding ONE widget inside a larger page —
 * the rest of the page keeps rendering; this just adds the failure signal
 * next to the affected section instead of letting it render as empty data.
 *
 * Extracted from the #495 calendar-outage chip (commit 31f75259) so every
 * widget whose query swallowed failures as empty arrays (#507) gets the
 * same signal instead of a bespoke inline JSX block per page.
 */
interface QueryErrorNoteProps {
  /** What failed, e.g. "calendar", "meetings" — rendered as "<label> unavailable". */
  label: string
  onRetry: () => void
}

export function QueryErrorNote({ label, onRetry }: QueryErrorNoteProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--task-ink-muted)', marginBottom: 8 }}>
      <span>{label} unavailable</span>
      <button
        onClick={onRetry}
        style={{ background: 'none', border: 'none', color: 'var(--task-ink-muted)', textDecoration: 'underline', fontSize: 11, cursor: 'pointer', padding: 0 }}
      >
        retry
      </button>
    </div>
  )
}
