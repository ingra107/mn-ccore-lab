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
  personal: '/portal/personal',
  myItems: '/portal/my-items',
  myTasks: '/portal/my-tasks',
  tasks: '/portal/tasks',
  calendar: '/portal/calendar',
  deadlines: '/portal/deadlines',
  deadlineCascade: '/portal/deadline-cascade',
  projects: '/portal/projects',
  project: (slug: string) => `/portal/projects/${slug}`,
  manuscripts: '/portal/manuscripts',
  ideas: '/portal/ideas',
  ask: '/portal/ask',
  decisions: '/portal/decisions',
  narratives: '/portal/narratives',
  digest: '/portal/digest',
  search: '/portal/search',
  grants: '/portal/grants',
  meetings: '/portal/meetings',
  meeting: (id: string | number) => `/portal/meetings/${id}`,
  meetingPrep: (id: string | number) => `/portal/meetings/${id}/prep`,
  meetingNotes: '/portal/meeting-notes',
  activity: '/portal/activity',
  analytics: '/portal/analytics',
  piAnalytics: '/portal/pi/analytics',
  menteeMilestones: '/portal/mentee-milestones',
  pb: '/portal/pb',
  sessions: '/portal/sessions',
  settings: '/portal/settings',
  teamMember: (slug: string) => `/portal/team/${slug}`,
  teamTrajectory: (slug: string) => `/portal/team/${slug}/trajectory`,
  // Public
  home: '/',
  pulse: '/pulse',
  publicTeam: '/team',
  publicMember: (slug: string) => `/team/${slug}`,
  publications: '/publications',
  publication: (id: string | number) => `/publications/${id}`,
  network: '/network',
  contact: '/contact',
} as const
