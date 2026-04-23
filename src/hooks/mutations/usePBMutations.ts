import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../lib/api'

// ── PB Sector mutations ──────────────────────────────────

export function usePBCapture() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { text: string; type?: 'task' | 'idea' | 'note'; priority?: string; project?: string }) =>
      fetchApi('/api/pb/capture', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

// ── PB Sector v2 — Daily Plan mutations ─────────────────────

export function useSaveDailyPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; star_task_id?: string | null; focus_task_ids?: string[]; quick_win_ids?: string[]; evening_task_ids?: string[]; intention?: string; gratitude?: string }) =>
      fetchApi('/api/pb/plan', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function useReorderPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; slot_type: 'focus' | 'quick_win' | 'evening'; task_ids: string[] }) =>
      fetchApi('/api/pb/plan/reorder', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function useStartPomodoro() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { task_id: string; plan_date: string; slot_type: string; duration_minutes?: number }) =>
      fetchApi('/api/pb/pomodoro/start', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

export function useSaveReflection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; highlight?: string; learned?: string; energy_rating?: number; focus_rating?: number; notes?: string }) =>
      fetchApi('/api/pb/reflection', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}

// ── Dispatch queue mutations ────────────────────────────────

export function useSendDispatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      fetchApi('/api/pb/dispatch/send', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-pending'] })
      queryClient.invalidateQueries({ queryKey: ['pb-command-center'] })
    },
  })
}
