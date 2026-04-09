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

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateDecision() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Record<string, unknown> }) =>
      fetchApi(`/api/decisions/${id}/update`, {
        method: 'POST',
        body: JSON.stringify(fields),
      }),

    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['decisions'] })
      const prev = queryClient.getQueryData<Array<Record<string, unknown>>>(['decisions'])
      if (prev) {
        queryClient.setQueryData(['decisions'], prev.map(d => d.id === id ? { ...d, ...fields } : d))
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['decisions'], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
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
