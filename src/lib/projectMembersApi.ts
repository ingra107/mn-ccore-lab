// projectMembersApi.ts -- project membership routes (#145, api/routes/project-members.ts).
import { fetchApi } from './api'

export interface ProjectMember {
  slug: string
  name: string | null
  preferred_name: string | null
  photo_url: string | null
  member_type: string | null
  email: string | null
  added_by: string
  created_at: string
}

export interface MemberProject {
  id: string
  slug: string | null
  title: string
  status: string | null
  stage: string | null
  category: string | null
  added_by: string
  joined_at: string
}

export interface ProjectMembersResult {
  data: ProjectMember[]
  project_id: string
  /** POST only: false when the person was already a member. */
  added?: boolean
  /** DELETE only. */
  removed?: boolean
}

const base = (ref: string) => `/api/projects/${encodeURIComponent(ref)}/members`

export function fetchProjectMembers(ref: string): Promise<ProjectMembersResult> {
  return fetchApi<ProjectMember[]>(base(ref)) as Promise<ProjectMembersResult>
}

export function addProjectMember(ref: string, slug: string): Promise<ProjectMembersResult> {
  return fetchApi<ProjectMember[]>(base(ref), { method: 'POST', body: JSON.stringify({ slug }) }) as Promise<ProjectMembersResult>
}

/** data is [] when the caller removed themself and can no longer see the project. */
export function removeProjectMember(ref: string, slug: string): Promise<ProjectMembersResult> {
  return fetchApi<ProjectMember[]>(`${base(ref)}/${encodeURIComponent(slug)}`, { method: 'DELETE' }) as Promise<ProjectMembersResult>
}

export function fetchMemberProjects(slug: string): Promise<{ data: MemberProject[] }> {
  return fetchApi<MemberProject[]>(`/api/team/${encodeURIComponent(slug)}/projects`)
}
