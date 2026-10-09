// MeetingRow — collapsed/expanded meeting CARD in the timeline.
// Click the card to expand inline notes; the × button dismisses from today's
// view (Timeline parent tracks dismissedMeetings + offers Restore-N-hidden).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_EventRow). File renamed
// to MeetingRow per HANDOFF §2; export name kept as EventRow to match the
// prototype source for searchability.
//
// Look (Today reskin, 2026-10-09): the same card anatomy as a task, so the eye
// learns one layout. Title bold on top, "time · place" as the muted line under
// it, the footer carries the small controls (notes marker, Agenda / Prep, Join).
// Join is the filled teal primary only while the meeting is happening now; the
// rest of the day it is a plain link. Attendee faces, the meeting's project and
// action counts are NOT here: the Today payload does not carry them yet (a
// separate meeting build).
//
// `.meeting-row-header` stays on the clickable top block as a stable hook
// (src/__tests__/meeting-row-placeholder-copy.test.tsx drives the card
// through it); it carries no styles of its own any more.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ListChecks, StickyNote } from 'lucide-react'
import type { TodayEvent } from './constants'
import { useNowMinutes } from './useNowMinutes'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import MarkdownView from '../MarkdownView'
import { useUnseenActivity, useMarkSeen } from '../../hooks/useEntitySeen'
import { usePrepMeetingFromEvent } from '../../hooks/mutations/useMeetingMutations'
import { useToast } from '../../hooks/useToast'

export type SaveStatus = 'idle' | 'saving' | 'saved'

/** "9:00 AM – 9:30 AM" for a timed row; plain words for the rows with no time. */
function timeLine(e: TodayEvent): string {
  if (e.time === 'all day') return 'All day'
  if (e.time === '—') return 'No time set'
  return e.end ? `${e.time} – ${e.end}` : e.time
}

export function EventRow({ e, onDismiss, overlap = false, compact = false, note, onNote, saveStatus = 'idle', isCalEvent = false, minHeight }: { e: TodayEvent; onDismiss: (id: string) => void; overlap?: boolean; compact?: boolean; note?: string; onNote: (id: string, v: string) => void; saveStatus?: SaveStatus; isCalEvent?: boolean; isPhone?: boolean; minHeight?: number }) {
  const [expanded, setExpanded] = useState(false)

  // Happening now: the Join link becomes the filled primary and the card gets
  // a teal edge. The clock is the same 60s ticker the now-line uses.
  const nowMin = useNowMinutes()
  const isNow = typeof e.startMin === 'number' && typeof e.endMin === 'number' && !e.isAllDay
    && e.startMin <= nowMin && nowMin < e.endMin

  // T13: NEW tag / teal dot for a cal- row matched to a D1 meeting
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
  const { showError } = useToast()
  // projectCalendarEventToDay always builds calendarRef, so test the uid in it:
  // a list response from a Worker older than #2225 has no uid, and Prep then
  // has no cache row to point at.
  const calendarUid = e.calendarRef?.uid
  const canPrep = isCalEvent && !rowMeetingId && !!e.dayKey && !!calendarUid

  async function handlePrep(ev: React.MouseEvent) {
    ev.stopPropagation()
    if (!e.dayKey || !e.calendarRef || !calendarUid || prep.isPending) return
    // prep-from-event upserts on (date, normalized title), so a second press
    // — or a press from another device — lands on the same row. The server
    // copies title + attendees from this calendar row (#2225). No source_id:
    // that slot is set-once and belongs to the PB debrief push (see
    // usePrepMeetingFromEvent's comment, and CLAUDE.md rule 83).
    try {
      const res = await prep.mutateAsync({ uid: calendarUid, startAt: e.calendarRef.startAt, day: e.dayKey })
      if (res?.data?.id) navigate(PATHS.meeting(res.data.id))
    } catch (err) {
      // fetchApi throws ApiError carrying the server's `error` text (e.g. the
      // 404 "calendar may have refreshed; reload"); show it instead of failing
      // silently.
      showError(`Prep failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const hasNotes = (note && note.length > 0) || !!e.meetingNotes
  const place = e.loc ?? null

  const notesEl = (
    hasNotes && (
      <span className="tk-mt" title="Has notes">
        <StickyNote {...ICON_PROPS} size={13} aria-hidden />notes
      </span>
    )
  )
  const agendaEl = (
    rowMeetingId && (
      <Link
        to={PATHS.meeting(rowMeetingId)}
        onClick={(ev) => ev.stopPropagation()}
        title="Open this meeting's agenda and notes"
        aria-label={`Open agenda for ${e.title}`}
        className="tk-pill tk-btnp"
      >
        <ListChecks {...ICON_PROPS} size={11} aria-hidden />Agenda
      </Link>
    )
  )
  const prepEl = (
    canPrep && (
      <button
        type="button"
        onClick={handlePrep}
        disabled={prep.isPending}
        title="Build an agenda for this meeting — links, notes, decisions"
        aria-label={`Prep ${e.title}`}
        className="tk-pill tk-btnp planned-chip"
        style={{ cursor: prep.isPending ? 'wait' : 'pointer', opacity: prep.isPending ? 0.6 : 1 }}
      >
        <ListChecks {...ICON_PROPS} size={11} aria-hidden />{prep.isPending ? 'Prepping' : 'Prep'}
      </button>
    )
  )
  const joinEl = (
    e.meetingUrl && (
      <a
        href={e.meetingUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(ev) => ev.stopPropagation()}
        title="Join meeting"
        aria-label="Join meeting"
        className={isNow ? 'tk-join' : 'tk-joinq'}
      >
        Join
      </a>
    )
  )
  const notesPanel = (
    <div className="tk-mexp">
              {e.meetingNotes ? (
                // T13: cal- row matched to a D1 meeting that has debrief notes —
                // read-only rendered notes + deep link, no jot textarea (editing
                // debriefed notes stays on the meeting page).
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div className="tk-lbl" style={{ margin: 0 }}>Meeting notes</div>
                    <Link
                      to={PATHS.meeting(e.meetingId!)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="tk-pill tk-btnp"
                    >
                      Open meeting →
                    </Link>
                  </div>
                  <MarkdownView source={e.meetingNotes} />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <div className="tk-lbl" style={{ margin: 0 }}>Meeting notes</div>
                    {!isCalEvent && saveStatus === 'saving' && (
                      <span style={{ fontSize: 10.5, color: 'var(--sk-t3)' }}>saving…</span>
                    )}
                    {!isCalEvent && saveStatus === 'saved' && (
                      <span style={{ fontSize: 10.5, color: 'var(--sk-ac)' }}>saved</span>
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
                    style={{ resize: isCalEvent ? 'none' : 'vertical', cursor: isCalEvent ? 'not-allowed' : undefined, outline: 'none', lineHeight: 1.5 }}
                  />
                </>
              )}
            </div>
  )

  // TIMELINE card (compact): time + title on one line, place dim and inline, the
  // pills inline too, no always-present footer. The row is only as tall as its
  // content, and the timeline gives it min-height = proportional px, so a 30 min
  // meeting and a 60 min one stay different heights (the footer card was ~70px
  // for everything under ~100 min). Overlap columns are narrow, so there the
  // line may wrap. The full card (below) is for the Agenda and the all-day band.
  if (compact) {
    const start = e.time === 'all day' || e.time === '—' ? timeLine(e) : (overlap ? e.time : timeLine(e))
    return (
      <div
        data-expanded={expanded ? 'true' : undefined}
        data-meeting-compact
        className={`tk-card tk-mc tk-mcc${isNow ? ' tk-nowm' : ''}`}
        style={{ minHeight }}
      >
        <div onClick={() => setExpanded(!expanded)} className={`meeting-row-header tk-mcr${overlap ? ' tk-wrap' : ''}`} style={{ cursor: 'pointer' }}>
          <span className="tk-mt" title={timeLine(e)}>{start}</span>
          <span className="tk-ct">{e.title}</span>
          {place && <span className="tk-cs tk-inl" title={place}>{place}</span>}
          {isNow && <span className="tk-pill tk-box"><i />Now</span>}
          {isNeverSeenMeeting && <span className="tk-tag" title="New notes since your last visit">New notes</span>}
          <span className="tk-sp" />
          {notesEl}{agendaEl}{prepEl}{joinEl}
          {hasUpdateSinceSeenMeeting && <span aria-hidden="true" title="Updated since you last looked" className="tk-dotg" />}
          <span className="tk-caret">{expanded ? '▾' : '▸'}</span>
          <button
            type="button"
            onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id) }}
            title="Remove from today's view"
            aria-label={`Hide ${e.title}`}
            className="tk-x"
          >×</button>
        </div>
        {expanded && notesPanel}
      </div>
    )
  }

  return (
    // GH#80 Phase 4: overflow stays visible so the expanded notes panel isn't
    // clipped. data-expanded drives a CSS elevation lift (#106).
    <div
      data-expanded={expanded ? 'true' : undefined}
      className={`tk-card tk-mc${isNow ? ' tk-nowm' : ''}`}
      style={{ minHeight }}
    >
      <div onClick={() => setExpanded(!expanded)} className="meeting-row-header" style={{ cursor: 'pointer' }}>
        <div className="tk-mch">
          <div className="tk-hdr">
            <div className="tk-ct" style={{ fontSize: 13 }}>{e.title}</div>
            <div className="tk-cs" title={place ? `${timeLine(e)} · ${place}` : timeLine(e)}>
              {timeLine(e)}{place ? ` · ${place}` : ''}
            </div>
          </div>
          <div className="tk-tr-r">
            {hasUpdateSinceSeenMeeting && (
              <span
                aria-hidden="true"
                title="Updated since you last looked"
                className="tk-dotg"
              />
            )}
            <span className="tk-caret">{expanded ? '▾' : '▸'}</span>
            <button
              type="button"
              onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id) }}
              title="Remove from today's view"
              aria-label={`Hide ${e.title}`}
              className="tk-x"
            >×</button>
          </div>
        </div>
        <div className="tk-ft">
          {isNow && <span className="tk-pill tk-box"><i />Now</span>}
          {isNeverSeenMeeting && <span className="tk-tag" title="New notes since your last visit">New notes</span>}
          <span className="tk-sp" />
          {notesEl}{agendaEl}{prepEl}{joinEl}
        </div>
      </div>
      {expanded && notesPanel}
    </div>
  )
}
