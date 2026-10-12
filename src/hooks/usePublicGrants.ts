// The live grant rows for the public pages (GET /api/grants). Anonymous callers
// get funded awards only; see lib/publicGrants.ts.
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import type { PublicGrant } from '../lib/publicGrants'

export function usePublicGrants() {
  return useQuery({
    queryKey: ['grants-public'],
    queryFn: async (): Promise<PublicGrant[]> => {
      const body = (await fetchApi<unknown>('/api/grants')) as unknown as { data?: PublicGrant[] }
      return body.data ?? []
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
