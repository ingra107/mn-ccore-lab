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
