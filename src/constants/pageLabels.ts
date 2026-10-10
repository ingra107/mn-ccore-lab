// One name per portal page (D3(a), 2026-10-09). The sidebar's nav label, the
// browser tab title ("<label> · MN-CCORE") and the mobile More drawer all
// read this map, so a page cannot be called "Lab Overview" in the
// nav and "Dashboard" in the tab again. Before this, 12 portal pages set no
// title at all and kept whatever the previous page (or the public site) had
// left in the tab.
//
// PortalLayout applies portalTitle(label) as the default for every path here;
// a page may still set its own (a count suffix, a record's name) through
// usePageMeta or portalTitle.

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, SquareCheck, Calendar, LayoutGrid, FolderKanban, FileText, DollarSign,
  Clock, Library, Video, Users, Activity, BarChart3, TrendingUp, User, Settings, History,
  Zap, Search, HelpCircle, BookOpen,
} from 'lucide-react'
import { PATHS } from './paths'

export const PORTAL_PAGE_LABELS: Record<string, string> = {
  [PATHS.dashboard]: 'Today',
  [PATHS.myTasks]: 'Tasks',
  [PATHS.calendar]: 'Calendar',
  [PATHS.overview]: 'Lab Overview',
  [PATHS.projects]: 'Projects',
  [PATHS.manuscripts]: 'Manuscripts',
  [PATHS.grants]: 'Grants',
  [PATHS.deadlines]: 'Deadlines',
  [PATHS.library]: 'Library',
  [PATHS.meetings]: 'Meetings',
  [PATHS.team]: 'Team',
  [PATHS.activity]: 'Activity',
  [PATHS.analytics]: 'Analytics',
  [PATHS.insights]: 'Insights',
  [PATHS.profile]: 'My Profile',
  [PATHS.settings]: 'Settings',
  [PATHS.sessions]: 'Session History',
  [PATHS.launches]: 'My Launches',
  [PATHS.search]: 'Search',
  [PATHS.decisions]: 'Decisions',
  [PATHS.ask]: 'Ask the Lab',
  [PATHS.narratives]: 'Research Narratives',
}

// One icon per portal page, beside the one name. The sidebar and the mobile
// More drawer both read this, so Grants cannot be a dollar sign in one and a
// medal in the other. Page headers (other files) should read it too.
export const PORTAL_PAGE_ICONS: Record<string, LucideIcon> = {
  [PATHS.dashboard]: LayoutDashboard,
  [PATHS.myTasks]: SquareCheck,
  [PATHS.calendar]: Calendar,
  [PATHS.overview]: LayoutGrid,
  [PATHS.projects]: FolderKanban,
  [PATHS.manuscripts]: FileText,
  [PATHS.grants]: DollarSign,
  [PATHS.deadlines]: Clock,
  [PATHS.library]: Library,
  [PATHS.meetings]: Video,
  [PATHS.team]: Users,
  [PATHS.activity]: Activity,
  [PATHS.analytics]: BarChart3,
  [PATHS.insights]: TrendingUp,
  [PATHS.profile]: User,
  [PATHS.settings]: Settings,
  [PATHS.sessions]: History,
  [PATHS.launches]: Zap,
  [PATHS.search]: Search,
  [PATHS.decisions]: HelpCircle,
  [PATHS.ask]: HelpCircle,
  [PATHS.narratives]: BookOpen,
}

/** "<label> · MN-CCORE", or "<label> (<detail>) · MN-CCORE" with a detail. */
export function portalTitle(label: string, detail?: string): string {
  return detail ? `${label} (${detail}) · MN-CCORE` : `${label} · MN-CCORE`
}
