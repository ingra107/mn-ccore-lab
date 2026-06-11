import type { Env } from './types';
import { verifyCfAccessJwt } from './jwt-verify';
import { validateApiKey } from './middleware/api-key-auth';
import { safeRow } from './lib/task-cols';
// Re-export so Phase 1b callers can import TASK_SELECT_COLS from the same
// shared root without touching the internal lib path.
// T2.5: TABLE_PRIVATE_COLS + safeRow added — preferred over the tasks-only
// TASK_PRIVATE_COLS + safeTaskRow pair for new code.
export { TASK_SELECT_COLS, TABLE_PRIVATE_COLS, TASK_PRIVATE_COLS, safeRow } from './lib/task-cols';

export type { Env };

// HUB-4: allowed browser origins for CORS (portal + localhost dev).
// PB Python scripts are server-side (no Origin header → no CORS restriction).
// Cloudflare Access already gates browser access to @umn.edu accounts;
// this is a defence-in-depth origin allowlist for browser CORS.
const ALLOWED_ORIGINS = new Set([
  'https://mn-ccore-lab.pages.dev',
  // localhost variants for wrangler dev / Vite dev server
  'http://localhost:5173',
  'http://localhost:8787',
]);

/**
 * Return CORS headers for the given request Origin.
 * Allowed origins are reflected exactly (enables credentials if ever needed).
 *
 * HUB-4 re-judge (2026-06-11, cold): the original `*` fallback for unknown origins
 * is deliberate and correct in both contexts where CORS headers appear:
 *
 *   1. OPTIONS preflights (corsHeadersFor(origin)): reflecting the exact allowed
 *      origin for known origins is ideal; `*` for unknown origins is a no-op
 *      security-wise because browsers only inspect the preflight response if a
 *      request is being allowed — an unknown browser origin will NOT be able to
 *      complete authentication (no CF Access JWT, no API key), so the `*` on the
 *      preflight only helps if the unauthenticated path returns useful data (it
 *      doesn't for any sensitive route). Server-side callers send no Origin and
 *      don't enforce CORS; `*` is harmless for them.
 *
 *   2. json()/error() responses (corsHeaders static): same reasoning applies.
 *      Unknown browsers can read the response body IF the ACAO header allows it
 *      (`*` does), but every meaningful endpoint is behind auth — a browser
 *      origin not in ALLOWED_ORIGINS can read a 401 body, not real data.
 *      Removing `*` here would break the portal's own API calls from
 *      mn-ccore-lab.pages.dev for non-preflight requests (simple GETs bypass
 *      the preflight but still need ACAO on the response). Since the portal IS
 *      in ALLOWED_ORIGINS, the preflight is already strict; the `*` in response
 *      bodies is the right fallback for both portal simple-requests and
 *      server-side callers.
 *
 * Named concrete consumer of `*` that would break if removed:
 *   - mn-ccore-lab.pages.dev simple GET requests (no preflight) reading API
 *     responses — the browser reads the ACAO header on the response, not on the
 *     preflight, for simple requests.
 *
 * Final verdict: '*' fallback stays. HUB-4 shipped correct preflight reflection;
 * no further tightening is warranted without a full CORS-middleware refactor that
 * threads the request origin through json()/error() (tracked as technical debt,
 * low priority — no meaningful attack surface with auth gating every real route).
 */
export function corsHeadersFor(requestOrigin?: string | null): Record<string, string> {
  const allow = requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
    ? requestOrigin
    : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
  };
}

// Static fallback for call sites that don't have a request (json()/error()).
// Server-side callers (PB Python) send no Origin → '*' is correct.
// Portal simple requests also get '*' — see corsHeadersFor() doc above.
export const corsHeaders = corsHeadersFor();

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

/**
 * S5 (2026-06-09): canonicalize the actor at the single write chokepoint so
 * every `logActivity` call site lands a real team slug, never a raw email or
 * the unauthed `'anonymous'` sentinel rendered literally on the feed.
 *
 *   - email-looking actors (`mesfin@umn.edu`) → `actorSlug()` slug
 *     (`nate-mesfin`). Most call sites historically passed `user.email`.
 *   - the unauthed fallback identity (`'anonymous'`) → null, so the feed can
 *     render it as a neutral system row instead of a person named "anonymous".
 *   - already-slug actors (`nick-ingraham`, `claude-ai`) pass through.
 */
function canonicalizeActorForLog(actor: string | null | undefined): string | null {
  const raw = typeof actor === 'string' ? actor.trim() : '';
  if (!raw || raw === 'anonymous') return null;
  if (raw.includes('@')) return actorSlug(raw);
  return raw;
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
  ).bind(generateId(), type, description, canonicalizeActorForLog(actor), relatedId ?? null, relatedType ?? null).run();
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

/**
 * AM-2 (SEC-T0-6): unified actor-identity resolution.
 *
 * One policy for every "who did this" write site (asked_by, submitted_by,
 * created_by, author_slug, author, to_slug, pi, uploaded_by):
 *
 *   1. Default identity = actorSlug(user.email) — the authenticated caller.
 *   2. A caller-supplied `override` is accepted ONLY if it resolves to a real
 *      team_members.slug. Email-looking overrides are canonicalized through
 *      actorSlug first (so "mesfin@umn.edu" → "nate-mesfin" before the slug
 *      check). An unknown slug returns an error (caller 400s).
 *   3. Cross-identity impersonation (override ≠ caller's own slug) is allowed
 *      ONLY when `allowImpersonation` is true — i.e. the request is a PI or the
 *      API-key/service path. EXCEPTION: `claude-ai` (Hermes) is always allowed,
 *      because the AI listener posts answers/comments as claude-ai via the
 *      service key and that identity has no team_members row.
 *
 * Returns { slug } on success or { error } on a rejected override. Async
 * because it validates the override against team_members.
 */
export async function resolveActor(
  env: Env,
  user: AuthUser,
  override: string | null | undefined,
  opts: { allowImpersonation: boolean },
): Promise<{ slug: string } | { error: string }> {
  const callerSlug = actorSlug(user.email);
  const raw = typeof override === 'string' ? override.trim() : '';
  if (!raw) return { slug: callerSlug };

  // claude-ai (Hermes) is always allowed and bypasses the team_members check —
  // it's a synthetic agent identity, not a directory row.
  if (raw === 'claude-ai') return { slug: 'claude-ai' };

  // Canonicalize email-looking overrides to a slug before validating.
  const candidate = raw.includes('@') ? actorSlug(raw) : raw;

  // The override must be a real team member slug.
  const member = await env.DB.prepare(
    'SELECT 1 FROM team_members WHERE slug = ? LIMIT 1'
  ).bind(candidate).first();
  if (!member) {
    return { error: `Unknown actor "${override}". Must match team_members.slug.` };
  }

  // Impersonating someone else requires PI / service authority.
  if (candidate !== callerSlug && !opts.allowImpersonation) {
    return { error: `Not authorized to act as "${candidate}".` };
  }

  return { slug: candidate };
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

/**
 * AM-1 (SEC-T0-5): protected fields that must never be set to null/empty.
 *
 * These columns carry the API field-protection contract documented in
 * CLAUDE.md ("Tasks: status/priority/assignee — can never be null;
 * Projects: status/stage/category — can never be null"). Pre-fix, three
 * write paths silently SKIPPED a null/empty protected value
 * (`continue`/no guard), which on the client manifested as an optimistic
 * update that silently reverted. We now hard-reject so the caller sees a
 * 400 instead of a silent no-op.
 */
const PROTECTED_NON_NULL: Record<string, readonly string[]> = {
  tasks: ['status', 'priority', 'assignee'],
  projects: ['status', 'stage', 'category'],
};

/**
 * Returns an error message string if `obj` sets any protected field of
 * `table` to null / undefined / '' (present-and-empty). Returns null when
 * the object is clean. Non-throwing so each caller controls its own
 * response shape (route handlers return `error(...)`, mutations returns a
 * MutationResult error). A field that is simply ABSENT from `obj` is fine —
 * only a present-but-empty value is rejected.
 */
export function assertProtectedNotNull(
  table: string,
  obj: Record<string, unknown> | null | undefined,
): string | null {
  if (!obj) return null;
  const protectedFields = PROTECTED_NON_NULL[table];
  if (!protectedFields) return null;
  for (const f of protectedFields) {
    if (f in obj) {
      const v = obj[f];
      if (v === null || v === undefined || v === '') {
        return `Protected field "${f}" on ${table} cannot be null or empty`;
      }
    }
  }
  return null;
}

/**
 * Phase A1 — per-item validation flags for the /api/mutations write path.
 *
 * Each validator (enum / conflict_hash / completion_tombstone / dedup) is gated
 * by its own lab_settings row so a false-fire in one can be reverted without
 * disabling the others (Q4 tiebreak: per-item flags; enum is highest false-fire
 * risk). Mirrors getPiEmails: lab_settings lookup, 5-min in-module cache, and
 * fallback OFF on any DB-read failure — a config hiccup must NOT lock out writes
 * (Q3 tiebreak + risk register #6). Keys (lab_settings.key, value '1'|'0'):
 *   hub_validate_enums
 *   hub_validate_conflict_hash
 *   hub_validate_completion_tombstone
 *   hub_dedup_adoptable
 *
 * DEPLOY POSTURE (original rollout): seeded OFF in prod; validators dormant
 * (zero behavior change) until each flag is flipped ON via a single UPDATE
 * lab_settings, after the read-only Step-0 prod-D1 audit confirms zero
 * un-aliasable values.
 * STATUS 2026-05-29 (verified via direct D1 read of lab_settings): ALL FOUR
 * flags are now ON in prod (hub_validate_enums, hub_validate_conflict_hash,
 * hub_validate_completion_tombstone, hub_dedup_adoptable = '1'). The validators
 * are LIVE — do NOT assume dormant. (Read the lab_settings row, not this
 * default, to know real state: the default below is the fail-safe, not the value.)
 */
export interface ValidationFlags {
  enums: boolean;
  conflict_hash: boolean;
  completion_tombstone: boolean;
  dedup: boolean;
}

const VALIDATION_FLAGS_DEFAULT: ValidationFlags = {
  enums: false,
  conflict_hash: false,
  completion_tombstone: false,
  dedup: false,
};

const VALIDATION_FLAG_KEYS: Record<keyof ValidationFlags, string> = {
  enums: 'hub_validate_enums',
  conflict_hash: 'hub_validate_conflict_hash',
  completion_tombstone: 'hub_validate_completion_tombstone',
  dedup: 'hub_dedup_adoptable',
};

let validationFlagsCache: { flags: ValidationFlags; fetchedAt: number } | null = null;
const VALIDATION_FLAGS_TTL_MS = 5 * 60 * 1000;

/** Read the per-item validation flags from lab_settings. Cached 5 minutes.
 *  Falls back to ALL-OFF if any row is missing or the query throws — a config
 *  hiccup must never lock out writes (validators dormant on error). A row value
 *  of '1' (string) is ON; anything else (including a missing row) is OFF. */
export async function getValidationFlags(env: Env): Promise<ValidationFlags> {
  const now = Date.now();
  if (validationFlagsCache && now - validationFlagsCache.fetchedAt < VALIDATION_FLAGS_TTL_MS) {
    return validationFlagsCache.flags;
  }
  try {
    const keys = Object.values(VALIDATION_FLAG_KEYS);
    const placeholders = keys.map(() => '?').join(', ');
    const { results } = await env.DB.prepare(
      `SELECT key, value FROM lab_settings WHERE key IN (${placeholders})`,
    ).bind(...keys).all<{ key: string; value: string }>();
    const byKey = new Map<string, string>(
      (results ?? []).map((r: { key: string; value: string }) => [r.key, r.value] as [string, string]),
    );
    const flags: ValidationFlags = { ...VALIDATION_FLAGS_DEFAULT };
    (Object.keys(VALIDATION_FLAG_KEYS) as Array<keyof ValidationFlags>).forEach(item => {
      flags[item] = byKey.get(VALIDATION_FLAG_KEYS[item]) === '1';
    });
    validationFlagsCache = { flags, fetchedAt: now };
    return flags;
  } catch {
    // Fall through to ALL-OFF — never lock out writes on a config-read failure.
    validationFlagsCache = { flags: VALIDATION_FLAGS_DEFAULT, fetchedAt: now };
    return VALIDATION_FLAGS_DEFAULT;
  }
}

/** Test-only: clear the validation-flags cache so a test that seeds new
 *  lab_settings rows isn't served a stale TTL window. */
export function _resetValidationFlagsCache(): void {
  validationFlagsCache = null;
}

// ── Phase 1a: shared ACL / visibility primitives ──────────────────────────────
//
// These four helpers are the consolidation layer for the hub-hardening sweep.
// Callers (Phase 1b) replace duplicated in-route logic with one-liners.
// Do NOT yet apply in routes — that is Phase 1b.

/**
 * A1 · `actorSlugFromRequest` — resolve the canonical team slug for the
 * authenticated caller, or null when the request is unauthenticated.
 *
 * Replaces the buggy `?.slug` pattern: `AuthUser` has no `.slug` field.
 * Correct form: `getAuthUser` → `actorSlug(user.email)`.
 */
export async function actorSlugFromRequest(request: Request, env: Env): Promise<string | null> {
  const user = await getAuthUser(request, env);
  return user ? actorSlug(user.email) : null;
}

/**
 * P2 · `projectRefToCanonical` — resolve a project id-or-slug to the
 * canonical typed PK (`proj_*`), or null when the ref is unresolvable.
 *
 * POST-P2-REKEY: returns `proj.id` always — Hub stores canonical typed PKs
 * after the P2 D1 data migration rewrites all slug/hex project_id FKs.
 * The resolver still accepts slugs and hex ids as input (slug=? arm retained)
 * so inbound writes from older PB clients or Hub UI routes resolve cleanly
 * during + after the migration window.
 *
 * PRE-P2 (historic note): returned `proj.slug || proj.id`, which stored slugs
 * as FKs. That caused advanceProjectMovement to require `id=? OR slug=?` to
 * match both forms. Post-P2 the slug arm there is dropped; only `id=?` needed.
 *
 * Returns null (not an error) on unknown refs — callers decide whether to
 * store NULL or reject (task create tolerates NULL; ACL gate rejects).
 */
export async function projectRefToCanonical(env: Env, ref: string): Promise<string | null> {
  if (!ref) return null;
  const proj = await env.DB.prepare(
    'SELECT id FROM projects WHERE id = ? OR slug = ? LIMIT 1'
  ).bind(ref, ref).first<{ id: string }>();
  if (!proj) return null;
  return proj.id;
}

/**
 * A2a · `canSeePbProject` — boolean visibility check for a project ref.
 *
 * 'Peripheral Brain' category projects are Nick-only. Non-PI callers get
 * `false` for any PB project. Unknown project refs are treated as not-visible
 * (fail-closed) — the unknown ref could be a PB project and we can't prove
 * otherwise without reading the DB. API key callers go through `isPiRequest`
 * which grants them PI-level access (same as the existing projects.ts gate).
 *
 * @param request  The incoming request (used to determine caller identity).
 * @param env      Worker env (DB + secrets).
 * @param projectRef  Project id or slug.
 * @returns true if the caller is allowed to see this project.
 */
export async function canSeePbProject(request: Request, env: Env, projectRef: string): Promise<boolean> {
  // Resolve the project row to read its category.
  // Note: deleted_at filter intentionally omitted — the category field does
  // not change on soft-delete, so we can safely read it from deleted rows.
  // This prevents a race where a soft-deleted PB project returns proj=null
  // and the function fails-closed even for PI/API-key callers, causing a
  // spurious 403 before the route's own 404 logic can run.
  const proj = await env.DB.prepare(
    'SELECT id, slug, category FROM projects WHERE (id = ? OR slug = ?) LIMIT 1'
  ).bind(projectRef, projectRef).first<{ id: string; slug: string | null; category: string | null }>();

  // Truly unknown ref (not in DB at all) → PI/API-key pass through so the
  // route can return its own 404; non-PI fail-closed (could be a PB project).
  if (!proj) return isPiRequest(request, env);

  // Non-PB categories are visible to everyone.
  if (proj.category !== 'Peripheral Brain') return true;

  // PB projects require PI access.
  return isPiRequest(request, env);
}

/**
 * A2b · `assertProjectVisible` — guard that returns a 403 Response when the
 * caller may not see the project, or null when access is allowed.
 *
 * Usage pattern in a route handler:
 *   const block = await assertProjectVisible(request, env, projectId);
 *   if (block) return block;
 *
 * @returns A 403 Response when visibility is denied, null when permitted.
 */
export async function assertProjectVisible(request: Request, env: Env, projectRef: string): Promise<Response | null> {
  const visible = await canSeePbProject(request, env, projectRef);
  if (!visible) return error('Project not found', 403);
  return null;
}

/**
 * T2.4 (2026-05-28) · `canSeePbProjectRow` — overload for callers that already
 * have a pre-fetched {id, category} row in hand. Skips the DB lookup that
 * `canSeePbProject` would otherwise issue.
 *
 * Used together with `resolveAndGuardProject` to eliminate the double-
 * lookup that 6 ACL-gated write handlers had: previously they called
 * `projectRefToCanonical` (1 SELECT) followed by `assertProjectVisible`
 * (a 2nd SELECT in canSeePbProject). Now: one combined SELECT returns
 * id+slug+category, this function applies the gate, and we save a query
 * per gated write.
 *
 * Semantics match canSeePbProject exactly: PB-category → PI-or-API-key only;
 * other categories → everyone.
 */
export async function canSeePbProjectRow(
  request: Request,
  env: Env,
  row: { id: string; category: string | null },
): Promise<boolean> {
  if (row.category !== 'Peripheral Brain') return true;
  return isPiRequest(request, env);
}

/**
 * T2.4 (2026-05-28) · `resolveAndGuardProject` — combined resolver + visibility
 * gate. Single SELECT for id/slug/category; returns either a 403 block plus a
 * null projectId (caller `return block;`s) or null block + the canonical
 * projectId (typed `proj_*` PK) for downstream use.
 *
 * Replaces the 2-statement pattern at 6 write-side call sites:
 *
 *   const projectId = await projectRefToCanonical(env, ref);   // SELECT #1
 *   if (!projectId) return error('Project not found', 404);
 *   const block = await assertProjectVisible(request, env, projectId);  // SELECT #2
 *   if (block) return block;
 *
 *   → const { block, projectId } = await resolveAndGuardProject(request, env, ref);
 *     if (block) return block;
 *     // projectId is the canonical proj_ typed PK for downstream INSERT/UPDATE.
 *
 * Unknown refs (proj=null) fail-closed for non-PI (consistent with
 * canSeePbProject) and return a 404 (not 403) so callers don't need a
 * separate existence check.
 */
export async function resolveAndGuardProject(
  request: Request,
  env: Env,
  ref: string,
): Promise<{ block: Response; projectId: null } | { block: null; projectId: string }> {
  if (!ref) {
    return { block: error('project_id required', 400), projectId: null };
  }
  // Note: deleted_at filter intentionally omitted — same rationale as
  // canSeePbProject (Fix 1, 2026-04-23): category doesn't change on soft-delete,
  // and we want PI/API-key callers to reach the gate's PB check rather than
  // a spurious 403 on a soft-deleted row.
  const proj = await env.DB.prepare(
    'SELECT id, slug, category FROM projects WHERE (id = ? OR slug = ?) LIMIT 1'
  ).bind(ref, ref).first<{ id: string; slug: string | null; category: string | null }>();

  if (!proj) {
    // Unknown ref — preserve the pre-existing error shape from the 6 call
    // sites this helper is replacing (400 + "Unknown project \"<ref>\"").
    // Non-PI callers DON'T get the 403 fail-closed here because the bare
    // "ref doesn't resolve" signal is already public (write was attempted)
    // and a 400 keeps the API surface stable. PB visibility is enforced
    // when the project EXISTS via canSeePbProjectRow below.
    return { block: error(`Unknown project "${ref}"`, 400), projectId: null };
  }

  // Post-P2: always return proj.id (typed proj_ PK), never slug.
  // Pre-P2 this was `proj.slug || proj.id`, which stored slugs as FKs in child
  // tables. After the P2 re-key the DB holds typed PKs everywhere; returning
  // the slug here would re-pollute child rows inserted post-deploy.
  const visible = await canSeePbProjectRow(request, env, proj);
  if (!visible) return { block: error('Project not found', 403), projectId: null };
  return { block: null, projectId: proj.id };
}

/**
 * A4 · `safeTaskRow` — strip private columns from a full task row.
 *
 * `/api/mutations` reads tasks via `SELECT *` to check current state before
 * applying patches. The resulting row contains `notes` (private brain.db
 * field). Before returning any such row to callers, pass it through this
 * function to omit all TASK_PRIVATE_COLS.
 *
 * T2.5 (2026-05-28): backward-compat wrapper around the generic safeRow()
 * — the strip-list is driven by TABLE_PRIVATE_COLS['tasks'] (same Set as
 * TASK_PRIVATE_COLS). New code should call safeRow('tasks', row) directly;
 * this wrapper exists for the ~10 callsites that still use safeTaskRow.
 *
 * Returns a shallow copy — does not mutate the input.
 */
export function safeTaskRow(row: Record<string, unknown>): Record<string, unknown> {
  return safeRow('tasks', row);
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
