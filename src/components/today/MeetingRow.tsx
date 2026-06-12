// MeetingRow — collapsed/expanded meeting row in the timeline.
// Click row to expand inline notes textarea; × button dismisses from today's
// view (Timeline parent tracks dismissedMeetings + offers Restore-N-hidden).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_EventRow). File renamed
// to MeetingRow per HANDOFF §2; export name kept as EventRow to match the
// prototype source for searchability.

import { useState } from 'react'
import { ACCENT_TEAL, ACCENT_GOLD, INK, INK_DIM, type TodayEvent } from './constants'
import { useIsMobile } from '../../hooks/useIsMobile'

export type SaveStatus = 'idle' | 'saving' | 'saved'

export function EventRow({ e, onDismiss, overlap = false, note, onNote, saveStatus = 'idle', isCalEvent = false }: { e: TodayEvent; onDismiss: (id: string) => void; overlap?: boolean; note?: string; onNote: (id: string, v: string) => void; saveStatus?: SaveStatus; isCalEvent?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  // N1.06 — phones: the single-line ellipsis title was crushed to 2-3 chars
  // by ~200px of row chrome. Let it wrap to 2 lines and drop the location
  // pill (it's in the expanded view's context anyway).
  const isPhone = useIsMobile(768)
  return (
    <div style={{ position: 'relative', background: 'rgba(92,188,180,0.06)', border: `1px solid rgba(92,188,180,${overlap ? 0.35 : 0.18})`, borderRadius: 6, overflow: 'hidden' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', gap: isPhone ? 8 : 12, padding: '10px 14px', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT_TEAL, fontVariantNumeric: 'tabular-nums', minWidth: isPhone ? 0 : overlap ? 90 : 72, lineHeight: 1.3, flexShrink: 0 }}>
          {e.time}
          {e.end && !isPhone && <span style={{ color: INK_DIM, fontWeight: 400 }}> – {e.end}</span>}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL, flexShrink: 0 }} />
        <span
          style={
            isPhone
              ? { flex: 1, fontSize: 13, color: INK, minWidth: '10ch', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.35 }
              : { flex: 1, fontSize: 13, color: INK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }
        >{e.title}</span>
        {e.meetingUrl && (
          <a
            href={e.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            title="Open meeting link in a new tab"
            className="hov-bg"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: ACCENT_GOLD, background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.30)', borderRadius: 999, textDecoration: 'none', transition: 'all 120ms', '--hov-bg': 'rgba(201,168,76,0.20)' } as React.CSSProperties}
          >
            <span aria-hidden="true">🔗</span>
            <span>Join</span>
          </a>
        )}
        {e.loc && !isPhone && <span style={{ fontSize: 11, color: ACCENT_TEAL }}>📍 {e.loc}</span>}
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
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid rgba(92,188,180,0.18)', background: 'rgba(92,188,180,0.02)' }}>
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
