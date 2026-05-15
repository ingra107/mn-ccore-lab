import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';

interface AuthUser {
  email: string;
  name: string;
}

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

  // Sanitize filename
  const safe = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${body.context.type}/${body.context.id}/${Date.now()}-${safe}`;

  const r2 = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  const url = new URL(`https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`);
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

  const id = crypto.randomUUID().slice(0, 16);
  await env.DB.prepare(
    `INSERT INTO file_attachments (id, entity_type, entity_id, filename, content_type, size_bytes, r2_key, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.entityType, body.entityId,
    body.filename, body.contentType || null,
    body.sizeBytes || null, body.key,
    user.email.split('@')[0]
  ).run();

  return json({ id, key: body.key, filename: body.filename });
}

/** GET /api/files?entity_type=X&entity_id=Y — list attachments */
export async function handleListFiles(url: URL, env: Env): Promise<Response> {
  const entityType = url.searchParams.get('entity_type');
  const entityId = url.searchParams.get('entity_id');

  if (!entityType || !entityId) {
    return error('entity_type and entity_id required');
  }

  const rows = await env.DB.prepare(
    'SELECT * FROM file_attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC'
  ).bind(entityType, entityId).all();

  return json(rows.results || []);
}

/** GET /api/files/:key+ — generate presigned GET URL for downloading */
export async function handleGetFile(key: string, env: Env): Promise<Response> {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return error('R2 not configured', 503);
  }

  const r2 = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  const url = new URL(`https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`);
  url.searchParams.set('X-Amz-Expires', '3600');

  const signed = await r2.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  });

  return json({ downloadUrl: signed.url });
}

/** POST /api/files/:id/delete — delete file attachment */
export async function handleDeleteFile(id: string, env: Env): Promise<Response> {
  // Get the R2 key before deleting the record
  const row = await env.DB.prepare('SELECT r2_key FROM file_attachments WHERE id = ?').bind(id).first<{ r2_key: string }>();
  if (!row) return error('File not found', 404);

  // Delete from R2 if bucket is bound
  if (env.FILES) {
    try { await env.FILES.delete(row.r2_key); } catch { /* best effort */ }
  }

  // Delete from D1
  await env.DB.prepare('DELETE FROM file_attachments WHERE id = ?').bind(id).run();
  return json({ deleted: id });
}
