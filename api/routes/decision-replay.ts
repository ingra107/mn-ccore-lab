import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/decisions/similar?q=keyword — text-based similarity search
export async function handleSimilarDecisions(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return json({ data: [] })

  const like = `%${q}%`

  // Search decisions by title, rationale, context, and tags
  const results = await env.DB.prepare(`
    SELECT id, title, rationale, context, project_slug, outcome, outcome_status, outcome_sentiment, outcome_date, decided_by, tags, linked_projects, created_at,
      CASE
        WHEN LOWER(title) LIKE LOWER(?) THEN 3
        WHEN LOWER(rationale) LIKE LOWER(?) THEN 2
        WHEN LOWER(context) LIKE LOWER(?) THEN 1
        ELSE 0
      END as relevance
    FROM decision_log
    WHERE LOWER(title) LIKE LOWER(?) OR LOWER(rationale) LIKE LOWER(?) OR LOWER(context) LIKE LOWER(?) OR LOWER(tags) LIKE LOWER(?)
    ORDER BY relevance DESC, created_at DESC
    LIMIT 5
  `).bind(like, like, like, like, like, like, like).all()

  return json({ data: results.results || [] })
}

// GET /api/decisions/similar-by-id?id=X — find decisions similar to a specific decision
export async function handleSimilarDecisionsById(url: URL, env: Env): Promise<Response> {
  const id = url.searchParams.get('id')?.trim()
  if (!id) return json({ data: [] })

  // Fetch the source decision
  const source = await env.DB.prepare(
    'SELECT id, title, rationale, context, tags FROM decision_log WHERE id = ?'
  ).bind(id).first() as { id: string; title: string; rationale: string | null; context: string | null; tags: string | null } | null

  if (!source) return json({ data: [] })

  // Extract keywords from title for text matching
  const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or', 'not', 'no', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'that', 'this', 'these', 'those', 'it', 'its', 'we', 'our', 'use', 'using', 'used'])
  const keywords = (source.title + ' ' + (source.rationale || '') + ' ' + (source.context || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w))

  const sourceTags = source.tags ? source.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : []

  // Fetch all other decisions
  const allDecisions = await env.DB.prepare(
    'SELECT * FROM decision_log WHERE id != ? ORDER BY created_at DESC'
  ).bind(id).all()

  const scored = ((allDecisions.results || []) as Array<{
    id: string; title: string; rationale: string | null; context: string | null;
    tags: string | null; outcome: string | null; outcome_status: string;
    outcome_sentiment: string | null; outcome_date: string | null;
    project_slug: string | null; linked_projects: string | null;
    decided_by: string | null; created_at: string;
  }>).map(d => {
    let score = 0

    // Tag overlap (3 points per shared tag)
    const dTags = d.tags ? d.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : []
    const sharedTags = sourceTags.filter(t => dTags.includes(t))
    score += sharedTags.length * 3

    // Keyword overlap (1 point per shared keyword)
    const dText = (d.title + ' ' + (d.rationale || '') + ' ' + (d.context || '')).toLowerCase()
    const matchedKeywords = keywords.filter(kw => dText.includes(kw))
    // Deduplicate matched keywords
    const uniqueMatches = new Set(matchedKeywords)
    score += uniqueMatches.size

    return { ...d, relevance_score: score, shared_tags: sharedTags }
  })
    .filter(d => d.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 3)

  return json({ data: scored })
}
