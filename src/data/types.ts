export interface Director {
  name: string
  credentials: string
  title: string
  role: string
  initials: string
  slug: string
  path: string
  bio: string
  photoUrl?: string
  scholarId?: string // Google Scholar user ID (the ?user= parameter)
}

export interface TeamMember {
  name: string
  initials: string
  role: string
  credentials?: string
  slug?: string
  photoUrl?: string
  authorName?: string // PubMed-style name for matching in author strings, e.g. "Chipman JG"
  bio?: string
  links?: { label: string; href: string }[]
  scholarId?: string // Google Scholar user ID (the ?user= parameter)
}

export interface Publication {
  id: string
  authors: string
  title: string
  journal: string
  year: number
  status: 'Published' | 'In Review' | 'In Preparation'
  doi?: string
  pubmed?: string
  abstract?: string
  topics: string[]
  featured?: boolean
  authorSlugs?: string[]
  visibility?: 'public' | 'internal'
}

// R10: grant status now follows the funding-lifecycle taxonomy. Legacy
// 'Active' / 'Pending' / 'Completed' are kept in the union so static
// fallback data (src/data/grants.ts) still type-checks until it's migrated.
export type GrantLifecycleStatus =
  | 'planning'
  | 'in_preparation'
  | 'submitted'
  | 'funded'
  | 'resubmission'
  | 'declined'
  | 'closed'

export interface Grant {
  mechanism: string
  title: string
  agency: string
  pi: string
  proposed?: boolean
  status?: GrantLifecycleStatus | 'Active' | 'Pending' | 'Completed'
  visibility?: 'public' | 'internal' // default: 'public'
}

// Visibility: 'public' = show on website, 'internal' = team-only (future portal)
// Default is 'public' — items only hidden when explicitly marked 'internal'

export interface ProjectNote {
  timestamp: string  // ISO datetime
  content: string
  author?: string
}

export interface Project {
  title: string
  status: 'Active' | 'In Review' | 'Published' | 'In Preparation'
  description?: string
  category: string
  pi: string
  slug: string
  short_name?: string
  visibility?: 'public' | 'internal'
  // Pipeline board fields. Includes both UI canonical stages (Analysis,
  // Review) rendered in StageSelector and API canonical stages
  // (Data Analysis, Submitted, Accepted) stored in D1. `normalizeStage`
  // folds API → UI for display; `toApiStage` folds UI → API on submit.
  stage?: 'Idea' | 'Data Collection' | 'Analysis' | 'Data Analysis' | 'Writing' | 'Review' | 'Submitted' | 'Accepted' | 'Published'
  team?: string[]  // slugs of team members working on this
  googleDocUrl?: string
  startDate?: string
  lastActivity?: string
  updated_at?: string
  notes?: ProjectNote[]
  pi_context?: string
  strategic_context?: string
  // Key links (schema-v42, 2026-04-17). URLs + optional descriptions.
  key_link_1?: string | null
  key_link_1_desc?: string | null
  key_link_2?: string | null
  key_link_2_desc?: string | null
  key_link_3?: string | null
  key_link_3_desc?: string | null
}

export interface Mentee {
  name: string
  slug: string            // links to TeamMember slug for photo/page
  role: string            // "Critical Care Fellow", "Research Coordinator", etc.
  credentials?: string
  mentor: 'nick-ingraham' | 'nate-mesfin' | 'shared'
  researchInterests?: string[]
  bio?: string
  projectSlugs?: string[] // links to Project slugs
  yearStarted?: number
}

export interface Affiliate {
  name: string
  description: string
  href: string
}

export interface ResearchPillar {
  icon: string
  title: string
  description: string
}

export interface ActionItem {
  id?: string  // D1 action item ID (present when from API)
  description: string
  assignee: string  // team member slug
  dueDate?: string
  completed: boolean
  projectSlug?: string  // links to a project
}

export interface Meeting {
  id: string
  date: string  // ISO date
  title: string
  type: 'biweekly' | 'ad-hoc' | 'journal-club'
  attendees?: string[]  // team member slugs
  agenda?: string[]
  actionItems?: ActionItem[]
  decisions?: string[]
  notes?: string
}
