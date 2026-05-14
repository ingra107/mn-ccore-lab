// Citations endpoint — lab-wide Google Scholar totals.
//
// Decision: D2-followup (audit/2026-04-28/DECISIONS-RESOLVED.md). Replaces
// hardcoded `totalCitations = 2626` on the Lab Overview StatsCard with a
// real-data SUM over team_members.citation_count.
//
// Pipeline (PB-side, separate from this code):
//   weekly cron on home laptop iterates `team_members WHERE scholar_id IS
//   NOT NULL`, uses `scholarly` Python library to fetch each profile,
//   writes citation_count + h_index + last_scholar_refresh back to D1 via
//   PUT /api/team/:slug.
//
// Hub serves the aggregated read here. SUM() in sqlite skips NULL values
// natively, so partial coverage (e.g. 5 of 19 members fetched) renders
// correctly without extra coalescing.
//
// Edge cache 1 hour: citation counts move on a weekly cadence at most;
// no point hitting D1 every dashboard mount.
//
// Schema dependency: api/schema-v54-team-citations.sql (citation_count,
// h_index, last_scholar_refresh on team_members).

import { corsHeaders } from '../helpers'
import type { Env } from '../helpers'

interface CitationsAggregateRow {
  total: number | null
  members_with_data: number
  members_total: number
  last_refresh: string | null
}

// GET /api/citations
export async function handleGetCitations(env: Env): Promise<Response> {
  // Single round-trip — sqlite computes SUM/MAX/COUNT in one pass. We
  // return total=0 + members_with_data=0 if the schema migration hasn't
  // run yet (CASE-guarded for forward-compat), but with v54 applied the
  // columns exist and the query returns meaningful data.
  const row = await env.DB.prepare(
    `SELECT
       SUM(citation_count) AS total,
       SUM(CASE WHEN citation_count IS NOT NULL THEN 1 ELSE 0 END) AS members_with_data,
       COUNT(*) AS members_total,
       MAX(last_scholar_refresh) AS last_refresh
     FROM team_members`
  ).first<CitationsAggregateRow>()

  const body = {
    total: row?.total ?? 0,
    last_refresh: row?.last_refresh ?? null,
    members_with_data: row?.members_with_data ?? 0,
    members_total: row?.members_total ?? 0,
  }

  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      ...corsHeaders,
    },
  })
}
