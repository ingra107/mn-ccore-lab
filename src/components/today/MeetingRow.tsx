// MeetingRow — collapsed/expanded meeting row in the timeline.
// Click row to expand inline notes textarea; × button dismisses from today's
// view (Timeline parent tracks dismissedMeetings + offers Restore-N-hidden).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_EventRow). File renamed
// to MeetingRow per HANDOFF §2; export name kept as EventRow to match the
// prototype source for searchability.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Video } from 'lucide-react'
import { ACCENT_TEAL, ACCENT_GOLD, INK, INK_DIM, withAlpha, type TodayEvent } from './constants'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import MarkdownView from '../MarkdownView'
import { useUnseenActivity, useMarkSeen } from '../../hooks/useEntitySeen'

export type SaveStatus = 'idle' | 'saving' | 'saved'

export function EventRow({ e, onDismiss, overlap = false, note, onNote, saveStatus = 'idle', isCalEvent = false, minHeight }: { e: TodayEvent; onDismiss: (id: string) => void; overlap?: boolean; note?: string; onNote: (id: string, v: string) => void; saveStatus?: SaveStatus; isCalEvent?: boolean; isPhone?: boolean; minHeight?: number }) {
  const [expanded, setExpanded] = useState(false)
  // N1.06 / ROW 24+25: visual breakpoints moved to CSS (.meeting-row-* in
  // index.css). isPhone prop accepted for API compatibility with Timeline +
  // OverlapBand callers (ROW 24); hook runs on standalone renders but value
  // is unused now that JSX branches are gone.
  useIsMobile(768) // keeps matchMedia alive on standalone renders

  // T13: gold NEW pill / teal ● for a cal- row matched to a D1 meeting
  // (same visual rule as the meetings tab — Meetings.tsx). Unmatched cal-
  // rows and real D1 rows (no e.meetingId) never carry the seen indicator
  // here; that surface is out of scope for this row.
  const { data: unseen } = useUnseenActivity()
  const meetingSeen = e.meetingId ? unseen?.meetings.get(e.meetingId) : undefined
  const isNeverSeenMeeting = meetingSeen?.never_seen === 1
  const hasUpdateSinceSeenMeeting = !!meetingSeen && !isNeverSeenMeeting

  // Viewing a matched meeting's debrief notes here counts as "seen" —
  // mirrors MeetingDetail.tsx's mark-on-view pattern.
  const markSeen = useMarkSeen()
  useEffect(() => {
    if (expanded && e.meetingId && e.meetingNotes) markSeen('meeting', e.meetingId)
  }, [expanded, e.meetingId, e.meetingNotes, markSeen])

  return (
    // GH#80 Phase 4: overflow removed (was 'hidden') so the expanded notes
    // panel isn't clipped. data-expanded drives a CSS elevation lift (#106).
    <div data-expanded={expanded ? 'true' : undefined} style={{ position: 'relative', background: withAlpha(ACCENT_TEAL, 6), border: `1px solid rgba(92,188,180,${overlap ? 0.35 : 0.18})`, borderRadius: 6, minHeight }}>
      {/* ROW 25: gap/padding/title-clamp/end-time/loc-hide → CSS .meeting-row-* */}
      <div onClick={() => setExpanded(!expanded)} className="meeting-row-header">
        <span className={`meeting-row-time${overlap ? ' meeting-row-time--overlap' : ''}`} style={{ color: ACCENT_TEAL, flexShrink: 0 }}>
          {e.time}
          {e.end && <span className="meeting-row-end" style={{ color: INK_DIM, fontWeight: 400 }}> – {e.end}</span>}
        </span>
        {/* #112: tooltip explains the teal dot — it's a calendar event indicator */}
        <span title="Calendar event" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL, flexShrink: 0 }} />
        <span className="meeting-row-title" style={{ color: INK }}>{e.title}</span>
        {e.meetingUrl && (
          // #83/#86: petite "Join" pill (was a 🔗 icon — a chain link did not
          // read as "join the meeting"). Gold = user-driven action (Rule 59),
          // small font like the timeline duration pills. flexShrink:0 keeps the
          // title's full flex width.
          <a
            href={e.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            title="Join meeting"
            aria-label="Join meeting"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: ACCENT_GOLD, background: withAlpha(ACCENT_GOLD, 12),
              border: `1px solid ${withAlpha(ACCENT_GOLD, 30)}`, borderRadius: 999,
              padding: '1px 7px', textDecoration: 'none', flexShrink: 0, lineHeight: 1.5,
            }}
          >
            <Video {...ICON_PROPS} size={11} aria-hidden />
            Join
          </a>
        )}
        {e.loc && <span className="meeting-row-loc" style={{ fontSize: 11, color: ACCENT_TEAL }}>📍 {e.loc}</span>}
        {note && note.length > 0 && <span title="Has notes" style={{ fontSize: 11, color: ACCENT_GOLD }}>📝</span>}
        {isNeverSeenMeeting && (
          <span
            title="New notes since your last visit"
            style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--gold)', color: '#1a1a1a', letterSpacing: '0.02em', flexShrink: 0 }}
          >
            NEW
          </span>
        )}
        {hasUpdateSinceSeenMeeting && (
          <span
            aria-hidden="true"
            title="Updated since you last looked"
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', boxShadow: '0 0 0 2.5px rgba(45,138,138,0.15)', flexShrink: 0 }}
          />
        )}
        <span style={{ fontSize: 11, color: INK_DIM }}>{expanded ? '▾' : '▸'}</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id) }}
          title="Remove from today's view"
          aria-label={`Hide ${e.title}`}
          className="hov-opacity"
          style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, opacity: 0.5, transition: 'opacity 120ms', '--hov-opacity': '1' } as React.CSSProperties}
        >×</button>
      </div>
      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${withAlpha(ACCENT_TEAL, 18)}`, background: withAlpha(ACCENT_TEAL, 2) }}>
          {e.meetingNotes ? (
            // T13: cal- row matched to a D1 meeting that has debrief notes —
            // read-only rendered notes + deep link, no jot textarea (editing
            // debriefed notes stays on the meeting page).
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_DIM }}>Meeting notes</div>
                <Link
                  to={PATHS.meeting(e.meetingId!)}
                  onClick={(ev) => ev.stopPropagation()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: ACCENT_GOLD, background: withAlpha(ACCENT_GOLD, 12),
                    border: `1px solid ${withAlpha(ACCENT_GOLD, 30)}`, borderRadius: 999,
                    padding: '1px 7px', textDecoration: 'none', flexShrink: 0, lineHeight: 1.5,
                  }}
                >
                  Open meeting →
                </Link>
              </div>
              <MarkdownView source={e.meetingNotes} />
            </>
          ) : (
            <>
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
                placeholder={
                  isCalEvent
                    ? (e.hasUndebriefedMatch
                        // #550: a match exists (undebriefed) — the native row
                        // elsewhere carries the live jot; don't claim no record.
                        ? 'This meeting has its own row — jot notes there instead'
                        : 'Personal calendar event — no meeting record')
                    : 'Jot notes as the meeting happens…'
                }
                style={{ width: '100%', minHeight: 72, background: isCalEvent ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', color: isCalEvent ? INK_DIM : INK, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: isCalEvent ? 'none' : 'vertical', boxSizing: 'border-box', lineHeight: 1.5, cursor: isCalEvent ? 'not-allowed' : undefined }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
