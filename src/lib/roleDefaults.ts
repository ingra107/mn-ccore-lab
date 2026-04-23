import { emailToSlug } from './emailSlug'

export type UserRole = 'pi' | 'fellow' | 'coordinator' | 'default'

// Mentee/trainee slugs (from mentees.ts). Phase 36b renamed to preferred-last.
const FELLOW_SLUGS = ['dan-shyu', 'beret-fitzgerald', 'emma-bromley', 'casey-eddington', 'claire-collins', 'steven-arriaza']

// Coordinator/staff slugs (research team members who are not mentees — currently same set,
// but coordinators are identified by role, not slug. We check mentees data first.)
// In practice: fellows = anyone in mentees.ts, coordinators = anyone else in team.ts

/** Derive role from auth user. PI-ness comes from the server via user.isPi
 *  (reflects the lab_settings.pi_emails allowlist, not a client-side list). */
export function getUserRoleFromAuth(user: { email?: string; isPi?: boolean } | null | undefined): UserRole {
  if (!user?.email) return 'default'
  if (user.isPi) return 'pi'
  const slug = emailToSlug(user.email)
  if (FELLOW_SLUGS.includes(slug)) return 'fellow'
  if (user.email.endsWith('@umn.edu')) return 'coordinator'
  return 'default'
}

// Role display labels
export const ROLE_LABELS: Record<UserRole, string> = {
  pi: 'PI View',
  fellow: 'Fellow View',
  coordinator: 'Coordinator View',
  default: 'Default',
}

// ── Team Dashboard card configs ──

export const ROLE_DEFAULTS: Record<UserRole, {
  dashboardCards: string[]
  taskView: string
  showAnalytics: boolean
}> = {
  pi: {
    dashboardCards: ['action-board', 'upcoming', 'project-health', 'pipeline', 'activity', 'stats', 'team-pulse'],
    taskView: 'board',
    showAnalytics: true,
  },
  fellow: {
    dashboardCards: ['action-board', 'upcoming', 'stats'],
    taskView: 'list',
    showAnalytics: false,
  },
  coordinator: {
    dashboardCards: ['action-board', 'upcoming', 'pipeline', 'activity'],
    taskView: 'list',
    showAnalytics: false,
  },
  default: {
    dashboardCards: ['action-board', 'upcoming', 'project-health', 'pipeline', 'activity', 'stats'],
    taskView: 'list',
    showAnalytics: false,
  },
}
