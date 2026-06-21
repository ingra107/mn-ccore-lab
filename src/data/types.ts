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
  /** True if this row was provisioned automatically on first login.
   *  Surfaces a "Pending review" badge in the Team UI until role is set. */
  autoCreated?: boolean
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
  id?: string        // proj_* PK from D1 (used for bulk-endpoint lookups); absent in static dev data
  title: string
  status: 'active' | 'waiting_external' | 'blocked' | 'done' | string
  description?: string
  category: string
  pi: string
  slug: string
  short_name?: string
  visibility?: 'public' | 'internal'
  // Pipeline board fields. D1 stores lowercase canonical values.
  // `normalizeStage` maps to 7-step UI ladder; `toApiStage` handles
  // analysis→data_analysis and review→submitted translation on write.
  stage?: 'idea' | 'data_collection' | 'analysis' | 'data_analysis' | 'writing' | 'review' | 'submitted' | 'revisions' | 'accepted' | 'published' | string
  team?: string[]  // slugs of team members working on this
  googleDocUrl?: string
  startDate?: string
  lastActivity?: string
  updated_at?: string
  stage_entered_at?: string
  // W1 pipeline-movement metadata — drives the unified P2-9 staleness basis
  // (days-since-meaningful-movement) on Projects "Needs Attention".
  last_meaningful_movement?: string
  stale_active_since?: string
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
  // Local working-folder path (brain.db→D1, schema v71). Drives the
  // "Open folder" / "Work on this in Claude" mnccore:// affordances. The
  // folder is expected to contain a generated "Start Claude.bat". NULL for
  // projects without a Box/local working dir.
  primary_folder?: string | null
  // Trophy / publication metadata (M-11). Populated for stage='Published'
  // projects via the linked publications row. NULL until the project is
  // shipped + linked. journal_name is the canonical field name; older
  // payloads may use `journal` or `target_journal` — those are aliases.
  journal_name?: string | null
  published_year?: number | null
  doi?: string | null
  created_at?: string
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
