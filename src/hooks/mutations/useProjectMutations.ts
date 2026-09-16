import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  createProject,
  updateProject,
  addProjectComment,
  fetchApi,
  linkProjectPublication,
  unlinkProjectPublication,
  type PublicationRole,
} from '../../lib/api'
import type { Project, Publication } from '../../data/types'
import type { Comment, ProjectDocumentRow } from '../useApiData'
import { nowInstant } from '../../lib/time'
import { useUndoToast } from '../../components/UndoToast'
import { PATHS } from '../../constants/paths'
import { normalizeStage } from '../../lib/stageNormalize'
import { bestPublicationMatch } from '../../lib/titleMatch'
import { isProjectFinished } from '../../lib/taskConstants'

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

// Every inline project edit (ProjectDetail meta row + stage strip, Projects
// and Manuscripts table cells) goes through this ONE optimistic writer.
// Before #128 the same merge lived in three copies, and all three rolled a
// failed write back in silence: the undo toast had already said "Stage →
// Writing", the row kept its old value, and nothing named the reason. Now a
// rejected write surfaces the server's message (Rule 35 400s, mutation 409s,
// auth 401s) so the next report carries the cause instead of "it didn't change".
// #129 "Is this the paper?" — surfaced at most once per project per session,
// so re-editing other fields on a just-published project doesn't re-nag.
const suggestedPublicationMatchSlugs = new Set<string>()

export function useUpdateProjectFields() {
  const queryClient = useQueryClient()
  const { showError, showInfo } = useUndoToast()

  return useMutation({
    mutationFn: ({ slug, fields }: { slug: string; fields: Record<string, unknown> }) =>
      updateProject(slug, fields),

    onMutate: async ({ slug, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })

      const previousProjects = queryClient.getQueryData<Project[]>(['projects'])

      if (previousProjects) {
        // Ingress chokepoint (Hub #361a): this optimistic merge feeds the
        // SAME `['projects']` cache Projects.tsx/ManuscriptsPage.tsx read
        // (both normalize-free downstream of rowToProject). `fields.stage`
        // is toApiStage() wire-shape output when the caller is a stage
        // change — needed as-is for the mutationFn PATCH body, but the local
        // cache write must hold the UI canonical value.
        const optimisticFields = 'stage' in fields && fields.stage != null
          ? { ...fields, stage: (normalizeStage(fields.stage as string) || fields.stage) as Project['stage'] }
          : fields
        queryClient.setQueryData<Project[]>(
          ['projects'],
          previousProjects.map((p) =>
            p.slug === slug ? { ...p, ...optimisticFields } : p
          )
        )
      }

      return { previousProjects }
    },

    onError: (err, { fields }, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects)
      }
      const what = Object.keys(fields).join(', ') || 'project'
      const why = err instanceof Error && err.message ? err.message : 'request failed'
      showError(`Could not save ${what} — ${why}`)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },

    onSuccess: (_resp, { slug, fields }) => {
      if (!isProjectFinished(fields as { status?: string | null; stage?: string | null }) || suggestedPublicationMatchSlugs.has(slug)) return

      // Already linked? The per-slug cache exists only once ProjectDetail has
      // mounted; the Projects/Manuscripts tables hold the all-links rows
      // instead, keyed by project_slug — check both or the nag re-fires there.
      const existing = queryClient.getQueryData<{ id: string }[]>(['project-publications', slug])
      if (existing && existing.length > 0) return
      const allLinks = queryClient.getQueryData<{ project_slug: string | null }[]>(['project-publications', 'all'])
      if (allLinks?.some((l) => l.project_slug === slug)) return

      const projects = queryClient.getQueryData<Project[]>(['projects'])
      const project = projects?.find((p) => p.slug === slug)
      const title = project?.title
      if (!title) return

      const candidates = queryClient.getQueryData<Publication[]>(['publications', undefined])
      if (!candidates || candidates.length === 0) return

      const match = bestPublicationMatch(title, candidates)
      if (!match) return

      suggestedPublicationMatchSlugs.add(slug)
      const { pub } = match
      const detail = [pub.journal, pub.year].filter(Boolean).join(' ')
      showInfo(`Is this the paper? ${pub.title}${detail ? ` (${detail})` : ''}`, {
        label: 'Link',
        onClick: () => {
          linkProjectPublication(slug, { publication_id: pub.id, role: 'primary' }).then(() => {
            queryClient.invalidateQueries({ queryKey: ['project-publications', slug] })
            queryClient.invalidateQueries({ queryKey: ['project-publications', 'all'] })
          })
        },
      })
    },
  })
}

// Slug-bound form for a single-project surface (ProjectDetail).
export function useUpdateProject(projectId: string) {
  const inline = useUpdateProjectFields()
  return {
    ...inline,
    mutate: (fields: Partial<Project>) => inline.mutate({ slug: projectId, fields }),
  }
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
      // (projectId here IS the slug — same key shape usePostProjectUpdate uses.)
      queryClient.invalidateQueries({ queryKey: ['project-activity', projectId] })
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
    mutationFn: ({ id }: { id: string; project_slug: string }) =>
      fetch(`/api/paper-links/${id}/delete`, { method: 'POST' }).then((r) => r.json()),
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-papers', variables.project_slug] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Project-Publication (published output) mutations, #129 ─
// Distinct from useLinkPaper/useUnlinkPaper above (paper_project_links —
// the Literature tab's reading list). This is the project_publications
// junction — the project's own published output.

export function useLinkProjectPublication(slug: string) {
  const queryClient = useQueryClient()
  const { showError } = useUndoToast()
  return useMutation({
    mutationFn: (input: { publication_id: string; role?: PublicationRole }) =>
      linkProjectPublication(slug, input),
    onError: (err) => {
      const why = err instanceof Error && err.message ? err.message : 'request failed'
      showError(`Could not link publication — ${why}`)
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-publications', slug] })
      queryClient.invalidateQueries({ queryKey: ['project-publications', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['linked-projects', variables.publication_id] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUnlinkProjectPublication(slug: string) {
  const queryClient = useQueryClient()
  const { showError } = useUndoToast()
  return useMutation({
    mutationFn: (publicationId: string) => unlinkProjectPublication(slug, publicationId),
    onError: (err) => {
      const why = err instanceof Error && err.message ? err.message : 'request failed'
      showError(`Could not unlink publication — ${why}`)
    },
    onSettled: (_data, _err, publicationId) => {
      queryClient.invalidateQueries({ queryKey: ['project-publications', slug] })
      queryClient.invalidateQueries({ queryKey: ['project-publications', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['linked-projects', publicationId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
