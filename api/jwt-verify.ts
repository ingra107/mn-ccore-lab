import type { Env } from './types';

/**
 * Cloudflare Access JWT signature verification.
 *
 * CF Access signs JWTs with RS256 keys published at
 * `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`. Without this
 * verification, any attacker can forge a `Cf-Access-Jwt-Assertion` header
 * claiming to be a PI email and access `/api/pb/*` private data.
 *
 * `CF_ACCESS_TEAM_DOMAIN` env var must be set for verification to happen.
 * Until set, falls back to decode-only (logged once per cold start). Do not
 * launch to the team without both `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`
 * secrets configured — see LAUNCH-CHECKLIST.md.
 */

interface Jwk {
  kid: string
  kty: string
  alg: string
  use?: string
  n: string
  e: string
}

interface JwksResponse {
  keys: Jwk[]
}

interface VerifiedClaims {
  email?: string
  name?: string
  aud?: string | string[]
  iss?: string
  exp?: number
  nbf?: number
}

let jwksCache: { keys: Jwk[]; fetchedAt: number; domain: string } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;
let fallbackWarningLogged = false;

async function fetchJwks(teamDomain: string): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.domain === teamDomain && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = await res.json() as JwksResponse;
  jwksCache = { keys: data.keys, fetchedAt: now, domain: teamDomain };
  return data.keys;
}

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  const normal = pad.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normal);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function importJwk(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Verify CF Access JWT signature + claims. Returns verified payload or null.
 * When `CF_ACCESS_TEAM_DOMAIN` is not set, skips verification and returns the
 * decoded payload (insecure fallback for pre-launch PI-only mode).
 */
export async function verifyCfAccessJwt(token: string, env: Env): Promise<VerifiedClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  if (!teamDomain) {
    if (!fallbackWarningLogged) {
      console.warn('[auth] CF_ACCESS_TEAM_DOMAIN not set — JWT signatures NOT verified. Configure before team launch.');
      fallbackWarningLogged = true;
    }
    try {
      return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as VerifiedClaims;
    } catch { return null; }
  }

  let header: { kid?: string; alg?: string };
  let payload: VerifiedClaims;
  try {
    header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
    payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }

  if (header.alg !== 'RS256') return null;
  if (!header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) return null;
  if (payload.nbf && now < payload.nbf) return null;

  const expectedIss = `https://${teamDomain}`;
  if (payload.iss && payload.iss !== expectedIss) return null;

  const expectedAud = env.CF_ACCESS_AUD?.trim();
  if (expectedAud) {
    const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!auds.includes(expectedAud)) return null;
  }

  let keys: Jwk[];
  try { keys = await fetchJwks(teamDomain); }
  catch { return null; }

  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) return null;

  let key: CryptoKey;
  try { key = await importJwk(jwk); }
  catch { return null; }

  const sig = base64UrlToBytes(sigB64);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    sig as BufferSource,
    data as BufferSource,
  );
  if (!ok) return null;

  return payload;
}
