// projectJoinApi.ts -- the project directory and requests to join
// (api/routes/project-join.ts, schema-v139).
import { fetchApi } from './api'

export type JoinState = 'member' | 'pending' | 'declined' | 'none'

/** One listed project as a member sees it: name, blurb, PI, and the caller's own state. */
export interface DirectoryEntry {
  project_id: string
  name: string
  blurb: string | null
  pi_slug: string | null
  pi_name: string | null
  state: JoinState
  request_id: string | null
  decided_note: string | null
  decided_at: string | null
}

export type JoinRequestStatus = 'pending' | 'approved' | 'declined'

export interface JoinRequest {
  id: string
  project_id: string
  requester_slug: string
  note: string | null
  status: JoinRequestStatus
  decided_by: string | null
  decided_via: string | null
  decided_note: string | null
  decided_at: string | null
  created_at: string
}

/** A request as Nick or Nate sees it on Today. */
export interface JoinRequestForApprover extends JoinRequest {
  project_name: string | null
  blurb: string | null
  pi_name: string | null
  requester_name: string | null
  requester_photo: string | null
}

export function fetchProjectDirectory(): Promise<{ data: DirectoryEntry[] }> {
  return fetchApi<DirectoryEntry[]>('/api/project-directory')
}

export function requestToJoin(projectId: string, note: string | null): Promise<{ data: JoinRequest; created: boolean }> {
  return fetchApi<JoinRequest>(`/api/projects/${encodeURIComponent(projectId)}/join-request`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  }) as Promise<{ data: JoinRequest; created: boolean }>
}

export function fetchJoinRequests(): Promise<{ data: JoinRequestForApprover[] }> {
  return fetchApi<JoinRequestForApprover[]>('/api/join-requests')
}

export function decideJoinRequest(id: string, decision: 'approve' | 'decline', note: string | null): Promise<{ data: JoinRequest }> {
  return fetchApi<JoinRequest>(`/api/join-requests/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify(note ? { decision, note } : { decision }),
  })
}

export interface ProjectBlurb {
  project_id: string
  blurb: string | null
  updated_by: string | null
  updated_at: string | null
}

export function fetchProjectBlurb(ref: string): Promise<{ data: ProjectBlurb }> {
  return fetchApi<ProjectBlurb>(`/api/projects/${encodeURIComponent(ref)}/blurb`)
}

export function setProjectBlurb(ref: string, blurb: string | null): Promise<{ data: ProjectBlurb }> {
  return fetchApi<ProjectBlurb>(`/api/projects/${encodeURIComponent(ref)}/blurb`, {
    method: 'PUT',
    body: JSON.stringify({ blurb }),
  })
}

/** The one-line description's limit, as the API and the table hold it. */
export const BLURB_MAX = 140
