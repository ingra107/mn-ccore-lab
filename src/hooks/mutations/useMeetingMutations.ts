import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'
import type { ActionItemRow } from '../useApiData'
import { nowInstant } from '../../lib/time'

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

// ── Action Item mutations ───────────────────────────────────

export function useCreateActionItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { meeting_id?: string; project_id?: string; description: string; assignee: string; due_date?: string }) =>
      fetchApi('/api/action-items', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['meeting'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useToggleActionItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) =>
      fetchApi(`/api/action-items/${itemId}/toggle`, {
        method: 'POST',
      }),

    onMutate: async (itemId) => {
      // Optimistically toggle in all action-items caches
      const queries = queryClient.getQueriesData<ActionItemRow[]>({ queryKey: ['action-items'] })
      const snapshots: { key: readonly unknown[]; data: ActionItemRow[] | undefined }[] = []

      for (const [key, data] of queries) {
        snapshots.push({ key, data })
        if (data) {
          queryClient.setQueryData(
            key,
            data.map((item) =>
              item.id === itemId
                ? { ...item, completed: item.completed ? 0 : 1, completed_at: item.completed ? null : nowInstant() }
                : item
            )
          )
        }
      }

      // Also update meeting detail caches (and snapshot for rollback)
      const meetingSnapshots: { key: readonly unknown[]; data: unknown }[] = []
      const meetingQueries = queryClient.getQueriesData<{ action_items?: ActionItemRow[] }>({ queryKey: ['meeting'] })
      for (const [key, data] of meetingQueries) {
        if (data?.action_items) {
          meetingSnapshots.push({ key, data })
          queryClient.setQueryData(key, {
            ...data,
            action_items: data.action_items.map((item) =>
              item.id === itemId
                ? { ...item, completed: item.completed ? 0 : 1 }
                : item
            ),
          })
        }
      }

      return { snapshots, meetingSnapshots }
    },

    onError: (_err, _itemId, context) => {
      if (context?.snapshots) {
        for (const { key, data } of context.snapshots) {
          queryClient.setQueryData(key, data)
        }
      }
      if (context?.meetingSnapshots) {
        for (const { key, data } of context.meetingSnapshots) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['meeting'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
