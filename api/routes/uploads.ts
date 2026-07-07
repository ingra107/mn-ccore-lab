import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';
import { actorSlug, isPiRequest } from '../helpers';
import { safeRow } from '../lib/task-cols';

interface AuthUser {
  email: string;
  name: string;
}

// R2's S3 API is path-style: https://{account}.r2.cloudflarestorage.com/{bucket}/{key}.
// Presigning without the bucket segment made R2 read the key's first segment
// ("task"/"project"/"meeting") as a nonexistent bucket -> 403 AccessDenied on every
// PUT since the feature shipped (88f54cbd). Must match wrangler.toml's FILES bucket.
const R2_BUCKET = 'mnccore-files';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function error(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/**
 * AM-6 / B11 (SEC-T0): can the caller see attachments on this entity?
 *
 * The only entity-class with restricted visibility today is a
 * 'Peripheral Brain'-category PROJECT — its files must not be enumerable /
 * downloadable / deletable by non-PI callers. `canSeePb` (PI/Nick/service) is
 * resolved by the route via isPiRequest. Tasks/meetings and non-PB projects
 * are visible to any authed caller. Returns true=allowed, false=blocked.
 *
 * entityType/entityId can be a project id OR slug (file_attachments stores
 * whatever the uploader passed); we match both.
 */
async function canAccessEntity(
  env: Env,
  entityType: string,
  entityId: string,
  canSeePb: boolean,
): Promise<boolean> {
  if (canSeePb) return true;
  if (entityType !== 'project') return true; // only PB-projects are gated
  const proj = await env.DB.prepare(
    'SELECT category FROM projects WHERE id = ? OR slug = ? LIMIT 1'
  ).bind(entityId, entityId).first<{ category: string | null }>();
  if (!proj) return true; // unknown/orphaned entity — not a PB leak
  return proj.category !== 'Peripheral Brain';
}

/** POST /api/upload/url — generate presigned PUT URL for direct browser→R2 upload */
export async function handleUploadUrl(request: Request, user: AuthUser, env: Env): Promise<Response> {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return error('R2 not configured', 503);
  }

  const body = await request.json() as {
    filename: string;
    contentType: string;
    context: { type: string; id: string };
  };

  if (!body.filename || !body.context?.type || !body.context?.id) {
    return error('filename and context required');
  }

  // B11: block uploading a file on a PB-category project for non-PI callers.
  // Mirror the same canAccessEntity gate used by list/download/delete.
  const canSeePb = await isPiRequest(request, env);
  if (!(await canAccessEntity(env, body.context.type, body.context.id, canSeePb))) {
    return error('Forbidden', 403);
  }

  // Sanitize filename
  const safe = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${body.context.type}/${body.context.id}/${Date.now()}-${safe}`;

  const r2 = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  const url = new URL(`https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
  url.searchParams.set('X-Amz-Expires', '3600');

  const signed = await r2.sign(
    new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': body.contentType || 'application/octet-stream' },
    }),
    { aws: { signQuery: true } }
  );

  return json({ uploadUrl: signed.url, key });
}

/** POST /api/upload/done — record file metadata in D1 after successful upload */
export async function handleUploadDone(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    key: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    entityType: string;
    entityId: string;
  };

  if (!body.key || !body.entityType || !body.entityId) {
    return error('key, entityType, entityId required');
  }

  // B11: block recording an attachment on a PB-category project for non-PI callers.
  // The presigned-URL step already gates this, but upload/done is a separate
  // POST that could be called independently with an already-known key.
  const canSeePb = await isPiRequest(request, env);
  if (!(await canAccessEntity(env, body.entityType, body.entityId, canSeePb))) {
    return error('Forbidden', 403);
  }

  // Verify file actually landed in R2 before writing the DB record.
  // Without this check a client could register arbitrary keys that were
  // never uploaded (e.g. failed PUT, wrong presigned URL) and the
  // file_attachments row would point at a missing object.
  if (env.FILES) {
    const head = await env.FILES.head(body.key);
    if (!head) {
      return error('File not found in storage', 400);
    }
  }

  // AM-2: uploaded_by is an actor identity. Pre-fix it stored a raw
  // email-prefix (user.email.split('@')[0]) that bypassed actorSlug. Resolve
  // to a canonical team slug (no caller override on this path).
  const uploadedBy = actorSlug(user.email);

  const id = crypto.randomUUID().slice(0, 16);
  await env.DB.prepare(
    `INSERT INTO file_attachments (id, entity_type, entity_id, filename, content_type, size_bytes, r2_key, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.entityType, body.entityId,
    body.filename, body.contentType || null,
    body.sizeBytes || null, body.key,
    uploadedBy
  ).run();

  // `url` is a same-origin, non-expiring pointer at the raw-bytes route below
  // (unlike the presigned R2 URL from /api/upload/url, which expires in 1h —
  // useless for a link embedded permanently in a comment/note body). Callers
  // (SmartCompose, OverviewQuickAdd) insert this directly instead of falling
  // back to the JSON-envelope GET /api/files/:key.
  const url = `/api/files/${body.key}/raw`;
  return json({ id, key: body.key, filename: body.filename, url });
}

/** GET /api/files?entity_type=X&entity_id=Y — list attachments */
export async function handleListFiles(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const entityType = url.searchParams.get('entity_type');
  const entityId = url.searchParams.get('entity_id');

  if (!entityType || !entityId) {
    return error('entity_type and entity_id required');
  }

  // B11: block listing files on a PB-category project for non-PI callers.
  if (!(await canAccessEntity(env, entityType, entityId, canSeePb))) {
    return error('Forbidden', 403);
  }

  const rows = await env.DB.prepare(
    'SELECT * FROM file_attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC'
  ).bind(entityType, entityId).all();

  const safe = (rows.results || []).map(r => safeRow('file_attachments', r as Record<string, unknown>));
  return json(safe);
}

/** GET /api/files/:key+ — presigned download URL (JSON envelope).
 *  GET /api/files/:key+/raw — the actual bytes, streamed same-origin. This
 *  is what an <img src> / direct browser navigation needs: the JSON form
 *  can't be dropped into an <img> tag, and the presigned URL it contains
 *  expires in 1h — dead weight for a link embedded permanently in a comment.
 *  (`raw` is parsed out of the `/raw` path suffix by the router — see
 *  api/index.ts; a literal defineRoute for `/raw` can't win against the
 *  `:rest{.+}` wildcard this route already registers, verified empirically.)
 */
export async function handleGetFile(key: string, env: Env, canSeePb = false, raw = false): Promise<Response> {
  // B11: resolve the attachment row (authoritative entity_type/entity_id —
  // the key prefix alone is client-supplied) and block signing a download URL
  // for files on a PB-category project for non-PI callers. If no row matches
  // the key we fall back to the key prefix so legacy keys still gate.
  const row = await env.DB.prepare(
    'SELECT entity_type, entity_id, filename, content_type FROM file_attachments WHERE r2_key = ? LIMIT 1'
  ).bind(key).first<{ entity_type: string; entity_id: string; filename: string | null; content_type: string | null }>();
  const entityType = row?.entity_type ?? key.split('/')[0] ?? '';
  const entityId = row?.entity_id ?? key.split('/')[1] ?? '';
  if (entityType && !(await canAccessEntity(env, entityType, entityId, canSeePb))) {
    return error('Forbidden', 403);
  }

  if (raw) {
    if (!env.FILES) return error('File storage not configured', 503);
    const obj = await env.FILES.get(key);
    if (!obj) return error('File not found in storage', 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Content-Type', obj.httpMetadata?.contentType || row?.content_type || 'application/octet-stream');
    headers.set('Access-Control-Allow-Origin', '*');
    // Immutable content-addressed-ish key (timestamp-prefixed, never overwritten
    // in place) — safe to cache aggressively client-side.
    headers.set('Cache-Control', 'private, max-age=86400');
    return new Response(obj.body, { headers });
  }

  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return error('R2 not configured', 503);
  }

  const r2 = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  const url = new URL(`https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
  url.searchParams.set('X-Amz-Expires', '3600');

  const signed = await r2.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  });

  return json({ downloadUrl: signed.url });
}

/** POST /api/files/:id/delete — delete file attachment */
// SEC-10.3: Idempotent — if the D1 record is already gone (row not found)
// we still attempt the R2 delete (best-effort) and return 200 with
// idempotent:true. The ownership gate (canAccessEntity) only fires when the
// record exists; for already-deleted files we can't re-check the project,
// so we return idempotent 200 directly.
//
// Z4.3 exempt: file_attachments has an R2 side-effect (env.FILES.delete(r2_key))
// that idempotentDelete() does not model. The R2 delete MUST run before the D1
// row is removed so the r2_key is still accessible; idempotentDelete()'s hard
// mode issues the DELETE first and has no hook for pre-mutation side-effects.
// Keep this handler hand-rolled with the R2 side-effect preserved exactly as
// written below. If a future version of idempotentDelete() gains a
// beforeDelete callback, revisit this site.
export async function handleDeleteFile(id: string, env: Env, canSeePb = false): Promise<Response> {
  // Get the R2 key + parent entity before deleting the record.
  const row = await env.DB.prepare('SELECT r2_key, entity_type, entity_id FROM file_attachments WHERE id = ?').bind(id).first<{ r2_key: string; entity_type: string; entity_id: string }>();

  if (!row) {
    // Already deleted — idempotent 200.
    return json({ deleted: id, idempotent: true });
  }

  // B11: block deleting a file on a PB-category project for non-PI callers.
  if (!(await canAccessEntity(env, row.entity_type, row.entity_id, canSeePb))) {
    return error('Forbidden', 403);
  }

  // Delete from R2 if bucket is bound
  if (env.FILES) {
    try { await env.FILES.delete(row.r2_key); } catch { /* best effort */ }
  }

  // Delete from D1
  await env.DB.prepare('DELETE FROM file_attachments WHERE id = ?').bind(id).run();
  return json({ deleted: id, idempotent: false });
}
