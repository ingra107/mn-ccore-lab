import type { ShowMoreState } from '../../hooks/useShowMore'

/** The one control under a list capped by useShowMore: "Show N more" / "Show fewer". */
export function ShowMoreButton({ list, noun }: { list: ShowMoreState<unknown>; noun?: string }) {
  if (list.hidden === 0 && !list.expanded) return null
  const next = Math.min(list.step, list.hidden)
  return (
    <button
      type="button"
      className="tk-btn tk-sm"
      onClick={list.hidden > 0 ? list.more : list.less}
      aria-expanded={list.hidden === 0}
      style={{ marginTop: '0.75rem', minHeight: 32, color: 'var(--slate)' }}
    >
      {list.hidden > 0
        ? `Show ${next} more${noun ? ` ${noun}` : ''} (${list.hidden} hidden)`
        : 'Show fewer'}
    </button>
  )
}
