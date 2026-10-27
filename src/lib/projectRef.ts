// projectRef.ts -- which reference ProjectDetail's own queries run on (#151, #156 review).
//
// A project URL may carry the slug or the typed id (proj_*). The detail
// queries are keyed by slug. On a slug URL they start at once, in parallel
// with the project list; on an id URL they wait for the list to name the
// slug, so they never run once under the id and again under the slug (two
// fetches, and orphaned id-keyed cache entries). Once the list has answered
// without the project (bad URL, no access) they stop: the page is the
// not-found screen.

export function detailQueryRef(
  param: string | undefined,
  project: { slug: string } | undefined,
  listLoading: boolean,
  listError: boolean,
): string | undefined {
  if (project) return project.slug
  if (!param) return undefined
  if (listLoading) return param.startsWith('proj_') ? undefined : param
  return listError ? param : undefined
}
