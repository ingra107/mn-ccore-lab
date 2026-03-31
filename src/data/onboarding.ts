export interface OnboardingStep {
  id: string
  day: number // target day (1, 3, 7, 14, 30)
  title: string
  description: string
  action: string // what to do
  link?: string // where to go
  category: 'setup' | 'explore' | 'contribute' | 'connect'
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  // Day 1: Setup
  {
    id: 'profile',
    day: 1,
    title: 'Complete your profile',
    description: 'Add your photo, bio, and credentials so the team knows you.',
    action: 'Go to your profile page',
    link: '/team',
    category: 'setup',
  },
  {
    id: 'dashboard',
    day: 1,
    title: 'Explore the Dashboard',
    description: 'The Dashboard shows lab health at a glance.',
    action: 'Visit the Dashboard',
    link: '/dashboard',
    category: 'explore',
  },
  {
    id: 'personal',
    day: 1,
    title: 'Check your Personal Hub',
    description: 'Your assigned tasks, deadlines, and notifications live here.',
    action: 'Visit Personal Hub',
    link: '/personal',
    category: 'explore',
  },

  // Day 3: Explore
  {
    id: 'projects',
    day: 3,
    title: 'Browse active projects',
    description: 'See what the lab is working on and find where you fit.',
    action: 'Visit Projects',
    link: '/projects',
    category: 'explore',
  },
  {
    id: 'meetings',
    day: 3,
    title: 'Review past meetings',
    description: 'Read recent meeting notes to catch up on decisions and context.',
    action: 'Visit Meetings',
    link: '/meetings',
    category: 'explore',
  },
  {
    id: 'digest',
    day: 3,
    title: 'Check the Research Digest',
    description: 'Weekly papers relevant to our lab, scored by relevance.',
    action: 'Visit Digest',
    link: '/digest',
    category: 'explore',
  },

  // Day 7: Contribute
  {
    id: 'task',
    day: 7,
    title: 'Complete your first task',
    description: 'Check your assigned tasks and mark one as done.',
    action: 'Go to Tasks',
    link: '/tasks',
    category: 'contribute',
  },
  {
    id: 'comment',
    day: 7,
    title: 'Comment on a project',
    description: 'Add a comment or update to a project you are working on.',
    action: 'Find your project',
    link: '/projects',
    category: 'contribute',
  },
  {
    id: 'idea',
    day: 7,
    title: 'Submit a research idea',
    description: 'Share an idea -- big or small. The Ideas Board is for everyone.',
    action: 'Visit Ideas',
    link: '/ideas',
    category: 'contribute',
  },

  // Day 14: Connect
  {
    id: 'ask',
    day: 14,
    title: 'Ask a question on Ask the Lab',
    description: 'No question is too small. Ask something you are curious about.',
    action: 'Visit Ask the Lab',
    link: '/ask',
    category: 'connect',
  },
  {
    id: 'react',
    day: 14,
    title: 'React to a team update',
    description: 'Show your team you see their work -- add a reaction to an update.',
    action: 'Find a project update',
    link: '/projects',
    category: 'connect',
  },

  // Day 30: Full member
  {
    id: 'calendar',
    day: 30,
    title: 'Check the lab calendar',
    description: 'See upcoming meetings, deadlines, and milestones.',
    action: 'Visit Calendar',
    link: '/calendar',
    category: 'connect',
  },
  {
    id: 'trajectory',
    day: 30,
    title: 'View your trajectory',
    description: 'See your publications, task velocity, and project involvement.',
    action: 'Check your trajectory',
    category: 'contribute',
  },
]

export const DAY_MILESTONES = [1, 3, 7, 14, 30] as const

export const DAY_LABELS: Record<number, string> = {
  1: 'Day 1 -- Get Started',
  3: 'Day 3 -- Explore the Lab',
  7: 'Day 7 -- Start Contributing',
  14: 'Day 14 -- Connect with the Team',
  30: 'Day 30 -- Full Member',
}

export const CATEGORY_META: Record<OnboardingStep['category'], { label: string; color: string }> = {
  setup: { label: 'Setup', color: 'var(--gold)' },
  explore: { label: 'Explore', color: 'var(--teal)' },
  contribute: { label: 'Contribute', color: 'var(--maroon)' },
  connect: { label: 'Connect', color: 'var(--ink)' },
}
