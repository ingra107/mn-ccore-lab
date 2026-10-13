import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { formatWeekRange } from '../../lib/isoWeek'
import { useWeekParam } from '../../hooks/useWeekParam'

// The Lab overview's one week control (`?week=YYYY-Www`, ISO Monday weeks).
// It replaced Analytics' local week offset and Insights' own chevrons: the URL
// holds the week, so a copied link opens the same week and Back steps through
// the weeks you looked at.
export default function WeekControl() {
  const { monday, isCurrent, prev, next, reset } = useWeekParam()
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Week">
      <button type="button" onClick={prev} aria-label="Previous week" className="tk-btn tk-sm">
        <ChevronLeft {...ICON_PROPS} size={14} />
      </button>
      <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--ink)' }} data-testid="week-range">
        <Calendar {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t3)' }} />
        {formatWeekRange(monday)}
      </span>
      <button
        type="button"
        onClick={next}
        disabled={isCurrent}
        aria-label="Next week"
        className="tk-btn tk-sm"
        style={{ opacity: isCurrent ? 0.4 : 1, cursor: isCurrent ? 'default' : 'pointer' }}
      >
        <ChevronRight {...ICON_PROPS} size={14} />
      </button>
      {!isCurrent && (
        <button type="button" onClick={reset} className="tk-btn tk-sm tk-sel">This week</button>
      )}
    </div>
  )
}
