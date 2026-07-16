import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface RelayMessage {
  from: string
  to: string
  topic: string
  prompt?: string
  status: 'pending' | 'completed' | string
}

export function useRelayMessages() {
  return useQuery({
    queryKey: ['pb-relay'],
    queryFn: async (): Promise<RelayMessage[]> => {
      const res = await fetch('/api/pb/relay')
      if (!res.ok) return []
      const data = await res.json()
      return data.data || []
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useCreateRelay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { from: string; to: string; topic: string; prompt: string }) =>
      fetch('/api/pb/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-relay'] })
    },
  })
}

export function useCompleteRelay() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (index: number) =>
      fetch(`/api/pb/relay/${index}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(r => r.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pb-relay'] })
    },
  })
}
