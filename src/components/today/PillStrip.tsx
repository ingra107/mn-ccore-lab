// PillStrip — clickable daily glance row.
// Five pills: overdue / stalled / planned / meetings / done today. Each pill
// scrollIntoView()s its anchor section.
//
// The "Day score" chip that closed this row was deleted 2026-10-09 (D5). Its
// sigmoid 100/(1+e^(0.05·overdue+0.02·stalled)) peaks at 50, so a "/100"
// score could never pass half and read red on any real day, and it restated
// the overdue + stalled pills beside it. The composite Lab Health score lives
// on Lab Overview (/portal/overview), reachable from the nav.
// Extracted from src/pages/portal/TodayPage.tsx (B2_PillStrip).

import { Pill } from './primitives'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_ORANGE, ACCENT_GREEN,
  type DailyCounts,
} from './constants'

export function PillStrip({ counts }: { counts: DailyCounts }) {
  const scrollTo = (sel: string) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      <Pill icon="🔴" color={ACCENT_CORAL} count={counts.overdue} label="overdue" title="Jump to Needs Attention" onClick={() => scrollTo('[data-b2-attention]')} />
      <Pill icon="🕰" color={ACCENT_ORANGE} count={counts.stalled} label="stalled" title="Stalled projects — no activity in 10+ days" onClick={() => scrollTo('[data-b2-attention]')} />
      <Pill icon="📌" color={ACCENT_GOLD} count={counts.planned} label="planned today" title="Scroll to planned queue" onClick={() => scrollTo('[data-b2-timeline]')} />
      <Pill icon="📅" color={ACCENT_TEAL} count={counts.meetings} label="meetings" title="Scroll to today's timeline" onClick={() => scrollTo('[data-b2-timeline]')} />
      <Pill icon="✓" color={ACCENT_GREEN} count={counts.doneToday} label="done today" title="Scroll to completed" onClick={() => scrollTo('[data-b2-completed]')} />
    </div>
  )
}
