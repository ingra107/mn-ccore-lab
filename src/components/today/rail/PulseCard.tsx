// PulseCard — FOCUS tile + NEXT MILESTONES + MENTEES summary.
// focusMin = today's real PB pomodoro minutes.
//
// #85: the SYNC tile was REMOVED — it read hoursSinceLastSync(), which is always
// Infinity in the browser (nothing writes the mnccore_last_sync_at LS key), so it
// permanently showed "—h". A control that can't be truthful is removed, not faked.
//
// Look (Today reskin, 2026-10-09): a panel; the focus number is a hero number in
// the display face (same family as the stat line); mentees get a small face.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Pulse).

import { useState } from 'react'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { Person } from '../skin'

// focusMin === null: the viewer has no pomodoro data source (a non-PI member;
// /api/pb/* is PI-only), so the FOCUS tile and header minutes are not drawn.
// A permanent "0min" would be a fake reading.
export function PulseCard({ focusMin, milestones, mentees }: { focusMin: number | null; milestones: Array<{ title: string; days: number }>; mentees: Array<{ name: string; next: string }> }) {
  // Session-only collapse — starts expanded on every load (no localStorage).
  const [open, setOpen] = useState(true)
  return (
    <section className="tk-panel">
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Pulse')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Pulse</h3>
        </div>
      </div>
      {open && (
      <>
      {focusMin !== null && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--sk-t3)' }}>Focus</div>
          <div className="tk-fm">
            {focusMin}<span style={{ fontSize: 11, color: 'var(--sk-t3)', marginLeft: 3, fontFamily: 'var(--font-body)' }}>min</span>
          </div>
        </div>
      )}
      {milestones.length > 0 && (
        <>
          <div className="tk-rsub">Next milestones</div>
          {milestones.slice(0, 3).map((m, i) => (
            <div key={i} className="tk-rli">
              <span className="tk-t">{m.title}</span>
              <span className="tk-d">{m.days}d</span>
            </div>
          ))}
        </>
      )}
      {mentees.length > 0 && (
        <>
          <div className="tk-rsub">Mentees</div>
          {mentees.slice(0, 4).map((m, i) => (
            <div key={i} className="tk-rli" style={{ alignItems: 'center' }}>
              <span className="tk-t" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Person name={m.name} /></span>
              <span className="tk-d">{m.next}</span>
            </div>
          ))}
        </>
      )}
      </>
      )}
    </section>
  )
}
