import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createProject, updateProject, addProjectComment } from '../../lib/api'
import { fetchApi } from '../../lib/api'
import type { Project } from '../../data/types'
import type { Comment } from '../useApiData'

// ── Project mutations ───────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      title: string
      category?: string
      stage?: string
      description?: string
      pi?: string
    }) => createProject(input),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

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

// ── Project Update mutations ────────────────────────────────

export function usePostProjectUpdate(projectSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { content: string; update_type?: string }) =>
      fetchApi(`/api/projects/${projectSlug}/updates`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project-updates', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Paper-Project link mutations ──────────────────────────

export function useLinkPaper() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { paper_id: string; project_slug: string; note?: string }) =>
      fetch('/api/paper-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-papers', variables.project_slug] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUnlinkPaper() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, project_slug }: { id: string; project_slug: string }) =>
      fetch(`/api/paper-links/${id}/delete`, { method: 'POST' }).then((r) => r.json()),
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-papers', variables.project_slug] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
