import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPBSession, bulkCreatePBSessions } from '../../lib/api'

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
