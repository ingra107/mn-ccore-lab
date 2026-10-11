import { projectShortLabel } from './displayNames'
// sidebarProjects — the sidebar's "My projects" list (nav redesign, 2026-10-09).
//
// Nick's rule: pinned projects first, then projects active in the last two
// weeks, then "All projects" one click below. "Active" is the same signal the
// Today rail uses (projectsForRail in TodayPage): the project's lastActivity,
// the API's last_activity rollup (api/routes/projects.ts), over 14 days instead
// of the rail's 7. No new API: GET /api/projects already carries it, scoped to
// the viewer's projects.
//
// Names are SHORT names (short_name, then title, then slug) with no "#".

export interface SidebarProjectInput {
  id?: string
  slug: string
  title: string
  short_name?: string
  status?: string | null
  stage?: string | null
  lastActivity?: string
}

export interface SidebarProject {
  id?: string
  slug: string
  name: string
  pinned: boolean
}

export const RECENT_PROJECT_DAYS = 14
export const RECENT_PROJECT_LIMIT = 8

const DAY_MS = 86_400_000

function finished(p: SidebarProjectInput): boolean {
  const s = (p.status ?? '').toLowerCase()
  return s === 'done' || s === 'completed' || s === 'archived' || s === 'deleted' || p.stage === 'published'
}

/**
 * Pinned projects in pin order, then unpinned, unfinished projects whose
 * lastActivity falls within RECENT_PROJECT_DAYS of `nowMs`, newest first,
 * capped at RECENT_PROJECT_LIMIT. A pin naming a project the viewer no longer
 * has (not in `projects`) is skipped.
 */
export function projectsForSidebar(
  projects: SidebarProjectInput[],
  pinnedSlugs: readonly string[],
  nowMs: number,
): SidebarProject[] {
  const bySlug = new Map(projects.map((p) => [p.slug, p]))
  const name = (p: SidebarProjectInput) => projectShortLabel(p)
  const pinned: SidebarProject[] = []
  const seen = new Set<string>()
  for (const slug of pinnedSlugs) {
    const p = bySlug.get(slug)
    if (!p || seen.has(slug)) continue
    seen.add(slug)
    pinned.push({ id: p.id, slug: p.slug, name: name(p), pinned: true })
  }
  const cutoff = nowMs - RECENT_PROJECT_DAYS * DAY_MS
  const recent = projects
    .filter((p) => !seen.has(p.slug) && !finished(p) && !!p.lastActivity)
    .map((p) => ({ p, t: new Date(p.lastActivity as string).getTime() }))
    .filter(({ t }) => !Number.isNaN(t) && t >= cutoff)
    .sort((a, b) => b.t - a.t)
    .slice(0, RECENT_PROJECT_LIMIT)
    .map(({ p }) => ({ id: p.id, slug: p.slug, name: name(p), pinned: false }))
  return [...pinned, ...recent]
}
