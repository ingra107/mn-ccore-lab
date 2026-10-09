// Project columns that hold a path on Nick's own machine (P7, 2026-10-09).
//
// primary_folder, manuscript_path and analysis_path are PB-owned local paths
// ("C:/Users/.../Box/Research/<project>"). They mean something only on the
// PI's laptops: the "Work on this in Claude" card and @workon open them
// through the mnccore:// handler installed there. A team member's browser got
// them anyway, on every project read, so each member could read Nick's folder
// layout and saw a card that could not work for them.
//
// The rule: a caller that is not the PI (canSeePb false -- not a PI email,
// not the PB API key) never receives these fields. The PB sync pull uses the
// API key, so replication is unchanged.

export const PI_ONLY_PROJECT_FIELDS = ['primary_folder', 'manuscript_path', 'analysis_path'] as const

/** A copy of `row` without the PI-only local-path fields. */
export function withoutPiOnlyProjectFields<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>
  for (const f of PI_ONLY_PROJECT_FIELDS) delete out[f]
  return out as T
}

/**
 * Strip the PI-only fields from a project route's JSON response when the
 * caller is not the PI. Handles `{ data: row }` and `{ data: row[] }`; any
 * other body (an error, a 404) passes through untouched.
 */
export async function projectResponseFor(canSeePb: boolean, res: Response): Promise<Response> {
  if (canSeePb || !res.ok) return res
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) return res
  const body = await res.json() as { data?: unknown }
  if (Array.isArray(body.data)) {
    body.data = body.data.map((r) => (r && typeof r === 'object' ? withoutPiOnlyProjectFields(r) : r))
  } else if (body.data && typeof body.data === 'object') {
    body.data = withoutPiOnlyProjectFields(body.data)
  }
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers })
}

// Typed links of type 'local_folder' carry the same thing: a path on the PI's
// machine ("~/Box/Research/...", or the derived mnccore://open/<path>). Prod
// held 6 explicit rows on 2026-10-09, 4 of them on MNCCORE projects or tasks a
// member can open. A non-PI never receives a local_folder link.
export const PI_ONLY_LINK_TYPES = ['local_folder'] as const

/** `rows` without the links only the PI can use (local folder paths). */
export function withoutPiOnlyLinks<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.filter((r) => !(PI_ONLY_LINK_TYPES as readonly unknown[]).includes(r.type))
}
