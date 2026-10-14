export interface Director {
  name: string
  credentials: string
  title: string
  role: string
  initials: string
  slug: string
  bio: string
  fullBio?: string // the longer bio the member page shows; the card keeps `bio`
  links?: { label: string; href: string }[] // ORCID, GitHub, UMN Bio; Scholar comes from scholarId
  photoUrl?: string
  scholarId?: string // Google Scholar user ID (the ?user= parameter)
  orcidId?: string // ORCID iD, e.g. "0000-0002-1825-0097" — primary publications source (#357)
  openalexId?: string // OpenAlex author id, e.g. "A5048294211" — fullest publications source (#905)
  authorName?: string // PubMed-style name for matching in author strings, e.g. "Ingraham NE" (#906)
}

export interface TeamMember {
  name: string
  initials: string
  role: string
  title?: string // faculty title, shown under the name on the member page (directors)
  credentials?: string
  slug?: string
  photoUrl?: string
  authorName?: string // PubMed-style name for matching in author strings, e.g. "Chipman JG"
  bio?: string
  fullBio?: string // longer bio for the member page; falls back to `bio`
  links?: { label: string; href: string }[]
  scholarId?: string // Google Scholar user ID (the ?user= parameter)
  orcidId?: string // ORCID iD — primary publications source (#357)
  openalexId?: string // OpenAlex author id, e.g. "A5048294211" — fullest publications source (#905)
  /** team_members.email, present only on rows fetched by an authed caller.
   *  The attendance picker resolves stored attendee emails with it (#551). */
  email?: string
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

// Where a grant sits for every reader. The API derives it from status; nothing re-derives it.
export type GrantBucket = 'active' | 'proposed' | 'ended'

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
  // Fine-grained grant/personal-taxonomy classification (schema-v73,
  // api/schema-v73-projects-type.sql: R01/R03/K/CLIF/Nick_Lab/Friends/
  // Mentees/Admin/Personal). Independent of `category` — see that
  // migration's rationale. Nullable: pre-2026-06-06 rows may not be
  // backfilled.
  type?: string | null
  pi: string
  slug: string
  short_name?: string
  visibility?: 'public' | 'internal'
  // A project's stage is its products' stages (contract phase step 1, PB
  // Scratch/plans/2026-10-12-contract-phase-retire-project-stage.md). There is
  // deliberately no `stage` here: projects.stage is being retired, and
  // rowToProject drops it so no reader can reach it. The browser read
  // (GET /api/projects) carries the HOME product's kind and stage plus the
  // counts below; compact displays read them through src/lib/projectStage.ts,
  // full views and rollups read the products themselves (useAllProjectProducts).
  home_kind?: string | null
  home_kind_label?: string | null
  home_stage?: string | null
  home_stage_label?: string | null
  /** Live products in the project (the "+N" is this minus one). */
  product_count?: number | null
  /** Live products on a non-terminal rung; 0 with product_count > 0 = finished. */
  product_open_count?: number | null
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
  // Trophy / publication metadata — the REAL columns are schema-v71's
  // Bucket-C reference fields (journal, publication_date, doi; Hub-canonical
  // + PB-synced since 2026-05-29, returned by GET /api/projects SELECT *).
  // The former M-11 names (journal_name, published_year; 2026-04-28) predated
  // v71 and never had a backing column — deleted 2026-07-29 (#812). Note
  // v71 deliberately keeps `journal` SEPARATE from the PWA publications
  // field `journal_name` (distinct lineage) — do not re-alias them.
  journal?: string | null
  publication_date?: string | null
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
  type: 'biweekly' | 'ad-hoc' | 'journal-club' | 'one-on-one'
  attendees?: string[]  // team member slugs
  agenda?: string[]
  actionItems?: ActionItem[]
  decisions?: string[]
  notes?: string
  updated_at?: string  // server row timestamp — drives the new-notes freshness pill
  /** Who ran the meeting, recorded — never derived. NULL renders nothing (#102). */
  facilitator?: string | null
  /** schema-v122: 'lab' = every member sees it (the three lab series, or flipped by its owner / Nick). */
  audience?: 'private' | 'lab'
}
