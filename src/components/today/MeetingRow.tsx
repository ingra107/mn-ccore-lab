// MeetingRow — collapsed/expanded meeting row in the timeline.
// Click row to expand inline notes textarea; × button dismisses from today's
// view (Timeline parent tracks dismissedMeetings + offers Restore-N-hidden).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_EventRow). File renamed
// to MeetingRow per HANDOFF §2; export name kept as EventRow to match the
// prototype source for searchability.

import { useState } from 'react'
import { ACCENT_TEAL, ACCENT_GOLD, INK, INK_DIM, type TodayEvent } from './constants'

export function EventRow({ e, onDismiss, overlap = false, note, onNote }: { e: TodayEvent; onDismiss: (id: string) => void; overlap?: boolean; note?: string; onNote: (id: string, v: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ position: 'relative', background: 'rgba(92,188,180,0.06)', border: `1px solid rgba(92,188,180,${overlap ? 0.35 : 0.18})`, borderRadius: 6, overflow: 'hidden' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', gap: 12, padding: '10px 14px', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT_TEAL, fontVariantNumeric: 'tabular-nums', minWidth: overlap ? 90 : 72, lineHeight: 1.3 }}>
          {e.time}
          {e.end && <span style={{ color: INK_DIM, fontWeight: 400 }}> – {e.end}</span>}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, color: INK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
        {e.meetingUrl && (
          <a
            href={e.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            title="Open meeting link in a new tab"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: ACCENT_GOLD, background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.30)', borderRadius: 999, textDecoration: 'none', transition: 'all 120ms' }}
            onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(201,168,76,0.20)' }}
            onMouseLeave={(ev) => { ev.currentTarget.style.background = 'rgba(201,168,76,0.10)' }}
          >
            <span aria-hidden="true">🔗</span>
            <span>Join</span>
          </a>
        )}
        {e.loc && <span style={{ fontSize: 11, color: ACCENT_TEAL }}>📍 {e.loc}</span>}
        {note && note.length > 0 && <span title="Has notes" style={{ fontSize: 11, color: ACCENT_GOLD }}>📝</span>}
        <span style={{ fontSize: 11, color: INK_DIM }}>{expanded ? '▾' : '▸'}</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id) }}
          title="Remove from today's view"
          style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, opacity: 0.5, transition: 'opacity 120ms' }}
          onMouseEnter={(ev) => { ev.currentTarget.style.opacity = '1' }}
          onMouseLeave={(ev) => { ev.currentTarget.style.opacity = '0.5' }}
        >×</button>
      </div>
      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid rgba(92,188,180,0.18)', background: 'rgba(92,188,180,0.02)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 4 }}>Meeting notes</div>
          <textarea
            value={note || ''}
            onChange={(ev) => onNote(e.id, ev.target.value)}
            placeholder="Jot notes as the meeting happens…"
            style={{ width: '100%', minHeight: 72, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', color: INK, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
          />
        </div>
      )}
    </div>
  )
}
