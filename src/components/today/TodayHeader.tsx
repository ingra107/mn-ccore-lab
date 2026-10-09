// TodayHeader — the "Today" day-view section header, shared by Timeline and the
// Agenda branch of TodayPage (they used to carry two copies of the same markup).
//
// A chevron + sentence-case "Today" + a count, the Timeline/Agenda toggle, a
// hint, and "Restore N hidden" when meetings were hidden. Only the
// chevron+title+count are the collapse-click target; the toggle, hint and
// restore button are siblings, so their clicks never reach the collapse
// handler (no stopPropagation needed).

import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'

export function TodayHeader({
  open, onToggleOpen, eventCount, activeView, onToggleView, hiddenCount, onRestore,
}: {
  open: boolean
  onToggleOpen: () => void
  eventCount: number
  activeView: 'timeline' | 'agenda'
  onToggleView: (v: 'timeline' | 'agenda') => void
  hiddenCount: number
  onRestore: () => void
}) {
  return (
    <div className="tk-ph">
      <div {...collapseToggleProps(open, onToggleOpen, 'Today section')} className="tk-ctog">
        <CollapseChevron open={open} />
        <h2>Today</h2>
        <span className="tk-cnt">{eventCount}</span>
      </div>
      <div role="group" aria-label="Today view" className="tk-seg">
        {(['timeline', 'agenda'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onToggleView(v)}
            aria-pressed={activeView === v}
            title={v === 'timeline' ? 'Timeline: drag tasks into gaps' : 'Agenda: scan your day'}
            className={activeView === v ? 'tk-on' : undefined}
          >
            {v === 'timeline' ? 'Timeline' : 'Agenda'}
          </button>
        ))}
      </div>
      <span className="tk-hintx today-section-hint">
        {activeView === 'agenda'
          ? 'scan your day · click to open · × to hide'
          : 'drag tasks into the gaps · click meetings to take notes · × to hide'}
      </span>
      {hiddenCount > 0 && (
        <button type="button" onClick={onRestore} style={{ marginLeft: 'auto', color: 'var(--sk-ac)', fontSize: 11.5 }}>
          Restore {hiddenCount} hidden
        </button>
      )}
    </div>
  )
}
