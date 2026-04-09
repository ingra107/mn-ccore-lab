/**
 * TanStack Query v5 mutation hooks with optimistic updates.
 *
 * Each mutation:
 * 1. Optimistically updates the cache immediately (instant UI feedback)
 * 2. Sends the request to D1
 * 3. Rolls back on error, invalidates on success
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, createProject, updateProject, addProjectComment, createTask, updateTaskStatus, updateTask, acknowledgeTask, createIdea, updateIdea, voteIdea, createDependency, deleteDependency, addExpertise, removeExpertise, createQuestion, createAnswer, acceptAnswer, createRevision, updateRevision, createRevisionComment, updateRevisionComment, createMenteeMilestone, updateMenteeMilestone, completeMenteeMilestone, createDeadlineDependency, deleteDeadlineDependency, createSubmissionEvent, updateSubmissionEvent, deleteSubmissionEvent, createRegulatoryItem, updateRegulatoryItem, renewRegulatoryItem, createGrantMilestone, updateGrantMilestone, completeGrantMilestone, createConference, updateConference, deleteConference, createPBSession, bulkCreatePBSessions } from '../lib/api'
import type { DependencyRow, ExpertiseTag, RevisionRow, ReviewerCommentRow, MenteeMilestoneRow, SubmissionEventRow, SubmissionEventType, RegulatoryItemRow, GrantMilestoneRow, ConferenceSubmissionRow, ConferenceSubmissionType, ConferenceStatus, MaterialsStatus, PresentationType } from '../lib/api'
import type { TaskRow, IdeaRow } from '../lib/api'
import type { Project } from '../data/types'
import type { Comment, SubtaskRow } from './useApiData'

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

// ── Team profile mutation ───────────────────────────────────

export function useUpdateProfile(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fields: Record<string, string | null>) =>
      fetchApi(`/api/team/${slug}`, {
        method: 'PUT',
        body: JSON.stringify(fields),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Action Item mutations ───────────────────────────────────

import type { ActionItemRow } from './useApiData'

export function useToggleActionItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) =>
      fetchApi(`/api/action-items/${itemId}/toggle`, {
        method: 'POST',
      }),

    onMutate: async (itemId) => {
      // Optimistically toggle in all action-items caches
      const queries = queryClient.getQueriesData<ActionItemRow[]>({ queryKey: ['action-items'] })
      const snapshots: { key: readonly unknown[]; data: ActionItemRow[] | undefined }[] = []

      for (const [key, data] of queries) {
        snapshots.push({ key, data })
        if (data) {
          queryClient.setQueryData(
            key,
            data.map((item) =>
              item.id === itemId
                ? { ...item, completed: item.completed ? 0 : 1, completed_at: item.completed ? null : new Date().toISOString() }
                : item
            )
          )
        }
      }

      // Also update meeting detail caches
      const meetingQueries = queryClient.getQueriesData<{ action_items?: ActionItemRow[] }>({ queryKey: ['meeting'] })
      for (const [key, data] of meetingQueries) {
        if (data?.action_items) {
          queryClient.setQueryData(key, {
            ...data,
            action_items: data.action_items.map((item) =>
              item.id === itemId
                ? { ...item, completed: item.completed ? 0 : 1 }
                : item
            ),
          })
        }
      }

      return { snapshots }
    },

    onError: (_err, _itemId, context) => {
      if (context?.snapshots) {
        for (const { key, data } of context.snapshots) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['meeting'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useCreateActionItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { meeting_id?: string; project_id?: string; description: string; assignee: string; due_date?: string }) =>
      fetchApi('/api/action-items', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['meeting'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Agenda Item mutations ───────────────────────────────────

export function useAddAgendaItem(meetingId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { content: string; project_id?: string; type?: string; document_url?: string }) =>
      fetchApi(`/api/meetings/${meetingId}/agenda`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── Meeting Notes mutation ──────────────────────────────────

export function useUpdateMeetingNotes(meetingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notes: string) =>
      fetchApi(`/api/meetings/${meetingId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

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
      // Optimistic update across all digest queries
      queryClient.setQueriesData({ queryKey: ['digest'] }, (old: unknown) => {
        if (!Array.isArray(old)) return old
        return old.map((p: Record<string, unknown>) => p.id === id ? { ...p, status } : p)
      })
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['digest'] })
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

// ── Task mutations ──────────────────────────────────────────

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      title?: string
      description: string
      assignee: string
      meeting_id?: string
      project_id?: string
      due_date?: string
      priority?: string
    }) => createTask(input),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateTaskStatus(id, status),

    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })

      const queries = queryClient.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
      const snapshots: { key: readonly unknown[]; data: TaskRow[] | undefined }[] = []

      for (const [key, data] of queries) {
        snapshots.push({ key, data })
        if (data) {
          queryClient.setQueryData(
            key,
            data.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status,
                    completed: status === 'done' ? 1 : 0,
                    completed_at: status === 'done' ? new Date().toISOString() : null,
                  }
                : t
            )
          )
        }
      }

      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const { key, data } of context.snapshots) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['meeting'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Record<string, unknown> }) =>
      updateTask(id, fields),

    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })

      const queries = queryClient.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
      const snapshots: { key: readonly unknown[]; data: TaskRow[] | undefined }[] = []

      for (const [key, data] of queries) {
        snapshots.push({ key, data })
        if (data) {
          queryClient.setQueryData(
            key,
            data.map((t) => t.id === id ? { ...t, ...fields } : t)
          )
        }
      }

      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const { key, data } of context.snapshots) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

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

// ── Subtask mutations ──────────────────────────────────────

export function useCreateSubtask(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) =>
      fetchApi(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useToggleSubtask(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (subtaskId: string) =>
      fetchApi(`/api/subtasks/${subtaskId}/toggle`, { method: 'POST' }),
    onMutate: async (subtaskId) => {
      await queryClient.cancelQueries({ queryKey: ['subtasks', taskId] })
      const prev = queryClient.getQueryData<SubtaskRow[]>(['subtasks', taskId])
      if (prev) {
        queryClient.setQueryData(['subtasks', taskId], prev.map((s) =>
          s.id === subtaskId ? { ...s, completed: s.completed ? 0 : 1, completed_at: s.completed ? null : new Date().toISOString() } : s
        ))
      }
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['subtasks', taskId], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
    },
  })
}

export function useDeleteSubtask(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (subtaskId: string) =>
      fetchApi(`/api/subtasks/${subtaskId}/delete`, { method: 'POST' }),
    onMutate: async (subtaskId) => {
      await queryClient.cancelQueries({ queryKey: ['subtasks', taskId] })
      const prev = queryClient.getQueryData<SubtaskRow[]>(['subtasks', taskId])
      if (prev) {
        queryClient.setQueryData(['subtasks', taskId], prev.filter(s => s.id !== subtaskId))
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['subtasks', taskId], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
    },
  })
}

export function useVoteIdea() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => voteIdea(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['ideas'] })
      const queries = queryClient.getQueriesData<IdeaRow[]>({ queryKey: ['ideas'] })
      for (const [key, data] of queries) {
        if (data) {
          queryClient.setQueryData(key, data.map((i) => i.id === id ? { ...i, votes: i.votes + 1 } : i))
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
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

// ── Reaction mutations ─────────────────────────────────────

export function useToggleReaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { target_type: string; target_id: string; emoji: string }) =>
      fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),
    onMutate: async (input) => {
      const key = ['reactions', input.target_type, input.target_id]
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData(key)
      // Optimistically toggle — invalidation will correct
      return { prev, key }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(context.key, context.prev)
    },
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
      fetch(`/api/tasks/${taskId}/handoffs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useAcknowledgeHandoff(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (handoffId: string) =>
      fetch(`/api/handoffs/${handoffId}/acknowledge`, { method: 'POST' }).then((r) => r.json()),
    onMutate: async (handoffId) => {
      await queryClient.cancelQueries({ queryKey: ['handoffs', taskId] })
      const prev = queryClient.getQueryData<{ id: string; acknowledged: number }[]>(['handoffs', taskId])
      if (prev) {
        queryClient.setQueryData(['handoffs', taskId], prev.map((h) =>
          h.id === handoffId ? { ...h, acknowledged: 1, acknowledged_at: new Date().toISOString() } : h
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

// ── Bulk task mutations ────────────────────────────────────

export function useBulkUpdateTasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { ids: string[]; action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete'; value?: string }) =>
      fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),

    onMutate: async ({ ids, action, value }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const queries = queryClient.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
      const snapshots: { key: readonly unknown[]; data: TaskRow[] | undefined }[] = []
      for (const [key, data] of queries) {
        snapshots.push({ key, data })
        if (data) {
          queryClient.setQueryData(key, data.map(t => {
            if (!ids.includes(t.id)) return t
            if (action === 'complete') return { ...t, completed: 1, status: 'done' }
            if (action === 'uncomplete') return { ...t, completed: 0, status: 'todo' }
            if (action === 'priority' && value) return { ...t, priority: value }
            if (action === 'assign' && value) return { ...t, assignee: value }
            if (action === 'delete') return { ...t, deleted_at: new Date().toISOString() }
            return t
          }))
        }
      }
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const { key, data } of context.snapshots) queryClient.setQueryData(key, data)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

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
          created_at: new Date().toISOString(),
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

// ── PB Sector mutations ──────────────────────────────────

export function usePBCapture() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { text: string; type?: 'task' | 'idea' | 'note'; priority?: string; project?: string }) =>
      fetch('/api/pb/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function usePBDefer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; to: 'tomorrow' | 'next_week' | 'someday' }) =>
      fetch('/api/pb/defer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ── PB Sector v2 — Daily Plan mutations ─────────────────────

export function useSaveDailyPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; star_task_id?: string | null; focus_task_ids?: string[]; quick_win_ids?: string[]; evening_task_ids?: string[]; intention?: string; gratitude?: string }) =>
      fetch('/api/pb/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function useReorderPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; slot_type: 'focus' | 'quick_win' | 'evening'; task_ids: string[] }) =>
      fetch('/api/pb/plan/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function usePromoteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; task_id: string; from_slot: string; to_slot: string }) =>
      fetch('/api/pb/plan/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function useStartPomodoro() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { task_id: string; plan_date: string; slot_type: string; duration_minutes?: number }) =>
      fetch('/api/pb/pomodoro/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function useCompletePomodoro() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string }) =>
      fetch('/api/pb/pomodoro/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function useSaveReflection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; highlight?: string; learned?: string; energy_rating?: number; focus_rating?: number; notes?: string }) =>
      fetch('/api/pb/reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

// ── Dispatch queue mutations ────────────────────────────────

export function useAddToDispatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { task_id?: string; task_title?: string; project_slug?: string; comment: string; comment_type?: 'action' | 'info' }) =>
      fetch('/api/pb/dispatch/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-pending'] })
    },
  })
}

export function useSendDispatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      fetch('/api/pb/dispatch/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-pending'] })
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

// ── TODAY.md mutations ────────────────────────────────────────

export function useUpdateTodayMd() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) =>
      fetch('/api/pb/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['today-md'] })
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

export function useCompleteMenteeMilestone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => completeMenteeMilestone(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['mentee-milestones'] })
      queryClient.invalidateQueries({ queryKey: ['mentee-milestones-overview'] })
    },
  })
}

// ── Deadline cascade dependency mutations ──────────────────

export function useCreateDeadlineDependency() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      upstream_id: string
      upstream_type: string
      downstream_id: string
      downstream_type: string
      lag_days?: number
      notes?: string
    }) => createDeadlineDependency(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deadline-cascade'] })
      queryClient.invalidateQueries({ queryKey: ['deadline-cascade-all'] })
      queryClient.invalidateQueries({ queryKey: ['deadline-impact'] })
    },
  })
}

export function useDeleteDeadlineDependency() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDeadlineDependency(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deadline-cascade'] })
      queryClient.invalidateQueries({ queryKey: ['deadline-cascade-all'] })
      queryClient.invalidateQueries({ queryKey: ['deadline-impact'] })
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

export function useUpdateSubmissionEvent(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{ event_type: SubmissionEventType; event_date: string; journal: string; notes: string }> }) =>
      updateSubmissionEvent(id, fields),
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['submission-events', projectId] })
      const previous = queryClient.getQueryData<SubmissionEventRow[]>(['submission-events', projectId])
      if (previous) {
        queryClient.setQueryData<SubmissionEventRow[]>(
          ['submission-events', projectId],
          previous.map((e) => e.id === id ? { ...e, ...fields } : e),
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

// ── Regulatory & Compliance mutations ─────────────────────────

export function useCreateRegulatoryItem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      project_id: string
      item_type: string
      title: string
      protocol_number?: string
      approved_date?: string
      expiration_date?: string
      renewal_due?: string
      status?: string
      notes?: string
    }) => createRegulatoryItem(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['regulatory', projectId] })
      queryClient.invalidateQueries({ queryKey: ['regulatory-expiring'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useUpdateRegulatoryItem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<{ title: string; item_type: string; protocol_number: string; approved_date: string; expiration_date: string; renewal_due: string; status: string; notes: string }> }) =>
      updateRegulatoryItem(id, fields),
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['regulatory', projectId] })
      const previous = queryClient.getQueryData<RegulatoryItemRow[]>(['regulatory', projectId])
      if (previous) {
        queryClient.setQueryData<RegulatoryItemRow[]>(
          ['regulatory', projectId],
          previous.map((r) => r.id === id ? { ...r, ...fields } : r),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['regulatory', projectId], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['regulatory', projectId] })
      queryClient.invalidateQueries({ queryKey: ['regulatory-expiring'] })
    },
  })
}

export function useRenewRegulatoryItem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { approved_date?: string; expiration_date?: string; renewal_due?: string; notes?: string } }) =>
      renewRegulatoryItem(id, input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['regulatory', projectId] })
      queryClient.invalidateQueries({ queryKey: ['regulatory-expiring'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
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

// ── PB Sessions mutations ──────────────────────────────────

export function useCreatePBSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      id?: string
      started_at: string
      ended_at?: string
      machine?: string
      project_name?: string
      summary?: string
      actions_count?: number
      commits_count?: number
      duration_minutes?: number
    }) => createPBSession(input),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['pb-session-stats'] })
    },
  })
}

export function useBulkCreatePBSessions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessions: Array<{
      id?: string
      started_at: string
      ended_at?: string
      machine?: string
      project_name?: string
      summary?: string
      actions_count?: number
      commits_count?: number
      duration_minutes?: number
    }>) => bulkCreatePBSessions(sessions),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['pb-session-stats'] })
    },
  })
}

// ── Task Acknowledgment (closed-loop communication) ─────────

export function useAcknowledgeTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => acknowledgeTask(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })

      const queries = queryClient.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })
      const snapshots: { key: readonly unknown[]; data: TaskRow[] | undefined }[] = []

      for (const [key, data] of queries) {
        snapshots.push({ key, data })
        if (data) {
          queryClient.setQueryData(
            key,
            data.map((t) =>
              t.id === id
                ? { ...t, acknowledged_at: new Date().toISOString(), acknowledged_by: 'me' }
                : t
            )
          )
        }
      }

      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const { key, data } of context.snapshots) {
          queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
