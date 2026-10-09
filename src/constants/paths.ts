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
  // Lab Overview's tabs (nav redesign 2026-10-09). The old pages
  // /portal/pi/analytics, /portal/mentee-milestones and
  // /portal/deadline-cascade redirect here.
  piAnalyticsTab: `${PORTAL_PREFIX}/overview?tab=pi-analytics`,
  menteeMilestonesTab: `${PORTAL_PREFIX}/overview?tab=mentee-milestones`,
  deadlineCascadeTab: `${PORTAL_PREFIX}/overview?tab=deadline-cascade`,
  myItems: `${PORTAL_PREFIX}/my-items`,

  myTasks: `${PORTAL_PREFIX}/my-tasks`,
  tasks: `${PORTAL_PREFIX}/tasks`,
  calendar: `${PORTAL_PREFIX}/calendar`,
  deadlines: `${PORTAL_PREFIX}/deadlines`,

  projects: `${PORTAL_PREFIX}/projects`,
  // Ideas is a tab on Projects (2026-10-09); /portal/ideas redirects here.
  ideasTab: `${PORTAL_PREFIX}/projects?tab=ideas`,
  project: (slug: string) => `${PORTAL_PREFIX}/projects/${slug}`,
  // Reference Gallery index (curated, tagged artifacts). The artifact(id) detail
  // helper below is the per-artifact page — keep both.
  artifacts: `${PORTAL_PREFIX}/artifacts`,
  artifact: (id: string) => `${PORTAL_PREFIX}/artifacts/${id}`,
  // Library = Artifacts + Research Digest as two tabs (2026-10-09).
  // /portal/artifacts (the index) and /portal/digest redirect here.
  library: `${PORTAL_PREFIX}/library`,
  digestTab: `${PORTAL_PREFIX}/library?tab=digest`,
  manuscripts: `${PORTAL_PREFIX}/manuscripts`,
  ask: `${PORTAL_PREFIX}/ask`,
  decisions: `${PORTAL_PREFIX}/decisions`,
  narratives: `${PORTAL_PREFIX}/narratives`,
  search: `${PORTAL_PREFIX}/search`,
  grants: `${PORTAL_PREFIX}/grants`,

  meetings: `${PORTAL_PREFIX}/meetings`,
  meeting: (id: string | number) => `${PORTAL_PREFIX}/meetings/${id}`,
  meetingPrep: (id: string | number) => `${PORTAL_PREFIX}/meetings/${id}/prep`,
  // Transcripts is a tab on Meetings (2026-10-09); /portal/meeting-notes
  // redirects here.
  transcriptsTab: `${PORTAL_PREFIX}/meetings?tab=transcripts`,

  activity: `${PORTAL_PREFIX}/activity`,
  analytics: `${PORTAL_PREFIX}/analytics`,
  insights: `${PORTAL_PREFIX}/insights`,
  sessions: `${PORTAL_PREFIX}/sessions`,
  // My Launches (PI), moved out of the retired My Hub page (2026-10-09).
  launches: `${PORTAL_PREFIX}/launches`,
  settings: `${PORTAL_PREFIX}/settings`,
  profile: `${PORTAL_PREFIX}/profile`,

  team: `${PORTAL_PREFIX}/team`,
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
  // The public "Member Hub" tab's page for a signed-in non-member (2026-10-09).
  join: '/join',
} as const

// Note: legacy root-path redirects are defined inline as <Navigate> elements
// in App.tsx; this file intentionally no longer exports a LEGACY_REDIRECTS map
// because nothing consumed it. See docs/superpowers/plans/2026-04-21-portal-url-migration.md
// for the full list of redirect shims kept for bookmark compatibility.
