import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'

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

// GET /api/commitments is signed-in only. The hook asks only for a signed-in
// member, so no page (the public /team/:slug renders this too) sends a request
// that can only 401 (overnight audit 2026-10-14, G11-11).
export function useCommitments(slug?: string) {
  const { user } = useAuth()
  return useQuery({
    enabled: user.isAuthenticated && user.isMember,
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
