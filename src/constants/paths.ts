// src/constants/paths.ts
// Single source of truth for Hub URL paths.
// All Links, navigate() calls, tests, and OG cards should reference these
// constants instead of string literals.
//
// Migration note (2026-04-21): gated paths moved under /portal/* so a single
// CF Access application destination can gate the authenticated surface.
// Root-level equivalents redirect via <Navigate> in App.tsx for bookmark
// compatibility — do not add new routes at the root gated path.

const PORTAL_PREFIX = '/portal'

// Gated (behind CF Access + RequireAuth)
export const PATHS = {
  // Today B2 = the operating-day landing (see CLAUDE.md Rule 52).
  // PATHS.dashboard stays at /portal/dashboard for URL compatibility, but
  // the component rendered there is TodayPage. The old card-grid Dashboard
  // moves to /portal/overview as "Lab Overview."
  dashboard: `${PORTAL_PREFIX}/dashboard`,
  overview: `${PORTAL_PREFIX}/overview`,
  personal: `${PORTAL_PREFIX}/personal`,
  myItems: `${PORTAL_PREFIX}/my-items`,

  myTasks: `${PORTAL_PREFIX}/my-tasks`,
  myTasksLegacy: `${PORTAL_PREFIX}/my-tasks-legacy`,
  tasks: `${PORTAL_PREFIX}/tasks`,
  calendar: `${PORTAL_PREFIX}/calendar`,
  deadlines: `${PORTAL_PREFIX}/deadlines`,
  deadlineCascade: `${PORTAL_PREFIX}/deadline-cascade`,

  projects: `${PORTAL_PREFIX}/projects`,
  project: (slug: string) => `${PORTAL_PREFIX}/projects/${slug}`,
  manuscripts: `${PORTAL_PREFIX}/manuscripts`,
  ideas: `${PORTAL_PREFIX}/ideas`,
  ask: `${PORTAL_PREFIX}/ask`,
  decisions: `${PORTAL_PREFIX}/decisions`,
  narratives: `${PORTAL_PREFIX}/narratives`,
  digest: `${PORTAL_PREFIX}/digest`,
  search: `${PORTAL_PREFIX}/search`,
  grants: `${PORTAL_PREFIX}/grants`,

  meetings: `${PORTAL_PREFIX}/meetings`,
  meeting: (id: string | number) => `${PORTAL_PREFIX}/meetings/${id}`,
  meetingPrep: (id: string | number) => `${PORTAL_PREFIX}/meetings/${id}/prep`,
  meetingNotes: `${PORTAL_PREFIX}/meeting-notes`,

  activity: `${PORTAL_PREFIX}/activity`,
  analytics: `${PORTAL_PREFIX}/analytics`,
  insights: `${PORTAL_PREFIX}/insights`,
  piAnalytics: `${PORTAL_PREFIX}/pi/analytics`,
  menteeMilestones: `${PORTAL_PREFIX}/mentee-milestones`,
  pb: `${PORTAL_PREFIX}/pb`,
  sessions: `${PORTAL_PREFIX}/sessions`,
  settings: `${PORTAL_PREFIX}/settings`,

  teamMember: (slug: string) => `${PORTAL_PREFIX}/team/${slug}`,
  teamTrajectory: (slug: string) => `${PORTAL_PREFIX}/team/${slug}/trajectory`,
} as const

// Public (no auth)
export const PUBLIC_PATHS = {
  home: '/',
  pulse: '/pulse',
  publicTeam: '/team',
  publicMember: (slug: string) => `/team/${slug}`,
  publicTrajectory: (slug: string) => `/team/${slug}/trajectory`,
  nick: '/nick',
  nate: '/nate',
  publications: '/publications',
  publication: (id: string | number) => `/publications/${id}`,
  network: '/network',
  contact: '/contact',
} as const

// Note: legacy root-path redirects are defined inline as <Navigate> elements
// in App.tsx; this file intentionally no longer exports a LEGACY_REDIRECTS map
// because nothing consumed it. See docs/superpowers/plans/2026-04-21-portal-url-migration.md
// for the full list of redirect shims kept for bookmark compatibility.
