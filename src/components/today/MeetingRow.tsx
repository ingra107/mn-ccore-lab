// MeetingRow — collapsed/expanded meeting row in the timeline.
// Click row to expand inline notes textarea; × button dismisses from today's
// view (Timeline parent tracks dismissedMeetings + offers Restore-N-hidden).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_EventRow). File renamed
// to MeetingRow per HANDOFF §2; export name kept as EventRow to match the
// prototype source for searchability.

import { useState } from 'react'
import { ACCENT_TEAL, ACCENT_GOLD, INK, INK_DIM, withAlpha, type TodayEvent } from './constants'
import { useIsMobile } from '../../hooks/useIsMobile'

export type SaveStatus = 'idle' | 'saving' | 'saved'

export function EventRow({ e, onDismiss, overlap = false, note, onNote, saveStatus = 'idle', isCalEvent = false, isPhone: isPhoneProp, minHeight }: { e: TodayEvent; onDismiss: (id: string) => void; overlap?: boolean; note?: string; onNote: (id: string, v: string) => void; saveStatus?: SaveStatus; isCalEvent?: boolean; isPhone?: boolean; minHeight?: number }) {
  const [expanded, setExpanded] = useState(false)
  // N1.06 / ROW 24+25: visual breakpoints moved to CSS (.meeting-row-* in
  // index.css). isPhone prop accepted for API compatibility with Timeline +
  // OverlapBand callers (ROW 24); hook runs on standalone renders but value
  // is unused now that JSX branches are gone.
  useIsMobile(768) // keeps matchMedia alive on standalone renders
  return (
    <div style={{ position: 'relative', background: withAlpha(ACCENT_TEAL, 6), border: `1px solid rgba(92,188,180,${overlap ? 0.35 : 0.18})`, borderRadius: 6, overflow: 'hidden', minHeight }}>
      {/* ROW 25: gap/padding/title-clamp/end-time/loc-hide → CSS .meeting-row-* */}
      <div onClick={() => setExpanded(!expanded)} className="meeting-row-header">
        <span className={`meeting-row-time${overlap ? ' meeting-row-time--overlap' : ''}`} style={{ color: ACCENT_TEAL, flexShrink: 0 }}>
          {e.time}
          {e.end && <span className="meeting-row-end" style={{ color: INK_DIM, fontWeight: 400 }}> – {e.end}</span>}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL, flexShrink: 0 }} />
        <span className="meeting-row-title" style={{ color: INK }}>{e.title}</span>
        {e.meetingUrl && (
          <a
            href={e.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            title="Open meeting link in a new tab"
            className="hov-bg"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: ACCENT_GOLD, background: withAlpha(ACCENT_GOLD, 10), border: `1px solid ${withAlpha(ACCENT_GOLD, 30)}`, borderRadius: 999, textDecoration: 'none', transition: 'all 120ms', '--hov-bg': withAlpha(ACCENT_GOLD, 20) } as React.CSSProperties}
          >
            <span aria-hidden="true">🔗</span>
            <span>Join</span>
          </a>
        )}
        {e.loc && <span className="meeting-row-loc" style={{ fontSize: 11, color: ACCENT_TEAL }}>📍 {e.loc}</span>}
        {note && note.length > 0 && <span title="Has notes" style={{ fontSize: 11, color: ACCENT_GOLD }}>📝</span>}
        <span style={{ fontSize: 11, color: INK_DIM }}>{expanded ? '▾' : '▸'}</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id) }}
          title="Remove from today's view"
          className="hov-opacity"
          style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, opacity: 0.5, transition: 'opacity 120ms', '--hov-opacity': '1' } as React.CSSProperties}
        >×</button>
      </div>
      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${withAlpha(ACCENT_TEAL, 18)}`, background: withAlpha(ACCENT_TEAL, 2) }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_DIM }}>Meeting notes</div>
            {!isCalEvent && saveStatus === 'saving' && (
              <span style={{ fontSize: 10, color: INK_DIM }}>saving…</span>
            )}
            {!isCalEvent && saveStatus === 'saved' && (
              <span style={{ fontSize: 10, color: ACCENT_TEAL }}>saved</span>
            )}
          </div>
          <textarea
            value={isCalEvent ? '' : (note || '')}
            onChange={isCalEvent ? undefined : (ev) => onNote(e.id, ev.target.value)}
            readOnly={isCalEvent}
            disabled={isCalEvent}
            placeholder={isCalEvent ? 'Personal calendar event — no meeting record' : 'Jot notes as the meeting happens…'}
            style={{ width: '100%', minHeight: 72, background: isCalEvent ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', color: isCalEvent ? INK_DIM : INK, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: isCalEvent ? 'none' : 'vertical', boxSizing: 'border-box', lineHeight: 1.5, cursor: isCalEvent ? 'not-allowed' : undefined }}
          />
        </div>
      )}
    </div>
  )
}
