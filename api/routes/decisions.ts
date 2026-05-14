import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, buildUpdate } from '../helpers';
import { filterFixtures } from '../lib/fixtures';

// GET /api/decisions?project_slug=&status=pending|recorded|revisited&tag=
export async function handleGetDecisions(url: URL, env: Env): Promise<Response> {
  const projectSlug = url.searchParams.get('project_slug');
  const status = url.searchParams.get('status');
  const tag = url.searchParams.get('tag');
  const includeFixtures = url.searchParams.get('include_fixtures') === '1';

  let query = 'SELECT * FROM hub_decisions WHERE 1=1';
  const params: string[] = [];

  if (projectSlug) { query += ' AND (project_slug = ? OR linked_projects LIKE ?)'; params.push(projectSlug, `%${projectSlug}%`); }
  if (status) { query += ' AND outcome_status = ?'; params.push(status); }
  if (tag) { query += ' AND ("," || tags || ",") LIKE ?'; params.push(`%,${tag},%`); }

  query += ' ORDER BY created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  const rows = filterFixtures(result.results || [], 'title', includeFixtures);
  return json({ data: rows, count: rows.length });
}

// POST /api/decisions — create decision
export async function handleCreateDecision(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    title: string;
    rationale?: string;
    context?: string;
    project_slug?: string;
    meeting_id?: string;
    tags?: string;
    linked_projects?: string;
    decided_by?: string;
  };
  if (!body.title) return error('title required', 400);

  const id = generateId();
  const decidedBy = body.decided_by?.trim() || actorSlug(user.email);
  // Normalize tags to CSV on write (historical data was JSON-stringified arrays).
  const normalizedTags = parseTagsField(body.tags).join(',') || null;

  await env.DB.prepare(
    'INSERT INTO hub_decisions (id, title, rationale, context, project_slug, meeting_id, decided_by, tags, linked_projects) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.title,
    body.rationale || null,
    body.context || null,
    body.project_slug || null,
    body.meeting_id || null,
    decidedBy,
    normalizedTags,
    body.linked_projects || null,
  ).run();

  await logActivity(env, 'decision', `Decision logged: "${body.title}"`, decidedBy, id, 'decision');

  const created = await env.DB.prepare('SELECT * FROM hub_decisions WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/decisions/:id/outcome — update outcome + outcome_status + outcome_sentiment
export async function handleUpdateDecisionOutcome(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    outcome: string;
    outcome_status: string;
    outcome_sentiment?: string;
  };

  if (!body.outcome || !body.outcome_status) {
    return error('outcome and outcome_status required', 400);
  }

  const validStatuses = ['pending', 'recorded', 'revisited'];
  if (!validStatuses.includes(body.outcome_status)) {
    return error(`outcome_status must be one of: ${validStatuses.join(', ')}`, 400);
  }

  const validSentiments = ['positive', 'negative', 'neutral', 'pending'];
  const sentiment = body.outcome_sentiment && validSentiments.includes(body.outcome_sentiment)
    ? body.outcome_sentiment
    : 'neutral';

  await env.DB.prepare(
    "UPDATE hub_decisions SET outcome = ?, outcome_status = ?, outcome_sentiment = ?, outcome_date = datetime('now') WHERE id = ?"
  ).bind(body.outcome, body.outcome_status, sentiment, id).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'decision_outcome', `Outcome recorded for decision`, actor, id, 'decision');

  const updated = await env.DB.prepare('SELECT * FROM hub_decisions WHERE id = ?').bind(id).first();
  if (!updated) return error('Decision not found', 404);
  return json({ data: updated });
}

// POST /api/decisions/:id/update — update decision fields (tags, linked_projects, etc.)
export async function handleUpdateDecision(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  // Normalize tags to CSV on write (repair path for historical JSON-array format).
  if (typeof body.tags === 'string') {
    body.tags = parseTagsField(body.tags).join(',') || null;
  }

  const allowedFields = ['title', 'rationale', 'context', 'project_slug', 'tags', 'linked_projects', 'outcome_sentiment'];
  const { sql, params: values, hasUpdates } = buildUpdate(body, allowedFields);

  if (!hasUpdates) return error('No valid fields to update', 400);

  await env.DB.prepare(
    `UPDATE hub_decisions SET ${sql} WHERE id = ?`
  ).bind(...values, id).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'decision_update', `Decision updated`, actor, id, 'decision');

  const updated = await env.DB.prepare('SELECT * FROM hub_decisions WHERE id = ?').bind(id).first();
  if (!updated) return error('Decision not found', 404);
  return json({ data: updated });
}

// GET /api/decisions/review — decisions older than 30 days with outcome_status='pending'
export async function handleGetDecisionsNeedingReview(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM hub_decisions WHERE outcome_status = 'pending' AND created_at <= datetime('now', '-30 days') ORDER BY created_at ASC"
  ).all();
  const rows = filterFixtures(result.results || [], 'title');
  return json({ data: rows, count: rows.length });
}

// GET /api/decisions/tags — unique tags across all decisions
function parseTagsField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return trimmed.split(',').map(t => t.trim()).filter(Boolean);
}

export async function handleGetDecisionTags(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT tags FROM hub_decisions WHERE tags IS NOT NULL AND tags != ''"
  ).all();

  const tagCounts = new Map<string, number>();
  for (const row of (result.results || []) as { tags: string }[]) {
    for (const tag of parseTagsField(row.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return json({ data: tags });
}
