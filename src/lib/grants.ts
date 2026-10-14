// Grants are products (Nick 2026-10-12: "use the current grants page to build
// out and make sure it reads the right stuff"). One row per grant_application,
// award or honor product, from GET /api/grants/timeline (api/routes/grants.ts).
// Dates and money are schema-v128's award terms: an application has a
// PROPOSED start and no end ("anything that's on an application is going to
// have a proposed start date, no end date"); an award has a start, an end and
// an amount.

import type { ProductKind } from './products'
import { projectShortLabel } from './displayNames'

export type GrantBucket = 'active' | 'proposed' | 'ended'

export interface GrantMilestone {
  id: string
  title: string
  due_date: string | null
  deadline: string | null
  status: string
  completed: number
  product_id: string
}

export interface GrantProduct {
  id: string
  project_id: string
  project_slug: string
  project_title: string
  project_short_name: string | null
  pi: string | null
  kind: 'grant_application' | 'award' | 'honor' | string
  kind_label: string
  stage: string
  stage_label: string
  stage_ordinal: number
  stage_is_terminal: number
  title: string | null
  short_name: string | null
  venue: string | null
  due_date: string | null
  deadline: string | null
  period_start: string | null
  period_end: string | null
  amount_usd: number | null
  is_home: number
  lineage_rank: number
  grew_from_id: string | null
  seq: number
  bucket: GrantBucket
  milestones: GrantMilestone[]
}

export interface GrantsTimeline {
  data: GrantProduct[]
  kinds: ProductKind[]
}

/** The project's short name, then the product's own name when it has one
 *  ("R03 · A1"), never an id. */
export function grantName(g: Pick<GrantProduct, 'project_short_name' | 'project_title' | 'project_slug' | 'short_name' | 'title'>): string {
  const project = projectShortLabel({ short_name: g.project_short_name, title: g.project_title, slug: g.project_slug })
  const own = g.short_name?.trim() || g.title?.trim()
  return own ? `${project} · ${own}` : project
}

/** The mechanism inside a venue ("NHLBI K23" -> "K23", "NIH R01" -> "R01"). */
export function mechanismOf(venue: string | null | undefined): string | null {
  if (!venue) return null
  const m = /\b([RKFUPT]\d{2}|DP\d|F\d{2})\b/i.exec(venue)
  return m ? m[1].toUpperCase() : null
}

/** How long an application's hypothetical bar runs, by mechanism (the
 *  reconciled plan: R01 5y, R21 2y, any K 5y, R03 2y, else 3y). */
export function defaultTermYears(venue: string | null | undefined): number {
  const mech = mechanismOf(venue)
  if (!mech) return 3
  if (mech === 'R01') return 5
  if (mech === 'R21' || mech === 'R03') return 2
  if (mech.startsWith('K')) return 5
  return 3
}

// ── dates (ISO YYYY-MM-DD, day arithmetic in UTC so no zone shifts a day) ──

export function isoToDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** A civil date from a day number. The Date here is UTC midnight of that
 *  civil day by construction (isoToDay), so its UTC fields ARE the date; no
 *  instant is being converted, so no zone rule applies. */
function civil(t: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

export function dayToIso(day: number): string {
  return civil(new Date(day * 86_400_000))
}

export function addYearsIso(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y + years, m - 1, d))
  // Feb 29 + 1y lands on Mar 1 in Date.UTC; keep it inside February.
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0)
  return civil(t)
}

export interface GanttBar {
  id: string
  start: string
  end: string
  /** An application's bar: proposed start + the default term, drawn muted. */
  hypothetical: boolean
}

/** The bar a grant draws, or null when it has no start to draw from.
 *  An award: start to end (an award with no end yet runs its default term,
 *  still drawn solid because the start is real). An application or honor:
 *  the proposed start plus the mechanism's default term, hypothetical. */
export function barOf(g: Pick<GrantProduct, 'id' | 'kind' | 'period_start' | 'period_end' | 'venue'>): GanttBar | null {
  if (!g.period_start) return null
  if (g.kind === 'award') {
    const end = g.period_end ?? addYearsIso(g.period_start, defaultTermYears(g.venue))
    return { id: g.id, start: g.period_start, end, hypothetical: false }
  }
  return { id: g.id, start: g.period_start, end: addYearsIso(g.period_start, defaultTermYears(g.venue)), hypothetical: true }
}

/** When a pointer on a Gantt bar becomes a date move. A bar drag writes grant
 *  dates, so it must never start by accident. Mouse and pen: after 5px of
 *  travel, the threshold the Hub's dnd boards use. Touch: only after a 250ms
 *  press-and-hold that stays within 5px (the boards' touch sensor); earlier
 *  movement is a scroll or swipe and the bar lets it go. On a 390px phone 1px
 *  is about 19 days, so before this a scroll that started on a bar wrote a new
 *  award period (overnight mobile audit 2026-10-14). */
export const BAR_DRAG = { distance: 5, holdMs: 250, tolerance: 5 } as const

export function barGesture(p: { pointerType: string; dx: number; dy: number; heldMs: number }): 'wait' | 'drag' | 'release' {
  const moved = Math.hypot(p.dx, p.dy)
  if (p.pointerType !== 'touch') return moved < BAR_DRAG.distance ? 'wait' : 'drag'
  if (p.heldMs >= BAR_DRAG.holdMs) return 'drag'
  return moved > BAR_DRAG.tolerance ? 'release' : 'wait'
}

/** Days a live drag has moved, measured from where it started (for a hold,
 *  where the finger sat when the hold armed). Under BAR_DRAG.distance of travel
 *  it is 0, so a press-and-hold that wobbles as the finger lifts writes nothing. */
export function dragDays(dx: number, dayPerPx: number): number {
  return Math.abs(dx) < BAR_DRAG.distance ? 0 : Math.round(dx * dayPerPx) || 0
}

/** The terms a drag writes. An award moves both ends and keeps its length;
 *  an application moves its proposed start (its end is not stored). */
export function movedTerms(
  g: Pick<GrantProduct, 'kind' | 'period_start' | 'period_end'>, days: number,
): { period_start?: string; period_end?: string } | null {
  if (!g.period_start || days === 0) return null
  const start = dayToIso(isoToDay(g.period_start) + days)
  if (g.kind === 'award' && g.period_end) return { period_start: start, period_end: dayToIso(isoToDay(g.period_end) + days) }
  return { period_start: start }
}

/** The visible span: every bar and milestone, plus today, padded to whole years. */
export function ganttSpan(bars: GanttBar[], milestoneDates: string[], today: string): { from: number; to: number } {
  const days = [isoToDay(today), ...bars.flatMap((b) => [isoToDay(b.start), isoToDay(b.end)]), ...milestoneDates.map(isoToDay)]
  const minYear = new Date(Math.min(...days) * 86_400_000).getUTCFullYear()
  const maxYear = new Date(Math.max(...days) * 86_400_000).getUTCFullYear()
  return { from: isoToDay(`${minYear}-01-01`), to: isoToDay(`${maxYear + 1}-01-01`) }
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

/** A milestone's date: the internal date, else the hard one. */
export function milestoneDate(m: Pick<GrantMilestone, 'due_date' | 'deadline'>): string | null {
  return m.due_date ?? m.deadline
}
