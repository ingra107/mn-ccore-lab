// One name per portal page (D3(a), 2026-10-09). The sidebar's nav label, the
// browser tab title ("<label> · MN-CCORE") and the My Hub recently-viewed
// chips all read this map, so a page cannot be called "Lab Overview" in the
// nav and "Dashboard" in the tab again. Before this, 12 portal pages set no
// title at all and kept whatever the previous page (or the public site) had
// left in the tab.
//
// PortalLayout applies portalTitle(label) as the default for every path here;
// a page may still set its own (a count suffix, a record's name) through
// usePageMeta or portalTitle.

import { PATHS } from './paths'

export const PORTAL_PAGE_LABELS: Record<string, string> = {
  [PATHS.dashboard]: 'Today',
  [PATHS.personal]: 'My Hub',
  [PATHS.myTasks]: 'Tasks',
  [PATHS.calendar]: 'Calendar',
  [PATHS.overview]: 'Lab Overview',
  [PATHS.projects]: 'Projects',
  [PATHS.manuscripts]: 'Manuscripts',
  [PATHS.grants]: 'Grants',
  [PATHS.deadlines]: 'Deadlines',
  [PATHS.ideas]: 'Ideas',
  [PATHS.digest]: 'Research Digest',
  [PATHS.meetings]: 'Meetings',
  [PATHS.meetingNotes]: 'Transcripts',
  [PATHS.team]: 'Team',
  [PATHS.artifacts]: 'Artifacts',
  [PATHS.activity]: 'Activity',
  [PATHS.analytics]: 'Analytics',
  [PATHS.insights]: 'Insights',
  [PATHS.profile]: 'My Profile',
  [PATHS.settings]: 'Settings',
  [PATHS.piAnalytics]: 'PI Analytics',
  [PATHS.menteeMilestones]: 'Mentee Milestones',
  [PATHS.deadlineCascade]: 'Deadline Cascade',
  [PATHS.sessions]: 'Session History',
  [PATHS.search]: 'Search',
  [PATHS.decisions]: 'Decisions',
  [PATHS.ask]: 'Ask the Lab',
  [PATHS.narratives]: 'Research Narratives',
}

/** "<label> · MN-CCORE", or "<label> (<detail>) · MN-CCORE" with a detail. */
export function portalTitle(label: string, detail?: string): string {
  return detail ? `${label} (${detail}) · MN-CCORE` : `${label} · MN-CCORE`
}
