// PulseCard — FOCUS tile + NEXT MILESTONES + MENTEES summary.
// focusMin = today's real PB pomodoro minutes.
//
// #85: the SYNC tile was REMOVED — it read hoursSinceLastSync(), which is always
// Infinity in the browser (nothing writes the mnccore_last_sync_at LS key), so it
// permanently showed "—h". A control that can't be truthful is removed, not faked.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Pulse).

import { ACCENT_GOLD, INK, INK_MUTED, INK_DIM } from '../constants'

export function PulseCard({ focusMin, milestones, mentees }: { focusMin: number; milestones: Array<{ title: string; days: number }>; mentees: Array<{ name: string; next: string }> }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_GOLD }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, margin: 0 }}>Pulse</h4>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em' }}>FOCUS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--task-ink)', fontVariantNumeric: 'tabular-nums' }}>
            {focusMin}<span style={{ fontSize: 11, color: INK_MUTED, fontWeight: 400, marginLeft: 2 }}>min</span>
          </div>
        </div>
      </div>
      {milestones.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em', marginBottom: 4 }}>NEXT MILESTONES</div>
          {milestones.slice(0, 3).map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12 }}>
              <span style={{ color: ACCENT_GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 32 }}>{m.days}d</span>
              <span style={{ color: INK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
            </div>
          ))}
        </>
      )}
      {mentees.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em', marginTop: 10, marginBottom: 4 }}>MENTEES</div>
          {mentees.slice(0, 4).map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 12, alignItems: 'baseline' }}>
              <span style={{ color: INK, fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
              <span style={{ color: m.next === '—' ? INK_DIM : ACCENT_GOLD, fontSize: 11, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{m.next}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
