import type { Env } from '../helpers';
import { json, error, generateId } from '../helpers';

// GET /api/settings
export async function handleGetSettings(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT key, value FROM lab_settings').all();
  const settings: Record<string, string> = {};
  for (const row of (result.results || []) as { key: string; value: string }[]) {
    settings[row.key] = row.value;
  }
  return json({ data: settings });
}

// POST /api/settings
export async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, string>;
  const stmts = Object.entries(body).map(([key, value]) =>
    env.DB.prepare("INSERT OR REPLACE INTO lab_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").bind(key, value)
  );
  if (stmts.length > 0) await env.DB.batch(stmts);
  return await handleGetSettings(env);
}

// GET /api/workflow-templates
export async function handleGetWorkflowTemplates(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT * FROM workflow_templates ORDER BY is_default DESC, name ASC').all();
  return json({ data: result.results || [] });
}

// POST /api/workflow-templates
export async function handleCreateWorkflowTemplate(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { id?: string; name: string; stages: string[]; is_default?: boolean };
  if (!body.name || !body.stages?.length) return error('name and stages required', 400);

  const id = body.id || generateId();
  await env.DB.prepare(
    'INSERT OR REPLACE INTO workflow_templates (id, name, stages, is_default) VALUES (?, ?, ?, ?)'
  ).bind(id, body.name, JSON.stringify(body.stages), body.is_default ? 1 : 0).run();

  const created = await env.DB.prepare('SELECT * FROM workflow_templates WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
