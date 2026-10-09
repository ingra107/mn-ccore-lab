// projectMeetings.ts -- which meetings belong to a project (Nick, 2026-10-09).
//
// A meeting belongs to a project when its `tags` (schema-v72: a JSON array of
// project slugs, written by the PB debrief push and the meeting meta edit)
// name the project: only a valid JSON array counts, only its string
// elements, and a tag matches the project's slug or id exactly (the same test
// as the server's tag arm, api/lib/table-scope.ts meetingRule, which is OFF
// until Nick re-rules). Callers pass the viewer-scoped /api/meetings list, so
// this only filters meetings the viewer can already see; it grants nothing.

export interface TaggedMeeting {
  id: string
  date: string
  title: string
  status?: string | null
  tags: string | null
}

/** The string elements of a meeting's tags, or [] when it is not a JSON array. */
export function meetingTagList(tags: string | null | undefined): string[] {
  if (!tags) return []
  try {
    const parsed: unknown = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

/** True when the meeting's tags name this project (by slug or id). */
export function isProjectMeeting(meeting: Pick<TaggedMeeting, 'tags'>, project: { id: string; slug?: string | null }): boolean {
  const refs = new Set([project.id, project.slug].filter((r): r is string => !!r))
  return meetingTagList(meeting.tags).some((t) => refs.has(t))
}

/**
 * A project's meetings, split for display: upcoming (today or later, soonest
 * first) and past (most recent first).
 */
export function meetingsForProject<M extends TaggedMeeting>(
  meetings: readonly M[],
  project: { id: string; slug?: string | null },
  today: string,
): { upcoming: M[]; past: M[] } {
  const mine = meetings.filter((m) => isProjectMeeting(m, project))
  return {
    upcoming: mine.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    past: mine.filter((m) => m.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  }
}
