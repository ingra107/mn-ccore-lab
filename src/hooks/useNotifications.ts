import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface NotificationRow {
  id: string
  recipient_slug: string
  type: string        // 'mention', 'assignment', 'deadline', 'update', 'impact'
  source_type: string // 'comment', 'project_update', 'action_item', 'project', 'publication'
  source_id: string
  title: string
  body: string | null
  link: string | null
  read: number
  email_sent: number
  created_at: string
}

export function useNotifications(slug: string) {
  return useQuery({
    queryKey: ['notifications', slug],
    queryFn: async () => {
      if (!slug) return []
      const res = await fetch(`/api/notifications?recipient=${slug}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as NotificationRow[]
    },
    staleTime: 30 * 1000,
    enabled: !!slug,
  })
}

export function useUnreadCount(slug: string) {
  return useQuery({
    queryKey: ['notification-count', slug],
    queryFn: async () => {
      if (!slug) return 0
      const res = await fetch(`/api/notifications/count?recipient=${slug}`)
      if (!res.ok) return 0
      const data = await res.json()
      return (data.count || 0) as number
    },
    staleTime: 30 * 1000,
    enabled: !!slug,
    refetchOnWindowFocus: true,
  })
}

export function useMarkRead(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to mark as read')
      return res.json()
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', slug] })
      const previous = queryClient.getQueryData<NotificationRow[]>(['notifications', slug])
      if (previous) {
        queryClient.setQueryData<NotificationRow[]>(
          ['notifications', slug],
          previous.map((n) => n.id === notificationId ? { ...n, read: 1 } : n)
        )
      }
      // Optimistically decrement count
      const prevCount = queryClient.getQueryData<number>(['notification-count', slug])
      if (typeof prevCount === 'number' && prevCount > 0) {
        queryClient.setQueryData(['notification-count', slug], prevCount - 1)
      }
      return { previous, prevCount }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications', slug], context.previous)
      }
      if (typeof context?.prevCount === 'number') {
        queryClient.setQueryData(['notification-count', slug], context.prevCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', slug] })
      queryClient.invalidateQueries({ queryKey: ['notification-count', slug] })
    },
  })
}

export function useMarkAllRead(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: slug }),
      })
      if (!res.ok) throw new Error('Failed to mark all as read')
      return res.json()
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', slug] })
      const previous = queryClient.getQueryData<NotificationRow[]>(['notifications', slug])
      if (previous) {
        queryClient.setQueryData<NotificationRow[]>(
          ['notifications', slug],
          previous.map((n) => ({ ...n, read: 1 }))
        )
      }
      queryClient.setQueryData(['notification-count', slug], 0)
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications', slug], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', slug] })
      queryClient.invalidateQueries({ queryKey: ['notification-count', slug] })
    },
  })
}
