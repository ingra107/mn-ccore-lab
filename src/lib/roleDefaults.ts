export type UserRole = 'pi' | 'fellow' | 'coordinator' | 'default'

// Canonical email list for PI detection
export const PI_EMAILS = ['ningraha@umn.edu', 'sandb029@umn.edu', 'nicholas.ingraham@gmail.com']

// Email-prefix slugs that map to PIs (from CF Access JWT email.split('@')[0])
const PI_SLUGS = ['ningraha', 'sandb029']

// Mentee/trainee slugs (from mentees.ts)
const FELLOW_SLUGS = ['shyu', 'fitzgerald', 'bromley', 'eddington', 'collins', 'arriaza']

// Coordinator/staff slugs (research team members who are not mentees — currently same set,
// but coordinators are identified by role, not slug. We check mentees data first.)
// In practice: fellows = anyone in mentees.ts, coordinators = anyone else in team.ts

export function getUserRole(email?: string): UserRole {
  if (!email) return 'default'
  if (PI_EMAILS.includes(email)) return 'pi'
  const slug = email.split('@')[0].toLowerCase()
  if (PI_SLUGS.includes(slug)) return 'pi'
  if (FELLOW_SLUGS.includes(slug)) return 'fellow'
  // Any other @umn.edu = coordinator (lab staff/faculty)
  if (email.endsWith('@umn.edu')) return 'coordinator'
  return 'default'
}

export function getUserRoleFromSlug(slug: string): UserRole {
  if (PI_SLUGS.includes(slug)) return 'pi'
  if (FELLOW_SLUGS.includes(slug)) return 'fellow'
  // Known team members not in fellows list = coordinator
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
