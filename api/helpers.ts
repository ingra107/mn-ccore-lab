import type { Env } from './types';
import { verifyCfAccessJwt } from './jwt-verify';
import { validateApiKey } from './middleware/api-key-auth';

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
  picture?: string
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
    picture: payload.picture,
  };
}

/**
 * Auto-provision OR claim a team_members row on first login.
 *
 * The CF Access JWT carries an authoritative email (verified by Google +
 * gated by the @umn.edu Access policy). On first sight of an email,
 * three branches:
 *
 *   1. Direct email match — row already linked. No-op.
 *
 *   2. Slug match via EMAIL_PREFIX_TO_SLUG LUT — Nick had pre-provisioned
 *      this member (e.g. `nate-mesfin` exists, JWT email `mesfin@umn.edu`,
 *      LUT maps `mesfin → nate-mesfin`). This is a CLAIM. Backfill the
 *      real email + photo (only if not already set) so future lookups
 *      hit branch 1. Don't overwrite name (Nick's preferred name beats
 *      Google's display name).
 *
 *   3. Email-prefix slug match — direct lookup against `slug = email-prefix`.
 *      Same claim logic as branch 2. Catches members provisioned without
 *      a LUT entry.
 *
 *   4. No match — INSERT a new row with auto_created=1. Surfaces in the
 *      Team UI with a PENDING REVIEW badge until Nick assigns a role.
 *
 * Idempotent + safe under concurrency. Excludes the synthetic Hermes
 * agent and test-mode users.
 */
export async function ensureTeamMember(env: Env, user: AuthUser): Promise<void> {
  if (user.email === 'anonymous' || user.email.endsWith('@test.local')) return
  if (user.email === 'claude-ai@umn.edu') return

  // Branch 1: direct email match — already linked, nothing to do.
  const byEmail = await env.DB.prepare(
    'SELECT id FROM team_members WHERE email = ?'
  ).bind(user.email).first<{ id: string }>()
  if (byEmail) return

  // Branch 2/3: try to claim a pre-provisioned row. Two candidate slugs:
  //   - canonical slug from the LUT (e.g. mesfin → nate-mesfin)
  //   - raw email-prefix (covers members not in the LUT)
  const emailPrefix = user.email.split('@')[0].toLowerCase()
  const canonicalSlug = actorSlug(user.email)  // returns LUT-mapped slug or email-prefix
  const candidateSlugs = [...new Set([canonicalSlug, emailPrefix])]

  const existingBySlug = await env.DB.prepare(
    `SELECT id, photo_url FROM team_members
     WHERE slug IN (${candidateSlugs.map(() => '?').join(',')})
     LIMIT 1`
  ).bind(...candidateSlugs).first<{ id: string; photo_url: string | null }>()

  if (existingBySlug) {
    // CLAIM: backfill email so future logins hit branch 1. Backfill
    // photo_url only if the row doesn't already have one (Nick's curated
    // photo wins). Never overwrite name — preferred name is intentional.
    const setPhoto = !existingBySlug.photo_url && user.picture
    if (setPhoto) {
      await env.DB.prepare(
        'UPDATE team_members SET email = ?, photo_url = ? WHERE id = ?'
      ).bind(user.email, user.picture ?? null, existingBySlug.id).run()
    } else {
      await env.DB.prepare(
        'UPDATE team_members SET email = ? WHERE id = ?'
      ).bind(user.email, existingBySlug.id).run()
    }
    return
  }

  // Branch 4: no pre-provisioned row → create one.
  const id = generateId()
  const name = user.name?.trim() || emailPrefix
  try {
    await env.DB.prepare(
      `INSERT INTO team_members (id, name, slug, email, photo_url, auto_created)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).bind(id, name, emailPrefix, user.email, user.picture ?? null).run()
  } catch (e) {
    // UNIQUE constraint race (two concurrent first requests). Safe to ignore —
    // row exists now; the next call will land on branch 1 or 2.
    const msg = (e as Error).message
    if (!msg.includes('UNIQUE')) throw e
  }
}

// A1.2 (2026-04-29 plan rev 4 §A1): when `kind` is 'task' or 'project',
// emit a typed ULID (`task_<26-char-Crockford>` / `proj_<26-char-Crockford>`)
// matching brain.db's `mint_task_id` / `mint_project_id` shape. PB's
// IdentityBoundary fast-path adopts these directly with no alias indirection.
//
// Other kinds (activity, plan, comment, etc.) keep the legacy 32-char hex
// for backward compat — they're not in CORE_TABLES sync and don't benefit
// from the typed format yet.
//
// PB acceptance shipped first (Peripheral-Brain commit 7894ed5d) so this
// flip is safe per codex r9 ordering: pre-deploy Hub-minted typed ULIDs
// would have confused old PB code that classifies them as legacy hex.
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid(): string {
  // 10 chars of millisecond timestamp (48 bits in base32)
  let ts = Date.now();
  let timePart = '';
  for (let i = 0; i < 10; i++) {
    timePart = ULID_ALPHABET[ts & 0x1f] + timePart;
    ts = Math.floor(ts / 32);
  }
  // 16 chars of randomness (80 bits in base32). Read 10 random bytes as a
  // bigint, then base32-encode 5 bits at a time. Matches Python's
  // scripts/db/ids.py::_ulid output format byte-for-byte.
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (let i = 0; i < 10; i++) {
    n = (n << 8n) | BigInt(bytes[i]);
  }
  let randPart = '';
  for (let i = 0; i < 16; i++) {
    randPart = ULID_ALPHABET[Number(n & 0x1fn)] + randPart;
    n >>= 5n;
  }
  return timePart + randPart;
}

export function generateId(kind?: 'task' | 'project' | 'inbox_event' | 'mut'): string {
  if (kind === 'task') return `task_${ulid()}`;
  if (kind === 'project') return `proj_${ulid()}`;
  if (kind === 'inbox_event') return `evt_${ulid()}`;
  if (kind === 'mut') return `mut_${ulid()}`;
  // Default: legacy 32-char hex for activities/notifications/comments/etc.
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
  ningraha: 'nick-ingraham',   // legacy email alias (W1 2026-04-29)
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
 *  automation / Hermes). Returns false for unauthenticated + non-PI users.
 *
 *  CX-A3 fix (2026-04-28, Codex holistic-review finding): pre-fix, ANY
 *  X-API-Key header value was accepted as PI authority — `request.headers
 *  .get('X-API-Key')` returns truthy for `X-API-Key: junk`. The validateApiKey
 *  middleware at api/middleware/api-key-auth.ts only checks Bearer in the
 *  Authorization header, so an attacker sending `X-API-Key: anything` could
 *  hit PI-only routes (`/api/pb/*`, insights dashboard, etc.) without ever
 *  being validated. Now: validate the Bearer key explicitly. */
export async function isPiRequest(request: Request, env: Env): Promise<boolean> {
  // API key callers are trusted ONLY when validateApiKey returns true
  // (Bearer scheme + key matches env.PB_API_KEY). Header-presence is not
  // sufficient — same pattern M5 closed for sync-layer identity writes.
  if (validateApiKey(request, env) === true) return true
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
