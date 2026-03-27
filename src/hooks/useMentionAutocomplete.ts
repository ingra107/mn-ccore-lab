import { useQuery } from '@tanstack/react-query'

export interface TeamSlug {
  slug: string
  name: string
}

export function useTeamSlugs() {
  return useQuery({
    queryKey: ['team-slugs'],
    queryFn: async () => {
      const res = await fetch('/api/team/slugs')
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as TeamSlug[]
    },
    staleTime: 10 * 60 * 1000, // 10 min cache
  })
}
