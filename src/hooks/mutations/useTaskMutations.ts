import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTask, updateTaskStatus, updateTask, acknowledgeTask, fetchApi } from '../../lib/api'
import type { TaskRow } from '../../lib/api'
import { TASK_STATUS, optimisticListUpdate, rollbackSnapshots } from './utils'
import { nowInstant } from '../../lib/time'

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
      const { snapshots } = optimisticListUpdate<TaskRow>(
        queryClient, ['tasks'],
        (tasks) => tasks.map((t) => t.id === id
          ? { ...t, status, completed: status === TASK_STATUS.DONE ? 1 : 0, completed_at: status === TASK_STATUS.DONE ? nowInstant() : null }
          : t
        ),
      )
      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      rollbackSnapshots(queryClient, context?.snapshots)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
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
      // Derive completed / completed_at from status so every caller that sends
      // { status } gets a consistent optimistic patch. Without this, filters
      // that check `completed` (Today page: `t.completed === 0`) or mutations
      // that spread `fields` without completed get a split-brain cache where
      // status='done' but completed=0 — causing tasks to disappear without
      // visual confirmation or persist in wrong filter buckets. (Rule 68: UI
      // branches on status; but we must keep completed in sync so the Today
      // filter and server both agree on "done-ness" from the same moment.)
      const statusDerived: Partial<TaskRow> = {}
      if ('status' in fields && typeof fields.status === 'string') {
        const isDone = fields.status === TASK_STATUS.DONE
        statusDerived.completed = isDone ? 1 : 0
        statusDerived.completed_at = isDone ? nowInstant() : null
      }
      const { snapshots } = optimisticListUpdate<TaskRow>(
        queryClient, ['tasks'],
        (tasks) => tasks.map((t) => t.id === id ? { ...t, ...fields, ...statusDerived } : t),
      )
      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      rollbackSnapshots(queryClient, context?.snapshots)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useBulkUpdateTasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { ids: string[]; action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'status'; value?: string }) =>
      fetchApi('/api/tasks/batch', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onMutate: async ({ ids, action, value }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const { snapshots } = optimisticListUpdate<TaskRow>(
        queryClient, ['tasks'],
        (tasks) => tasks.map(t => {
          if (!ids.includes(t.id)) return t
          if (action === 'complete') return { ...t, completed: 1, status: TASK_STATUS.DONE }
          if (action === 'uncomplete') return { ...t, completed: 0, status: TASK_STATUS.TODO }
          if (action === 'status' && value) return { ...t, status: value, completed: value === TASK_STATUS.DONE ? 1 : 0, completed_at: value === TASK_STATUS.DONE ? nowInstant() : null }
          if (action === 'priority' && value) return { ...t, priority: value }
          if (action === 'assign' && value) return { ...t, assignee: value }
          if (action === 'delete') return { ...t, deleted_at: nowInstant() }
          return t
        }),
      )
      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      rollbackSnapshots(queryClient, context?.snapshots)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useAcknowledgeTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => acknowledgeTask(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const { snapshots } = optimisticListUpdate<TaskRow>(
        queryClient, ['tasks'],
        (tasks) => tasks.map((t) => t.id === id
          ? { ...t, acknowledged_at: nowInstant(), acknowledged_by: 'nick-ingraham' }
          : t
        ),
      )
      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      rollbackSnapshots(queryClient, context?.snapshots)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      // The sidebar "unseen" badge counts acknowledged_at IS NULL — drain it
      // as soon as an auto-/manual acknowledge lands (Slack-style seen model).
      queryClient.invalidateQueries({ queryKey: ['overdue-count'] })
    },
  })
}
