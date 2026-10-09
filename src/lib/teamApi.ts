// teamApi.ts — POST /api/team, the PI's "Add member" (2026-10-08).
//
// Its own module rather than a fetchApi() wrapper: fetchApi throws an ApiError
// that keeps only the status and message, and the form needs the server's
// `code` (email_taken vs slug_taken) to say which field to fix.

import type { TeamMemberRow } from './api'

export interface NewMemberInput {
  name: string
  email: string
  slug?: string
  role?: string
  member_type?: string
}

export type AddMemberResult =
  | { ok: true; member: TeamMemberRow }
  | { ok: false; status: number; error: string; code?: 'email_taken' | 'slug_taken' | 'not_a_member'; slug?: string }

export async function addTeamMember(input: NewMemberInput): Promise<AddMemberResult> {
  let res: Response
  try {
    res = await fetch('/api/team', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the Hub. Check your connection and try again.' }
  }
  const body = await res.json().catch(() => ({})) as { data?: TeamMemberRow; error?: string; code?: string; slug?: string }
  if (res.ok && body.data) return { ok: true, member: body.data }
  const code = body.code === 'email_taken' || body.code === 'slug_taken' || body.code === 'not_a_member' ? body.code : undefined
  return { ok: false, status: res.status, error: body.error || res.statusText || 'Could not add the member', code, slug: body.slug }
}
