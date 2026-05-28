import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, buildUpdate, getAuthUser } from '../helpers';
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
const VALID_STATUSES = ['active', 'expired', 'pending', 'exempt'] as const;

// GET /api/regulatory?project_id=
export async function handleGetRegulatoryItems(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');

  let query = 'SELECT * FROM regulatory_items WHERE 1=1';
  const params: string[] = [];

  if (projectId) {
    query += ' AND project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY CASE status WHEN \'expired\' THEN 0 WHEN \'active\' THEN 1 WHEN \'pending\' THEN 2 WHEN \'exempt\' THEN 3 END, expiration_date ASC, created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// GET /api/regulatory/expiring?days=30
export async function handleGetExpiringItems(url: URL, env: Env): Promise<Response> {
  const days = parseInt(url.searchParams.get('days') || '30', 10);
  const now = new Date();
  // AM-7: CT-anchored cutoff (was UTC `cutoff.toISOString()`, which after ~6pm
  // CT advanced the expiration window a day). `now` (Date) is still used for
  // the days_remaining ms-diff math below, which is timezone-agnostic.
  // (`nowIso` was dead — never referenced in the query — so it's removed.)
  const cutoffIso = ctToday(days);

  // Get items expiring within N days (including already expired), joined with project title
  const result = await env.DB.prepare(`
    SELECT r.*, p.title as project_title, p.slug as project_slug
    FROM regulatory_items r
    LEFT JOIN projects p ON r.project_id = p.slug OR r.project_id = p.id
    WHERE r.status IN ('active','action_needed','expiring_soon','pending')
      AND r.expiration_date IS NOT NULL
      AND r.expiration_date <= ?
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
export async function handleCreateRegulatoryItem(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    project_id: string;
    item_type: string;
    title: string;
    protocol_number?: string;
    approved_date?: string;
    expiration_date?: string;
    renewal_due?: string;
    status?: string;
    notes?: string;
  };

  if (!body.project_id) return error('project_id required', 400);
  if (!body.item_type) return error('item_type required', 400);
  if (!body.title) return error('title required', 400);

  if (!VALID_TYPES.includes(body.item_type as typeof VALID_TYPES[number])) {
    return error(`Invalid item_type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  const id = generateId();
  const status = body.status || 'active';

  await env.DB.prepare(
    'INSERT INTO regulatory_items (id, project_id, item_type, title, protocol_number, approved_date, expiration_date, renewal_due, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.project_id,
    body.item_type,
    body.title,
    body.protocol_number || null,
    body.approved_date || null,
    body.expiration_date || null,
    body.renewal_due || null,
    status,
    body.notes || null,
  ).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'regulatory', `New regulatory item for ${body.project_id}: "${body.title}"`, actor, id, 'regulatory');

  const created = await env.DB.prepare('SELECT * FROM regulatory_items WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/regulatory/:id — update item
export async function handleUpdateRegulatoryItem(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
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
export async function handleRegulatoryIcs(id: string, env: Env, request?: Request): Promise<Response> {
  if (request) {
    const user = await getAuthUser(request, env);
    if (!user) return error('Authentication required', 401);
  }
  const item = await env.DB.prepare('SELECT * FROM regulatory_items WHERE id = ?').bind(id).first() as Record<string, any> | null;
  if (!item) return error('Regulatory item not found', 404);

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
