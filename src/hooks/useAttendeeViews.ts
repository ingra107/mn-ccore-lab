// The team list -> a meeting's attendee values as people. Rules: lib/attendeeViews.ts.

import { useMemo } from 'react'
import { useTeam } from './useApiData'
import { resolveAttendeeViews, type AttendeeView } from '../lib/attendeeViews'

export type { AttendeeView }

export function useAttendeeViews(values: readonly unknown[] | null | undefined): AttendeeView[] {
  const { data: team = [] } = useTeam()
  return useMemo(() => resolveAttendeeViews(values, team), [values, team])
}
