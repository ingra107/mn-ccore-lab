// MyTasksEmpty — P2-8. Designed empty states for the three My Tasks views,
// replacing the bare-italic "nothing here" / "no tasks match" fallbacks with
// the shared EmptyState + EmptyStateArt (8 lab illustrations) + a clear-filters
// action. One copy voice; folds into P2-7 (the shell owns empty states later).

import EmptyState from '../../../components/EmptyState'
import EmptyStateArt from '../../../components/EmptyStateArt'
import { PATHS } from '../../../constants/paths'
import { INK_DIM } from '../constants'

// Clearing filters has to reset state that lives in MyTasks/index.tsx (one-way
// local→URL after mount). A clean navigation to the bare route re-initializes
// every filter from an empty URL — always correct, no cross-file callback.
function clearFilters() {
  window.location.assign(PATHS.myTasks)
}

// Page-level empty: the active filter/search excluded everything. Offers the
// designed art + a clear-filters action.
export function NoTasksMatch() {
  return (
    <EmptyState
      icon={<EmptyStateArt variant="tasks" />}
      title="No tasks match"
      subtitle="Your current filters or search hide everything here."
      action={{ label: 'Clear filters', onClick: clearFilters }}
    />
  )
}

// Genuinely-empty page: no tasks at all (not a filter artifact).
export function AllCaughtUp() {
  return (
    <EmptyState
      icon={<EmptyStateArt variant="tasks" />}
      title="All caught up"
      subtitle="Nothing on your plate right now. Capture a task with ⌘K when something lands."
    />
  )
}

// Compact in-context empty for a single Kanban column / lane that's empty while
// other groups still have work. A full illustrated state in every empty column
// would overwhelm the board, so this is a calm one-liner — but a designed one,
// not bare italic.
export function LaneEmpty({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ padding: compact ? '14px 8px' : '16px', textAlign: 'center', color: INK_DIM, fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <span aria-hidden="true" style={{ fontSize: 13 }}>✓</span>
      <span>Clear here</span>
    </div>
  )
}
