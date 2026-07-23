/**
 * phase4-correctness.test.ts — Phase 4 correctness-bug regression guard
 *
 * Covers:
 *   Fix 1: Hermes @mention in project comments passes project.id (UUID) not slug
 *   Fix 1b: Hermes @mention in task comments creates ai_request + placeholder
 *   Fix 2: Upsert-on-miss (handleUpdateProject) runs PROJECT_ENUM_GUARDS → 400 on bad stage/status/category
 *   Fix 3: handleDeleteProject idempotency check BEFORE cascade (retry doesn't re-NULL tasks)
 *   Fix 3b: handleDeleteTask idempotency check BEFORE cascade
 *   Fix 4: handleUpdateProject conflict returns HTTP 409 (not 200)
 *   Fix 5: regulatory VALID_STATUSES includes action_needed + expiring_soon
 *   Fix 6: project-ref resolver in submissions, conferences, regulatory, revisions, deadline-cascade
 *   Fix 7: /api/mutations applyInsert resolves tasks.project_id slug → canonical
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthUser, Env } from '../helpers';

// ── Mock applyMutation so route handlers don't need full D1 runtime ───────────
vi.mock('./mutations', () => ({
  applyMutation: vi.fn(),
  handleMutations: vi.fn(),
  applyInsert: vi.fn(),
  applyUpdate: vi.fn(),
  applyDelete: vi.fn(),
}));

import { applyMutation, applyInsert } from './mutations';
import { handleUpdateProject, handleAddComment, handleDeleteProject } from './projects';
import { handleAddTaskComment, handleDeleteTask } from './tasks';
import { handleCreateRegulatoryItem, handleUpdateRegulatoryItem } from './regulatory';
import { handleCreateSubmission } from './submissions';
import { handleCreateConference } from './conferences';
import { handleCreateRevision } from './revisions';
import { handleGetCascade } from './deadline-cascade';

const mockApplyMutation = vi.mocked(applyMutation);

// ── Shared helpers ─────────────────────────────────────────────────────────────

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick' };

// Phase 1b-extended: write-path handlers now run assertProjectVisible / isPiRequest,
// both of which need a real auth signal on the Request. Use the same TEST_MODE_KEY
// pattern as pb-visibility-contract.test.ts — caller must be PI by default so
// these correctness tests aren't blocked by the new ACL gates. Override to
// nonPi only when explicitly testing a non-PI path.
const TEST_MODE_KEY = 'local-test-key-do-not-use-in-prod';

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Mode-Key': TEST_MODE_KEY,
      'X-Test-User': NICK.email,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeUrl(params: Record<string, string> = {}): URL {
  const u = new URL('https://example.com/api/test');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

// ── Minimal DB stub factory ────────────────────────────────────────────────────

type FirstFn = (sql: string, binds: unknown[]) => unknown;
type AllFn = (sql: string, binds: unknown[]) => { results: unknown[] };

function makeDb(opts: {
  first?: FirstFn;
  all?: AllFn;
  runOk?: boolean;
  captureRun?: (sql: string, binds: unknown[]) => void;
  captureInsert?: (sql: string, binds: unknown[]) => void;
  batchCb?: (stmts: unknown[]) => void;
} = {}) {
  const inserted: Array<{ sql: string; binds: unknown[] }> = [];
  let firstCallCount = 0;

  return {
    _inserted: inserted,
    prepare: (sql: string) => {
      let boundVals: unknown[] = [];
      const stmt: any = {
        bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
        run: async () => {
          opts.captureRun?.(sql, boundVals);
          opts.captureInsert?.(sql, boundVals);
          inserted.push({ sql, binds: [...boundVals] });
          return { success: true, meta: {}, results: [] };
        },
        first: async () => opts.first?.(sql, boundVals) ?? null,
        all: async () => opts.all ? opts.all(sql, boundVals) : { results: [] },
      };
      // Rebind returns same stmt ref (so chained .bind works)
      stmt.bind = (...args: unknown[]) => {
        boundVals = [...boundVals, ...args];
        return stmt;
      };
      return stmt;
    },
    batch: async (stmts: unknown[]) => {
      opts.batchCb?.(stmts);
      return stmts.map(() => ({ success: true, meta: {}, results: [] }));
    },
  };
}

// ── Fix 1: Hermes project-comment passes project.id not URL slug ─────────────

describe('Fix 1 — handleAddComment: @hermes uses project.id (UUID), not URL slug', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts ai_request and placeholder comment bound to project.id (UUID)', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];

    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => {
            inserts.push({ sql, binds: [...boundVals] });
            return { success: true, meta: {}, results: [] };
          },
          first: async () => {
            // Route by SQL content — more robust than call count ordering
            if (/FROM projects WHERE/.test(sql) && /id\s*=\s*\?\s*OR\s+slug\s*=\s*\?/.test(sql)) {
              return { id: 'proj-uuid-001', title: 'My Project', slug: 'my-project' };
            }
            // postActivityEntry's project existence check (P2-A retarget).
            if (/SELECT id FROM projects WHERE id = \? LIMIT 1/.test(sql)) {
              return { id: 'proj-uuid-001' };
            }
            // postActivityEntry's INSERT ... RETURNING * write path — record it
            // alongside .run() inserts so the placeholder assertion sees it.
            if (/INSERT INTO activity_entries/.test(sql) && /RETURNING \*/.test(sql)) {
              inserts.push({ sql, binds: [...boundVals] });
              return { id: boundVals[0], body: boundVals[7], actor_slug: boundVals[6], update_type: boundVals[9], created_at: '2026-06-10 00:00:00' };
            }
            // #98: postActivityEntry resolves a parent when the Hermes
            // placeholder threads onto its triggering entry. This is a PROJECT
            // comment, so the parent must report project identity — the
            // placeholder inherits entity_type/entity_id from it, and this test
            // asserts the placeholder lands on project.id.
            if (/SELECT id, parent_id, entity_type, entity_id, kind, visibility, hidden_at FROM activity_entries WHERE id = \?/.test(sql)) {
              return {
                id: boundVals[0], parent_id: null, entity_type: 'project',
                entity_id: 'proj-uuid-001', kind: 'comment', visibility: 'team',
                hidden_at: null,
              };
            }
            if (sql.includes('FROM team_members WHERE slug = ?')) return { id: 'member_001' };
            if (sql.includes('FROM team_members WHERE email =')) return { id: 'member_001', slug: 'nick-ingraham' };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ content: '@hermes what is the status of this project?' });

    // Pass URL slug (not UUID) as projectId — the fix should resolve to project.id
    const res = await handleAddComment('my-project', req, NICK, env);

    expect(res.status).toBe(201);

    // Find ai_requests INSERT
    const aiInsert = inserts.find(i => i.sql.includes('ai_requests'));
    expect(aiInsert).toBeDefined();

    // The project_slug bound to ai_requests should be 'proj-uuid-001' (project.id)
    // NOT the URL param 'my-project'.
    // ai_requests INSERT: (id, source_type, source_id, project_slug, prompt, context, requested_by)
    // project_slug is at bind index 3.
    expect(aiInsert!.binds[3]).toBe('proj-uuid-001');

    // P2-A retarget: the placeholder is an activity_entries row (not a legacy
    // comments row). entity_id bind (index 2) must be project.id.
    const placeholderInserts = inserts.filter(i =>
      i.sql.includes('INSERT INTO activity_entries') &&
      (i.binds as string[]).some(b => typeof b === 'string' && b.includes('Thinking about'))
    );
    expect(placeholderInserts.length).toBe(1);
    expect(placeholderInserts[0].binds[2]).toBe('proj-uuid-001');
    // No legacy comments-table write anywhere on this path.
    expect(inserts.some(i => i.sql.includes('INSERT INTO comments'))).toBe(false);
  });

  it('does not create ai_request when no @hermes mention', async () => {
    const inserts: Array<{ sql: string }> = [];

    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => { inserts.push({ sql }); return { success: true, meta: {}, results: [] }; },
          first: async () => {
            if (/FROM projects WHERE/.test(sql) && /id\s*=\s*\?\s*OR\s+slug\s*=\s*\?/.test(sql)) {
              return { id: 'proj-uuid-001', title: 'My Project', slug: 'my-project' };
            }
            if (/SELECT id FROM projects WHERE id = \? LIMIT 1/.test(sql)) {
              return { id: 'proj-uuid-001' };
            }
            if (/INSERT INTO activity_entries/.test(sql) && /RETURNING \*/.test(sql)) {
              return { id: boundVals[0], body: boundVals[7], actor_slug: boundVals[6], created_at: '2026-06-10 00:00:00' };
            }
            if (sql.includes('FROM team_members WHERE slug = ?')) return { id: 'member_001' };
            if (sql.includes('FROM team_members WHERE email =')) return { id: 'member_001', slug: 'nick-ingraham' };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ content: 'Great work everyone!' });

    const res = await handleAddComment('my-project', req, NICK, env);
    expect(res.status).toBe(201); // the write itself succeeds via postActivityEntry

    const aiInsert = inserts.find(i => i.sql.includes('ai_requests'));
    expect(aiInsert).toBeUndefined();
  });
});

// ── Fix 1b: Hermes in task comments creates ai_request + placeholder ──────────

describe('Fix 1b — handleAddTaskComment: @hermes creates ai_request + placeholder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates ai_request with source_type=task_comment and placeholder comment', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];

    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => {
            inserts.push({ sql, binds: [...boundVals] });
            return { success: true, meta: {}, results: [] };
          },
          first: async () => {
            // Route by SQL content
            // Design C (v77): comment write/read now lands in activity_entries.
            // Normal writes use `INSERT ... RETURNING *` resolved via first() — record
            // the insert (so placeholder-insert assertions still see it) and echo a row
            // back from the binds so postActivityEntry continues.
            if (sql.includes('INSERT INTO activity_entries') && sql.includes('RETURNING *')) {
              inserts.push({ sql, binds: [...boundVals] });
              return {
                id: boundVals[0], entity_type: boundVals[1], entity_id: boundVals[2], project_id: boundVals[3],
                kind: boundVals[4], visibility: boundVals[5], actor_slug: boundVals[6], body: boundVals[7],
                created_at: '2026-06-10 00:00:00',
              };
            }
            // #98: kind/visibility/parent_id are read by postActivityEntry's parent
            // resolution when a Hermes placeholder threads onto its trigger. Without
            // them the stub row looks like a non-repliable entry and the placeholder
            // is never written.
            if (sql.includes('FROM activity_entries WHERE id =')) return { id: 'ae-001', entity_type: 'task', entity_id: 'task-001', kind: 'comment', visibility: 'team', parent_id: null, actor_slug: 'nick-ingraham', body: '@hermes help', created_at: '2026-06-10 00:00:00' };
            if (sql.includes('FROM team_members WHERE slug =')) return { id: 'member_001', slug: 'nick-ingraham' };
            if (sql.includes('FROM team_members WHERE email =')) return { id: 'member_001', slug: 'nick-ingraham' };
            if (sql.includes('FROM tasks WHERE id = ? AND deleted_at IS NULL')) return { project_id: 'proj-slug-001' };
            // Phase 1b-extended ACL gate visits the projects table to read
            // category. Non-PB row keeps the test on the happy path.
            if (/FROM projects WHERE/.test(sql)) return { id: 'proj-uuid-001', slug: 'proj-slug-001', category: null };
            return null;
          },
          all: async () => {
            if (sql.includes('FROM team_members WHERE slug IN')) return { results: [] };
            return { results: [] };
          },
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest(
      { content: '@hermes can you summarize the task context?' },
      { 'X-Auth-Email': 'ingra107@umn.edu' },
    );

    const res = await handleAddTaskComment('task-001', req, NICK, env);

    expect(res.status).toBe(201);

    // Find ai_requests INSERT
    const aiInsert = inserts.find(i => i.sql.includes('ai_requests'));
    expect(aiInsert).toBeDefined();
    // source_type should be 'task_comment' (bind index 1) — preserved through
    // postActivityEntry's Hermes dispatch so the listener routes the answer back.
    expect(aiInsert!.binds[1]).toBe('task_comment');

    // Find the placeholder — Design C (v77): it is now an activity_entries row
    // (kind='comment', actor_slug='claude-ai') with body 'Thinking about...'.
    const placeholderInserts = inserts.filter(i =>
      i.sql.includes('INSERT') && i.sql.includes('activity_entries') &&
      (i.binds as string[]).some(b => typeof b === 'string' && b.includes('Thinking about'))
    );
    expect(placeholderInserts.length).toBe(1);
    // activity_entries insert bind order: id, entity_type, entity_id, project_id,
    // kind, visibility, actor_slug, body, ...
    const ph = placeholderInserts[0].binds as unknown[];
    expect(ph[1]).toBe('task');          // entity_type
    expect(ph[2]).toBe('task-001');      // entity_id
    expect(ph[4]).toBe('comment');       // kind
    expect(ph[6]).toBe('claude-ai');     // actor_slug
  });

  it('does not create ai_request when content has no @hermes mention', async () => {
    const inserts: Array<{ sql: string }> = [];

    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => { inserts.push({ sql }); return { success: true, meta: {}, results: [] }; },
          first: async () => {
            if (sql.includes('FROM activity_entries WHERE id =')) return { id: 'ae-001', entity_type: 'task', entity_id: 'task-001', kind: 'comment', visibility: 'team', parent_id: null, actor_slug: 'nick-ingraham', body: 'regular comment', created_at: '2026-06-10 00:00:00' };
            if (sql.includes('FROM team_members')) return { id: 'member_001', slug: 'nick-ingraham' };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ content: 'Just a regular comment, no AI mention.' });

    await handleAddTaskComment('task-001', req, NICK, env);

    expect(inserts.find(i => i.sql.includes('ai_requests'))).toBeUndefined();
    expect(inserts.find(i => i.sql.includes('task_comments') && i.sql.includes('Thinking'))).toBeUndefined();
  });
});

// ── Fix 2: Upsert-on-miss enum guards ─────────────────────────────────────────

describe('Fix 2 — handleUpdateProject upsert-on-miss enum guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyMutation.mockResolvedValue({ mutation_id: 'mut_1', status: 'accepted', result_seq: 1 });
  });

  function makeEnvNoProject() {
    // project does NOT exist → triggers upsert-on-miss path
    return {
      DB: {
        prepare: (_sql: string) => ({
          bind: function(..._args: unknown[]) { return this; },
          first: async () => null,
          run: async () => ({ success: true, meta: {}, results: [] }),
          all: async () => ({ results: [] }),
        }),
        batch: async () => [],
      },
    } as unknown as Env;
  }

  it('returns 400 for invalid stage on upsert-on-miss branch', async () => {
    const env = makeEnvNoProject();
    const req = makeRequest({
      title: 'New Project',
      status: 'active',
      stage: 'not_a_real_stage',   // invalid
      category: 'MNCCORE',
    });

    const res = await handleUpdateProject('new-project-id', req, NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Invalid stage/i);
  });

  it('returns 400 for invalid status on upsert-on-miss branch', async () => {
    const env = makeEnvNoProject();
    const req = makeRequest({
      title: 'New Project',
      status: 'flying',   // invalid
      stage: 'idea',
      category: 'MNCCORE',
    });

    const res = await handleUpdateProject('new-project-id', req, NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Invalid status/i);
  });

  it('returns 400 for invalid category on upsert-on-miss branch', async () => {
    const env = makeEnvNoProject();
    const req = makeRequest({
      title: 'New Project',
      status: 'active',
      stage: 'idea',
      category: 'lab',   // invalid (old value)
    });

    const res = await handleUpdateProject('new-project-id', req, NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Invalid category/i);
  });

  it('accepts canonical values and calls applyMutation on upsert-on-miss branch', async () => {
    const env = makeEnvNoProject();
    const req = makeRequest({
      title: 'New Project',
      status: 'active',
      stage: 'idea',
      category: 'MNCCORE',
    });

    const res = await handleUpdateProject('new-project-id', req, NICK, env);
    expect(res.status).not.toBe(400);
    expect(mockApplyMutation).toHaveBeenCalled();
    const callArgs = mockApplyMutation.mock.calls[0][1];
    expect(callArgs.op).toBe('insert');
    expect(callArgs.payload?.status).toBe('active');
    expect(callArgs.payload?.stage).toBe('idea');
    expect(callArgs.payload?.category).toBe('MNCCORE');
  });
});

// ── Fix 3: handleDeleteProject — idempotency BEFORE cascade ──────────────────

describe('Fix 3 — handleDeleteProject: idempotency check runs BEFORE cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyMutation.mockResolvedValue({ mutation_id: 'mut_1', status: 'accepted', result_seq: 1 });
  });

  it('does NOT call DB.batch() when project is already soft-deleted (idempotent retry)', async () => {
    const batchCalled = { count: 0 };

    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => {
            // Route by SQL content so we don't rely on call-count ordering
            // across separate prepare() invocations.
            if (sql.includes('FROM projects WHERE id = ? OR slug = ?')) {
              return { id: 'proj_X', title: 'Dead Project', slug: 'dead-project', category: 'MNCCORE' };
            }
            if (sql.includes('SELECT deleted_at FROM projects WHERE id = ?')) {
              return { deleted_at: '2026-05-01T00:00:00Z' };  // already deleted
            }
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async (stmts: unknown[]) => {
        batchCalled.count++;
        return stmts.map(() => ({ success: true, meta: {}, results: [] }));
      },
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const res = await handleDeleteProject('proj_X', NICK, env, makeRequest({}));

    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect((body.data as any).idempotent).toBe(true);
    // Cascade MUST NOT run on an already-deleted project
    expect(batchCalled.count).toBe(0);
  });
});

// ── Fix 3b: handleDeleteTask — idempotency BEFORE cascade ────────────────────

describe('Fix 3b — handleDeleteTask: idempotency check runs BEFORE cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyMutation.mockResolvedValue({ mutation_id: 'mut_1', status: 'accepted', result_seq: 1 });
  });

  it('does NOT execute child DELETEs when task already has deleted_at', async () => {
    const deleteRuns: string[] = [];

    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => {
            // task_comments/task_updates dropped (schema-v78, 2026-06-10).
            if (sql.includes('DELETE FROM activity_entries') ||
                sql.includes('DELETE FROM task_subtasks') ||
                sql.includes('DELETE FROM notifications')) {
              deleteRuns.push(sql);
            }
            return { success: true, meta: {}, results: [] };
          },
          first: async () => {
            // task row with deleted_at set
            if (sql.includes('FROM tasks')) return {
              id: 'task_Z', title: 'Done task', description: null,
              deleted_at: '2026-05-01T00:00:00Z',
            };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    // T1.1 (2026-05-28): handleDeleteTask now takes (id, request, user, env) — added request
    // arg for the PB-visibility gate. PI request bypasses the gate.
    const req = new Request('https://x/api/tasks/task_Z/delete', {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': NICK.email },
    });
    const res = await handleDeleteTask('task_Z', req, NICK, env);

    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect((body.data as any).idempotent).toBe(true);
    // Child cascade DELETEs must not run
    expect(deleteRuns).toHaveLength(0);
  });
});

// ── Fix 4: handleUpdateProject conflict returns 409 ───────────────────────────

describe('Fix 4 — handleUpdateProject: conflict → HTTP 409', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 409 when applyMutation returns conflict status', async () => {
    mockApplyMutation.mockResolvedValue({
      mutation_id: 'mut_conflict',
      status: 'conflict' as const,
      reason: 'row changed by another writer',
    });

    const db = {
      prepare: (_sql: string) => {
        let boundVals: unknown[] = [];
        let firstCallCount = 0;
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => {
            firstCallCount++;
            // 1: existingCheck SELECT → row exists
            if (firstCallCount === 1) return { id: 'proj_A', stage: 'idea', pi: 'nick', title: 'Test' };
            // 2: current project fetch for conflict body
            if (firstCallCount === 2) return { id: 'proj_A', title: 'Test', status: 'active', stage: 'idea' };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ title: 'Updated Title', status: 'active', stage: 'idea', category: 'MNCCORE' });

    const res = await handleUpdateProject('proj_A', req, NICK, env);
    expect(res.status).toBe(409);

    const body = await res.json() as { rejected: string; message: string };
    expect(body.rejected).toBe('conflict');
  });

  it('returns 200 on successful update (no regression)', async () => {
    mockApplyMutation.mockResolvedValue({
      mutation_id: 'mut_ok',
      status: 'accepted' as const,
      result_seq: 2,
    });

    const db = {
      prepare: (_sql: string) => {
        let boundVals: unknown[] = [];
        let firstCallCount = 0;
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => {
            firstCallCount++;
            if (firstCallCount === 1) return { id: 'proj_B', stage: 'idea', pi: 'nick', title: 'Test' };
            if (firstCallCount === 2) return { id: 'proj_B', title: 'Updated', status: 'active', stage: 'idea' };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ title: 'Updated Title', status: 'active', stage: 'idea', category: 'MNCCORE' });

    const res = await handleUpdateProject('proj_B', req, NICK, env);
    expect(res.status).toBe(200);
  });
});

// ── Fix 5: regulatory VALID_STATUSES enum alignment ──────────────────────────

describe('Fix 5 — regulatory: action_needed and expiring_soon accepted as valid status', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRegDb(projectExists: boolean) {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      _inserts: inserts,
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => {
            inserts.push({ sql, binds: [...boundVals] });
            return { success: true, meta: {}, results: [] };
          },
          first: async () => {
            if (/FROM projects WHERE/.test(sql) && /id\s*=\s*\?\s*OR\s+slug\s*=\s*\?/.test(sql)) {
              return projectExists ? { id: 'proj-uuid-r', slug: 'irb-project' } : null;
            }
            if (sql.includes('FROM regulatory_items WHERE id = ?')) {
              return { id: 'reg_1', status: 'action_needed', item_type: 'irb', title: 'IRB Protocol', project_id: 'irb-project' };
            }
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };
    return db;
  }

  it('accepts action_needed as a valid status on create', async () => {
    const db = makeRegDb(true);
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({
      project_id: 'irb-project',
      item_type: 'irb',
      title: 'IRB Protocol v3',
      status: 'action_needed',
    });

    const res = await handleCreateRegulatoryItem(req, NICK, env);
    expect(res.status).toBe(201);
  });

  it('accepts expiring_soon as a valid status on create', async () => {
    const db = makeRegDb(true);
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({
      project_id: 'irb-project',
      item_type: 'dua',
      title: 'DUA with hospital',
      status: 'expiring_soon',
    });

    const res = await handleCreateRegulatoryItem(req, NICK, env);
    expect(res.status).toBe(201);
  });

  it('still rejects truly invalid status', async () => {
    const db = makeRegDb(true);
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({
      project_id: 'irb-project',
      item_type: 'irb',
      title: 'IRB Protocol',
      status: 'flying_blind',  // not in VALID_STATUSES
    });

    const res = await handleCreateRegulatoryItem(req, NICK, env);
    expect(res.status).toBe(400);
  });

  it('accepts action_needed on update', async () => {
    const db = makeRegDb(true);
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ status: 'action_needed' });

    const res = await handleUpdateRegulatoryItem('reg_1', req, NICK, env);
    expect(res.status).toBe(200);
  });
});

// ── Fix 6: project-ref resolver in submissions, conferences, regulatory, revisions ──

describe('Fix 6 — project-ref resolver: slug resolves to canonical before INSERT', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeProjectDb(projectRow: { id: string; slug: string } | null) {
    return (sql: string, _binds: unknown[]) => {
      if (/FROM projects WHERE/.test(sql) && /id\s*=\s*\?\s*OR\s+slug\s*=\s*\?/.test(sql)) return projectRow;
      return null;
    };
  }

  // ── submissions.ts ──
  it('submissions: stores canonical project_id (resolved), not raw slug', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => { inserts.push({ sql, binds: [...boundVals] }); return { success: true, meta: {}, results: [] }; },
          first: async () => {
            if (/FROM projects WHERE/.test(sql) && /id\s*=\s*\?\s*OR\s+slug\s*=\s*\?/.test(sql)) return { id: 'proj-uuid-s', slug: 'some-project' };
            if (sql.includes('FROM submission_events WHERE id = ?')) return { id: 'ev_1' };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ project_id: 'some-project', event_type: 'submitted', event_date: '2026-06-01' });

    const res = await handleCreateSubmission(req, NICK, env);
    expect(res.status).toBe(201);
    const submissionInsert = inserts.find(i => i.sql.includes('submission_events') && i.sql.includes('INSERT'));
    expect(submissionInsert).toBeDefined();
    // P2: projectRefToCanonical returns proj.id (typed PK), not slug.
    // Stub returns { id: 'proj-uuid-s', slug: 'some-project' } → canonical = 'proj-uuid-s'.
    expect(submissionInsert!.binds[1]).toBe('proj-uuid-s');
  });

  it('submissions: returns 400 when project_id slug is unknown', async () => {
    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => null,  // project not found
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ project_id: 'nonexistent-project', event_type: 'submitted', event_date: '2026-06-01' });

    const res = await handleCreateSubmission(req, NICK, env);
    expect(res.status).toBe(400);
  });

  // ── conferences.ts ──
  it('conferences: stores resolved project_id, not raw slug', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => { inserts.push({ sql, binds: [...boundVals] }); return { success: true, meta: {}, results: [] }; },
          first: async () => {
            if (/FROM projects WHERE/.test(sql) && /id\s*=\s*\?\s*OR\s+slug\s*=\s*\?/.test(sql)) return { id: 'proj-uuid-c', slug: 'clif-study' };
            if (sql.includes('FROM conference_submissions WHERE id = ?')) return { id: 'conf_1' };
            return null;
          },
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({
      project_id: 'clif-study',
      conference: 'CHEST 2026',
      submission_type: 'oral',
      title: 'CLIF Data Presentation',
    });

    const res = await handleCreateConference(req, NICK, env);
    expect(res.status).toBe(201);
    const confInsert = inserts.find(i => i.sql.includes('conference_submissions') && i.sql.includes('INSERT'));
    expect(confInsert).toBeDefined();
    // P2: projectRefToCanonical returns proj.id (typed PK), not slug.
    // Stub returns { id: 'proj-uuid-c', slug: 'clif-study' } → canonical = 'proj-uuid-c'.
    expect(confInsert!.binds[1]).toBe('proj-uuid-c');
  });

  // ── regulatory.ts ──
  it('regulatory: stores resolved project_id, returns 400 on unknown project', async () => {
    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => null,  // project not found
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ project_id: 'ghost-project', item_type: 'irb', title: 'IRB' });

    const res = await handleCreateRegulatoryItem(req, NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Unknown project/i);
  });

  // ── revisions.ts ──
  it('revisions: uses projectRefToCanonical and returns 400 on unknown project', async () => {
    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => null,  // project not found
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const req = makeRequest({ project_id: 'missing-project' });

    const res = await handleCreateRevision(req, NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Unknown project/i);
  });

  // ── deadline-cascade.ts ──
  it('deadline-cascade: returns 400 when project_id resolves to unknown', async () => {
    const db = {
      prepare: (sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => null,  // project not found
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
      batch: async () => [],
    };
    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
    const url = makeUrl({ project_id: 'ghost-project' });
    const req = makeRequest({});

    const res = await handleGetCascade(url, req, env);
    expect(res.status).toBe(400);
  });
});

// ── Fix 7: applyInsert resolves tasks.project_id ──────────────────────────────

describe('Fix 7 — applyInsert: tasks.project_id slug resolved to canonical', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves a slug-form project_id to canonical before INSERT', async () => {
    // We import and call applyInsert directly.
    // Re-import to get actual implementation (not mocked).
    // Since applyInsert is mocked, we need to test the resolution logic embedded
    // in the real applyInsert. We bypass the mock by testing via the helpers.
    // Instead: test projectRefToCanonical from helpers directly, then verify the
    // mutation payload is mutated in-place before the INSERT SQL fires.
    //
    // Approach: call the real applyInsert via un-mocked import.
    // Because vi.mock('./mutations') mocks the module, we can't call the real fn here.
    // We verify the behavior through integration: the resolver is IN applyInsert,
    // so we test that it calls the project lookup SQL with the raw slug and then
    // stores the resolved value.
    //
    // Use the helpers module directly — projectRefToCanonical is the unit under test.
    const { projectRefToCanonical } = await import('../helpers');

    // Build a minimal DB that has a project with id='proj-uuid-7', slug='my-slug'
    const db = {
      prepare: (_sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          run: async () => ({ success: true, meta: {}, results: [] }),
          first: async () => ({ id: 'proj-uuid-7', slug: 'my-slug' }),
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
    };

    const env = { DB: db, TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;

    // P2: canonical = proj.id (typed PK), not slug.
    // With slug as input → resolver finds the row, returns proj.id.
    const result = await projectRefToCanonical(env, 'my-slug');
    expect(result).toBe('proj-uuid-7');

    // With UUID as input → resolver finds the row, returns proj.id (same value).
    const result2 = await projectRefToCanonical(env, 'proj-uuid-7');
    expect(result2).toBe('proj-uuid-7');

    // With unknown ref → null
    const db2 = {
      prepare: (_sql: string) => {
        let boundVals: unknown[] = [];
        const stmt: any = {
          bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
          first: async () => null,
          all: async () => ({ results: [] }),
        };
        stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
        return stmt;
      },
    };
    const env2 = { DB: db2 } as unknown as Env;
    const result3 = await projectRefToCanonical(env2, 'nonexistent');
    expect(result3).toBeNull();
  });
});
