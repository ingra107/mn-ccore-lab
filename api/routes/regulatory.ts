import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, buildUpdate, getAuthUser, assertProjectVisible } from '../helpers';
import { withProjectWrite } from '../lib/route-guards';
import { ctToday } from '../lib/ct-date';
import { nowInstant } from '../lib/time';

// ── .ics helpers ─────────────────────────────────────────────────────────────

function formatIcsDate(dateStr: string): string {
  return dateStr.replace(/[^0-9]/g, '').slice(0, 8);
}

function escapeIcs(s: string): string {
  return s.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n');
}

const VALID_TYPES = ['irb', 'irb_amendment', 'dua', 'dta', 'coi', 'training', 'other'] as const;
// 'action_needed' and 'expiring_soon' are produced by the read query at line 59
// (handleGetExpiringItems WHERE clause). Omitting them from VALID_STATUSES caused
// validation to reject values the system itself writes.
const VALID_STATUSES = ['active', 'expired', 'pending', 'exempt', 'action_needed', 'expiring_soon'] as const;

// GET /api/regulatory?project_id=
// Phase 1b-extended: cross-project feed when project_id is absent — filter PB
// rows for non-PI callers.
export async function handleGetRegulatoryItems(url: URL, request: Request, env: Env, canSeePb = false): Promise<Response> {
  const projectId = url.searchParams.get('project_id');

  // Phase 1b-B: when scoped to a specific project, block non-PI callers from
  // reading regulatory items of a PB-category project.
  if (projectId) {
    const block = await assertProjectVisible(request, env, projectId);
    if (block) return block;
  }

  const pbFilter = (!projectId && !canSeePb)
    ? " AND (p.category IS NULL OR p.category != 'Peripheral Brain')"
    : '';

  let query = `SELECT r.* FROM regulatory_items r
               LEFT JOIN projects p ON p.id = r.project_id OR p.slug = r.project_id
               WHERE 1=1${pbFilter}`;
  const params: string[] = [];

  if (projectId) {
    query += ' AND r.project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY CASE r.status WHEN \'expired\' THEN 0 WHEN \'active\' THEN 1 WHEN \'pending\' THEN 2 WHEN \'exempt\' THEN 3 END, r.expiration_date ASC, r.created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// GET /api/regulatory/expiring?days=30
// Phase 1b-extended: cross-project feed; filter PB rows for non-PI callers.
export async function handleGetExpiringItems(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const days = parseInt(url.searchParams.get('days') || '30', 10);
  const now = new Date();
  // AM-7: CT-anchored cutoff (was UTC `cutoff.toISOString()`, which after ~6pm
  // CT advanced the expiration window a day). `now` (Date) is still used for
  // the days_remaining ms-diff math below, which is timezone-agnostic.
  // (`nowIso` was dead — never referenced in the query — so it's removed.)
  const cutoffIso = ctToday(days);

  const pbFilter = canSeePb ? '' : " AND (p.category IS NULL OR p.category != 'Peripheral Brain')";
  // Get items expiring within N days (including already expired), joined with project title
  const result = await env.DB.prepare(`
    SELECT r.*, p.title as project_title, p.slug as project_slug
    FROM regulatory_items r
    LEFT JOIN projects p ON r.project_id = p.slug OR r.project_id = p.id
    WHERE r.status IN ('active','action_needed','expiring_soon','pending')
      AND r.expiration_date IS NOT NULL
      AND r.expiration_date <= ?${pbFilter}
    ORDER BY r.expiration_date ASC
  `).bind(cutoffIso).all();

  // Annotate with days_remaining
  const items = (result.results || []).map((item: any) => {
    const exp = new Date(item.expiration_date + 'T23:59:59');
    const daysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...item, days_remaining: daysRemaining };
  });

  return json({ data: items, count: items.length });
}

// POST /api/regulatory — create item
// Z2.3 (2026-05-28): withProjectWrite wraps the resolve+visibility-gate so
// bypass is impossible. The outer signature (request, user, env) is
// unchanged for api/index.ts compatibility. The inner handler receives the
// canonical projectId already resolved and PB-gated.
export async function handleCreateRegulatoryItem(request: Request, user: AuthUser, env: Env): Promise<Response> {
  type CreateBody = {
    project_id?: string;
    item_type?: string;
    title?: string;
    protocol_number?: string;
    approved_date?: string;
    expiration_date?: string;
    renewal_due?: string;
    status?: string;
    notes?: string;
  };

  const body = await request.json() as CreateBody;

  if (!body.item_type) return error('item_type required', 400);
  if (!body.title) return error('title required', 400);

  if (!VALID_TYPES.includes(body.item_type as typeof VALID_TYPES[number])) {
    return error(`Invalid item_type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  // withProjectWrite checks project_id presence (→ 400 if absent) + runs
  // resolveAndGuardProject (→ 403/400 if hidden/unknown). Inner handler only
  // runs when project is confirmed visible; receives the canonical projectId.
  return withProjectWrite<CreateBody>(async (_req, e, resolvedProjectId, b) => {
    const id = generateId();
    const status = b.status || 'active';

    await e.DB.prepare(
      'INSERT INTO regulatory_items (id, project_id, item_type, title, protocol_number, approved_date, expiration_date, renewal_due, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      resolvedProjectId,
      b.item_type!,
      b.title!,
      b.protocol_number || null,
      b.approved_date || null,
      b.expiration_date || null,
      b.renewal_due || null,
      status,
      b.notes || null,
    ).run();

    const actor = actorSlug(user.email);
    await logActivity(e, 'regulatory', `New regulatory item for ${b.project_id}: "${b.title}"`, actor, id, 'regulatory');

    const created = await e.DB.prepare('SELECT * FROM regulatory_items WHERE id = ?').bind(id).first();
    return json({ data: created }, 201);
  })(request, env, body);
}

// POST /api/regulatory/:id — update item
export async function handleUpdateRegulatoryItem(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  // Phase 1b-extended: gate on the existing row's project before mutation.
  // allowedFields below does NOT include project_id, so we don't need a target
  // gate here — the item can't be re-parented through this endpoint. If a
  // future spec adds project_id to allowedFields, also gate the new target.
  const existing = await env.DB.prepare('SELECT project_id FROM regulatory_items WHERE id = ?').bind(id).first<{ project_id: string | null }>();
  if (existing?.project_id) {
    const block = await assertProjectVisible(request, env, existing.project_id);
    if (block) return block;
  }

  const body = await request.json() as Record<string, unknown>;
  const allowedFields = ['title', 'item_type', 'protocol_number', 'approved_date', 'expiration_date', 'renewal_due', 'status', 'notes'];
  const { sql, params, hasUpdates } = buildUpdate(body, allowedFields);

  if (!hasUpdates) return error('No valid fields to update', 400);

  // Validate status if provided
  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  // Validate item_type if provided
  if (body.item_type && !VALID_TYPES.includes(body.item_type as typeof VALID_TYPES[number])) {
    return error(`Invalid item_type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  await env.DB.prepare(`UPDATE regulatory_items SET ${sql} WHERE id = ?`).bind(...params, id).run();

  const updated = await env.DB.prepare('SELECT * FROM regulatory_items WHERE id = ?').bind(id).first();
  if (!updated) return error('Regulatory item not found', 404);
  return json({ data: updated });
}

// GET /api/regulatory/:id/ics — generate .ics calendar invite for renewal.
// Auth-only (not PI-only): the whole team legitimately needs iCal access to
// regulatory deadlines to add renewal reminders to their calendars.
export async function handleRegulatoryIcs(id: string, env: Env, request: Request): Promise<Response> {
  // Z1.6 (2026-05-28): request is now required (was optional). Callers in
  // api/index.ts forward c.req.raw unconditionally via R(c). The fail-closed
  // branch collapses to the standard auth gate.
  const user = await getAuthUser(request, env);
  if (!user) return error('Authentication required', 401);
  const item = await env.DB.prepare('SELECT * FROM regulatory_items WHERE id = ?').bind(id).first() as Record<string, any> | null;
  if (!item) return error('Regulatory item not found', 404);

  // Phase 1b-extended: block non-PI callers from generating an ICS for a
  // regulatory item attached to a PB-category project.
  if (item.project_id) {
    const block = await assertProjectVisible(request, env, item.project_id as string);
    if (block) return block;
  }

  const renewalDate = (item.renewal_due || item.expiration_date) as string | null;
  if (!renewalDate) return error('No renewal date on this item', 400);

  const uid = `regulatory-${id}@mn-ccore-lab.pages.dev`;
  const dtstart = formatIcsDate(renewalDate);
  const now = nowInstant().replace(/[^0-9]/g, '').slice(0, 15) + 'Z';
  const summary = `Renew: ${item.title}`;
  const description = `${item.item_type} renewal for ${item.title}. Protocol: ${item.protocol_number || 'N/A'}. Notes: ${item.notes || 'N/A'}.`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MN-CCORE Lab Hub//Regulatory//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtstart}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-P60D',
    'ACTION:DISPLAY',
    `DESCRIPTION:Regulatory renewal approaching: ${escapeIcs(String(item.title))}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="regulatory-${id}.ics"`,
    },
  });
}

// POST /api/regulatory/:id/renew — archive old item, create new with updated dates
export async function handleRenewRegulatoryItem(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    approved_date?: string;
    expiration_date?: string;
    renewal_due?: string;
    notes?: string;
  };

  // Get the existing item
  const existing = await env.DB.prepare('SELECT * FROM regulatory_items WHERE id = ?').bind(id).first() as Record<string, any> | null;
  if (!existing) return error('Regulatory item not found', 404);

  // Phase 1b-extended: gate on the existing row's project. The renew creates a
  // new row that inherits existing.project_id, so the same gate covers both.
  if (existing.project_id) {
    const block = await assertProjectVisible(request, env, existing.project_id as string);
    if (block) return block;
  }

  // Archive the old item and create the new item atomically so a failed
  // INSERT never leaves the old item orphaned in 'expired' state.
  const newId = generateId();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE regulatory_items SET status = 'expired', notes = COALESCE(notes || ' | ', '') || 'Renewed on ' || datetime('now') WHERE id = ?"
    ).bind(id),
    env.DB.prepare(
      'INSERT INTO regulatory_items (id, project_id, item_type, title, protocol_number, approved_date, expiration_date, renewal_due, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      newId,
      existing.project_id,
      existing.item_type,
      existing.title,
      existing.protocol_number,
      body.approved_date || null,
      body.expiration_date || null,
      body.renewal_due || null,
      'active',
      body.notes || null,
    ),
  ]);

  const actor = actorSlug(user.email);
  await logActivity(env, 'regulatory', `Renewed regulatory item: "${existing.title}"`, actor, newId, 'regulatory');

  const created = await env.DB.prepare('SELECT * FROM regulatory_items WHERE id = ?').bind(newId).first();
  return json({ data: created }, 201);
}
