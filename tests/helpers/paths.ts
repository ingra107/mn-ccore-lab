// tests/helpers/paths.ts
// Test-side path helpers. Mirror of src/constants/paths.ts but plain strings
// so tests don't import the prod bundle. Keep in sync when adding new routes.
//
// Migration note (2026-04-21): gated paths moved under /portal/* for CF Access
// consolidation. Legacy root paths redirect; tests should use portal paths
// directly.

export const P = {
  // Gated
  dashboard: '/portal/dashboard',
  team: '/portal/team',
  overview: '/portal/overview',
  // Nav redesign (2026-10-09): these keys now name the page's NEW home
  // (My Hub merged into Today; Ideas, Transcripts, Research Digest and the PI
  // pages became tabs). The old URLs still redirect, but tests visit the real
  // page. `artifact(id)` below is unchanged: an artifact's page did not move.
  personal: '/portal/dashboard',
  library: '/portal/library',
  launches: '/portal/launches',
  myItems: '/portal/my-items',
  myTasks: '/portal/my-tasks',
  myTasksLegacy: '/portal/my-tasks-legacy',
  tasks: '/portal/tasks',
  calendar: '/portal/calendar',
  deadlines: '/portal/deadlines',
  deadlineCascade: '/portal/overview?tab=deadline-cascade',
  projects: '/portal/projects',
  project: (slug: string) => `/portal/projects/${slug}`,
  artifacts: '/portal/library',
  artifact: (id: string) => `/portal/artifacts/${id}`,
  manuscripts: '/portal/manuscripts',
  ideas: '/portal/projects?tab=ideas',
  ask: '/portal/ask',
  decisions: '/portal/decisions',
  narratives: '/portal/narratives',
  digest: '/portal/library?tab=digest',
  search: '/portal/search',
  grants: '/portal/grants',
  meetings: '/portal/meetings',
  meeting: (id: string | number) => `/portal/meetings/${id}`,
  meetingPrep: (id: string | number) => `/portal/meetings/${id}/prep`,
  meetingNotes: '/portal/meetings?tab=transcripts',
  activity: '/portal/activity',
  analytics: '/portal/analytics',
  insights: '/portal/insights',
  piAnalytics: '/portal/overview?tab=pi-analytics',
  menteeMilestones: '/portal/overview?tab=mentee-milestones',
  sessions: '/portal/sessions',
  settings: '/portal/settings',
  teamMember: (slug: string) => `/portal/team/${slug}`,
  teamTrajectory: (slug: string) => `/portal/team/${slug}/trajectory`,
  // Public
  home: '/',
  pulse: '/pulse',
  nickLab: '/nick',
  nateLab: '/nate',
  publicTeam: '/team',
  publicMember: (slug: string) => `/team/${slug}`,
  publicTrajectory: (slug: string) => `/team/${slug}/trajectory`,
  publications: '/publications',
  publication: (id: string | number) => `/publications/${id}`,
  network: '/network',
  contact: '/contact',
  join: '/join',
} as const

/**
 * The page URL for a path given on the command line (HUB_CHECK_PATH), joined
 * onto `base` with `new URL`, never by string concatenation.
 *
 * Git Bash (MSYS) rewrites an argument or env value that starts with `/` into
 * a Windows path: `HUB_CHECK_PATH=/portal/tasks` arrives as
 * `C:/Program Files/Git/portal/tasks`, and `${BASE}${PATH}` then became
 * `https://mn-ccore-lab.pages.devc/Program%20Files/...` (ERR_NAME_NOT_RESOLVED).
 * So: a path may be given WITHOUT its leading slash (`portal/tasks`), which
 * MSYS leaves alone, and a value that already looks like a Windows path is
 * refused with the reason instead of being opened.
 */
export function resolveCheckUrl(base: string, raw: string | undefined, fallback: string): URL {
  const given = (raw ?? '').trim() || fallback
  if (/^[A-Za-z]:[\\/]/.test(given) || /[\\/]Program Files[\\/]Git[\\/]/i.test(given) || given.includes('\\')) {
    throw new Error(
      `HUB_CHECK_PATH looks like a Windows path (${JSON.stringify(given)}): Git Bash rewrote a leading "/". ` +
      'Give the path without the leading slash (HUB_CHECK_PATH=portal/tasks) or set MSYS_NO_PATHCONV=1.',
    )
  }
  const url = new URL(given.startsWith('/') ? given : `/${given}`, base)
  if (url.origin !== new URL(base).origin) {
    throw new Error(`HUB_CHECK_PATH must be a path on ${new URL(base).origin}, got ${JSON.stringify(given)}`)
  }
  return url
}
