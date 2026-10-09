// HermesSuggestsCard ("Today's Focus") — algorithmic 3-bullet suggestion.
// First bullet biased to longest-overdue task, second to most-stalled
// project, third to mentee with soonest due. Real Hermes (async ai_request)
// is a follow-up — D17 stage 2.
//
// TP-14 (D17 stage 1, Phase 39 audit): renamed from "Hermes Suggests" to
// "Today's Focus" because the heuristic is JS, not an LLM call. The sparkle
// glyph and gold-AI framing implied AI authorship that wasn't there. We
// keep the heuristic as-is; stage 2 will swap to a 1×/day cached
// ai_request. The component name + filename keep "HermesSuggests" to
// minimise churn on imports — only the visible label changes.
//
// Look (Today reskin, 2026-10-09): a panel on the middle surface step, the
// text in the second text tier. The "Tackle ..." bullet uses the task's
// short title, not the full one.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Alert).

import { useState } from 'react'
import { daysSince } from '../constants'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import type { TaskRow } from '../../../lib/api'

interface HermesSuggestsProps {
  overdueTasks: TaskRow[]
  stalledProjects: Array<{ name: string; days: number }>
  menteesWithDue: Array<{ name: string; next: string }>
}

export function HermesSuggestsCard({ overdueTasks, stalledProjects, menteesWithDue }: HermesSuggestsProps) {
  // Session-only collapse — starts expanded on every load (no localStorage).
  const [open, setOpen] = useState(true)
  // Algorithmic 3-bullet suggestion (CD spec parity — focus + ul of bullets).
  // Real Hermes requires async (60s listener poll); defer to a follow-up that
  // creates an ai_request once/day and caches the response per-user.
  const overdueCount = overdueTasks.length
  const stalledCount = stalledProjects.length
  const focus = overdueCount > 0
    ? `${overdueCount} overdue task${overdueCount === 1 ? '' : 's'} at the top of your list — work the longest one first; momentum carries the rest.`
    : stalledCount > 0
      ? `${stalledCount} stalled project${stalledCount === 1 ? '' : 's'} (no movement in the stale window). Pick one and ship a 30-min nudge.`
      : 'No fires today. Block 90 minutes for the deepest task on your list — that\'s where leverage lives.'

  // Build 3 bullets from real signal — first three of these that are non-null:
  // (1) longest-overdue task, (2) most-stalled project, (3) mentee with soonest due.
  const bullets: string[] = []
  if (overdueTasks.length > 0) {
    const longest = [...overdueTasks].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]
    if (longest) {
      const days = daysSince(longest.due_date)
      // Short title first: the long title is what leaked here (Nick: display
      // short names everywhere).
      bullets.push(`Tackle "${(longest.short_title || longest.title).slice(0, 60)}" — ${Number.isFinite(days) ? `${days}d overdue` : 'overdue'}.`)
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
    <section className="tk-panel">
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), "Today's focus")} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Today's focus</h3>
        </div>
      </div>
      {open && (
        <div className="tk-rail-p">
          <div>{focus}</div>
          <ul>
            {bullets.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
