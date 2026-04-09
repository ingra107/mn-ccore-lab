import { useMutation, useQueryClient } from '@tanstack/react-query'

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
      fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),

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
      fetch(`/api/decisions/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then((r) => r.json()),

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
      fetch(`/api/decisions/${id}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, outcome_status, outcome_sentiment }),
      }).then((r) => r.json()),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
