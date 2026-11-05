import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'

// ── Decision mutations ────────────────────────────────────

export function useCreateDecision() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      title: string
      rationale?: string
      context?: string
      project_slug?: string
      meeting_id?: string
      tags?: string
      linked_projects?: string
    }) =>
      fetchApi('/api/decisions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      // The meeting page lists the decisions logged on it.
      if (input.meeting_id) queryClient.invalidateQueries({ queryKey: ['meeting', input.meeting_id] })
    },
  })
}

export function useUpdateDecisionOutcome() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, outcome, outcome_status, outcome_sentiment }: { id: string; outcome: string; outcome_status: string; outcome_sentiment?: string }) =>
      fetchApi(`/api/decisions/${id}/outcome`, {
        method: 'POST',
        body: JSON.stringify({ outcome, outcome_status, outcome_sentiment }),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
