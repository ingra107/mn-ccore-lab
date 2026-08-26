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
// source_id carries the calendar row's stable id (set-once via COALESCE on
// the server) so a later PB debrief push lands on this same row.
export function usePrepMeetingFromEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { date: string; title: string; source_id: string }) =>
      fetchApi<{ id: string }>('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({ date: input.date, title: input.title, source_id: input.source_id }),
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
