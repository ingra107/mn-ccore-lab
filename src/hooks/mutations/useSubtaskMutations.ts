import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'
import type { SubtaskRow } from '../useApiData'

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

export function useReorderSubtasks(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (subtaskIds: string[]) =>
      fetchApi(`/api/tasks/${taskId}/subtasks/reorder`, {
        method: 'POST',
        body: JSON.stringify({ subtaskIds }),
      }),
    onMutate: async (subtaskIds) => {
      await queryClient.cancelQueries({ queryKey: ['subtasks', taskId] })
      const prev = queryClient.getQueryData<SubtaskRow[]>(['subtasks', taskId])
      if (prev) {
        // Optimistically reorder to match the new order
        const idOrder = new Map(subtaskIds.map((id, i) => [id, i]))
        const reordered = [...prev].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
        queryClient.setQueryData(['subtasks', taskId], reordered)
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
