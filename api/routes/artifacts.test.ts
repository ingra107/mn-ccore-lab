/**
 * artifacts.test.ts — Hermes Artifacts v1 route behavior.
 *
 * Covers:
 *   - create: validation (title/body_md required), id mint, version=1, actor
 *   - get: 404 when missing; returns artifact + versions
 *   - revise: archives current body, bumps version, idempotent archive (INSERT OR IGNORE)
 *   - revise: 404 when missing; body_md required
 *   - comments: routes through postActivityEntry(entityType='artifact')
 *   - delete: PI-gated (403 for non-PI), cascades activity_entries + versions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env, AuthUser } from '../helpers';

// Stub postActivityEntry + the visibility gate (the comment route delegates to it).
vi.mock('../lib/activity-entry', () => ({
  postActivityEntry: vi.fn().mockResolvedValue({
    ok: true,
    row: { id: 'ae-1', entity_id: 'art_abc', actor_slug: 'nick-ingraham', body: 'hi', created_at: '2026-06-11 00:00:00' },
  }),
  activityVisibilityGate: vi.fn().mockResolvedValue({ clause: '1=1', binds: [] }),
}));

// resolveActor + isPiRequest are real-ish; stub helpers we need to control.
vi.mock('../helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers')>();
  return {
    ...actual,
    resolveActor: vi.fn(async (_env: unknown, user: AuthUser, override: string | null | undefined) => {
      if (override === 'claude-ai') return { slug: 'claude-ai' };
      if (override) return { slug: override };
      return { slug: user.email === 'claude-ai' ? 'claude-ai' : 'nick-ingraham' };
    }),
    isPiRequest: vi.fn(async () => false),
  };
});

import { postActivityEntry } from '../lib/activity-entry';
import { isPiRequest } from '../helpers';
import {
  handleGetArtifacts,
  handleGetArtifact,
  handleCreateArtifact,
  handleReviseArtifact,
  handleDeleteArtifact,
  handleAddArtifactComment,
} from './artifacts';

const mockPostActivity = vi.mocked(postActivityEntry);
const mockIsPi = vi.mocked(isPiRequest);

// ── DB stub factory ────────────────────────────────────────────────────────────

function makeDb(opts: {
  artifact?: Record<string, unknown> | null;
  versions?: Record<string, unknown>[];
  list?: Record<string, unknown>[];
  captureWrite?: (sql: string, binds: unknown[]) => void;
}) {
  return {
    prepare: (sql: string) => {
      let bound: unknown[] = [];
      const stmt: any = {
        bind: (...args: unknown[]) => { bound = [...bound, ...args]; return stmt; },
        run: async () => { opts.captureWrite?.(sql, [...bound]); return { success: true, meta: {}, results: [] }; },
        first: async () => {
          if (/FROM artifacts WHERE id/.test(sql)) return opts.artifact ?? null;
          return null;
        },
        all: async () => {
          if (/FROM artifact_versions/.test(sql)) return { results: opts.versions ?? [] };
          if (/FROM artifacts/.test(sql)) return { results: opts.list ?? [] };
          return { results: [] };
        },
      };
      return stmt;
    },
    batch: async (stmts: any[]) => {
      // Execute each prepared statement's run to capture the writes.
      for (const s of stmts) { if (s && typeof s.run === 'function') await s.run(); }
      return stmts.map(() => ({ success: true, meta: {}, results: [] }));
    },
  };
}

function req(body: unknown): Request {
  return new Request('https://example.com/api/artifacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const USER: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick' };

describe('artifacts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPi.mockResolvedValue(false);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  it('create: 400 when title missing', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    const res = await handleCreateArtifact(req({ body_md: 'x' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('create: 400 when body_md missing', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    const res = await handleCreateArtifact(req({ title: 'Lit review' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('create: inserts with version 1 and art_ id, returns 201', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const created = { id: 'art_xyz', title: 'Lit review', body_md: '# Hello', version: 1, created_by: 'claude-ai' };
    const env = { DB: makeDb({ artifact: created, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;

    const res = await handleCreateArtifact(
      req({ title: 'Lit review', body_md: '# Hello', created_by: 'claude-ai', task_id: 'task_1', project_id: 'proj_1' }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );

    expect(res.status).toBe(201);
    const insert = writes.find((w) => /INSERT INTO artifacts/.test(w.sql));
    expect(insert).toBeDefined();
    // id begins with art_; version literal 1 in the SQL; created_by resolved.
    expect((insert!.binds[0] as string).startsWith('art_')).toBe(true);
    expect(insert!.binds).toContain('task_1');
    expect(insert!.binds).toContain('proj_1');
    expect(insert!.binds).toContain('claude-ai');
  });

  // ── get ─────────────────────────────────────────────────────────────────────

  it('get: 404 when artifact missing', async () => {
    const env = { DB: makeDb({ artifact: null }) } as unknown as Env;
    const res = await handleGetArtifact('art_missing', env);
    expect(res.status).toBe(404);
  });

  it('get: returns artifact + versions array', async () => {
    const env = { DB: makeDb({
      artifact: { id: 'art_1', title: 'T', body_md: 'B', version: 3 },
      versions: [{ artifact_id: 'art_1', version: 2 }, { artifact_id: 'art_1', version: 1 }],
    }) } as unknown as Env;
    const res = await handleGetArtifact('art_1', env);
    expect(res.status).toBe(200);
    const payload = await res.json() as { data: { version: number; versions: unknown[] } };
    expect(payload.data.version).toBe(3);
    expect(payload.data.versions).toHaveLength(2);
  });

  it('list: returns rows + count', async () => {
    const env = { DB: makeDb({ list: [{ id: 'art_1' }, { id: 'art_2' }] }) } as unknown as Env;
    const res = await handleGetArtifacts(new URL('https://x/api/artifacts'), env);
    const payload = await res.json() as { data: unknown[]; count: number };
    expect(payload.count).toBe(2);
  });

  // ── revise ────────────────────────────────────────────────────────────────────

  it('revise: 404 when artifact missing', async () => {
    const env = { DB: makeDb({ artifact: null }) } as unknown as Env;
    const res = await handleReviseArtifact('art_x', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(404);
  });

  it('revise: 400 when body_md missing', async () => {
    const env = { DB: makeDb({ artifact: { id: 'art_1', version: 1, body_md: 'old', title: 'T' } }) } as unknown as Env;
    const res = await handleReviseArtifact('art_1', req({ revision_note: 'x' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('revise: archives current body at current version, bumps to version+1', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const env = { DB: makeDb({
      artifact: { id: 'art_1', version: 2, body_md: 'old body', title: 'Old title' },
      captureWrite: (sql, binds) => writes.push({ sql, binds }),
    }) } as unknown as Env;

    const res = await handleReviseArtifact(
      'art_1',
      req({ body_md: 'new body', revision_note: 'addressed 3 comments' }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );
    expect(res.status).toBe(200);

    // Archive INSERT OR IGNORE with the CURRENT version (2) + old body.
    const archive = writes.find((w) => /INSERT OR IGNORE INTO artifact_versions/.test(w.sql));
    expect(archive).toBeDefined();
    expect(archive!.binds).toContain(2);          // current version
    expect(archive!.binds).toContain('old body'); // current body archived
    expect(archive!.binds).toContain('addressed 3 comments');

    // UPDATE bumps to 3 with the new body.
    const update = writes.find((w) => /UPDATE artifacts SET/.test(w.sql));
    expect(update).toBeDefined();
    expect(update!.binds).toContain('new body');
    expect(update!.binds).toContain(3);           // version+1
  });

  // ── comments ──────────────────────────────────────────────────────────────────

  it('comment: 404 when artifact missing', async () => {
    const env = { DB: makeDb({ artifact: null }) } as unknown as Env;
    const res = await handleAddArtifactComment('art_x', req({ content: 'hi' }), USER, env);
    expect(res.status).toBe(404);
  });

  it('comment: 400 when content empty', async () => {
    const env = { DB: makeDb({ artifact: { id: 'art_1' } }) } as unknown as Env;
    const res = await handleAddArtifactComment('art_1', req({ content: '  ' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('comment: routes through postActivityEntry with entityType=artifact', async () => {
    const env = { DB: makeDb({ artifact: { id: 'art_1' } }) } as unknown as Env;
    const res = await handleAddArtifactComment('art_1', req({ content: '@hermes please revise' }), USER, env);
    expect(res.status).toBe(201);
    expect(mockPostActivity).toHaveBeenCalledOnce();
    const call = mockPostActivity.mock.calls[0][0];
    expect(call.entityType).toBe('artifact');
    expect(call.entityId).toBe('art_1');
    expect(call.kind).toBe('comment');
    expect(call.body).toBe('@hermes please revise');
  });

  it('comment: author-only visibility passes through when requested', async () => {
    const env = { DB: makeDb({ artifact: { id: 'art_1' } }) } as unknown as Env;
    await handleAddArtifactComment('art_1', req({ content: '@me private note', visibility: 'author' }), USER, env);
    expect(mockPostActivity.mock.calls[0][0].visibility).toBe('author');
  });

  // ── delete ────────────────────────────────────────────────────────────────────

  it('delete: 403 for non-PI caller', async () => {
    mockIsPi.mockResolvedValue(false);
    const env = { DB: makeDb({ artifact: { id: 'art_1' } }) } as unknown as Env;
    const res = await handleDeleteArtifact('art_1', req({}), env);
    expect(res.status).toBe(403);
  });

  it('delete: PI cascades activity_entries + versions + artifact', async () => {
    mockIsPi.mockResolvedValue(true);
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const env = { DB: makeDb({ artifact: { id: 'art_1' }, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;
    const res = await handleDeleteArtifact('art_1', req({}), env);
    expect(res.status).toBe(200);
    // All three cascade deletes fired through batch().
    expect(writes.some((w) => /DELETE FROM activity_entries WHERE entity_type = 'artifact'/.test(w.sql))).toBe(true);
    expect(writes.some((w) => /DELETE FROM artifact_versions/.test(w.sql))).toBe(true);
    expect(writes.some((w) => /DELETE FROM artifacts WHERE id/.test(w.sql))).toBe(true);
  });

  it('delete: idempotent when artifact already gone (PI)', async () => {
    mockIsPi.mockResolvedValue(true);
    const env = { DB: makeDb({ artifact: null }) } as unknown as Env;
    const res = await handleDeleteArtifact('art_gone', req({}), env);
    expect(res.status).toBe(200);
    const payload = await res.json() as { data: { idempotent: boolean } };
    expect(payload.data.idempotent).toBe(true);
  });
});
