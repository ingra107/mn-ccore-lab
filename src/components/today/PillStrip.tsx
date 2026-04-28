// PillStrip — clickable daily glance row.
// Six pills: overdue / stalled / planned / meetings / done today / lab health.
// Each pill scrollIntoView()s its anchor section. Lab Health is a Link to
// /portal/overview because it's a navigation cue, not an in-page jump.
// Extracted from src/pages/portal/TodayPage.tsx (B2_PillStrip).

import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { Pill } from './primitives'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK_MUTED, type DailyCounts,
} from './constants'

export function PillStrip({ counts }: { counts: DailyCounts }) {
  // TP-17 (D20): sigmoid scaling — score = 100 / (1 + e^(0.05 * overdue + 0.02 * stalled)).
  // Smooth degradation; never reaches 0. With 0/0 → 50, but the tooltip
  // explains the formula so the number is legible. Old linear formula
  // hit 0 at 25 overdue and stayed; sigmoid lets a 50-overdue lab still
  // distinguish from a 5-overdue one.
  const labHealth = Math.round(100 / (1 + Math.exp(0.05 * counts.overdue + 0.02 * counts.stalled)))
  const healthColor = labHealth >= 35 ? ACCENT_GREEN : labHealth >= 25 ? ACCENT_GOLD : ACCENT_CORAL
  const tooltipReasons: string[] = []
  if (counts.overdue > 0) tooltipReasons.push(`${counts.overdue} overdue task${counts.overdue === 1 ? '' : 's'}`)
  if (counts.stalled > 0) tooltipReasons.push(`${counts.stalled} stalled project${counts.stalled === 1 ? '' : 's'}`)
  const tooltipReasonText = tooltipReasons.length > 0 ? tooltipReasons.join(' · ') : 'No active drag'
  const tooltipText = `Lab Health: ${labHealth}/100\nFormula: 100 / (1 + e^(0.05·overdue + 0.02·stalled))\n${tooltipReasonText}\nClick for Lab Overview →`
  const scrollTo = (sel: string) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      <Pill icon="🔴" color={ACCENT_CORAL} count={counts.overdue} label="overdue" title="Jump to Needs Attention" onClick={() => scrollTo('[data-b2-attention]')} />
      <Pill icon="🕰" color={ACCENT_ORANGE} count={counts.stalled} label="stalled" title="Stalled projects — no activity in 10+ days" onClick={() => scrollTo('[data-b2-attention]')} />
      <Pill icon="📌" color={ACCENT_GOLD} count={counts.planned} label="planned today" title="Scroll to planned queue" onClick={() => scrollTo('[data-b2-timeline]')} />
      <Pill icon="📅" color={ACCENT_TEAL} count={counts.meetings} label="meetings" title="Scroll to today's timeline" onClick={() => scrollTo('[data-b2-timeline]')} />
      <Pill icon="✓" color={ACCENT_GREEN} count={counts.doneToday} label="done today" title="Scroll to completed" onClick={() => scrollTo('[data-b2-completed]')} />
      <div style={{ flex: 1 }} />
      <Link
        to={PATHS.overview}
        title={tooltipText}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: `${healthColor}10`, border: `1px solid ${healthColor}50`, borderRadius: 999, textDecoration: 'none', transition: 'all 150ms' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${healthColor}20` }}
        onMouseLeave={(e) => { e.currentTarget.style.background = `${healthColor}10` }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: healthColor }}>Lab health</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: healthColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{labHealth}</span>
        <span style={{ fontSize: 11, color: INK_MUTED }}>{counts.overdue} overdue · {counts.stalled} stalled</span>
      </Link>
    </div>
  )
}
