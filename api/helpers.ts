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
  // Test-mode auth bypass — uses the same TEST_MODE_KEY secret that gates
  // the DB_TEST swap, but is INDEPENDENT of the swap so the audit can hit
  // prod DB with a test user identity. Activates when:
  //   X-Test-Mode-Key: <env.TEST_MODE_KEY>  (Cloudflare secret match)
  //   X-Test-User:     <email>              (email-shaped only)
  // Note: deliberately does NOT require `X-Test-Mode: true` — that header
  // controls the DB_TEST swap (api/index.ts middleware step 1) and the
  // audit needs to test prod-DB write paths with auth, not test-DB write
  // paths. Send `X-Test-Mode: true` only when DB isolation is also wanted.
  //
  // Why: CF Access service-token JWTs (used by hub-audit + CI) are valid
  // CF Access tokens but lack an `email` claim, so JWKS-based auth below
  // returns null and every audit mutation 401s. This bypass lets the
  // audit run as an explicit test user without exposing prod auth.
  //
  // Trust boundary: TEST_MODE_KEY is a Cloudflare secret. CF Access still
  // gates the request reaching the worker. Knowing the secret already
  // grants test-DB writes; auth bypass doesn't widen blast radius.
  const testModeKey = (env as unknown as { TEST_MODE_KEY?: string }).TEST_MODE_KEY;
  if (testModeKey && request.headers.get('X-Test-Mode-Key') === testModeKey) {
    const testEmail = request.headers.get('X-Test-User');
    if (testEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      return { email: testEmail, name: testEmail.split('@')[0] };
    }
  }

  // Prefer the header (set by CF Access when it proxies a request — only on
  // CF-Access-gated destinations). Fall back to the CF_Authorization cookie
  // so endpoints OUTSIDE the CF Access scope (e.g. /api/* after Phase 37
  // scoped CF Access to /portal/*) can still authenticate browser users.
  let jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
      if (match) jwt = decodeURIComponent(match[1]);
    }
  }
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

/** Map email local-part → canonical team slug. Used because team emails
 *  (`nick@umn.edu`, `bromley@umn.edu`) don't match the post-Phase-36b
 *  `preferred-last` slug format. Also handles Nick's real UMN address
 *  aliases (`ningraha@`, `sandb029@`). Keep in sync with
 *  `team_members.slug` — adding a new member means adding a row here.
 *  Unknown prefix falls through to the email-prefix literal. */
const EMAIL_PREFIX_TO_SLUG: Record<string, string> = {
  nick: 'nick-ingraham',       // old slug, kept so legacy records resolve
  ingra107: 'nick-ingraham',   // real UMN NetID
  nate: 'nate-mesfin',
  dudley: 'adams-dudley',
  chipman: 'jeff-chipman',
  mceachron: 'kendall-mceachron',
  safadi: 'sami-safadi',
  begnaud: 'abbie-begnaud',
  henkle: 'benjamin-henkle',
  macdonald: 'dave-macdonald',
  trujeque: 'josh-trujeque',
  pendleton: 'katie-pendleton',
  kalinoski: 'michael-kalinoski',
  wacker: 'dave-wacker',
  arriaza: 'steven-arriaza',
  bromley: 'emma-bromley',
  eddington: 'casey-eddington',
  shyu: 'dan-shyu',
  fitzgerald: 'beret-fitzgerald',
  collins: 'claire-collins',
}

/** Extract canonical team slug from email (e.g., "nick@umn.edu" →
 *  "nick-ingraham", "ningraha@umn.edu" → "nick-ingraham"). Returns the
 *  literal email prefix for unknown emails. */
export function actorSlug(email: string): string {
  const prefix = email.split('@')[0].toLowerCase()
  return EMAIL_PREFIX_TO_SLUG[prefix] ?? prefix
}

/** Fallback PI emails used when lab_settings query fails (cold start, DB
 *  unreachable, or migration v44 not yet run). Keep this in sync with the
 *  v44 seed so behavior doesn't silently diverge. Ground truth:
 *  `/c/Users/ingra107/Peripheral-Brain/Context/contacts.md`. */
const PI_EMAILS_FALLBACK = new Set<string>([
  'ingra107@umn.edu',            // Nick — real UMN address
  'nicholas.ingraham@gmail.com', // Nick — personal
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
