import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/decisions/similar?q=keyword
export async function handleSimilarDecisions(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return json({ data: [] })

  const like = `%${q}%`

  // Search decisions by title, rationale, and context
  const results = await env.DB.prepare(`
    SELECT id, title, rationale, context, project_slug, outcome, outcome_status, outcome_date, decided_by, created_at,
      CASE
        WHEN LOWER(title) LIKE LOWER(?) THEN 3
        WHEN LOWER(rationale) LIKE LOWER(?) THEN 2
        WHEN LOWER(context) LIKE LOWER(?) THEN 1
        ELSE 0
      END as relevance
    FROM decision_log
    WHERE LOWER(title) LIKE LOWER(?) OR LOWER(rationale) LIKE LOWER(?) OR LOWER(context) LIKE LOWER(?)
    ORDER BY relevance DESC, created_at DESC
    LIMIT 5
  `).bind(like, like, like, like, like, like).all()

  return json({ data: results.results || [] })
}
