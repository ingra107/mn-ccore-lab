// MeetingRow — collapsed/expanded meeting row in the timeline.
// Click row to expand inline notes textarea; × button dismisses from today's
// view (Timeline parent tracks dismissedMeetings + offers Restore-N-hidden).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_EventRow). File renamed
// to MeetingRow per HANDOFF §2; export name kept as EventRow to match the
// prototype source for searchability.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Video, ListChecks } from 'lucide-react'
import { ACCENT_TEAL, ACCENT_GOLD, INK, INK_DIM, withAlpha, type TodayEvent } from './constants'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import MarkdownView from '../MarkdownView'
import { useUnseenActivity, useMarkSeen } from '../../hooks/useEntitySeen'
import { usePrepMeetingFromEvent } from '../../hooks/mutations/useMeetingMutations'
import { Chip } from '../ui/Chip'

export type SaveStatus = 'idle' | 'saving' | 'saved'

// #2227: the row's inline actions (Join / Agenda / Prep / Open meeting) are
// interactive <a>/<Link>/<button> elements, so they can't BE a Chip (Chip
// renders a passive <span>, has no href/onClick/`as` prop, and none of its 7
// other callers are interactive — src/components/ui/Chip.tsx). Instead the
// interactive element stays an unstyled shell (behavior only) and wraps a
// Chip (visual chrome only) as its child — reuses the shared pill primitive
// per design-system rule 4 ("never fork a one-off variant") without adding
// polymorphism risk to a component 7 other surfaces depend on.
const PILL_LINK_STYLE: React.CSSProperties = {
  display: 'inline-flex', textDecoration: 'none', flexShrink: 0, lineHeight: 1.5,
  background: 'none', border: 'none', padding: 0, font: 'inherit',
}

// Chip doesn't have an uppercase/tracked-label mode (its other callers are
// sentence-case badges) -- merged into Chip's `style` prop, which callers
// override last by design, rather than adding a variant to the primitive.
const PILL_LABEL_STYLE: React.CSSProperties = {
  textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
}

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

  // ── Prep ────────────────────────────────────────────────────────────────
  // A calendar row has no D1 meeting record, so before the meeting there is
  // nowhere to build an agenda, drop links, or leave notes for the team.
  // "Prep" creates that record and opens it. Everything downstream already
  // exists (MeetingDetail: agenda items with document links, drag order,
  // notes, decisions, tasks) — this is only the bridge into it.
  //
  // A native D1 row (isCalEvent false) IS its own meeting, so it links
  // straight through instead of offering to create anything.
  const navigate = useNavigate()
  const prep = usePrepMeetingFromEvent()
  const rowMeetingId = isCalEvent ? (e.meetingId ?? e.matchedMeetingId) : e.id
  const canPrep = isCalEvent && !rowMeetingId && !!e.dayKey

  async function handlePrep(ev: React.MouseEvent) {
    ev.stopPropagation()
    if (!e.dayKey || prep.isPending) return
    // POST /api/meetings upserts on (date, normalized title), so a second
    // press — or a press from another device — lands on the same row. No
    // source_id: that slot is set-once and belongs to the PB debrief push
    // (see usePrepMeetingFromEvent's comment, and CLAUDE.md rule 83).
    const res = await prep.mutateAsync({ date: e.dayKey, title: e.title })
    if (res?.data?.id) navigate(PATHS.meeting(res.data.id))
  }

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
            style={PILL_LINK_STYLE}
          >
            <Chip color={ACCENT_GOLD} pill bordered borderAlpha={30} style={PILL_LABEL_STYLE}>
              <Video {...ICON_PROPS} size={11} aria-hidden />
              Join
            </Chip>
          </a>
        )}
        {rowMeetingId && (
          <Link
            to={PATHS.meeting(rowMeetingId)}
            onClick={(ev) => ev.stopPropagation()}
            title="Open this meeting's agenda and notes"
            aria-label={`Open agenda for ${e.title}`}
            style={PILL_LINK_STYLE}
          >
            <Chip color={ACCENT_GOLD} pill bordered borderAlpha={30} style={PILL_LABEL_STYLE}>
              <ListChecks {...ICON_PROPS} size={11} aria-hidden />
              Agenda
            </Chip>
          </Link>
        )}
        {canPrep && (
          <button
            type="button"
            onClick={handlePrep}
            disabled={prep.isPending}
            title="Build an agenda for this meeting — links, notes, decisions"
            aria-label={`Prep ${e.title}`}
            style={{ ...PILL_LINK_STYLE, cursor: prep.isPending ? 'wait' : 'pointer' }}
          >
            <Chip color={ACCENT_GOLD} pill bordered borderAlpha={30} style={{ ...PILL_LABEL_STYLE, opacity: prep.isPending ? 0.6 : 1 }}>
              <ListChecks {...ICON_PROPS} size={11} aria-hidden />
              {prep.isPending ? 'Prepping' : 'Prep'}
            </Chip>
          </button>
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
                  style={PILL_LINK_STYLE}
                >
                  <Chip color={ACCENT_GOLD} pill bordered borderAlpha={30} style={PILL_LABEL_STYLE}>
                    Open meeting →
                  </Chip>
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
                        : 'No meeting page yet — press Prep to build an agenda')
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
