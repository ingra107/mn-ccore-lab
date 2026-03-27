/**
 * TanStack Query v5 mutation hooks with optimistic updates.
 *
 * Each mutation:
 * 1. Optimistically updates the cache immediately (instant UI feedback)
 * 2. Sends the request to D1
 * 3. Rolls back on error, invalidates on success
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject, addProjectComment, createTask, updateTaskStatus, updateTask } from '../lib/api'
import type { TaskRow } from '../lib/api'
import type { Project } from '../data/types'
import type { Comment } from './useApiData'

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

// ── Action Item mutations ───────────────────────────────────

import type { ActionItemRow } from './useApiData'

export function useToggleActionItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) =>
      fetch(`/api/action-items/${itemId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json()),

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
      fetch('/api/action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),

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
      fetch(`/api/meetings/${meetingId}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),

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
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/digest/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },

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
      fetch(`/api/projects/${projectSlug}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.json()),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project-updates', projectSlug] })
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

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['action-items'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
