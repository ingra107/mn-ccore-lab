// useTeamRaw — the raw GET /api/team rows (every column the Worker returns,
// including full_name / preferred_name / bio / photo_url that the public
// TeamMember shape drops). One query, one cache key, shared by the Profile
// page (which edits these fields) and Today's "Set up your profile" prompt
// (which asks whether they are filled), so the prompt clears the moment a
// profile save invalidates ['team-raw'].
//
// MUST stay a real useQuery with a queryFn: ProfilePage's save calls
// invalidateQueries(['team-raw']), and invalidate refetches only queries that
// have an observer with a queryFn (the STATE-2 bug).

import { useQuery } from '@tanstack/react-query'

export type TeamRawRow = Record<string, unknown>

export function useTeamRaw(enabled: boolean) {
  return useQuery({
    queryKey: ['team-raw'],
    queryFn: async (): Promise<{ data: TeamRawRow[] }> => {
      const r = await fetch('/api/team')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    enabled,
  })
}
