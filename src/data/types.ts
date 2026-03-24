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
}

export interface TeamMember {
  name: string
  initials: string
  role: string
  credentials?: string
  slug?: string
  photoUrl?: string
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
}

export interface Grant {
  mechanism: string
  title: string
  agency: string
  pi: string
}

export interface Project {
  title: string
  status: 'Active' | 'In Review' | 'Published' | 'In Preparation'
  description?: string
  category: string
  pi: string
  slug?: string
}

export interface Mentee {
  name: string
  project: string
  mentor: string
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
