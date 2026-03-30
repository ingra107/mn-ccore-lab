import { directors, getAllMembers } from '../data/team'

const ROTATION_ROSTER: string[] = (() => {
  // All members with slugs, sorted alphabetically for deterministic order
  const all = [
    ...directors.filter(d => d.slug).map(d => d.slug!),
    ...getAllMembers().filter(m => m.slug).map(m => m.slug!),
  ]
  // Deduplicate
  return [...new Set(all)].sort()
})()

/**
 * Get the facilitator for a meeting based on its date.
 * Uses a simple hash of the date string to rotate through the roster.
 */
export function getMeetingFacilitator(meetingDate: string): string | null {
  if (ROTATION_ROSTER.length === 0) return null
  // Simple deterministic rotation: hash date to index
  const hash = meetingDate.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return ROTATION_ROSTER[hash % ROTATION_ROSTER.length]
}

/**
 * Get next N facilitators for upcoming meetings.
 */
export function getUpcomingFacilitators(meetingDates: string[]): { date: string; slug: string }[] {
  return meetingDates.map(date => ({
    date,
    slug: getMeetingFacilitator(date) || ROTATION_ROSTER[0],
  }))
}
