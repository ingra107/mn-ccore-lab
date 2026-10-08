/**
 * brief7-cors.test.ts
 *
 * Brief-7: PB API-key actor identity (actor_slug should be 'nick-ingraham',
 *          not 'anonymous').
 * Brief-8 / HUB-4 re-judge: corsHeadersFor behavior for known and unknown origins.
 *
 * These tests cover the helpers layer directly — index.ts middleware wiring is
 * covered implicitly (resolveSlug(env, 'ingra107@umn.edu') === 'nick-ingraham' is the
 * key invariant that makes the middleware fix correct).
 */

import { describe, it, expect } from 'vitest';
import { resolveSlug, corsHeadersFor } from '../helpers';
import type { Env } from '../helpers';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

// ── Brief-7: PB API-key actor identity ─────────────────────────────────────────
//
// The middleware sets user.email = 'ingra107@umn.edu' when a valid API key is
// present and no CF Access JWT is resolved; its slug is read from team_members.

describe('Brief-7 — PB API-key actor identity', () => {
  // #8945: the slug comes from team_members.email (resolveSlug), not a map.
  const db = prodSchemaDb();
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' });
  const env = { DB: d1Adapter(db) } as unknown as Env;

  it('the PB service email resolves to "nick-ingraham" (the PB service identity)', async () => {
    // The middleware sets email = 'ingra107@umn.edu' for API-key callers, so
    // this is the slug every PB-originated activity entry carries.
    expect(await resolveSlug(env, 'ingra107@umn.edu')).toBe('nick-ingraham');
  });

  it('"anonymous" passes through as "anonymous" (the unauthed sentinel)', async () => {
    expect(await resolveSlug(env, 'anonymous')).toBe('anonymous');
  });
});

// ── Brief-8 / HUB-4: corsHeadersFor behavior ────────────────────────────────────
//
// HUB-4 re-judge (cold, 2026-06-11): '*' fallback for unknown origins is deliberate.
// See corsHeadersFor() docblock in helpers.ts for the full rationale. These tests
// pin the INTENDED behavior so a future "tighten CORS" attempt is explicit.

describe('HUB-4 / Brief-8 — corsHeadersFor behavior', () => {
  // ── Known origins: reflected exactly ──────────────────────────────────────────

  it('reflects the portal origin exactly', () => {
    const h = corsHeadersFor('https://mn-ccore-lab.pages.dev');
    expect(h['Access-Control-Allow-Origin']).toBe('https://mn-ccore-lab.pages.dev');
  });

  it('reflects localhost:5173 exactly', () => {
    const h = corsHeadersFor('http://localhost:5173');
    expect(h['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });

  it('reflects localhost:8787 exactly', () => {
    const h = corsHeadersFor('http://localhost:8787');
    expect(h['Access-Control-Allow-Origin']).toBe('http://localhost:8787');
  });

  // ── Unknown origins: '*' (deliberate — named consumer: portal simple GETs) ───

  it('returns "*" for an unknown browser origin (deliberate — named consumer exists)', () => {
    // Named consumer: portal simple GET requests (no preflight) reading API
    // responses still need an ACAO header. Changing this to '' or undefined
    // would break portal simple-request reads. See helpers.ts corsHeadersFor doc.
    const h = corsHeadersFor('https://evil.example.com');
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns "*" when no origin is provided (server-side callers)', () => {
    // PB Python (httpx) sends no Origin header → corsHeaders static.
    const h = corsHeadersFor(undefined);
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns "*" when origin is null (explicit null = no origin)', () => {
    const h = corsHeadersFor(null);
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });

  // ── Methods + Headers fields are present for all origins ────────────────────

  it('always includes Allow-Methods and Allow-Headers', () => {
    const h = corsHeadersFor('https://mn-ccore-lab.pages.dev');
    expect(h['Access-Control-Allow-Methods']).toContain('GET');
    expect(h['Access-Control-Allow-Methods']).toContain('POST');
    expect(h['Access-Control-Allow-Headers']).toContain('Content-Type');
    expect(h['Access-Control-Allow-Headers']).toContain('Authorization');
  });

  it('unknown origin also includes Allow-Methods and Allow-Headers', () => {
    const h = corsHeadersFor('https://other.com');
    expect(h['Access-Control-Allow-Methods']).toContain('GET');
    expect(h['Access-Control-Allow-Headers']).toContain('Content-Type');
  });

  // ── Regression: case sensitivity — origin must match exactly ────────────────

  it('does NOT match the portal with wrong scheme (http vs https)', () => {
    // 'http://mn-ccore-lab.pages.dev' is not in ALLOWED_ORIGINS → '*'
    const h = corsHeadersFor('http://mn-ccore-lab.pages.dev');
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });

  it('does NOT match with trailing slash', () => {
    const h = corsHeadersFor('https://mn-ccore-lab.pages.dev/');
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });
});
