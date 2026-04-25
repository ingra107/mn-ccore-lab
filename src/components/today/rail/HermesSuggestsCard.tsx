// HermesSuggestsCard — algorithmic 3-bullet focus suggestion (CD spec).
// First bullet biased to longest-overdue task, second to most-stalled
// project, third to mentee with soonest due. Real Hermes (async ai_request)
// is a follow-up — see HANDOFF Phase 2.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Alert).

import { ACCENT_GOLD, INK, INK_MUTED, daysSince } from '../constants'
import type { TaskRow } from '../../../lib/api'

interface HermesSuggestsProps {
  overdueTasks: TaskRow[]
  stalledProjects: Array<{ name: string; days: number }>
  menteesWithDue: Array<{ name: string; next: string }>
}

export function HermesSuggestsCard({ overdueTasks, stalledProjects, menteesWithDue }: HermesSuggestsProps) {
  // Algorithmic 3-bullet suggestion (CD spec parity — focus + ul of bullets).
  // Real Hermes requires async (60s listener poll); defer to a follow-up that
  // creates an ai_request once/day and caches the response per-user.
  const overdueCount = overdueTasks.length
  const stalledCount = stalledProjects.length
  const focus = overdueCount > 0
    ? `${overdueCount} overdue task${overdueCount === 1 ? '' : 's'} at the top of your list — work the longest one first; momentum carries the rest.`
    : stalledCount > 0
      ? `${stalledCount} stalled project${stalledCount === 1 ? '' : 's'} (no activity 10+ days). Pick one and ship a 30-min nudge.`
      : 'No fires today. Block 90 minutes for the deepest task on your list — that\'s where leverage lives.'

  // Build 3 bullets from real signal — first three of these that are non-null:
  // (1) longest-overdue task, (2) most-stalled project, (3) mentee with soonest due.
  const bullets: string[] = []
  if (overdueTasks.length > 0) {
    const longest = [...overdueTasks].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]
    if (longest) {
      const days = daysSince(longest.due_date)
      bullets.push(`Tackle "${longest.title.slice(0, 60)}" — ${Number.isFinite(days) ? `${days}d overdue` : 'overdue'}.`)
    }
  }
  if (stalledProjects.length > 0) {
    const top = stalledProjects[0]
    bullets.push(`Nudge ${top.name} (${top.days}d quiet) — even a one-line note moves the needle.`)
  }
  const overdueMentee = menteesWithDue.find((m) => m.next.endsWith('late'))
    ?? menteesWithDue.find((m) => m.next === 'today')
  if (overdueMentee) {
    bullets.push(`Check in with ${overdueMentee.name} — ${overdueMentee.next}.`)
  } else if (bullets.length < 3 && menteesWithDue.length > 0) {
    bullets.push(`${menteesWithDue.length} mentee${menteesWithDue.length === 1 ? '' : 's'} active this week — shape one quick win.`)
  }
  // If we still don't have 3 bullets, top up with deep-work nudge.
  if (bullets.length < 3) bullets.push('Block 90 min on the deepest task on your list — leverage compounds.')
  if (bullets.length < 3) bullets.push('No backlog drama. Pick one strategic project and write the next 200 words.')

  return (
    <div style={{ padding: 14, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.20)', borderRadius: 6, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span>✨</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD }}>Hermes suggests</span>
      </div>
      <div style={{ fontSize: 12, color: INK, lineHeight: 1.5, marginBottom: 8 }}>{focus}</div>
      <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: INK_MUTED, lineHeight: 1.7 }}>
        {bullets.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  )
}
