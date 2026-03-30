export type UserRole = 'pi' | 'staff' | 'student' | 'guest'

const PI_EMAILS = ['ningraha@umn.edu', 'sandb029@umn.edu']

export function getUserRole(email?: string): UserRole {
  if (email && PI_EMAILS.includes(email)) return 'pi'
  // Default for authenticated users — expand with member_type lookup later
  return 'staff'
}

export const ROLE_DEFAULTS: Record<UserRole, {
  dashboardCards: string[]
  taskView: string
  showAnalytics: boolean
  personalHubSections: string[]
}> = {
  pi: {
    dashboardCards: ['action-board', 'upcoming', 'project-health', 'pipeline', 'activity', 'stats', 'team-pulse'],
    taskView: 'board',
    showAnalytics: true,
    personalHubSections: ['tasks', 'deadlines', 'commitments', 'notifications', 'activity'],
  },
  staff: {
    dashboardCards: ['action-board', 'upcoming', 'pipeline', 'activity'],
    taskView: 'list',
    showAnalytics: false,
    personalHubSections: ['tasks', 'deadlines', 'notifications'],
  },
  student: {
    dashboardCards: ['action-board', 'upcoming', 'stats'],
    taskView: 'list',
    showAnalytics: false,
    personalHubSections: ['tasks', 'deadlines'],
  },
  guest: {
    dashboardCards: ['upcoming', 'stats'],
    taskView: 'list',
    showAnalytics: false,
    personalHubSections: ['tasks'],
  },
}
