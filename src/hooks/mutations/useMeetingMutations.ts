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
// POST /api/meetings/prep-from-event (#2225) shares POST /api/meetings'
// upsert keyed on (date, normalized title) — upsertMeeting in
// api/routes/meetings.ts — so pressing Prep twice, or on two devices, returns
// the SAME row rather than minting a duplicate. That is why this needs no
// client-side "already prepped?" guard: the duplicate is unrepresentable at
// the write path, not defended against here.
//
// The client sends only WHICH calendar row ({uid, startAt}, the cache key
// that survives a re-poll) and the day it was rendered on. The server copies
// the title and the invited attendees from the caller's own calendar cache,
// so there is no attendee field here to forget (every meeting this pill made
// before #2225 had NULL attendees).
//
// ⚠️ This deliberately sends NO `source_id`, and that is load-bearing — see
// CLAUDE.md rule 83 ("Meeting origin is TWO questions"). `meetings.source_id`
// is SET-ONCE on the server (`COALESCE(source_id, ?)`), and it belongs to the
// PB debrief pipeline: `push_meeting_entry` writes `source_id = <the manifest
// meeting_id>` so that `tasks.meeting_id IN (m.id, m.source_id)` — the join in
// handleGetMeeting — can find a meeting's action items. PB mints those ids as
// `cal-YYYYMMDDTHHMM-<slug>` (scripts/meetings/calendar_adapter.py), while a
// Today row's id is `cal-<cache row id>@<YYYY-MM-DD>`. Different id spaces. If Prep
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
    mutationFn: (input: { uid: string; startAt: string; day: string }) =>
      fetchApi<{ id: string }>('/api/meetings/prep-from-event', {
        method: 'POST',
        body: JSON.stringify({ uid: input.uid, start_at: input.startAt, day: input.day }),
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
    mutationFn: (input: { attendees?: string[]; title?: string; type?: string; tags?: string[]; audience?: 'private' | 'lab' }) =>
      fetchApi(`/api/meetings/${meetingId}/meta`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── "Belongs to" project grants (schema-v122) ───────────────
//
// The owner or Nick gives a project's members access to a meeting
// (POST /api/meetings/:id/projects, body {project: id or slug}) or takes it
// away (DELETE /api/meetings/:id/projects/:projectId). The server decides who
// may; the page only offers the toggle when the meeting says
// can_manage_access.

export function useGrantMeetingProject(meetingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (project: string) =>
      fetchApi(`/api/meetings/${meetingId}/projects`, { method: 'POST', body: JSON.stringify({ project }) }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useRevokeMeetingProject(meetingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      fetchApi(`/api/meetings/${meetingId}/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// Action Item mutations (useCreateActionItem/useToggleActionItem) retired in
// T19 (#547) — the /api/action-items routes are gone; use useUpdateTask /
// useBulkUpdateTasks / useCreateTask against the tasks model instead.
