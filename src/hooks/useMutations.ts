/**
 * TanStack Query v5 mutation hooks with optimistic updates.
 *
 * Each mutation:
 * 1. Optimistically updates the cache immediately (instant UI feedback)
 * 2. Sends the request to D1
 * 3. Rolls back on error, invalidates on success
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject, addProjectComment } from '../lib/api'
import type { Project } from '../data/types'

// ── Project mutations ───────────────────────────────────────

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fields: Partial<Project>) => updateProject(projectId, fields),

    onMutate: async (fields) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: ['projects'] })

      // Snapshot current data for rollback
      const previousProjects = queryClient.getQueryData<Project[]>(['projects'])

      // Optimistically update the cache
      if (previousProjects) {
        queryClient.setQueryData<Project[]>(
          ['projects'],
          previousProjects.map((p) =>
            p.slug === projectId ? { ...p, ...fields } : p
          )
        )
      }

      return { previousProjects }
    },

    onError: (_err, _fields, context) => {
      // Roll back on error
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects)
      }
    },

    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Comment mutations ───────────────────────────────────────

interface CommentInput {
  content: string
  author: string
}

interface Comment {
  id: string
  content: string
  author_name: string | null
  author_slug: string | null
  created_at: string
}

export function useAddComment(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CommentInput) => addProjectComment(projectId, input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['comments', projectId] })

      const previousComments = queryClient.getQueryData<Comment[]>(['comments', projectId])

      // Optimistically add the comment
      const optimisticComment: Comment = {
        id: `temp-${Date.now()}`,
        content: input.content,
        author_name: input.author,
        author_slug: null,
        created_at: new Date().toISOString(),
      }

      queryClient.setQueryData<Comment[]>(
        ['comments', projectId],
        [optimisticComment, ...(previousComments || [])]
      )

      return { previousComments }
    },

    onError: (_err, _input, context) => {
      if (context?.previousComments) {
        queryClient.setQueryData(['comments', projectId], context.previousComments)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', projectId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Team profile mutation ───────────────────────────────────

export function useUpdateProfile(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fields: Record<string, string | null>) =>
      fetch(`/api/team/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then((r) => r.json()),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
