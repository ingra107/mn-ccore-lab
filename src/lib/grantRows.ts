// Pure helpers for the Grants list rows (components/grants/GrantSleekList).

import type { SleekSort } from '../components/table/sleekSort'
import { GRANT_STATUS_OPTIONS } from '../hooks/useGrantTimeline'
import type { GrantTimelineItem, GrantStatus } from '../hooks/useGrantTimeline'
import { formatPublicationDate } from './dateUtils'

const BUCKET_ORDER: Record<string, number> = { active: 0, proposed: 1, ended: 2 }
const STATUS_ORDER = Object.fromEntries(GRANT_STATUS_OPTIONS.map((o, i) => [o.value, i])) as Record<string, number>
// The dot carries the state; the word stays gray (TaskStatusPill's rule).
// Teal = funded (the accent), gold = out the door and waiting, hollow = not
// started, plain gray = everything else.
export const GRANT_STATUS_DOT: Partial<Record<GrantStatus, string>> = {
  planning: 'sr-td', submitted: 'sr-wt', resubmission: 'sr-wt', funded: 'sr-ip',
}

// A grant with no stored status shows the status its bucket implies, so the
// pill never contradicts the bucket (api/routes/grant-bucket.ts files a
// null-status grant as 'active' unless it is marked proposed; the old default
// showed those active grants as "Planning").
const BUCKET_DEFAULT_STATUS: Record<GrantTimelineItem['bucket'], GrantStatus> = {
  active: 'funded', proposed: 'in_preparation', ended: 'closed',
}

/** The status a row shows: the stored one, or the bucket's default. */
export function grantStatusOf(g: GrantTimelineItem): GrantStatus {
  return (g.status as GrantStatus | null) ?? BUCKET_DEFAULT_STATUS[g.bucket]
}

/** Percent of the award period elapsed, funded (active) grants only; 0 otherwise. */
export function grantProgress(g: GrantTimelineItem, now: number): number {
  if (g.bucket !== 'active' || !g.start_date || !g.end_date) return 0
  const start = new Date(g.start_date).getTime()
  const end = new Date(g.end_date).getTime()
  if (!(end > start)) return 0
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
}

export const monthYear = (d: string | null) => (d ? formatPublicationDate(d.slice(0, 7)) : '?')
/** "Jan 2027 – Dec 2032" */
export const grantPeriod = (g: GrantTimelineItem) => `${monthYear(g.start_date)} – ${monthYear(g.end_date)}`
/** "K23 · NHLBI" */
export const grantAward = (g: GrantTimelineItem) => [g.mechanism, g.agency].filter(Boolean).join(' · ')

/** Header sort. No sort = start date, earliest first (the page's old default). */
export function sortGrants(list: GrantTimelineItem[], sort: SleekSort): GrantTimelineItem[] {
  const key = sort?.key ?? 'period'
  const sign = sort?.dir === 'desc' ? -1 : 1
  const cmp = (a: GrantTimelineItem, b: GrantTimelineItem): number => {
    switch (key) {
      case 'title': return a.title.localeCompare(b.title)
      // Mechanism, then agency: the one Award column carries both old sorts.
      case 'award': return (a.mechanism || '').localeCompare(b.mechanism || '') || (a.agency || '').localeCompare(b.agency || '')
      case 'status': return (BUCKET_ORDER[a.bucket] ?? 9) - (BUCKET_ORDER[b.bucket] ?? 9) || (STATUS_ORDER[grantStatusOf(a)] ?? 99) - (STATUS_ORDER[grantStatusOf(b)] ?? 99)
      case 'pi': return (a.pi || '').localeCompare(b.pi || '')
      default: return (a.start_date || '').localeCompare(b.start_date || '') || (a.end_date || '').localeCompare(b.end_date || '')
    }
  }
  return [...list].sort((a, b) => cmp(a, b) * sign)
}

