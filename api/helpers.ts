import type { Env } from './types';
import { verifyCfAccessJwt } from './jwt-verify';

export type { Env };

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

export function error(message: string, status = 500): Response {
  return json({ error: message }, status);
}

export interface AuthUser {
  email: string
  name?: string
}

export async function getAuthUser(request: Request, env: Env): Promise<AuthUser | null> {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;

  const payload = await verifyCfAccessJwt(jwt, env);
  if (!payload?.email) return null;
  return {
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
  };
}

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function logActivity(
  env: Env,
  type: string,
  description: string,
  actor: string,
  relatedId?: string,
  relatedType?: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO activity_log (id, type, description, actor, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(generateId(), type, description, actor, relatedId ?? null, relatedType ?? null).run();
}

export function parseMentions(text: string): string[] {
  const regex = /@([a-z][a-z0-9_-]*)/g;
  return [...new Set(Array.from(text.matchAll(regex), m => m[1]))];
}

/** Extract user slug from email (e.g., "nick@umn.edu" → "nick") */
export function actorSlug(email: string): string {
  return email.split('@')[0].toLowerCase()
}

/** Fallback PI emails used when lab_settings query fails (cold start, DB
 *  unreachable, or migration v44 not yet run). Keep this in sync with the
 *  v44 seed so behavior doesn't silently diverge. */
export const PI_EMAILS_FALLBACK = new Set<string>([
  'ningraha@umn.edu',
  'sandb029@umn.edu',           // Nick (alt)
  'nicholas.ingraham@gmail.com', // Nick personal
])

let piEmailsCache: { emails: Set<string>; fetchedAt: number } | null = null;
const PI_EMAILS_TTL_MS = 5 * 60 * 1000;

/** Read PI email allowlist from lab_settings (key='pi_emails', JSON array).
 *  Cached for 5 minutes in-module. Falls back to PI_EMAILS_FALLBACK if the
 *  row is missing or the query throws — no lockout risk when DB is cold. */
export async function getPiEmails(env: Env): Promise<Set<string>> {
  const now = Date.now();
  if (piEmailsCache && now - piEmailsCache.fetchedAt < PI_EMAILS_TTL_MS) {
    return piEmailsCache.emails;
  }
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM lab_settings WHERE key = 'pi_emails'"
    ).first<{ value: string }>();
    if (row?.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr) && arr.every(v => typeof v === 'string')) {
        const emails = new Set<string>(arr.map((e: string) => e.toLowerCase()));
        piEmailsCache = { emails, fetchedAt: now };
        return emails;
      }
    }
  } catch { /* fall through to fallback */ }
  piEmailsCache = { emails: PI_EMAILS_FALLBACK, fetchedAt: now };
  return PI_EMAILS_FALLBACK;
}

/** True iff the request is from a PI — either an authenticated CF Access
 *  JWT matching a known PI email, OR a valid API-key request (server-side
 *  automation / Hermes). Returns false for unauthenticated + non-PI users. */
export async function isPiRequest(request: Request, env: Env): Promise<boolean> {
  // API key callers are trusted (already validated by validateApiKey middleware).
  if (request.headers.get('X-API-Key')) return true
  const user = await getAuthUser(request, env)
  if (!user?.email) return false
  const piEmails = await getPiEmails(env)
  return piEmails.has(user.email.toLowerCase())
}

/** Build a dynamic UPDATE clause from allowed fields */
export function buildUpdate(body: Record<string, unknown>, allowedFields: string[]) {
  const updates: string[] = []
  const params: unknown[] = []
  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`)
      params.push(body[field])
    }
  }
  return { updates, params, sql: updates.join(', '), hasUpdates: updates.length > 0 }
}
