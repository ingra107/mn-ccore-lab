export interface Env {
  DB: D1Database;
  DB_TEST?: D1Database;
  FILES?: R2Bucket;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  CF_ACCOUNT_ID?: string;
  SENDGRID_API_KEY?: string;
  RESEND_API_KEY?: string;
  NOTIFICATION_HUB?: DurableObjectNamespace;
  PB_API_KEY?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  // Airtable secrets removed in CX-S2 (2026-04-28). Pre-removal these
  // configured an Airtable DELETE cascade in handleDeleteProject; Airtable
  // was retired 2026-04-21 and the cascade no longer ran. Variables are
  // still safe to leave set on Cloudflare (this interface no longer reads
  // them, so the secret just sits unused).
}

export interface PublicationRow {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number;
  status: string;
  doi: string | null;
  pubmed: string | null;
  abstract: string | null;
  topics: string | null;
  featured: number;
  author_slugs: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  role: string | null;
  credentials: string | null;
  slug: string | null;
  photo_url: string | null;
  bio: string | null;
  scholar_id: string | null;
  author_name: string | null;
  title: string | null;
  department: string | null;
  member_type: string | null;
  email: string | null;
  /** v53: 1 if provisioned via first-login auto-create; 0 otherwise. */
  auto_created: number;
  created_at: string;
}

export interface GraphNode {
  id: string;
  name: string;
  slug: string | null;
  publicationCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  sharedPublications: string[];
}

export interface CollaborationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Stats {
  publicationCount: number;
  teamSize: number;
  grantCount: number;
  projectCount: number;
  activeProjectCount: number;
  featuredPublicationCount: number;
}
