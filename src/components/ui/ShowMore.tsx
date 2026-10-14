import type { ShowMoreState } from '../../hooks/useShowMore'

/** The one control under a list capped by useShowMore: "Show N more" while
 *  rows are hidden, and "Show fewer" as soon as the list has grown past its
 *  first page. "Show fewer" used to appear only once every row was showing, so
 *  a 26-row list opened to 20 could not fold back (O2B, 2026-10-14). */
export function ShowMoreButton({ list, noun }: { list: ShowMoreState<unknown>; noun?: string }) {
  if (list.hidden === 0 && !list.expanded) return null
  const next = Math.min(list.step, list.hidden)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
      {list.hidden > 0 && (
        <button
          type="button"
          className="tk-btn tk-sm"
          onClick={list.more}
          aria-expanded={false}
          style={{ minHeight: 32, color: 'var(--slate)' }}
        >
          {`Show ${next} more${noun ? ` ${noun}` : ''} (${list.hidden} hidden)`}
        </button>
      )}
      {list.expanded && (
        <button
          type="button"
          className="tk-btn tk-sm"
          onClick={list.less}
          aria-expanded={true}
          style={{ minHeight: 32, color: 'var(--slate)' }}
        >
          Show fewer
        </button>
      )}
    </div>
  )
}
