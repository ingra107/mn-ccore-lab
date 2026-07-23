/**
 * artifact-tags.test.ts — Artifacts Reference Gallery route behavior (schema-v104).
 *
 * Design ref: docs/superpowers/specs/2026-07-23-artifacts-reference-gallery-design.md.
 *
 * Covers:
 *   - normalizeTag: lowercasing, trimming, whitespace→hyphen, [a-z0-9-] filter
 *   - gallery: returns tagged rows newest-first, each with tags:string[]
 *   - gallery: ?tag= narrows the WHERE to the one tag
 *   - artifact-tags: distinct tag + count rows
 *   - add tag: round-trip, normalization, 400 empty, 400 oversized, 404 missing
 *             artifact, 401 anonymous
 *   - remove tag: normalizes the :tag param, 401 anonymous, returns remaining set
 */

import { describe, it, expect } from 'vitest';
import type { Env, AuthUser } from '../helpers';
import {
  normalizeTag,
  handleGetArtifactGallery,
  handleGetArtifactTags,
  handleAddArtifactTag,
  handleRemoveArtifactTag,
} from './artifacts';

// ── DB stub ─────────────────────────────────────────────────────────────────
// Regex-routed like artifacts.test.ts's makeDb, tailored to the tag queries.

function makeDb(opts: {
  gallery?: Record<string, unknown>[];     // rows for the gallery SELECT (carry tags_csv)
  tagCounts?: Record<string, unknown>[];   // rows for GET /api/artifact-tags
  artifactExists?: boolean;                // SELECT id FROM artifacts WHERE id
  tagsAfter?: string[];                    // rows for the read-back SELECT tag FROM artifact_tags
  captureWrite?: (sql: string, binds: unknown[]) => void;
}) {
  return {
    prepare: (sql: string) => {
      let bound: unknown[] = [];
      const stmt: Record<string, unknown> = {
        bind: (...args: unknown[]) => { bound = [...bound, ...args]; return stmt; },
        run: async () => { opts.captureWrite?.(sql, [...bound]); return { success: true, meta: {}, results: [] }; },
        first: async () => {
          if (/FROM artifacts WHERE id/.test(sql)) {
            return opts.artifactExists === false ? null : { id: 'art_1' };
          }
          return null;
        },
        all: async () => {
          if (/FROM artifacts a WHERE/.test(sql)) return { results: opts.gallery ?? [] };
          if (/COUNT\(\*\) AS count FROM artifact_tags/.test(sql)) return { results: opts.tagCounts ?? [] };
          if (/SELECT tag FROM artifact_tags WHERE artifact_id/.test(sql)) {
            return { results: (opts.tagsAfter ?? []).map((tag) => ({ tag })) };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  };
}

const USER: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick' };
const ANON: AuthUser = { email: 'anonymous', name: 'Team Member' };

function postReq(body: unknown): Request {
  return new Request('https://mn-ccore-lab.pages.dev/api/artifacts/art_1/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const delReq = () => new Request('https://mn-ccore-lab.pages.dev/api/artifacts/art_1/tags/x', { method: 'DELETE' });

describe('normalizeTag', () => {
  it('lowercases + trims', () => {
    expect(normalizeTag('  Grant-Writing  ')).toBe('grant-writing');
  });
  it('collapses internal whitespace to a single hyphen', () => {
    expect(normalizeTag('Specific   Aims')).toBe('specific-aims');
  });
  it('drops disallowed characters and collapses hyphen runs', () => {
    expect(normalizeTag('R01!!  //Funnel__')).toBe('r01-funnel');
  });
  it('empties a tag that has no [a-z0-9-] content', () => {
    expect(normalizeTag('!!!')).toBe('');
  });
});

describe('GET /api/artifacts/gallery', () => {
  it('returns tagged rows with a tags array + count, newest-first', async () => {
    const env = { DB: makeDb({
      gallery: [
        { id: 'art_a', title: 'Aims Funnel', updated_at: '2026-07-23 10:00:00', tags_csv: 'specific-aims,grant-writing' },
        { id: 'art_b', title: 'Methods', updated_at: '2026-07-20 09:00:00', tags_csv: 'methods' },
      ],
    }) } as unknown as Env;
    const res = await handleGetArtifactGallery(new URL('https://x/api/artifacts/gallery'), env);
    expect(res.status).toBe(200);
    const payload = await res.json() as { data: Array<{ id: string; tags: string[] }>; count: number };
    expect(payload.count).toBe(2);
    // tags split from the csv and sorted; tags_csv itself is not leaked.
    expect(payload.data[0].tags).toEqual(['grant-writing', 'specific-aims']);
    expect((payload.data[0] as Record<string, unknown>).tags_csv).toBeUndefined();
  });

  it('a row with no tags_csv yields an empty tags array', async () => {
    const env = { DB: makeDb({ gallery: [{ id: 'art_c', title: 'X', tags_csv: null }] }) } as unknown as Env;
    const res = await handleGetArtifactGallery(new URL('https://x/api/artifacts/gallery'), env);
    const payload = await res.json() as { data: Array<{ tags: string[] }> };
    expect(payload.data[0].tags).toEqual([]);
  });

  it('?tag= narrows the query to the one (normalized) tag', async () => {
    let capturedSql = '';
    let capturedBinds: unknown[] = [];
    const db = makeDb({ gallery: [] });
    const orig = db.prepare;
    db.prepare = (sql: string) => {
      const stmt = orig(sql);
      const bindFn = stmt.bind as (...a: unknown[]) => typeof stmt;
      stmt.bind = (...args: unknown[]) => { capturedSql = sql; capturedBinds = args; return bindFn(...args); };
      return stmt;
    };
    const env = { DB: db } as unknown as Env;
    await handleGetArtifactGallery(new URL('https://x/api/artifacts/gallery?tag=Grant%20Writing'), env);
    expect(capturedSql).toMatch(/WHERE tag = \?/);
    expect(capturedBinds).toEqual(['grant-writing']);
  });
});

describe('GET /api/artifact-tags', () => {
  it('returns distinct tags + counts', async () => {
    const env = { DB: makeDb({ tagCounts: [{ tag: 'grant-writing', count: 3 }, { tag: 'methods', count: 1 }] }) } as unknown as Env;
    const res = await handleGetArtifactTags(env);
    const payload = await res.json() as { data: Array<{ tag: string; count: number }>; count: number };
    expect(payload.count).toBe(2);
    expect(payload.data[0]).toEqual({ tag: 'grant-writing', count: 3 });
  });
});

describe('POST /api/artifacts/:id/tags', () => {
  it('401 when caller is anonymous (unauthed)', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    const res = await handleAddArtifactTag('art_1', postReq({ tag: 'x' }), ANON, env);
    expect(res.status).toBe(401);
  });

  it('400 when tag missing/empty', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    expect((await handleAddArtifactTag('art_1', postReq({}), USER, env)).status).toBe(400);
    expect((await handleAddArtifactTag('art_1', postReq({ tag: '   ' }), USER, env)).status).toBe(400);
  });

  it('400 when the tag normalizes to empty', async () => {
    const env = { DB: makeDb({ artifactExists: true }) } as unknown as Env;
    const res = await handleAddArtifactTag('art_1', postReq({ tag: '!!!' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('400 when the normalized tag exceeds the length cap', async () => {
    const env = { DB: makeDb({ artifactExists: true }) } as unknown as Env;
    const res = await handleAddArtifactTag('art_1', postReq({ tag: 'a'.repeat(65) }), USER, env);
    expect(res.status).toBe(400);
  });

  it('404 when the artifact does not exist', async () => {
    const env = { DB: makeDb({ artifactExists: false }) } as unknown as Env;
    const res = await handleAddArtifactTag('art_missing', postReq({ tag: 'grant-writing' }), USER, env);
    expect(res.status).toBe(404);
  });

  it('normalizes + inserts, returns 201 with the artifact tag set', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const env = { DB: makeDb({
      artifactExists: true,
      tagsAfter: ['grant-writing', 'specific-aims'],
      captureWrite: (sql, binds) => writes.push({ sql, binds }),
    }) } as unknown as Env;
    const res = await handleAddArtifactTag('art_1', postReq({ tag: '  Specific Aims ' }), USER, env);
    expect(res.status).toBe(201);
    const insert = writes.find((w) => /INSERT OR IGNORE INTO artifact_tags/.test(w.sql));
    expect(insert).toBeDefined();
    expect(insert!.binds).toEqual(['art_1', 'specific-aims']); // normalized
    const payload = await res.json() as { data: { tag: string; tags: string[] } };
    expect(payload.data.tag).toBe('specific-aims');
    expect(payload.data.tags).toEqual(['grant-writing', 'specific-aims']);
  });
});

describe('DELETE /api/artifacts/:id/tags/:tag', () => {
  it('401 when caller is anonymous', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    const res = await handleRemoveArtifactTag('art_1', 'grant-writing', delReq(), ANON, env);
    expect(res.status).toBe(401);
  });

  it('normalizes the :tag param before the delete, returns remaining set', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const env = { DB: makeDb({
      tagsAfter: ['methods'],
      captureWrite: (sql, binds) => writes.push({ sql, binds }),
    }) } as unknown as Env;
    const res = await handleRemoveArtifactTag('art_1', 'Grant Writing', delReq(), USER, env);
    expect(res.status).toBe(200);
    const del = writes.find((w) => /DELETE FROM artifact_tags/.test(w.sql));
    expect(del).toBeDefined();
    expect(del!.binds).toEqual(['art_1', 'grant-writing']); // normalized param
    const payload = await res.json() as { data: { removed: string; tags: string[] } };
    expect(payload.data.removed).toBe('grant-writing');
    expect(payload.data.tags).toEqual(['methods']);
  });
});
