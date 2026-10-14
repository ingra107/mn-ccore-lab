// ViewPicker — the view switch (List / Table / Lanes / Columns / Board).
// Lives far-left of the filter row (CLAUDE.md Rule 60). List is the default
// (Nick 2026-06-10). It is the shared SegmentedToggle, Today's tray.

import SegmentedToggle from '../../../components/ui/SegmentedToggle'
import type { ViewMode } from '../constants'

const ALL_VIEWS: { value: ViewMode; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
  { value: 'lanes', label: 'Lanes' },
  { value: 'columns', label: 'Columns' },
  { value: 'board', label: 'Board' },
]

export function ViewPicker({ view, setView, isPhone = false }: { view: ViewMode; setView: (v: ViewMode) => void; isPhone?: boolean }) {
  // Columns and Board cannot render on a phone (index.tsx falls back to List for
  // deep links); do not offer choices that never show.
  const options = isPhone ? ALL_VIEWS.filter((v) => v.value !== 'columns' && v.value !== 'board') : ALL_VIEWS
  // A stored desktop view (?view=columns on a phone) renders as List, so List
  // is the segment that shows active. The stored value is untouched, so
  // widening the window still restores it.
  const shown = options.some((o) => o.value === view) ? view : 'list'
  return <SegmentedToggle ariaLabel="View" options={options} value={shown} onChange={setView} />
}
