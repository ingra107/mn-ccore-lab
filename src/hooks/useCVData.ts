import { useQuery } from '@tanstack/react-query'

interface CVData {
  member: {
    name: string
    role: string
    credentials: string | null
    slug: string
    bio: string | null
    photo_url: string | null
    title: string | null
    department: string | null
  }
  publications: {
    id: string
    title: string
    authors: string
    journal: string | null
    year: number
    status: string
    doi: string | null
    pmid: string | null
  }[]
  grants: {
    id: string
    mechanism: string
    title: string
    agency: string
    pi: string
    start_date: string | null
    end_date: string | null
    proposed: number
    total_funding: number | null
  }[]
  mentees: {
    name: string
    role: string
    slug: string
  }[]
}

export type { CVData }

export function useCVData(slug: string) {
  return useQuery({
    queryKey: ['cv-data', slug],
    queryFn: async () => {
      const res = await fetch(`/api/team/${slug}/cv-data`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      return data.data as CVData
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}
