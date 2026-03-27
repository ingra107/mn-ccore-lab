/**
 * Typed API client for MN-CCORE D1 backend.
 *
 * In production (Cloudflare Pages), /api/* routes to the Worker.
 * In local dev (Vite), /api/* will 404 unless wrangler dev is running
 * on a proxy — hooks fall back to static data in that case.
 */

// D1 row types (mirror api/types.ts without importing — avoids D1Database type issue)
export interface PublicationRow {
  id: string
  title: string
  authors: string
  journal: string | null
  year: number
  status: string
  doi: string | null
  pubmed: string | null
  abstract: string | null
  topics: string | null
  featured: number
  author_slugs: string | null
  created_at: string
  updated_at: string
}

export interface TeamMemberRow {
  id: string
  name: string
  role: string | null
  credentials: string | null
  slug: string | null
  photo_url: string | null
  bio: string | null
  scholar_id: string | null
  author_name: string | null
  title: string | null
  department: string | null
  member_type: string | null
  created_at: string
}

export interface ProjectRow {
  id: string
  title: string
  status: string
  description: string | null
  category: string | null
  pi: string | null
  slug: string | null
  stage: string
  created_at: string
  updated_at: string
}

export interface GrantRow {
  id: string
  mechanism: string | null
  title: string
  agency: string | null
  pi: string | null
  start_date: string | null
  end_date: string | null
  proposed: number
  total_funding: number | null
  created_at: string
}

export interface GraphNode {
  id: string
  name: string
  slug: string | null
  publicationCount: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  sharedPublications: string[]
}

export interface CollaborationGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Stats {
  publicationCount: number
  teamSize: number
  grantCount: number
  projectCount: number
  activeProjectCount: number
  featuredPublicationCount: number
}

export interface TaskRow {
  id: string
  meeting_id: string | null
  project_id: string | null
  title: string
  description: string
  assignee: string
  assigned_by: string | null
  due_date: string | null
  priority: string // low, medium, high, urgent
  status: string // todo, in_progress, done, blocked
  source: string // manual, meeting, sync
  completed: number
  completed_at: string | null
  completed_by: string | null
  created_at: string
  meeting_title?: string
  meeting_date?: string
}

interface ApiResponse<T> {
  data: T
  count?: number
}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error || res.statusText)
  }

  return res.json()
}

// ── Read endpoints ──────────────────────────────────────────

export function fetchPublications(params?: {
  year?: number
  status?: string
  topic?: string
}) {
  const qs = new URLSearchParams()
  if (params?.year) qs.set('year', String(params.year))
  if (params?.status) qs.set('status', params.status)
  if (params?.topic) qs.set('topic', params.topic)
  const query = qs.toString()
  return fetchApi<PublicationRow[]>(`/api/publications${query ? `?${query}` : ''}`)
}

export function fetchTeam() {
  return fetchApi<TeamMemberRow[]>('/api/team')
}

export function fetchProjects(params?: { status?: string; category?: string }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.category) qs.set('category', params.category)
  const query = qs.toString()
  return fetchApi<ProjectRow[]>(`/api/projects${query ? `?${query}` : ''}`)
}

export function fetchGrants() {
  return fetchApi<GrantRow[]>('/api/grants')
}

export function fetchCollaborationGraph() {
  return fetchApi<CollaborationGraph>('/api/graph/collaboration')
}

export function fetchStats() {
  return fetchApi<Stats>('/api/stats')
}

// ── Write endpoints (require auth) ──────────────────────────

export function updateProject(id: string, fields: Record<string, unknown>) {
  return fetchApi<ProjectRow>(`/api/projects/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function addProjectComment(id: string, comment: { content: string; author: string }) {
  return fetchApi<{ id: string }>(`/api/projects/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify(comment),
  })
}

// ── Tasks endpoints ──────────────────────────────────────────

export function fetchTasks(params?: {
  assignee?: string
  status?: string
  priority?: string
  project?: string
  meeting?: string
  source?: string
  completed?: string
}) {
  const qs = new URLSearchParams()
  if (params?.assignee) qs.set('assignee', params.assignee)
  if (params?.status) qs.set('status', params.status)
  if (params?.priority) qs.set('priority', params.priority)
  if (params?.project) qs.set('project', params.project)
  if (params?.meeting) qs.set('meeting', params.meeting)
  if (params?.source) qs.set('source', params.source)
  if (params?.completed) qs.set('completed', params.completed)
  const query = qs.toString()
  return fetchApi<TaskRow[]>(`/api/tasks${query ? `?${query}` : ''}`)
}

export function createTask(input: {
  title?: string
  description: string
  assignee: string
  meeting_id?: string
  project_id?: string
  due_date?: string
  priority?: string
  source?: string
}) {
  return fetchApi<TaskRow>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTaskStatus(id: string, status: string) {
  return fetchApi<TaskRow>(`/api/tasks/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export function updateTask(id: string, fields: Record<string, unknown>) {
  return fetchApi<TaskRow>(`/api/tasks/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function fetchTeamSlugs() {
  return fetchApi<{ slug: string; name: string }[]>('/api/team/slugs')
}

export { ApiError }
