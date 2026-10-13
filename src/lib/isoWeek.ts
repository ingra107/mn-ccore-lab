// ISO weeks for the Lab overview (Monday start, week 1 holds Jan 4th).
//
// One week rule for every number on the Team and Pipeline tabs. Before the
// fold, Analytics counted the stat row on Monday weeks but drew the velocity
// bars and sparklines on Sunday weeks, and Insights used ISO weeks; the same
// "this week" meant three windows. All of them now read a `YYYY-Www` string
// (the `?week=` URL param) and a local-midnight Monday from this file.
//
// Dates here are CIVIL (the viewer's calendar day), not instants: a week runs
// Monday 00:00 to the next Monday 00:00 in the viewer's zone.

const WEEK_RE = /^(\d{4})-W(\d{2})$/

/** `YYYY-Www` for the civil day of `d` (local y/m/d). */
export function isoWeekOf(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function currentIsoWeek(now: Date = new Date()): string {
  return isoWeekOf(now)
}

/** True for a well-formed week (`2026-W41`) whose number exists in that year. */
export function isIsoWeek(value: string | null | undefined): value is string {
  if (!value) return false
  const m = WEEK_RE.exec(value)
  if (!m) return false
  const week = Number(m[2])
  if (week < 1 || week > 53) return false
  // Week 53 only exists in a long year: round-trip through the Monday.
  const monday = isoWeekMonday(value)
  return monday !== null && isoWeekOf(monday) === value
}

/** The Monday, at local midnight, of an ISO week. Null for bad input. */
export function isoWeekMonday(week: string): Date | null {
  const m = WEEK_RE.exec(week)
  if (!m) return null
  const year = Number(m[1])
  const num = Number(m[2])
  if (num < 1 || num > 53) return null
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Mon = Date.UTC(year, 0, 4 - (jan4Day - 1))
  const mon = new Date(week1Mon + (num - 1) * 7 * 86400000)
  return new Date(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate())
}

/** The ISO week `deltaWeeks` away. Bad input comes back unchanged. */
export function shiftIsoWeek(week: string, deltaWeeks: number): string {
  const monday = isoWeekMonday(week)
  if (!monday) return week
  const shifted = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + deltaWeeks * 7)
  return isoWeekOf(shifted)
}

/** Monday 00:00 (local) of the week holding `d`. */
export function mondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
}

/** The Mondays of the last `count` weeks ending with the week holding `now`, oldest first. */
export function trailingMondays(count: number, now: Date = new Date()): Date[] {
  const thisMonday = mondayOf(now)
  const out: Date[] = []
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - i * 7))
  }
  return out
}

/** A Monday plus `days` civil days, at local midnight. */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** "Oct 12 - Oct 18, 2026" for the week starting `monday`. */
export function formatWeekRange(monday: Date): string {
  const end = addDays(monday, 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(monday)} - ${fmt(end)}, ${end.getFullYear()}`
}
