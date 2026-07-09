/**
 * ai-requests.test.ts — T4 Hermes response lane + submitter notifications
 *
 * Covers:
 *   - handleUpdateAIResponse for source_type='task_comment': updates placeholder + writes timeline
 *   - handleUpdateAIResponse for source_type='project_comment': same
 *   - visibility inheritance from the triggering entry (author-only @me case)
 *   - placeholder resolution: UPDATE body in-place when placeholder exists
 *   - fallback INSERT when placeholder is missing
 *   - non-comment source_types (e.g. 'direct') do NOT write to timeline
 *   - failed status does NOT write to timeline
 *   - submitter notifications: INSERT on every completion, idempotent, correct link
 */

import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../helpers';

// Stub postActivityEntry so we can assert it was/wasn't called and what it got.
vi.mock('../lib/activity-entry', () => ({
  postActivityEntry: vi.fn().mockResolvedValue({ ok: true, row: { id: 'new-ae-id' } }),
  activityVisibilityGate: vi.fn().mockResolvedValue({ clause: '1=1', binds: [] }),
}));

import { postActivityEntry } from '../lib/activity-entry';
import { handleCreateAIRequest, handleUpdateAIResponse } from './ai-requests';

const mockPostActivity = vi.mocked(postActivityEntry);

// ── DB stub factory ────────────────────────────────────────────────────────────

type RowKey = 'aiReq' | 'trigEntry' | 'placeholder' | 'existingNotif';

function makeDb(opts: {
  aiReq?: Record<string, unknown> | null;
  trigEntry?: Record<string, unknown> | null;
  placeholder?: Record<string, unknown> | null;
  taskRow?: { project_id: string | null } | null;
  /** Pre-existing notification row — used to test idempotency (non-null = skip INSERT). */
  existingNotif?: { id: string } | null;
  captureUpdate?: (sql: string, binds: unknown[]) => void;
}) {
  return {
    prepare: (sql: string) => {
      let boundVals: unknown[] = [];
      const stmt: any = {
        bind: (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; },
        run: async () => {
          opts.captureUpdate?.(sql, [...boundVals]);
          return { success: true, meta: {}, results: [] };
        },
        first: async () => {
          // Route by SQL content.
          if (/FROM ai_requests WHERE id/.test(sql)) return opts.aiReq ?? null;
          if (/FROM activity_entries WHERE id/.test(sql)) return opts.trigEntry ?? null;
          if (/actor_slug = 'claude-ai'/.test(sql) && /Thinking/.test(sql)) return opts.placeholder ?? null;
          if (/FROM tasks WHERE id/.test(sql)) return opts.taskRow ?? null;
          if (/FROM notifications/.test(sql)) return opts.existingNotif ?? null;
          return null;
        },
        all: async () => ({ results: [] }),
      };
      stmt.bind = (...args: unknown[]) => { boundVals = [...boundVals, ...args]; return stmt; };
      return stmt;
    },
    batch: async (stmts: unknown[]) => stmts.map(() => ({ success: true, meta: {}, results: [] })),
  };
}

function makeRequest(body: unknown): Request {
  return new Request('https://example.com/api/ai-requests/test-id/response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleUpdateAIResponse — T4 Hermes response lane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── task_comment: placeholder found → UPDATE in-place ──────────────────────

  it('task_comment: updates placeholder body in-place when placeholder exists', async () => {
    const updates: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: { id: 'ai-1', source_type: 'task_comment', source_id: 'ae-trigger-1', project_slug: null, response: null, status: 'pending' },
      trigEntry: { entity_id: 'task-123', entity_type: 'task', visibility: 'team' },
      placeholder: { id: 'ae-placeholder-1' },
      captureUpdate: (sql, binds) => updates.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse(
      'ai-1',
      makeRequest({ response: 'Here is my answer to your question.' }),
      env,
    );

    expect(res.status).toBe(200);

    // The placeholder UPDATE must have fired, not postActivityEntry.
    const placeholderUpdate = updates.find(u =>
      /UPDATE activity_entries SET body/.test(u.sql) && u.binds.includes('ae-placeholder-1')
    );
    expect(placeholderUpdate).toBeDefined();
    expect(placeholderUpdate!.binds[0]).toBe('Here is my answer to your question.');
    expect(mockPostActivity).not.toHaveBeenCalled();
  });

  // ── task_comment: no placeholder → INSERT via postActivityEntry ─────────────

  it('task_comment: inserts fresh comment when no placeholder exists', async () => {
    const db = makeDb({
      aiReq: { id: 'ai-2', source_type: 'task_comment', source_id: 'ae-trigger-2', project_slug: null },
      trigEntry: { entity_id: 'task-456', entity_type: 'task', visibility: 'team' },
      placeholder: null,
      taskRow: { project_id: 'proj-111' },
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse(
      'ai-2',
      makeRequest({ response: 'Task analysis complete.' }),
      env,
    );

    expect(res.status).toBe(200);
    expect(mockPostActivity).toHaveBeenCalledOnce();
    const call = mockPostActivity.mock.calls[0][0];
    expect(call.entityType).toBe('task');
    expect(call.entityId).toBe('task-456');
    expect(call.kind).toBe('comment');
    expect(call.actorSlug).toBe('claude-ai');
    expect(call.body).toBe('Task analysis complete.');
    expect(call.fireSideEffects).toBe(false);
    expect(call.taskProjectId).toBe('proj-111');
  });

  // ── project_comment: placeholder found → UPDATE in-place ───────────────────

  it('project_comment: updates placeholder body in-place when placeholder exists', async () => {
    const updates: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: { id: 'ai-3', source_type: 'project_comment', source_id: 'ae-trigger-3', project_slug: 'my-proj' },
      trigEntry: { entity_id: 'proj-789', entity_type: 'project', visibility: 'team' },
      placeholder: { id: 'ae-ph-project-1' },
      captureUpdate: (sql, binds) => updates.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse(
      'ai-3',
      makeRequest({ response: 'Project review done.' }),
      env,
    );

    expect(res.status).toBe(200);
    const update = updates.find(u => /UPDATE activity_entries SET body/.test(u.sql));
    expect(update).toBeDefined();
    expect(update!.binds[0]).toBe('Project review done.');
    expect(update!.binds[1]).toBe('ae-ph-project-1');
    expect(mockPostActivity).not.toHaveBeenCalled();
  });

  // ── project_comment: no placeholder → INSERT via postActivityEntry ──────────

  it('project_comment: inserts fresh comment when no placeholder exists', async () => {
    const db = makeDb({
      aiReq: { id: 'ai-4', source_type: 'project_comment', source_id: 'ae-trigger-4', project_slug: 'my-proj' },
      trigEntry: { entity_id: 'proj-999', entity_type: 'project', visibility: 'team' },
      placeholder: null,
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse(
      'ai-4',
      makeRequest({ response: 'Project notes summarized.' }),
      env,
    );

    expect(res.status).toBe(200);
    expect(mockPostActivity).toHaveBeenCalledOnce();
    const call = mockPostActivity.mock.calls[0][0];
    expect(call.entityType).toBe('project');
    expect(call.entityId).toBe('proj-999');
    expect(call.actorSlug).toBe('claude-ai');
    expect(call.fireSideEffects).toBe(false);
    expect(call.taskProjectId).toBeUndefined();
  });

  // ── visibility inheritance: author-only (@me) ────────────────────────────────

  it('inherits author visibility from the triggering entry', async () => {
    const db = makeDb({
      aiReq: { id: 'ai-5', source_type: 'task_comment', source_id: 'ae-trigger-5', project_slug: null },
      trigEntry: { entity_id: 'task-me', entity_type: 'task', visibility: 'author' },
      placeholder: null,
      taskRow: { project_id: null },
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-5', makeRequest({ response: 'Private answer.' }), env);

    expect(mockPostActivity).toHaveBeenCalledOnce();
    const call = mockPostActivity.mock.calls[0][0];
    expect(call.visibility).toBe('author');
  });

  it('defaults to team visibility when triggering entry is team', async () => {
    const db = makeDb({
      aiReq: { id: 'ai-6', source_type: 'task_comment', source_id: 'ae-trigger-6', project_slug: null },
      trigEntry: { entity_id: 'task-team', entity_type: 'task', visibility: 'team' },
      placeholder: null,
      taskRow: { project_id: null },
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-6', makeRequest({ response: 'Team answer.' }), env);

    expect(mockPostActivity).toHaveBeenCalledOnce();
    expect(mockPostActivity.mock.calls[0][0].visibility).toBe('team');
  });

  // ── Non-comment source_types do NOT write to timeline ────────────────────────

  it('does not write to timeline for source_type="direct" (non-comment)', async () => {
    const db = makeDb({
      aiReq: { id: 'ai-7', source_type: 'direct', source_id: 'some-id', project_slug: null },
      trigEntry: null,
      placeholder: null,
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse('ai-7', makeRequest({ response: 'Direct answer.' }), env);

    expect(res.status).toBe(200);
    expect(mockPostActivity).not.toHaveBeenCalled();
  });

  // ── status='failed' does NOT write to timeline ────────────────────────────────

  it('does not write to timeline when status is failed', async () => {
    const db = makeDb({
      aiReq: { id: 'ai-8', source_type: 'task_comment', source_id: 'ae-trigger-8', project_slug: null },
      trigEntry: { entity_id: 'task-fail', entity_type: 'task', visibility: 'team' },
      placeholder: { id: 'ae-ph-8' },
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse('ai-8', makeRequest({ response: 'Error occurred.', status: 'failed' }), env);

    expect(res.status).toBe(200);
    expect(mockPostActivity).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  it('returns 400 when response body is empty', async () => {
    const db = makeDb({});
    const env = { DB: db } as unknown as Env;
    const res = await handleUpdateAIResponse('ai-x', makeRequest({ response: '  ' }), env);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status', async () => {
    const db = makeDb({});
    const env = { DB: db } as unknown as Env;
    const res = await handleUpdateAIResponse('ai-x', makeRequest({ response: 'ok', status: 'bogus' }), env);
    expect(res.status).toBe(400);
  });

  it('returns 404 when ai_request row not found after update', async () => {
    const db = makeDb({ aiReq: null });
    const env = { DB: db } as unknown as Env;
    const res = await handleUpdateAIResponse('ai-missing', makeRequest({ response: 'ok' }), env);
    expect(res.status).toBe(404);
  });
});

// ── Submitter notifications ────────────────────────────────────────────────────
//
// INSERT INTO notifications for every completed ai_request, keyed by
// requested_by email → actorSlug (LUT-mapped, e.g. ingra107 → nick-ingraham).
// Idempotent: repeated response-POST retries skip the INSERT when a
// (recipient_slug, 'ai_request', ai_request.id) row already exists.

describe('handleUpdateAIResponse — submitter notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts notification for daily_thought completion with requested_by set', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n1',
        source_type: 'daily_thought',
        source_id: '2026-06-25',
        project_slug: null,
        requested_by: 'ingra107@umn.edu',
        prompt: 'What should I focus on today?',
      },
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse(
      'ai-n1',
      makeRequest({ response: 'Focus on the manuscript revision.' }),
      env,
    );

    expect(res.status).toBe(200);
    const notifInsert = inserts.find(i => /INSERT INTO notifications/.test(i.sql));
    expect(notifInsert).toBeDefined();
    // binds: [id, recipient_slug, type, source_type, source_id, title, body, link]
    expect(notifInsert!.binds[1]).toBe('nick-ingraham');   // actorSlug('ingra107@umn.edu')
    expect(notifInsert!.binds[2]).toBe('update');
    expect(notifInsert!.binds[3]).toBe('ai_request');
    expect(notifInsert!.binds[4]).toBe('ai-n1');           // source_id = ai_request.id
    expect(notifInsert!.binds[5] as string).toContain('Hermes replied to:');
    expect(notifInsert!.binds[6]).toBeNull();              // body = null
    expect(notifInsert!.binds[7]).toBe('/today');          // daily_thought link
  });

  it('daily_thought notification with a task-keyed source_id links to ?openTask= (#521)', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n1b',
        source_type: 'daily_thought',
        source_id: 'task_01hqz3x9k2v8m4n6p7q8r9s0',
        project_slug: null,
        requested_by: 'ingra107@umn.edu',
        prompt: '@hermes what should I do next on this task?',
      },
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    const res = await handleUpdateAIResponse(
      'ai-n1b',
      makeRequest({ response: 'Finish the draft first.' }),
      env,
    );

    expect(res.status).toBe(200);
    const notifInsert = inserts.find(i => /INSERT INTO notifications/.test(i.sql));
    expect(notifInsert).toBeDefined();
    expect(notifInsert!.binds[7]).toBe('/portal/my-tasks?openTask=task_01hqz3x9k2v8m4n6p7q8r9s0');
  });

  it('does not insert notification when requested_by is null', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n2',
        source_type: 'daily_thought',
        source_id: '2026-06-25',
        project_slug: null,
        requested_by: null,
        prompt: 'No submitter',
      },
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-n2', makeRequest({ response: 'Answer.' }), env);

    expect(inserts.find(i => /INSERT INTO notifications/.test(i.sql))).toBeUndefined();
  });

  it('skips INSERT when notification already exists (idempotent retry)', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n3',
        source_type: 'daily_thought',
        source_id: '2026-06-25',
        project_slug: null,
        requested_by: 'ingra107@umn.edu',
        prompt: 'Already notified prompt',
      },
      existingNotif: { id: 'notif-already-exists' },
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-n3', makeRequest({ response: 'Answer.' }), env);

    expect(inserts.find(i => /INSERT INTO notifications/.test(i.sql))).toBeUndefined();
  });

  it('does not insert notification when status=failed', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n4',
        source_type: 'daily_thought',
        source_id: '2026-06-25',
        project_slug: null,
        requested_by: 'ingra107@umn.edu',
        prompt: 'Failed request',
      },
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-n4', makeRequest({ response: 'Error.', status: 'failed' }), env);

    expect(inserts.find(i => /INSERT INTO notifications/.test(i.sql))).toBeUndefined();
  });

  it('task_comment notification links to /portal/my-tasks?open=<entity_id>', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n5',
        source_type: 'task_comment',
        source_id: 'ae-trigger-n5',
        project_slug: null,
        requested_by: 'ingra107@umn.edu',
        prompt: 'Analyze this task for me',
      },
      trigEntry: { entity_id: 'task-n5', entity_type: 'task', visibility: 'team' },
      placeholder: null,
      taskRow: null,
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-n5', makeRequest({ response: 'Task analysis done.' }), env);

    const notifInsert = inserts.find(i => /INSERT INTO notifications/.test(i.sql));
    expect(notifInsert).toBeDefined();
    expect(notifInsert!.binds[7]).toBe('/portal/my-tasks?open=task-n5');
  });

  it('project_comment notification links to /portal/projects/:slug', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n6',
        source_type: 'project_comment',
        source_id: 'ae-trigger-n6',
        project_slug: 'lpv-paper',
        requested_by: 'ingra107@umn.edu',
        prompt: 'Review project status',
      },
      trigEntry: { entity_id: 'proj-n6', entity_type: 'project', visibility: 'team' },
      placeholder: null,
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-n6', makeRequest({ response: 'Project is on track.' }), env);

    const notifInsert = inserts.find(i => /INSERT INTO notifications/.test(i.sql));
    expect(notifInsert).toBeDefined();
    expect(notifInsert!.binds[7]).toBe('/portal/projects/lpv-paper');
  });

  it('uses artifact URL from response text as link when present (all source_types)', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n7',
        source_type: 'task_comment',
        source_id: 'ae-trigger-n7',
        project_slug: null,
        requested_by: 'ingra107@umn.edu',
        prompt: 'Summarize this task',
      },
      trigEntry: { entity_id: 'task-n7', entity_type: 'task', visibility: 'team' },
      placeholder: null,
      taskRow: null,
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    const responseWithArtifact = 'Here is your summary: https://mn-ccore-lab.pages.dev/portal/artifacts/art_abc123def456';

    await handleUpdateAIResponse('ai-n7', makeRequest({ response: responseWithArtifact }), env);

    const notifInsert = inserts.find(i => /INSERT INTO notifications/.test(i.sql));
    expect(notifInsert).toBeDefined();
    // Artifact URL → relative path extracted; /portal/my-tasks link not used.
    expect(notifInsert!.binds[7]).toBe('/portal/artifacts/art_abc123def456');
  });

  it('artifact_comment notification links to /portal/artifacts/:entity_id', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = [];
    const db = makeDb({
      aiReq: {
        id: 'ai-n8',
        source_type: 'artifact_comment',
        source_id: 'ae-trigger-n8',
        project_slug: null,
        requested_by: 'ingra107@umn.edu',
        prompt: 'Revise this artifact',
      },
      trigEntry: { entity_id: 'art_deadbeef', entity_type: 'artifact', visibility: 'team' },
      placeholder: null,
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;

    await handleUpdateAIResponse('ai-n8', makeRequest({ response: 'Artifact revised.' }), env);

    const notifInsert = inserts.find(i => /INSERT INTO notifications/.test(i.sql));
    expect(notifInsert).toBeDefined();
    expect(notifInsert!.binds[7]).toBe('/portal/artifacts/art_deadbeef');
  });
});

// ── handleCreateAIRequest: entity context derivation ───────────────────────────
//
// A typed "@hermes …" prefix on a task compose surface posts source_type
// 'daily_thought' + source_id=<task_id> with NO context. The fenced listener
// resolves ai_requests.context to orient itself; without the token it answered
// with zero awareness of the task. The route derives the token from source_id.

describe('handleCreateAIRequest — entity context derivation', () => {
  /** context is bind index 5 of the ai_requests INSERT. */
  async function createAndGetContext(body: Record<string, unknown>): Promise<unknown> {
    const inserts: { sql: string; binds: unknown[] }[] = [];
    const db = makeDb({
      aiReq: { id: 'ai-new' },
      captureUpdate: (sql, binds) => inserts.push({ sql, binds }),
    });
    const env = { DB: db } as unknown as Env;
    const req = new Request('https://example.com/api/ai-requests', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await handleCreateAIRequest(req, { email: 'nick@umn.edu', name: 'Nick' } as never, env);
    const insert = inserts.find(i => /INSERT INTO ai_requests/.test(i.sql));
    expect(insert).toBeDefined();
    return insert!.binds[5];
  }

  it('derives "task: <id>" for a typed @hermes prefix on a task (daily_thought + task_ id)', async () => {
    const ctx = await createAndGetContext({
      source_type: 'daily_thought',
      source_id: 'task_01KWKFBXABCDEFGHJKMNPQRSTV',
      prompt: 'draft a reply to Trung',
    });
    expect(ctx).toBe('task: task_01KWKFBXABCDEFGHJKMNPQRSTV');
  });

  it('derives "project: <id>" for a proj_ source_id', async () => {
    const ctx = await createAndGetContext({
      source_type: 'daily_thought',
      source_id: 'proj_01KWKFBXABCDEFGHJKMNPQRSTV',
      prompt: 'what is left here?',
    });
    expect(ctx).toBe('project: proj_01KWKFBXABCDEFGHJKMNPQRSTV');
  });

  it('leaves an explicit caller context untouched (dispatchHermes mention lane)', async () => {
    const ctx = await createAndGetContext({
      source_type: 'task_comment',
      source_id: 'deadbeefdeadbeefdeadbeefdeadbeef', // activity_entry id
      prompt: 'thoughts?',
      context: 'task: task_01EXPLICIT',
    });
    expect(ctx).toBe('task: task_01EXPLICIT');
  });

  it('stores NULL for a date-key source_id (Today bar has no entity)', async () => {
    const ctx = await createAndGetContext({
      source_type: 'daily_thought',
      source_id: '2026-07-09',
      prompt: 'what should I focus on?',
    });
    expect(ctx).toBeNull();
  });

  it('stores NULL for an activity-entry source_id with no caller context', async () => {
    const ctx = await createAndGetContext({
      source_type: 'lab_question',
      source_id: 'deadbeefdeadbeefdeadbeefdeadbeef',
      prompt: 'question',
    });
    expect(ctx).toBeNull();
  });
});
