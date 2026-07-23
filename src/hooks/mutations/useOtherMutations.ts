import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, createDependency, deleteDependency, addExpertise, removeExpertise, createQuestion, createAnswer, acceptAnswer, createRevision, updateRevision, createRevisionComment, updateRevisionComment, createMenteeMilestone, updateMenteeMilestone, createSubmissionEvent, deleteSubmissionEvent, createGrantMilestone, updateGrantMilestone, completeGrantMilestone, createConference, updateConference, deleteConference } from '../../lib/api'
import { rollbackSnapshots } from './utils'
import { nowInstant } from '../../lib/time'
import type { DependencyRow, ExpertiseTag, RevisionRow, ReviewerCommentRow, MenteeMilestoneRow, SubmissionEventRow, SubmissionEventType, GrantMilestoneRow, ConferenceSubmissionRow, ConferenceSubmissionType, ConferenceStatus, MaterialsStatus, PresentationType } from '../../lib/api'

// ── Digest Status mutation ───────────────────────────────────

export function useUpdateDigestStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetchApi(`/api/digest/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),

    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['digest'] })
      // Snapshot all matching digest queries before the optimistic update
      const queries = queryClient.getQueriesData<unknown[]>({ queryKey: ['digest'] })
      const snapshots = queries.map(([key, data]) => ({ key, data }))
      // Optimistic update across all digest queries
      queryClient.setQueriesData({ queryKey: ['digest'] }, (old: unknown) => {
        if (!Array.isArray(old)) return old
        return old.map((p: Record<string, unknown>) => p.id === id ? { ...p, status } : p)
      })
      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      rollbackSnapshots(queryClient, context?.snapshots)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['digest'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Digest Comment mutation ─────────────────────────────────

export function useCreateDigestComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ paperId, content }: { paperId: string; content: string }) =>
      fetchApi(`/api/digest/${paperId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),

    onSettled: (_data, _err, { paperId }) => {
      queryClient.invalidateQueries({ queryKey: ['digest-comments', paperId] })
      queryClient.invalidateQueries({ queryKey: ['digest-comment-counts'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Task Update mutation ────────────────────────────────────

export function usePostTaskUpdate(taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { content: string; update_type?: string }) =>
      fetchApi(`/api/tasks/${taskId}/updates`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['task-updates', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Activity entry deletion (author or PI) ──────────────────
// POST /api/activity/:id/delete — hard-deletes an activity_entries row
// (comment/note/update). The server enforces author-or-PI; the UI only
// offers the button on entries the viewer may delete.
export function useDeleteActivityEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; taskId?: string; projectSlug?: string }) =>
      fetchApi(`/api/activity/${input.id}/delete`, { method: 'POST' }),

    onSettled: (_data, _err, input) => {
      if (input.taskId) {
        queryClient.invalidateQueries({ queryKey: ['task-activity', input.taskId] })
        queryClient.invalidateQueries({ queryKey: ['task-comments', input.taskId] })
        queryClient.invalidateQueries({ queryKey: ['task-detail', input.taskId] })
      }
      if (input.projectSlug) {
        queryClient.invalidateQueries({ queryKey: ['project-activity', input.projectSlug] })
      }
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useEditActivityEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; body: string; taskId?: string; projectSlug?: string }) =>
      fetchApi(`/api/activity/${input.id}/edit`, {
        method: 'POST',
        body: JSON.stringify({ body: input.body }),
      }),

    onSettled: (_data, _err, input) => {
      if (input.taskId) {
        queryClient.invalidateQueries({ queryKey: ['task-activity', input.taskId] })
        queryClient.invalidateQueries({ queryKey: ['task-comments', input.taskId] })
        queryClient.invalidateQueries({ queryKey: ['task-detail', input.taskId] })
      }
      if (input.projectSlug) {
        queryClient.invalidateQueries({ queryKey: ['project-activity', input.projectSlug] })
      }
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Activity thread dismiss / restore (author or PI) ────────
// POST /api/activity/:id/hide { hidden } — hides (dismiss) or restores a thread
// ROOT + its replies. Reversible, so the UI offers a single-click toggle (no
// two-step confirm like delete). The server enforces author-or-PI and that only
// a root is hideable. Invalidation-only (like useDeleteActivityEntry): the feeds
// filter hidden server-side, so a refetch drops/re-adds the row.
export function useDismissThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; hidden: boolean; taskId?: string; projectSlug?: string; artifactId?: string }) =>
      fetchApi(`/api/activity/${input.id}/hide`, {
        method: 'POST',
        body: JSON.stringify({ hidden: input.hidden }),
      }),

    onSettled: (_data, _err, input) => {
      if (input.taskId) {
        queryClient.invalidateQueries({ queryKey: ['task-activity', input.taskId] })
        queryClient.invalidateQueries({ queryKey: ['task-detail', input.taskId] })
      }
      if (input.projectSlug) {
        queryClient.invalidateQueries({ queryKey: ['project-activity', input.projectSlug] })
      }
      if (input.artifactId) {
        queryClient.invalidateQueries({ queryKey: ['artifact-activity', input.artifactId] })
      }
      // A dismissed thread must not keep raising the teal ● "new activity" badge.
      queryClient.invalidateQueries({ queryKey: ['unseen-activity'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Reaction mutations ─────────────────────────────────────

export function useToggleReaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { target_type: string; target_id: string; emoji: string }) =>
      fetchApi('/api/reactions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reactions', variables.target_type, variables.target_id] })
    },
  })
}

// ── Handoff mutations ─────────────────────────────────────

export function useCreateHandoff(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      to_slug: string
      situation: string
      background?: string
      assessment?: string
      recommendation?: string
    }) =>
      // M09: use fetchApi so non-OK responses throw ApiError and reach onError
      // (pre-fix: raw fetch().then(json) silently resolved with error JSON body).
      fetchApi(`/api/tasks/${taskId}/handoffs`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useAcknowledgeHandoff(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (handoffId: string) =>
      // M09: use fetchApi so non-OK responses throw ApiError and reach onError.
      fetchApi(`/api/handoffs/${handoffId}/acknowledge`, { method: 'POST' }),
    onMutate: async (handoffId) => {
      await queryClient.cancelQueries({ queryKey: ['handoffs', taskId] })
      const prev = queryClient.getQueryData<{ id: string; acknowledged: number }[]>(['handoffs', taskId])
      if (prev) {
        queryClient.setQueryData(['handoffs', taskId], prev.map((h) =>
          h.id === handoffId ? { ...h, acknowledged: 1, acknowledged_at: nowInstant() } : h
        ))
      }
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['handoffs', taskId], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs', taskId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Dependency mutations ──────────────────────────────────

export function useCreateDependency() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { from_slug: string; to_slug: string; relationship_type?: string; note?: string }) =>
      createDependency(input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['dependencies'] })
      const prev = queryClient.getQueryData<DependencyRow[]>(['dependencies'])
      if (prev) {
        const optimistic: DependencyRow = {
          id: `temp-${Date.now()}`,
          from_slug: input.from_slug,
          to_slug: input.to_slug,
          relationship_type: input.relationship_type || 'feeds_into',
          note: input.note || null,
          created_by: null,
          created_at: nowInstant(),
        }
        queryClient.setQueryData(['dependencies'], [optimistic, ...prev])
      }
      return { prev }
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['dependencies'], ctx.prev)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useDeleteDependency() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteDependency(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['dependencies'] })
      const prev = queryClient.getQueryData<DependencyRow[]>(['dependencies'])
      if (prev) {
        queryClient.setQueryData(['dependencies'], prev.filter((d) => d.id !== id))
      }
      return { prev }
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['dependencies'], ctx.prev)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Expertise mutations ────────────────────────────────────

export function useAddExpertise(memberSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { tag: string; source?: string; confidence?: number }) =>
      addExpertise({ member_slug: memberSlug, ...input }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['expertise', memberSlug] })
      queryClient.invalidateQueries({ queryKey: ['expertise', 'all'] })
    },
  })
}

export function useRemoveExpertise(memberSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => removeExpertise(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['expertise', memberSlug] })
      const prev = queryClient.getQueryData<ExpertiseTag[]>(['expertise', memberSlug])
      if (prev) {
        queryClient.setQueryData(['expertise', memberSlug], prev.filter((t) => t.id !== id))
      }
      return { prev }
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['expertise', memberSlug], ctx.prev)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['expertise', memberSlug] })
      queryClient.invalidateQueries({ queryKey: ['expertise', 'all'] })
    },
  })
}

// ── Question mutations (Ask the Lab) ─────────────────────────

export function useCreateQuestion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { question: string; context?: string; project_slug?: string }) =>
      createQuestion(input),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useCreateAnswer(questionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (content: string) => createAnswer(questionId, content),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['question', questionId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useAcceptAnswer(questionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (answerId: string) => acceptAnswer(answerId),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      queryClient.invalidateQueries({ queryKey: ['question', questionId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Revision tracker mutations ────────────────────────────────

export function useCreateRevision(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      project_id: string
      round?: number
      submitted_at?: string
      response_due?: string
      status?: string
      journal?: string
      notes?: string
    }) => createRevision(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['revisions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['revisions-active'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateRevision(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{ submitted_at: string; response_due: string; status: string; journal: string; notes: string }> }) =>
      updateRevision(id, fields),
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['revisions', projectId] })
      const previous = queryClient.getQueryData<RevisionRow[]>(['revisions', projectId])
      if (previous) {
        queryClient.setQueryData<RevisionRow[]>(
          ['revisions', projectId],
          previous.map((r) => r.id === id ? { ...r, ...fields } : r),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['revisions', projectId], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['revisions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['revisions-active'] })
    },
  })
}

export function useCreateRevisionComment(revisionId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      reviewer_number?: number
      comment_text: string
      assigned_to?: string
      status?: string
      response_text?: string
    }) => createRevisionComment(revisionId, input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['revision-comments', revisionId] })
      queryClient.invalidateQueries({ queryKey: ['revisions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['revisions-active'] })
    },
  })
}

export function useUpdateRevisionComment(revisionId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{ status: string; response_text: string; assigned_to: string; comment_text: string }> }) =>
      updateRevisionComment(id, fields),
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['revision-comments', revisionId] })
      const previous = queryClient.getQueryData<ReviewerCommentRow[]>(['revision-comments', revisionId])
      if (previous) {
        queryClient.setQueryData<ReviewerCommentRow[]>(
          ['revision-comments', revisionId],
          previous.map((c) => c.id === id ? { ...c, ...fields } : c),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['revision-comments', revisionId], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['revision-comments', revisionId] })
      queryClient.invalidateQueries({ queryKey: ['revisions', projectId] })
      queryClient.invalidateQueries({ queryKey: ['revisions-active'] })
    },
  })
}

// ── Mentee Milestone mutations ─────────────────────────────

export function useCreateMenteeMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      mentee_slug: string
      milestone_type: string
      title: string
      description?: string
      due_date?: string
      notes?: string
      status?: string
    }) => createMenteeMilestone(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mentee-milestones'] })
      queryClient.invalidateQueries({ queryKey: ['mentee-milestones-overview'] })
    },
  })
}

export function useUpdateMenteeMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{ title: string; description: string; due_date: string; notes: string; status: string; milestone_type: string; mentee_slug: string }> }) =>
      updateMenteeMilestone(id, fields),
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['mentee-milestones'] })
      const queries = queryClient.getQueriesData<MenteeMilestoneRow[]>({ queryKey: ['mentee-milestones'] })
      for (const [key, data] of queries) {
        if (data) {
          queryClient.setQueryData<MenteeMilestoneRow[]>(
            key,
            data.map((m) => m.id === id ? { ...m, ...fields } : m),
          )
        }
      }
      return { queries }
    },
    onError: (_err, _vars, context) => {
      if (context?.queries) {
        for (const [key, data] of context.queries) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mentee-milestones'] })
      queryClient.invalidateQueries({ queryKey: ['mentee-milestones-overview'] })
    },
  })
}

// ── Submission lifecycle mutations ────────────────────────────

export function useCreateSubmissionEvent(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      project_id: string
      event_type: SubmissionEventType
      event_date: string
      journal?: string
      notes?: string
    }) => createSubmissionEvent(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['submission-events', projectId] })
      queryClient.invalidateQueries({ queryKey: ['submissions-active'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useDeleteSubmissionEvent(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSubmissionEvent(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['submission-events', projectId] })
      const previous = queryClient.getQueryData<SubmissionEventRow[]>(['submission-events', projectId])
      if (previous) {
        queryClient.setQueryData<SubmissionEventRow[]>(
          ['submission-events', projectId],
          previous.filter((e) => e.id !== id),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['submission-events', projectId], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['submission-events', projectId] })
      queryClient.invalidateQueries({ queryKey: ['submissions-active'] })
    },
  })
}

// ── Grant Post-Award Milestone mutations ─────────────────────────

export function useCreateGrantMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      grant_id: string
      milestone_type: string
      title: string
      due_date?: string
      notes?: string
      status?: string
    }) => createGrantMilestone(input),
    onSettled: (_data, _err, input) => {
      queryClient.invalidateQueries({ queryKey: ['grant-milestones', input.grant_id] })
      queryClient.invalidateQueries({ queryKey: ['grant-milestones-upcoming'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateGrantMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{ title: string; due_date: string; notes: string; status: string; milestone_type: string; grant_id: string }> }) =>
      updateGrantMilestone(id, fields),
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['grant-milestones-upcoming'] })
      const previous = queryClient.getQueryData<GrantMilestoneRow[]>(['grant-milestones-upcoming'])
      if (previous) {
        queryClient.setQueryData<GrantMilestoneRow[]>(
          ['grant-milestones-upcoming'],
          previous.map((m) => m.id === id ? { ...m, ...fields } : m),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['grant-milestones-upcoming'], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['grant-milestones'] })
      queryClient.invalidateQueries({ queryKey: ['grant-milestones-upcoming'] })
    },
  })
}

// R10: partial-update for grants (status, title, dates, agency, etc.)
export function useUpdateGrant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => {
      const res = await fetch(`/api/grants/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) throw new Error(`Failed to update grant: ${res.status}`)
      return res.json()
    },
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['grants-timeline'] })
      const previous = queryClient.getQueryData<unknown[]>(['grants-timeline'])
      if (previous) {
        queryClient.setQueryData<unknown[]>(
          ['grants-timeline'],
          previous.map((g) => {
            const grant = g as { id: string }
            return grant.id === id ? { ...grant, ...fields } : g
          }),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['grants-timeline'], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['grants-timeline'] })
      queryClient.invalidateQueries({ queryKey: ['grants'] })
    },
  })
}

export function useCompleteGrantMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => completeGrantMilestone(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['grant-milestones'] })
      queryClient.invalidateQueries({ queryKey: ['grant-milestones-upcoming'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Conference submission mutations ─────────────────────────

export function useCreateConference(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      project_id?: string
      conference: string
      conference_date?: string
      submission_type: ConferenceSubmissionType
      title: string
      authors?: string
      abstract_due?: string
      status?: ConferenceStatus
      notes?: string
    }) => createConference(input),
    onSettled: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ['conferences', projectId] })
      queryClient.invalidateQueries({ queryKey: ['conferences-upcoming'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateConference(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{
      project_id: string
      conference: string
      conference_date: string
      submission_type: ConferenceSubmissionType
      title: string
      authors: string
      abstract_due: string
      abstract_submitted_at: string
      accepted_at: string
      presentation_type: PresentationType
      materials_status: MaterialsStatus
      travel_booked: number
      notes: string
      status: ConferenceStatus
    }> }) => updateConference(id, fields),
    onMutate: async ({ id, fields }) => {
      const key = projectId ? ['conferences', projectId] : ['conferences-upcoming']
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ConferenceSubmissionRow[]>(key)
      if (previous) {
        queryClient.setQueryData<ConferenceSubmissionRow[]>(
          key,
          previous.map((c) => c.id === id ? { ...c, ...fields } as ConferenceSubmissionRow : c),
        )
      }
      return { previous, key }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ['conferences', projectId] })
      queryClient.invalidateQueries({ queryKey: ['conferences-upcoming'] })
    },
  })
}

export function useDeleteConference(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteConference(id),
    onMutate: async (id) => {
      const key = projectId ? ['conferences', projectId] : ['conferences-upcoming']
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ConferenceSubmissionRow[]>(key)
      if (previous) {
        queryClient.setQueryData<ConferenceSubmissionRow[]>(
          key,
          previous.filter((c) => c.id !== id),
        )
      }
      return { previous, key }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ['conferences', projectId] })
      queryClient.invalidateQueries({ queryKey: ['conferences-upcoming'] })
    },
  })
}
