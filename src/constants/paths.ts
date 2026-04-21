// src/constants/paths.ts
// Single source of truth for Hub URL paths.
// All Links, navigate() calls, tests, and OG cards should reference these
// constants instead of string literals.
//
// Migration note (2026-04-21): gated paths moved under /portal/* so a single
// CF Access application destination can gate the authenticated surface.
// Root-level equivalents redirect via <Navigate> in App.tsx for bookmark
// compatibility — do not add new routes at the root gated path.

export const PORTAL_PREFIX = '/portal'

// Gated (behind CF Access + RequireAuth)
export const PATHS = {
  dashboard: `${PORTAL_PREFIX}/dashboard`,
  personal: `${PORTAL_PREFIX}/personal`,
  myItems: `${PORTAL_PREFIX}/my-items`,

  myTasks: `${PORTAL_PREFIX}/my-tasks`,
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

// Known legacy root paths that should redirect to portal equivalents.
// Consumed by App.tsx's redirect shim block. Kept indefinitely; cost is
// negligible and bookmarks should not silently break.
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/dashboard': PATHS.dashboard,
  '/personal': PATHS.personal,
  '/my-items': PATHS.myItems,
  '/my-tasks': PATHS.myTasks,
  '/tasks': PATHS.myTasks,
  '/calendar': PATHS.calendar,
  '/deadlines': PATHS.deadlines,
  '/deadline-cascade': PATHS.deadlineCascade,
  '/projects': PATHS.projects,
  '/manuscripts': PATHS.manuscripts,
  '/ideas': PATHS.ideas,
  '/ask': PATHS.ask,
  '/decisions': PATHS.decisions,
  '/narratives': PATHS.narratives,
  '/digest': PATHS.digest,
  '/research-digest': PATHS.digest,
  '/search': PATHS.search,
  '/grants': PATHS.grants,
  '/meetings': PATHS.meetings,
  '/meeting-prep': PATHS.meetings,
  '/meeting-notes': PATHS.meetingNotes,
  '/activity': PATHS.activity,
  '/analytics': PATHS.analytics,
  '/pi/analytics': PATHS.piAnalytics,
  '/pi-analytics': PATHS.piAnalytics,
  '/mentee-milestones': PATHS.menteeMilestones,
  '/pb': PATHS.pb,
  '/sessions': PATHS.sessions,
  '/settings': PATHS.settings,
}
