// projectMeetings.ts -- which meetings belong to a project, and the project
// pills on a meeting (schema-v122, Nick 2026-10-09).
//
// Two different lists, never confused again:
//   - DISCUSSED: meetings.tags (schema-v72), every project slug (+ topic word)
//     the PB debrief found in the meeting. A label; it grants nothing.
//   - BELONGS TO: meetings.granted_projects, the projects the owner or Nick
//     granted the meeting to (meeting_project_grants). Members of a granted
//     project see the meeting; this is what a project's Meetings tab and its
//     agenda picker list.
// Callers pass the viewer-scoped /api/meetings list, so this only filters
// meetings the viewer can already see; it grants nothing.

import { projectShortLabel } from './displayNames'

export interface GrantedProject {
  id: string
  slug: string | null
  short_name: string | null
  title: string | null
}

export interface ProjectMeeting {
  id: string
  date: string
  title: string
  status?: string | null
  tags: string | null
  granted_projects?: string | null
}

function parseArray(raw: string | null | undefined): unknown[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** The string elements of a meeting's tags, or [] when it is not a JSON array. */
export function meetingTagList(tags: string | null | undefined): string[] {
  return parseArray(tags).filter((t): t is string => typeof t === 'string')
}

/** The projects a meeting is granted to, from the API's JSON column. */
export function grantedProjectList(raw: string | null | undefined): GrantedProject[] {
  return parseArray(raw)
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object' && typeof (g as { id?: unknown }).id === 'string')
    .map((g) => ({
      id: g.id as string,
      slug: typeof g.slug === 'string' ? g.slug : null,
      short_name: typeof g.short_name === 'string' ? g.short_name : null,
      title: typeof g.title === 'string' ? g.title : null,
    }))
}

/** True when the meeting is GRANTED to this project (its typed id). */
export function isProjectMeeting(meeting: Pick<ProjectMeeting, 'granted_projects'>, project: { id: string }): boolean {
  return !!project.id && grantedProjectList(meeting.granted_projects).some((g) => g.id === project.id)
}

/**
 * A project's meetings, split for display: upcoming (today or later, soonest
 * first) and past (most recent first).
 */
export function meetingsForProject<M extends ProjectMeeting>(
  meetings: readonly M[],
  project: { id: string },
  today: string,
): { upcoming: M[]; past: M[] } {
  const mine = meetings.filter((m) => isProjectMeeting(m, project))
  return {
    upcoming: mine.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    past: mine.filter((m) => m.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  }
}

/** One pill in a meeting's Projects row. */
export interface ProjectPill {
  key: string
  /** The typed project id, or null for a tag that names no project the viewer can see (a topic word). */
  projectId: string | null
  slug: string | null
  label: string
  /** Granted = the project's members can see this meeting (full contrast). */
  granted: boolean
  /** Found in the meeting by the debrief (meetings.tags). */
  discussed: boolean
}

interface KnownProject { id: string; slug: string; title: string; short_name?: string | null }

/**
 * The pills a meeting shows: every DISCUSSED project (faded until granted),
 * then every GRANTED project the tags do not name (granted after the debrief,
 * or added by hand). A discussed project is matched to the viewer's projects
 * by slug or id; a tag that matches none (a topic word, or a project the
 * viewer is not on) is shown faded and cannot be granted from here.
 */
export function meetingProjectPills(
  tags: readonly string[],
  granted: readonly GrantedProject[],
  projects: readonly KnownProject[],
): ProjectPill[] {
  const bySlugOrId = new Map<string, KnownProject>()
  for (const p of projects) {
    bySlugOrId.set(p.id, p)
    if (p.slug) bySlugOrId.set(p.slug, p)
  }
  const grantedIds = new Set(granted.map((g) => g.id))
  const out: ProjectPill[] = []
  const seen = new Set<string>()
  for (const tag of tags) {
    const p = bySlugOrId.get(tag)
    const key = p?.id ?? `tag:${tag}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      projectId: p?.id ?? null,
      slug: p?.slug ?? tag,
      label: p ? projectShortLabel(p) : tag,
      granted: !!p && grantedIds.has(p.id),
      discussed: true,
    })
  }
  for (const g of granted) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    const p = bySlugOrId.get(g.id)
    out.push({
      key: g.id,
      projectId: g.id,
      slug: g.slug ?? p?.slug ?? null,
      label: projectShortLabel({ ...g, short_name: g.short_name ?? p?.short_name, title: g.title ?? p?.title }),
      granted: true,
      discussed: false,
    })
  }
  return out
}
