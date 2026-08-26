import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'

// ── Agenda Item mutations ───────────────────────────────────

export function useAddAgendaItem(meetingId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { content: string; project_id?: string; type?: string; document_url?: string }) =>
      fetchApi(`/api/meetings/${meetingId}/agenda`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Prep a future meeting from a calendar row ───────────────
//
// The Today timeline shows personal-calendar events (cal-*) that have no D1
// `meetings` row, so there is nowhere to build an agenda before the meeting
// happens. Until now the only way to get a row was Meetings → "Record
// Meeting", retyping date + title by hand, or waiting for the PB debrief
// pipeline to push one AFTER a transcript existed.
//
// POST /api/meetings is already an upsert keyed on (date, normalized title)
// — handleCreateMeeting, api/routes/meetings.ts — so pressing Prep twice, or
// on two devices, returns the SAME row rather than minting a duplicate. That
// is why this needs no client-side "already prepped?" guard: the duplicate is
// unrepresentable at the write path, not defended against here.
//
// ⚠️ This deliberately sends NO `source_id`, and that is load-bearing — see
// CLAUDE.md rule 83 ("Meeting origin is TWO questions"). `meetings.source_id`
// is SET-ONCE on the server (`COALESCE(source_id, ?)`), and it belongs to the
// PB debrief pipeline: `push_meeting_entry` writes `source_id = <the manifest
// meeting_id>` so that `tasks.meeting_id IN (m.id, m.source_id)` — the join in
// handleGetMeeting — can find a meeting's action items. PB mints those ids as
// `cal-YYYYMMDDTHHMM-<slug>` (scripts/meetings/calendar_adapter.py), while a
// Today row's id is `cal-<icalUID>@<YYYY-MM-DD>`. Different id spaces. If Prep
// claimed the slot first, the later debrief push would be COALESCE'd away and
// every action item from that meeting would render nowhere — the exact #108
// failure rule 83 exists to prevent.
//
// Nothing is lost by omitting it: the debrief push lands on this same row via
// the (date, normalized title) dedup above, which is what actually matched in
// the prod round-trip, and it then fills source_id itself.
export function usePrepMeetingFromEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { date: string; title: string }) =>
      fetchApi<{ id: string }>('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({ date: input.date, title: input.title }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Meeting Notes mutation ──────────────────────────────────

export function useUpdateMeetingNotes(meetingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notes: string) =>
      fetchApi(`/api/meetings/${meetingId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Meeting Metadata mutation ───────────────────────────────

export function useUpdateMeetingMeta(meetingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { attendees?: string[]; title?: string; type?: string; tags?: string[] }) =>
      fetchApi(`/api/meetings/${meetingId}/meta`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// Action Item mutations (useCreateActionItem/useToggleActionItem) retired in
// T19 (#547) — the /api/action-items routes are gone; use useUpdateTask /
// useBulkUpdateTasks / useCreateTask against the tasks model instead.
