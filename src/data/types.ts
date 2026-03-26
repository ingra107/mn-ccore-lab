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

export interface Grant {
  mechanism: string
  title: string
  agency: string
  pi: string
  proposed?: boolean
  status?: 'Active' | 'Pending' | 'Completed'
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
  visibility?: 'public' | 'internal'
  // Pipeline board fields
  stage?: 'Idea' | 'Data Collection' | 'Analysis' | 'Writing' | 'Review' | 'Published'
  team?: string[]  // slugs of team members working on this
  googleDocUrl?: string
  startDate?: string
  lastActivity?: string
  notes?: ProjectNote[]
}

export interface Mentee {
  name: string
  slug: string            // links to TeamMember slug for photo/page
  role: string            // "Critical Care Fellow", "Research Coordinator", etc.
  credentials?: string
  mentor: 'nick' | 'nate' | 'shared'
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
