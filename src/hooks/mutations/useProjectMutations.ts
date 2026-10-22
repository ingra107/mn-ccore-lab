import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
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
import type { Comment, ProjectLinkLibraryPayload, StoredLink } from '../useApiData'
import { nowInstant } from '../../lib/time'
import { useUndoToast } from '../../components/UndoToast'
import { PATHS } from '../../constants/paths'
import { bestPublicationMatch } from '../../lib/titleMatch'

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
      /** The first product (the project's home): kind and a stage on its ladder. */
      kind?: string
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
// so moving a just-published manuscript again doesn't re-nag.
const suggestedPublicationMatchSlugs = new Set<string>()

/**
 * #129 "Is this the paper?": offer to link the publication whose title best
 * matches the project's, when a MANUSCRIPT product reaches its ladder's
 * terminal rung (Published). The caller is the product stage write
 * (useSetProductStage); a project's own status going done is not a paper being
 * published, and a project's stage lives on its products (contract phase).
 * Skipped when the project already has a linked publication.
 */
export function suggestPaperLink(
  queryClient: ReturnType<typeof useQueryClient>,
  showInfo: ReturnType<typeof useUndoToast>['showInfo'],
  slug: string,
): void {
  if (suggestedPublicationMatchSlugs.has(slug)) return

  // Already linked? The per-slug cache exists only once ProjectDetail has
  // mounted; the Projects/Manuscripts tables hold the all-links rows
  // instead, keyed by project_slug — check both or the nag re-fires there.
  const existing = queryClient.getQueryData<{ id: string }[]>(['project-publications', slug])
  if (existing && existing.length > 0) return
  const allLinks = queryClient.getQueryData<{ project_slug: string | null }[]>(['project-publications', 'all'])
  if (allLinks?.some((l) => l.project_slug === slug)) return

  const project = cachedProjects(queryClient).find((p) => p.slug === slug)
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
}

/** Every cached project-list row set. The list lives under ['projects', params]
 *  (useProjects), one entry per filter; a bare ['projects'] entry may also
 *  exist. Read by prefix, never by one exact key. */
function cachedProjects(queryClient: QueryClient): Project[] {
  const rows: Project[] = []
  for (const [, data] of queryClient.getQueriesData<Project[]>({ queryKey: ['projects'] })) {
    if (Array.isArray(data)) rows.push(...data)
  }
  return rows
}

export function useUpdateProjectFields() {
  const queryClient = useQueryClient()
  const { showError } = useUndoToast()

  return useMutation({
    mutationFn: ({ slug, fields }: { slug: string; fields: Record<string, unknown> }) =>
      updateProject(slug, fields),

    onMutate: async ({ slug, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })

      // Patch every cached project list (all filters), keep the snapshots to roll back.
      const previousProjects = queryClient.getQueriesData<Project[]>({ queryKey: ['projects'] })
      queryClient.setQueriesData<Project[]>(
        { queryKey: ['projects'] },
        (old) => Array.isArray(old) ? old.map((p) => (p.slug === slug ? { ...p, ...fields } : p)) : old,
      )

      return { previousProjects }
    },

    onError: (err, { fields }, context) => {
      for (const [key, data] of context?.previousProjects ?? []) {
        queryClient.setQueryData(key, data)
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

/** `productId` is the chip the page validated against the project's live
 *  products (ProjectDetail); null posts project-wide. */
export function useAddComment(projectId: string, productId: string | null = null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CommentInput) => addProjectComment(projectId, { ...input, product_id: productId }),

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

export function usePostProjectUpdate(projectSlug: string, productId: string | null = null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { content: string; update_type?: string }) =>
      fetchApi(`/api/projects/${projectSlug}/updates`, {
        method: 'POST',
        // A note written while a product chip is selected belongs to that product.
        body: JSON.stringify({ ...input, product_id: productId }),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project-updates', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      // P2-A: notes land in activity_entries — refresh the unified feed.
      queryClient.invalidateQueries({ queryKey: ['project-activity', projectSlug] })
    },
  })
}

// ── Project page link writes (#2089, #151) ─────────────────

type LibraryPayload = ProjectLinkLibraryPayload

/** Every cache a link write can change: this project's library, the bulk
 *  per-project map and every task card (task cards inherit a project's key
 *  links, and a task link's own role/kind shows on its card). */
function invalidateLinkCaches(queryClient: QueryClient, projectSlug: string) {
  queryClient.invalidateQueries({ queryKey: ['project-link-library', projectSlug] })
  queryClient.invalidateQueries({ queryKey: ['project-links', projectSlug] })
  queryClient.invalidateQueries({ queryKey: ['all-project-links'] })
  queryClient.invalidateQueries({ queryKey: ['task-links'] })
}

/** Set one link's role (archive / restore) and/or kind, project- OR task-owned
 *  (#151: a task document archives from the project page; the task keeps it).
 *  Optimistic on the project page's library cache; rolls back and says why. A
 *  409 is usually a same-URL collision, which a silent revert would leave Nick
 *  guessing at. */
export function useUpdateLink(projectSlug: string) {
  const queryClient = useQueryClient()
  const { showError } = useUndoToast()
  const key = ['project-link-library', projectSlug]

  return useMutation({
    mutationFn: (input: { linkId: string; role?: 'key' | 'archive'; kind?: string | null }) => {
      const body: Record<string, unknown> = {}
      if (input.role !== undefined) body.role = input.role
      if (input.kind !== undefined) body.kind = input.kind
      return fetchApi<StoredLink>(`/api/links/${encodeURIComponent(input.linkId)}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LibraryPayload>(key)
      if (previous) {
        const apply = (l: StoredLink): StoredLink => l.id !== input.linkId ? l : {
          ...l,
          ...(input.role !== undefined ? { role: input.role, updated_at: nowInstant() } : {}),
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
        }
        queryClient.setQueryData<LibraryPayload>(key, {
          ...previous,
          links: previous.links.map(apply),
          taskLinks: previous.taskLinks.map(apply),
        })
      }
      return { previous }
    },

    onError: (err, input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
      const why = err instanceof Error && err.message ? err.message : 'request failed'
      const what = input.role === 'archive' ? 'archive' : input.role === 'key' ? 'restore' : 'label'
      showError(`Could not ${what} link — ${why}`)
    },

    onSettled: () => invalidateLinkCaches(queryClient, projectSlug),
  })
}

/** Promote a task's document onto its project (COPY: the task keeps its row). */
export function usePromoteLink(projectSlug: string) {
  const queryClient = useQueryClient()
  const { showError } = useUndoToast()
  return useMutation({
    mutationFn: (linkId: string) =>
      fetchApi<StoredLink>(`/api/links/${encodeURIComponent(linkId)}/promote`, { method: 'POST' }),
    onError: (err) => {
      const why = err instanceof Error && err.message ? err.message : 'request failed'
      showError(`Could not promote link — ${why}`)
    },
    onSettled: () => invalidateLinkCaches(queryClient, projectSlug),
  })
}

/** Add a document to the project from its page (replaces the project_documents
 *  form, #151). The Worker normalizes the URL; the row shows "On every task". */
export function useAddProjectLink(projectSlug: string) {
  const queryClient = useQueryClient()
  const { showError } = useUndoToast()
  return useMutation({
    mutationFn: (input: { url: string; title?: string; kind?: string | null }) =>
      fetchApi<StoredLink>(`/api/projects/${encodeURIComponent(projectSlug)}/links`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onError: (err) => {
      const why = err instanceof Error && err.message ? err.message : 'request failed'
      showError(`Could not add document — ${why}`)
    },
    onSettled: () => {
      invalidateLinkCaches(queryClient, projectSlug)
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Paper-Project link mutations ──────────────────────────

export function useLinkPaper() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { paper_id: string; project_slug: string; note?: string }) =>
      // fetchApi rejects on a non-2xx answer; raw fetch().json() read a
      // refusal as a success.
      fetchApi('/api/paper-links', { method: 'POST', body: JSON.stringify(input) }),
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
      fetchApi(`/api/paper-links/${id}/delete`, { method: 'POST' }),
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
