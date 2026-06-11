/**
 * ai-requests.test.ts — T4 Hermes response lane
 *
 * Covers:
 *   - handleUpdateAIResponse for source_type='task_comment': updates placeholder + writes timeline
 *   - handleUpdateAIResponse for source_type='project_comment': same
 *   - visibility inheritance from the triggering entry (author-only @me case)
 *   - placeholder resolution: UPDATE body in-place when placeholder exists
 *   - fallback INSERT when placeholder is missing
 *   - non-comment source_types (e.g. 'direct') do NOT write to timeline
 *   - failed status does NOT write to timeline
 */

import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../helpers';

// Stub postActivityEntry so we can assert it was/wasn't called and what it got.
vi.mock('../lib/activity-entry', () => ({
  postActivityEntry: vi.fn().mockResolvedValue({ ok: true, row: { id: 'new-ae-id' } }),
  activityVisibilityGate: vi.fn().mockResolvedValue({ clause: '1=1', binds: [] }),
}));

import { postActivityEntry } from '../lib/activity-entry';
import { handleUpdateAIResponse } from './ai-requests';

const mockPostActivity = vi.mocked(postActivityEntry);

// ── DB stub factory ────────────────────────────────────────────────────────────

type RowKey = 'aiReq' | 'trigEntry' | 'placeholder';

function makeDb(opts: {
  aiReq?: Record<string, unknown> | null;
  trigEntry?: Record<string, unknown> | null;
  placeholder?: Record<string, unknown> | null;
  taskRow?: { project_id: string | null } | null;
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
