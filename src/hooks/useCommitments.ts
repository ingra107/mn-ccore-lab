import { useQuery } from '@tanstack/react-query'

export interface CommitmentRow {
  id: string
  commitment: string
  to_whom: string
  /** Resolved team-member slug for to_whom. Null until backend ships WS2.3. */
  to_slug: string | null
  status: string
  due_date: string | null
  source: string | null
  project: string | null
  task_id: string | null
  created_at: string
  completed_at: string | null
}

export function useCommitments(slug?: string) {
  return useQuery({
    queryKey: ['commitments', slug],
    queryFn: async () => {
      try {
        const qs = new URLSearchParams()
        if (slug) qs.set('slug', slug)
        const res = await fetch(`/api/commitments?${qs}`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []) as CommitmentRow[]
      } catch {
        return []
      }
    },
    staleTime: 60 * 1000,
  })
}
