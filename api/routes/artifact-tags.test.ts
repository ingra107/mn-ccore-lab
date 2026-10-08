/**
 * artifact-tags.test.ts — Artifacts Reference Gallery route behavior (schema-v104).
 *
 * Design ref: docs/superpowers/specs/2026-07-23-artifacts-reference-gallery-design.md.
 *
 * Covers:
 *   - normalizeTag: lowercasing, trimming, whitespace→hyphen, [a-z0-9-] filter
 *   - gallery: returns tagged rows newest-first, each with tags:string[]
 *   - gallery: ?tag= narrows to the one tag
 *   - artifact-tags: distinct tag + count rows
 *   - add tag: round-trip, normalization, 400 empty, 400 oversized, 404 missing
 *             artifact, 401 anonymous
 *   - remove tag: normalizes the :tag param, 401 anonymous, returns remaining set
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The first cut answered the gallery from canned rows carrying a hand-written
 * `tags_csv`, so the GROUP_CONCAT and the ?tag= WHERE were never run, and it
 * asserted the INSERT's binds rather than the stored tag. Here the gallery and
 * counts come from real artifact_tags rows, and add/remove are read back.
 * Rows the chain seeds are filtered out by id, never counted.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env, AuthUser } from '../helpers';
import {
  normalizeTag,
  handleGetArtifactGallery,
  handleGetArtifactTags,
  handleAddArtifactTag,
  handleRemoveArtifactTag,
} from './artifacts';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

const USER: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' };
const ANON: AuthUser = { email: 'anonymous', name: 'Team Member', slug: 'anonymous' };

let db: InstanceType<typeof Database>;
let env: Env;
beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db) } as unknown as Env;
});

function artifact(id: string, title: string, updatedAt: string) {
  insertRow(db, 'artifacts', { id, title, body_md: 'B', created_by: 'nick-ingraham', updated_at: updatedAt });
}
function tag(artifactId: string, t: string) {
  insertRow(db, 'artifact_tags', { artifact_id: artifactId, tag: t });
}
const tagsOf = (id: string) =>
  (db.prepare('SELECT tag FROM artifact_tags WHERE artifact_id = ? ORDER BY tag').all(id) as { tag: string }[]).map((r) => r.tag);
const OURS = new Set(['art_a', 'art_b', 'art_c', 'art_1']);

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
  beforeEach(() => {
    artifact('art_a', 'Aims Funnel', '2026-07-23 10:00:00');
    artifact('art_b', 'Methods', '2026-07-20 09:00:00');
    artifact('art_c', 'Untagged', '2026-07-24 09:00:00');
    tag('art_a', 'specific-aims');
    tag('art_a', 'grant-writing');
    tag('art_b', 'methods');
  });

  it('returns tagged rows with a tags array, newest-first; an untagged artifact is not in the gallery', async () => {
    const res = await handleGetArtifactGallery(new URL('https://x/api/artifacts/gallery'), env);
    expect(res.status).toBe(200);
    const payload = await res.json() as { data: Array<{ id: string; tags: string[] }>; count: number };
    const ours = payload.data.filter((r) => OURS.has(r.id));
    expect(ours.map((r) => r.id)).toEqual(['art_a', 'art_b']);
    // tags split and sorted; tags_csv itself is not leaked.
    expect(ours[0].tags).toEqual(['grant-writing', 'specific-aims']);
    expect((ours[0] as Record<string, unknown>).tags_csv).toBeUndefined();
  });

  it('?tag= narrows to the one (normalized) tag', async () => {
    const res = await handleGetArtifactGallery(new URL('https://x/api/artifacts/gallery?tag=Grant%20Writing'), env);
    const payload = await res.json() as { data: Array<{ id: string; tags: string[] }> };
    expect(payload.data.map((r) => r.id)).toEqual(['art_a']);
  });
});

describe('GET /api/artifact-tags', () => {
  it('returns distinct tags + counts', async () => {
    artifact('art_a', 'A', '2026-07-23 10:00:00');
    artifact('art_b', 'B', '2026-07-20 09:00:00');
    tag('art_a', 'zz-grant-writing');
    tag('art_b', 'zz-grant-writing');
    tag('art_b', 'zz-methods');
    const res = await handleGetArtifactTags(env);
    const payload = await res.json() as { data: Array<{ tag: string; count: number }>; count: number };
    const ours = payload.data.filter((r) => r.tag.startsWith('zz-'));
    expect(ours).toEqual(expect.arrayContaining([{ tag: 'zz-grant-writing', count: 2 }, { tag: 'zz-methods', count: 1 }]));
    expect(ours).toHaveLength(2);
  });
});

describe('POST /api/artifacts/:id/tags', () => {
  beforeEach(() => artifact('art_1', 'One', '2026-07-23 10:00:00'));

  it('401 when caller is anonymous (unauthed), and writes nothing', async () => {
    const res = await handleAddArtifactTag('art_1', postReq({ tag: 'x' }), ANON, env);
    expect(res.status).toBe(401);
    expect(tagsOf('art_1')).toEqual([]);
  });

  it('400 when tag missing/empty', async () => {
    expect((await handleAddArtifactTag('art_1', postReq({}), USER, env)).status).toBe(400);
    expect((await handleAddArtifactTag('art_1', postReq({ tag: '   ' }), USER, env)).status).toBe(400);
    expect(tagsOf('art_1')).toEqual([]);
  });

  it('400 when the tag normalizes to empty', async () => {
    const res = await handleAddArtifactTag('art_1', postReq({ tag: '!!!' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('400 when the normalized tag exceeds the length cap', async () => {
    const res = await handleAddArtifactTag('art_1', postReq({ tag: 'a'.repeat(65) }), USER, env);
    expect(res.status).toBe(400);
    expect(tagsOf('art_1')).toEqual([]);
  });

  it('404 when the artifact does not exist', async () => {
    const res = await handleAddArtifactTag('art_missing', postReq({ tag: 'grant-writing' }), USER, env);
    expect(res.status).toBe(404);
    expect(tagsOf('art_missing')).toEqual([]);
  });

  it('normalizes + inserts, returns 201 with the artifact tag set; a repeat is idempotent', async () => {
    tag('art_1', 'grant-writing');
    const res = await handleAddArtifactTag('art_1', postReq({ tag: '  Specific Aims ' }), USER, env);
    expect(res.status).toBe(201);
    const payload = await res.json() as { data: { tag: string; tags: string[] } };
    expect(payload.data.tag).toBe('specific-aims');
    expect(payload.data.tags).toEqual(['grant-writing', 'specific-aims']);
    expect(tagsOf('art_1')).toEqual(['grant-writing', 'specific-aims']);

    const again = await handleAddArtifactTag('art_1', postReq({ tag: 'specific aims' }), USER, env);
    expect(again.status).toBe(201);
    expect(tagsOf('art_1')).toEqual(['grant-writing', 'specific-aims']);
  });
});

describe('DELETE /api/artifacts/:id/tags/:tag', () => {
  beforeEach(() => {
    artifact('art_1', 'One', '2026-07-23 10:00:00');
    tag('art_1', 'grant-writing');
    tag('art_1', 'methods');
  });

  it('401 when caller is anonymous, and removes nothing', async () => {
    const res = await handleRemoveArtifactTag('art_1', 'grant-writing', delReq(), ANON, env);
    expect(res.status).toBe(401);
    expect(tagsOf('art_1')).toEqual(['grant-writing', 'methods']);
  });

  it('normalizes the :tag param before the delete, returns remaining set', async () => {
    const res = await handleRemoveArtifactTag('art_1', 'Grant Writing', delReq(), USER, env);
    expect(res.status).toBe(200);
    const payload = await res.json() as { data: { removed: string; tags: string[] } };
    expect(payload.data.removed).toBe('grant-writing');
    expect(payload.data.tags).toEqual(['methods']);
    expect(tagsOf('art_1')).toEqual(['methods']);
  });
});
