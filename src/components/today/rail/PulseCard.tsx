// PulseCard — FOCUS / SYNC tiles + NEXT MILESTONES + MENTEES summary.
// SYNC turns coral if >24h per CLAUDE.md Rule 59. focusMin = today's
// planned-task minutes proxy.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Pulse).

import { ACCENT_GOLD, ACCENT_GREEN, ACCENT_CORAL, INK, INK_MUTED, INK_DIM } from '../constants'

export function PulseCard({ focusMin, syncHours, milestones, mentees }: { focusMin: number; syncHours: number; milestones: Array<{ title: string; days: number }>; mentees: Array<{ name: string; next: string }> }) {
  // CD spec: FOCUS / SYNC tiles + NEXT MILESTONES + MENTEES.
  // SYNC turns coral if >24h per Rule 59. focusMin = today's planned-task minutes proxy.
  const syncColor = syncHours > 24 ? ACCENT_CORAL : ACCENT_GREEN
  const syncLabel = syncHours === Infinity ? '—' : String(syncHours)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_GOLD }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, margin: 0 }}>Pulse</h4>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em' }}>FOCUS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {focusMin}<span style={{ fontSize: 11, color: INK_MUTED, fontWeight: 400, marginLeft: 2 }}>min</span>
          </div>
        </div>
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }} title={syncHours === Infinity ? 'No sync recorded yet' : `Last brain.db sync ${syncHours}h ago`}>
          <div style={{ fontSize: 10, color: INK_MUTED, letterSpacing: '0.04em' }}>SYNC</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: syncColor, fontVariantNumeric: 'tabular-nums' }}>
            {syncLabel}<span style={{ fontSize: 11, color: INK_MUTED, fontWeight: 400, marginLeft: 2 }}>h</span>
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
