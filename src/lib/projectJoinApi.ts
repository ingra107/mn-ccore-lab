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
  pi_photo: string | null
  state: JoinState
  request_id: string | null
  decided_note: string | null
  decided_at: string | null
  /** When declined and a new ask must still wait: when it is allowed (7 days after the decline). Null once allowed. */
  retry_after: string | null
}

export type JoinRequestStatus = 'pending' | 'approved' | 'declined' | 'expired'

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
  /** 1 while the project is in the directory; 0 once it left (only Close then). */
  listed: number
  project_name: string | null
  blurb: string | null
  pi_name: string | null
  requester_name: string | null
  requester_photo: string | null
  /** An approver's Telegram 'Other': Nick and Nate only, never the requester. */
  director_note: string | null
  director_note_by: string | null
  director_note_at: string | null
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

export type JoinDecision = 'approve' | 'decline' | 'close'

export function decideJoinRequest(id: string, decision: JoinDecision, note: string | null): Promise<{ data: JoinRequest }> {
  return fetchApi<JoinRequest>(`/api/join-requests/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify(note ? { decision, note } : { decision }),
  })
}

/** A project's Browse listing: its one-line description and whether Browse hides it. */
export interface ProjectListing {
  project_id: string
  blurb: string | null
  hidden: boolean
  /** Nick or the project's PI: may hide or show it. */
  can_hide: boolean
  updated_by: string | null
  updated_at: string | null
}

export function fetchProjectListing(ref: string): Promise<{ data: ProjectListing }> {
  return fetchApi<ProjectListing>(`/api/projects/${encodeURIComponent(ref)}/listing`)
}

export function setProjectListing(ref: string, change: { blurb?: string | null; hidden?: boolean }): Promise<{ data: ProjectListing }> {
  return fetchApi<ProjectListing>(`/api/projects/${encodeURIComponent(ref)}/listing`, {
    method: 'PUT',
    body: JSON.stringify(change),
  })
}

/** The one-line description's limit, as the API and the table hold it. */
export const BLURB_MAX = 140
