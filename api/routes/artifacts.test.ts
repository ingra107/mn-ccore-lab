/**
 * artifacts.test.ts — Hermes Artifacts v1 route behavior.
 *
 * Covers:
 *   - create: validation (title/body_md required, body_md size cap), id mint, version=1, actor
 *   - create + key_link: task_id set + empty slots → slot 1 gets abs URL + desc
 *   - create + key_link: task_id set + slots 1&2 full → writes slot 3
 *   - create + key_link: task_id set + all 3 full → no link write, artifact created
 *   - create + key_link: URL already present in a slot → idempotent, no dup write
 *   - create + key_link: no task_id → no task UPDATE issued at all
 *   - get: 404 when missing; returns artifact + versions
 *   - revise: archives current body, bumps version, idempotent archive (INSERT OR IGNORE)
 *   - revise: 404 when missing; body_md required
 *   - revise: ownership gate — creator or PI allowed, other member 403
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
import * as helpers from '../helpers';
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
  // task row returned for SELECT key_link_1/2/3 FROM tasks WHERE id = ?
  // undefined = task not found (null); pass a partial row to simulate slot state.
  task?: { key_link_1?: string | null; key_link_2?: string | null; key_link_3?: string | null } | null;
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
          // Task key_link SELECT (resolveKeyLinkSlot path).
          if (/FROM tasks WHERE id/.test(sql)) {
            if (opts.task === undefined) return null; // task not found
            return opts.task === null ? null : {
              key_link_1: opts.task.key_link_1 ?? null,
              key_link_2: opts.task.key_link_2 ?? null,
              key_link_3: opts.task.key_link_3 ?? null,
            };
          }
          return null;
        },
        all: async () => {
          if (/FROM artifacts WHERE id/.test(sql)) return { results: opts.artifact ? [opts.artifact] : [] };
          if (/FROM artifact_versions/.test(sql)) return { results: opts.versions ?? [] };
          if (/FROM artifacts/.test(sql)) return { results: opts.list ?? [] };
          return { results: [] };
        },
      };
      return stmt;
    },
    batch: async (stmts: any[]) => {
      // Like D1: per-statement results. run() still fires so write-capture works.
      const out: unknown[] = [];
      for (const s of stmts) {
        if (s && typeof s.run === 'function') await s.run();
        out.push(s && typeof s.all === 'function' ? await s.all() : { success: true, meta: {}, results: [] });
      }
      return out;
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

  it('create: 400 when body_md exceeds the size cap', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    const oversized = 'x'.repeat(2_000_001);
    const res = await handleCreateArtifact(req({ title: 'Too big', body_md: oversized }), USER, env);
    expect(res.status).toBe(400);
    const payload = await res.json() as { error?: string };
    expect(payload.error).toMatch(/exceeds maximum size/);
  });

  it('create: exactly at the size cap is accepted', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const created = { id: 'art_cap', title: 'At cap', body_md: 'x', version: 1, created_by: 'nick-ingraham' };
    const env = { DB: makeDb({ artifact: created, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;
    const atCap = 'x'.repeat(2_000_000);
    const res = await handleCreateArtifact(req({ title: 'At cap', body_md: atCap }), USER, env);
    expect(res.status).toBe(201);
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

  // ── create: schema-v94 content_type/visibility ───────────────────────────────

  it('create: omitting content_type/visibility defaults to markdown/team', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const created = { id: 'art_defaults', title: 'T', body_md: 'B', version: 1, created_by: 'nick-ingraham' };
    const env = { DB: makeDb({ artifact: created, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;

    const res = await handleCreateArtifact(req({ title: 'T', body_md: 'B' }), USER, env);

    expect(res.status).toBe(201);
    const insert = writes.find((w) => /INSERT INTO artifacts/.test(w.sql));
    expect(insert!.binds).toContain('markdown');
    expect(insert!.binds).toContain('team');
  });

  it('create: accepts content_type=html + visibility=public, stores both', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const created = { id: 'art_public', title: 'Shared', body_md: '<html></html>', version: 1, created_by: 'nick-ingraham' };
    const env = { DB: makeDb({ artifact: created, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;

    const res = await handleCreateArtifact(
      req({ title: 'Shared', body_md: '<html></html>', content_type: 'html', visibility: 'public' }),
      USER,
      env,
    );

    expect(res.status).toBe(201);
    const insert = writes.find((w) => /INSERT INTO artifacts/.test(w.sql));
    expect(insert!.binds).toContain('html');
    expect(insert!.binds).toContain('public');
  });

  // ── create/revise: #915 html doctype normalization at ingest ─────────────────

  it('create: content_type=html stores a doctype-less FRAGMENT as a complete document (#915)', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const fragment = '<title>Aims Funnel</title><h1>Funnel</h1>'; // the Claude-Artifact export shape
    const created = { id: 'art_frag', title: 'Aims', body_md: fragment, version: 1, created_by: 'nick-ingraham' };
    const env = { DB: makeDb({ artifact: created, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;

    const res = await handleCreateArtifact(
      req({ title: 'Aims', body_md: fragment, content_type: 'html' }),
      USER,
      env,
    );

    expect(res.status).toBe(201);
    const insert = writes.find((w) => /INSERT INTO artifacts/.test(w.sql));
    expect(insert!.binds).toContain('<!DOCTYPE html>\n' + fragment);
    expect(insert!.binds).not.toContain(fragment); // the raw fragment is never stored
  });

  it('create: content_type=html passes a complete document through byte-identical (#915)', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const full = '<!DOCTYPE html><html lang="en"><body>x</body></html>';
    const created = { id: 'art_full', title: 'Full', body_md: full, version: 1, created_by: 'nick-ingraham' };
    const env = { DB: makeDb({ artifact: created, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;

    const res = await handleCreateArtifact(req({ title: 'Full', body_md: full, content_type: 'html' }), USER, env);

    expect(res.status).toBe(201);
    const insert = writes.find((w) => /INSERT INTO artifacts/.test(w.sql));
    expect(insert!.binds).toContain(full);
  });

  it('create: content_type=markdown is NEVER doctype-normalized (#915)', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const md = '# A markdown body with an <html> mention';
    const created = { id: 'art_md', title: 'MD', body_md: md, version: 1, created_by: 'nick-ingraham' };
    const env = { DB: makeDb({ artifact: created, captureWrite: (sql, binds) => writes.push({ sql, binds }) }) } as unknown as Env;

    const res = await handleCreateArtifact(req({ title: 'MD', body_md: md }), USER, env);

    expect(res.status).toBe(201);
    const insert = writes.find((w) => /INSERT INTO artifacts/.test(w.sql));
    expect(insert!.binds).toContain(md);
  });

  it('revise: an html artifact revision gets the same ingest normalization (#915)', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const env = { DB: makeDb({
      artifact: { id: 'art_1', version: 1, body_md: '<!DOCTYPE html>\n<h1>v1</h1>', title: 'T', created_by: 'claude-ai', content_type: 'html' },
      captureWrite: (sql, binds) => writes.push({ sql, binds }),
    }) } as unknown as Env;

    const res = await handleReviseArtifact(
      'art_1',
      req({ body_md: '<h1>v2 fragment</h1>' }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );
    expect(res.status).toBe(200);

    const update = writes.find((w) => /UPDATE artifacts SET/.test(w.sql));
    expect(update!.binds).toContain('<!DOCTYPE html>\n<h1>v2 fragment</h1>');
  });

  it('create: 400 on invalid content_type', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    const res = await handleCreateArtifact(req({ title: 'T', body_md: 'B', content_type: 'pdf' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('create: 400 on invalid visibility', async () => {
    const env = { DB: makeDb({}) } as unknown as Env;
    const res = await handleCreateArtifact(req({ title: 'T', body_md: 'B', visibility: 'world' }), USER, env);
    expect(res.status).toBe(400);
  });

  // ── create + key_link auto-backfill ──────────────────────────────────────────

  it('create + key_link: task_id set + all slots empty → slot 1 gets absolute URL + Hermes desc', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const created = { id: 'art_abc', title: 'Lit review', body_md: '# Hi', version: 1, created_by: 'claude-ai' };
    const env = {
      DB: makeDb({
        artifact: created,
        task: { key_link_1: null, key_link_2: null, key_link_3: null },
        captureWrite: (sql, binds) => writes.push({ sql, binds }),
      }),
    } as unknown as Env;

    const res = await handleCreateArtifact(
      new Request('https://mn-ccore-lab.pages.dev/api/artifacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Lit review', body_md: '# Hi', created_by: 'claude-ai', task_id: 'task_aaa' }),
      }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );

    expect(res.status).toBe(201);
    // key_link_1 UPDATE fired (via batch — captureWrite intercepts run() inside batch).
    const linkUpdate = writes.find((w) => /UPDATE tasks SET key_link_1/.test(w.sql));
    expect(linkUpdate).toBeDefined();
    // URL must be absolute and contain the art_ id.
    const url = linkUpdate!.binds[0] as string;
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain('/portal/artifacts/art_');
    // Description starts with 'Hermes: ' and contains the title.
    const desc = linkUpdate!.binds[1] as string;
    expect(desc).toMatch(/^Hermes: /);
    expect(desc).toContain('Lit review');
    // WHERE clause targets the right task id.
    expect(linkUpdate!.binds[2]).toBe('task_aaa');
  });

  it('create + key_link: slots 1 & 2 full → writes slot 3', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const created = { id: 'art_def', title: 'Methods', body_md: '# Methods', version: 1, created_by: 'claude-ai' };
    const env = {
      DB: makeDb({
        artifact: created,
        task: {
          key_link_1: 'https://docs.google.com/doc1',
          key_link_2: 'https://docs.google.com/doc2',
          key_link_3: null,
        },
        captureWrite: (sql, binds) => writes.push({ sql, binds }),
      }),
    } as unknown as Env;

    await handleCreateArtifact(
      new Request('https://mn-ccore-lab.pages.dev/api/artifacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Methods', body_md: '# Methods', created_by: 'claude-ai', task_id: 'task_bbb' }),
      }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );

    const linkUpdate = writes.find((w) => /UPDATE tasks SET key_link_3/.test(w.sql));
    expect(linkUpdate).toBeDefined();
    // Confirm slot 1 and 2 UPDATEs were NOT issued.
    expect(writes.some((w) => /UPDATE tasks SET key_link_1/.test(w.sql))).toBe(false);
    expect(writes.some((w) => /UPDATE tasks SET key_link_2/.test(w.sql))).toBe(false);
  });

  it('create + key_link: all 3 slots full → no key_link write, artifact still created (201)', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const created = { id: 'art_ghi', title: 'Results', body_md: '# Results', version: 1, created_by: 'claude-ai' };
    const env = {
      DB: makeDb({
        artifact: created,
        task: {
          key_link_1: 'https://example.com/1',
          key_link_2: 'https://example.com/2',
          key_link_3: 'https://example.com/3',
        },
        captureWrite: (sql, binds) => writes.push({ sql, binds }),
      }),
    } as unknown as Env;

    const res = await handleCreateArtifact(
      new Request('https://mn-ccore-lab.pages.dev/api/artifacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Results', body_md: '# Results', created_by: 'claude-ai', task_id: 'task_ccc' }),
      }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );

    expect(res.status).toBe(201);
    // No task UPDATE of any slot.
    expect(writes.some((w) => /UPDATE tasks SET key_link/.test(w.sql))).toBe(false);
    // Artifact INSERT still fired.
    expect(writes.some((w) => /INSERT INTO artifacts/.test(w.sql))).toBe(true);
    // linkSkipped reported.
    const payload = await res.json() as { linkSkipped?: string };
    expect(payload.linkSkipped).toBe('slots_full');
  });

  it('create + key_link: URL already in a slot → idempotent, no duplicate UPDATE', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    // Pin the ID so we can pre-populate the matching URL in the task row.
    const fixedHex = 'deadbeef000000000000000000000001';
    const spy = vi.spyOn(helpers, 'generateId').mockReturnValue(fixedHex);
    const expectedUrl = `https://mn-ccore-lab.pages.dev/portal/artifacts/art_${fixedHex}`;
    const created = { id: `art_${fixedHex}`, title: 'Discussion', body_md: '# Disc', version: 1, created_by: 'claude-ai' };

    const env = {
      DB: makeDb({
        artifact: created,
        // Slot 1 already holds the exact URL that will be generated.
        task: { key_link_1: expectedUrl, key_link_2: null, key_link_3: null },
        captureWrite: (sql, binds) => writes.push({ sql, binds }),
      }),
    } as unknown as Env;

    const res = await handleCreateArtifact(
      new Request('https://mn-ccore-lab.pages.dev/api/artifacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Discussion', body_md: '# Disc', created_by: 'claude-ai', task_id: 'task_ddd' }),
      }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );

    spy.mockRestore();

    expect(res.status).toBe(201);
    expect(writes.some((w) => /UPDATE tasks SET key_link/.test(w.sql))).toBe(false);
    const payload = await res.json() as { linkSkipped?: string };
    expect(payload.linkSkipped).toBe('already_linked');
  });

  it('create + key_link: no task_id → no task SELECT or UPDATE issued', async () => {
    const writes: Array<{ sql: string; binds: unknown[] }> = [];
    const selects: string[] = [];
    const created = { id: 'art_notask', title: 'Standalone', body_md: '# Stand', version: 1, created_by: 'claude-ai' };
    // Intercept DB.prepare to capture SELECTs too.
    const baseDb = makeDb({ artifact: created, task: undefined, captureWrite: (sql, binds) => writes.push({ sql, binds }) });
    const origPrepare = baseDb.prepare.bind(baseDb);
    const db = {
      ...baseDb,
      prepare: (sql: string) => {
        if (/FROM tasks/.test(sql)) selects.push(sql);
        return origPrepare(sql);
      },
    };
    const env = { DB: db } as unknown as Env;

    const res = await handleCreateArtifact(
      new Request('https://mn-ccore-lab.pages.dev/api/artifacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Standalone', body_md: '# Stand', created_by: 'claude-ai' }),
      }),
      { email: 'claude-ai', name: 'Hermes' },
      env,
    );

    expect(res.status).toBe(201);
    expect(selects).toHaveLength(0);
    expect(writes.some((w) => /UPDATE tasks/.test(w.sql))).toBe(false);
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
    // created_by='claude-ai' matches the mocked resolveActor's resolution for
    // the { email: 'claude-ai' } caller below — this test exercises the
    // creator-matches-actor branch of the ownership gate, not the PI branch.
    const env = { DB: makeDb({
      artifact: { id: 'art_1', version: 2, body_md: 'old body', title: 'Old title', created_by: 'claude-ai' },
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

  // ── revise: ownership gate ───────────────────────────────────────────────────

  it('revise: creator (actor.slug === created_by) is allowed even when not PI', async () => {
    mockIsPi.mockResolvedValue(false);
    const env = { DB: makeDb({
      artifact: { id: 'art_1', version: 1, body_md: 'old', title: 'T', created_by: 'nick-ingraham' },
    }) } as unknown as Env;
    // Mocked resolveActor resolves USER (non-claude-ai email) to 'nick-ingraham'.
    const res = await handleReviseArtifact('art_1', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(200);
  });

  it('revise: PI is allowed to revise an artifact they did not create', async () => {
    mockIsPi.mockResolvedValue(true);
    const env = { DB: makeDb({
      artifact: { id: 'art_1', version: 1, body_md: 'old', title: 'T', created_by: 'someone-else' },
    }) } as unknown as Env;
    const res = await handleReviseArtifact('art_1', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(200);
  });

  it('revise: 403 for a non-creator, non-PI team member', async () => {
    mockIsPi.mockResolvedValue(false);
    const env = { DB: makeDb({
      artifact: { id: 'art_1', version: 1, body_md: 'old', title: 'T', created_by: 'someone-else' },
    }) } as unknown as Env;
    // USER resolves to 'nick-ingraham' via the mocked resolveActor — mismatches
    // created_by='someone-else', and isPiRequest is mocked false.
    const res = await handleReviseArtifact('art_1', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(403);
    const payload = await res.json() as { error?: string };
    expect(payload.error).toMatch(/creator or a PI/);
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
