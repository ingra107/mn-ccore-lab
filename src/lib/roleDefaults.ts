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
  const slug = user.email.split('@')[0].toLowerCase()
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

// ── Personal Hub (bento dashboard) card configs per role ──

// Card IDs used in Personal.tsx bento grid
export type PersonalCardId =
  | 'my-tasks'
  | 'deadlines'
  | 'notifications'
  | 'assigned-by-me'
  | 'commitments'
  | 'activity'
  | 'watching'
  | 'lab-health'
  | 'grants'
  | 'quick-capture'

export interface RoleCardConfig {
  visible: PersonalCardId[]
  primary: PersonalCardId[]  // cards that get span-2 treatment
}

export const ROLE_CARD_CONFIGS: Record<UserRole, RoleCardConfig> = {
  pi: {
    visible: ['my-tasks', 'deadlines', 'notifications', 'assigned-by-me', 'commitments', 'activity', 'watching', 'lab-health', 'grants', 'quick-capture'],
    primary: ['lab-health', 'my-tasks'],
  },
  fellow: {
    visible: ['my-tasks', 'deadlines', 'notifications', 'activity', 'watching', 'quick-capture'],
    primary: ['my-tasks'],
  },
  coordinator: {
    visible: ['my-tasks', 'deadlines', 'notifications', 'activity', 'assigned-by-me', 'commitments', 'watching', 'quick-capture'],
    primary: ['my-tasks', 'deadlines'],
  },
  default: {
    visible: ['my-tasks', 'deadlines', 'notifications', 'assigned-by-me', 'commitments', 'activity', 'watching', 'lab-health', 'grants', 'quick-capture'],
    primary: ['my-tasks'],
  },
}

// ── Team Dashboard card configs (backward compat for Dashboard.tsx) ──

export const ROLE_DASHBOARD_DEFAULTS: Record<UserRole, {
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

// Backward compat alias — old code imports ROLE_DEFAULTS
export const ROLE_DEFAULTS = ROLE_DASHBOARD_DEFAULTS
