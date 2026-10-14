// Calendar paging: what Prev/Next do in each view, what the arrows are called,
// when the Today button has nothing to do, and the Agenda's window.
import { localDateKey } from './dateUtils'

export type ViewMode = 'month' | 'week' | 'day' | 'agenda'

// Prev/Next step per view (G4-1, 2026-10-14). Agenda pages by month, like
// Month: a one-day step left the agenda list unchanged, because Agenda lists a
// window, not a day. A month step starts from the 1st so Jan 31 + 1 lands in
// February, not March 3.
const STEP_UNIT: Record<ViewMode, 'month' | 'week' | 'day'> = { month: 'month', agenda: 'month', week: 'week', day: 'day' }

export function stepDate(view: ViewMode, date: Date, dir: 1 | -1): Date {
  const d = new Date(date)
  if (STEP_UNIT[view] === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir) }
  else if (STEP_UNIT[view] === 'week') d.setDate(d.getDate() + 7 * dir)
  else d.setDate(d.getDate() + dir)
  return d
}

export function stepLabel(view: ViewMode, dir: 1 | -1): string {
  return `${dir < 0 ? 'Previous' : 'Next'} ${STEP_UNIT[view]}`
}

/** True when the view already shows today, so the Today button has nothing to do. */
export function showsToday(view: ViewMode, date: Date, now: Date = new Date()): boolean {
  const unit = STEP_UNIT[view]
  if (unit === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  if (unit === 'day') return localDateKey(date) === localDateKey(now)
  const ws = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return localDateKey(x) }
  return ws(date) === ws(now)
}

/** The Agenda window for the month in view. The current month lists what is
 *  upcoming: today through the end of the fetch window (next month), so the
 *  list never runs short late in a month. Any other month lists exactly that
 *  month, 1st to last day, so its header ("September 2026") and its count
 *  ("events in September") describe the same rows (principle 6), and paging
 *  month to month never shows a row twice. */
export function agendaWindow(date: Date, now: Date = new Date()): { from: string; to: string } {
  const isCurrent = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const last = new Date(date.getFullYear(), date.getMonth() + (isCurrent ? 2 : 1), 0)
  return { from: isCurrent ? localDateKey(now) : localDateKey(first), to: localDateKey(last) }
}

/** The empty Agenda's title names the window it shows. The page pages the
 *  Agenda by month (G4-1), and the old fixed "The week ahead is open" sat under
 *  "November 2026 / 0 events in November" (O2B, 2026-10-14). */
export function agendaEmptyTitle(from: string, to: string | undefined, today: string): string {
  if (!to) return 'Nothing coming up'
  const [y, m] = from.split('-').map(Number)
  const month = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })
  // The current month's window runs from today to the end of next month (agendaWindow).
  return from.slice(0, 7) === today.slice(0, 7) ? 'Nothing coming up' : `Nothing in ${month}`
}
