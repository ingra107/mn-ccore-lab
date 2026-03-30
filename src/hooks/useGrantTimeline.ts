import { useQuery } from '@tanstack/react-query'

export interface GrantMilestone {
  id: string
  title: string
  target_date: string
  status: string
  future_note?: string | null
  future_note_author?: string | null
}

export interface GrantTimelineItem {
  id: string
  mechanism: string
  title: string
  agency: string
  pi: string
  start_date: string | null
  end_date: string | null
  proposed: number
  total_funding: number | null
  milestones: GrantMilestone[]
}

export function useGrantTimeline() {
  return useQuery({
    queryKey: ['grants-timeline'],
    queryFn: async () => {
      const res = await fetch('/api/grants/timeline')
      if (!res.ok) throw new Error('Failed to fetch grant timeline')
      const data = await res.json()
      return data.data as GrantTimelineItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
