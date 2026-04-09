import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTask, updateTaskStatus, updateTask, acknowledgeTask, fetchApi } from '../../lib/api'
import type { TaskRow } from '../../lib/api'

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

export function useBulkUpdateTasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { ids: string[]; action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete'; value?: string }) =>
      fetchApi('/api/tasks/batch', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

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
