import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createIdea, updateIdea, voteIdea } from '../../lib/api'
import type { IdeaRow } from '../../lib/api'
import { rollbackSnapshots } from './utils'

// ── Idea mutations ──────────────────────────────────────────

export function useCreateIdea() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { title: string; description?: string; research_area?: string }) =>
      createIdea(input),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateIdea() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Record<string, unknown> }) =>
      updateIdea(id, fields),

    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['ideas'] })
      const prev = queryClient.getQueryData<IdeaRow[]>(['ideas'])
      if (prev) {
        queryClient.setQueryData(['ideas'], prev.map(i => i.id === id ? { ...i, ...fields } : i))
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['ideas'], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useVoteIdea() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, voted }: { id: string; voted: boolean; slug: string }) => voteIdea(id, voted),

    onMutate: async ({ id, voted, slug }) => {
      await queryClient.cancelQueries({ queryKey: ['ideas'] })
      const queries = queryClient.getQueriesData<IdeaRow[]>({ queryKey: ['ideas'] })
      const snapshots = queries.map(([key, data]) => ({ key, data }))
      for (const [key, data] of queries) {
        if (data) {
          queryClient.setQueryData(key, data.map((i) => i.id === id
            ? { ...i, votes: i.votes + (voted ? 1 : -1), voters: voted ? [...(i.voters ?? []), slug] : (i.voters ?? []).filter((s) => s !== slug) }
            : i))
        }
      }
      return { snapshots }
    },

    onError: (_err, _id, context) => {
      rollbackSnapshots(queryClient, context?.snapshots)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
    },
  })
}
