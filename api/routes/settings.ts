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

// The keys a member may write through POST /api/settings: exactly the four the
// Settings page sends (SettingsPage.tsx Profile tab). Every other lab_settings
// row is off this route. Before #8949 the route turned EVERY top-level field of
// the body into its own row, so a test's {key, value} body wrote rows named
// 'key' and 'value' to prod, and any member could overwrite pi_emails or a
// hub_validate_* flag (the route is auth:'authed', not PI). pi_emails and the
// flags are set through D1 directly; a PI self-service route for pi_emails
// would be its own auth:'pi' route, not a wider list here.
export const SETTINGS_KEYS = ['lab_name', 'lab_description', 'lab_icon', 'lab_type'] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];
const isSettingsKey = (k: string): k is SettingsKey => (SETTINGS_KEYS as readonly string[]).includes(k);

// POST /api/settings: body is { <SettingsKey>: string, ... }. Any other key,
// or a non-string value, refuses the whole write with a 400 and writes nothing.
export async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return error('body must be a JSON object', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('body must be a JSON object', 400);
  const entries = Object.entries(body as Record<string, unknown>);
  const refused = entries.filter(([key, value]) => !isSettingsKey(key) || typeof value !== 'string').map(([key]) => key);
  if (refused.length > 0) {
    return error(`not a writable setting: ${refused.join(', ')} (writable: ${SETTINGS_KEYS.join(', ')}; values are strings)`, 400);
  }
  const stmts = entries.map(([key, value]) =>
    env.DB.prepare("INSERT OR REPLACE INTO lab_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").bind(key, value as string)
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
