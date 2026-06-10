import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createProject, updateProject, addProjectComment, fetchApi } from '../../lib/api'
import type { Project } from '../../data/types'
import type { Comment, ProjectDocumentRow } from '../useApiData'
import { nowInstant } from '../../lib/time'
import { useUndoToast } from '../../components/UndoToast'
import { PATHS } from '../../constants/paths'

// ── Project mutations ───────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient()
  // S16: creates must not end in silence. Both consumers (Projects /
  // Manuscripts) call .mutate(input) with no onSuccess, so the toast +
  // navigation live here so every create surfaces a working "Open →".
  const navigate = useNavigate()
  const { showSuccess } = useUndoToast()

  return useMutation({
    mutationFn: (input: {
      title: string
      category?: string
      stage?: string
      description?: string
      pi?: string
    }) => createProject(input),

    onSuccess: (resp) => {
      const slug = resp?.data?.slug
      showSuccess(
        'Project created',
        slug ? { label: 'Open →', onClick: () => navigate(PATHS.project(slug)) } : undefined,
      )
    },

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
      await queryClient.cancelQueries({ queryKey: ['projects'] })

      const previousProjects = queryClient.getQueryData<Project[]>(['projects'])

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
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects)
      }
    },

    onSettled: () => {
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
        created_at: nowInstant(),
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
      // P2-A: comments land in activity_entries — refresh the unified feed.
      queryClient.invalidateQueries({ queryKey: ['project-activity'] })
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
      // P2-A: notes land in activity_entries — refresh the unified feed.
      queryClient.invalidateQueries({ queryKey: ['project-activity', projectSlug] })
    },
  })
}

// ── Project Document mutations ─────────────────────────────

export function useAddProjectDocument(projectSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { title: string; url: string; doc_type?: string }) =>
      fetchApi<ProjectDocumentRow>(`/api/projects/${projectSlug}/documents`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['project-documents', projectSlug] })
      const previous = queryClient.getQueryData<ProjectDocumentRow[]>(['project-documents', projectSlug])

      const optimistic: ProjectDocumentRow = {
        id: `temp-${Date.now()}`,
        project_id: projectSlug,
        title: input.title,
        url: input.url,
        doc_type: (input.doc_type as ProjectDocumentRow['doc_type']) || 'link',
        created_at: nowInstant(),
        created_by: null,
      }

      queryClient.setQueryData<ProjectDocumentRow[]>(
        ['project-documents', projectSlug],
        [optimistic, ...(previous || [])]
      )

      return { previous }
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['project-documents', projectSlug], context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useDeleteProjectDocument(projectSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (docId: string) =>
      fetch(`/api/projects/${projectSlug}/documents/${docId}/delete`, { method: 'POST' }).then(r => r.json()),

    onMutate: async (docId) => {
      await queryClient.cancelQueries({ queryKey: ['project-documents', projectSlug] })
      const previous = queryClient.getQueryData<ProjectDocumentRow[]>(['project-documents', projectSlug])

      queryClient.setQueryData<ProjectDocumentRow[]>(
        ['project-documents', projectSlug],
        (previous || []).filter(d => d.id !== docId)
      )

      return { previous }
    },

    onError: (_err, _docId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['project-documents', projectSlug], context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectSlug] })
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
