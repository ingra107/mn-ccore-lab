/**
 * ai-requests.test.ts — T4 Hermes response lane + submitter notifications
 *
 * Covers:
 *   - handleUpdateAIResponse for source_type='task_comment': updates placeholder + writes timeline
 *   - handleUpdateAIResponse for source_type='project_comment': same
 *   - visibility inheritance from the triggering entry (author-only @me case)
 *   - placeholder resolution: UPDATE body in-place when placeholder exists,
 *     scoped to the asking thread (#98)
 *   - fallback INSERT when placeholder is missing
 *   - self-gating (Hermes wave Phase 3): the source_type allowlist is GONE — the
 *     writeback fires iff source_id resolves to an activity_entries row, so a
 *     source_id that doesn't (a legacy daily_thought task/date key, 'direct',
 *     a deleted entry) does NOT write, and routing is by the entry's OWN
 *     entity_type (a 'day' ask threads its answer back correctly)
 *   - failed status does NOT write to timeline
 *   - submitter notifications: INSERT on every completion, idempotent, correct link
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The first cut answered each lookup from a canned row (any SQL mentioning
 * 'claude-ai' and 'Thinking' got "the placeholder"), so the thread-scoped
 * placeholder query, the answered_at stamp and the notification idempotency
 * check never ran. Here the ask, its placeholder and any prior notification
 * are real rows, and each case reads the stored result. postActivityEntry
 * (the fresh-INSERT fallback, covered by its own suite) stays mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env } from '../helpers';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

// Stub postActivityEntry so we can assert it was/wasn't called and what it got.
vi.mock('../lib/activity-entry', () => ({
  postActivityEntry: vi.fn().mockResolvedValue({ ok: true, row: { id: 'new-ae-id' } }),
  activityVisibilityGate: vi.fn().mockResolvedValue({ clause: '1=1', binds: [] }),
}));

import { postActivityEntry } from '../lib/activity-entry';
import { handleCreateAIRequest, handleUpdateAIResponse } from './ai-requests';

const mockPostActivity = vi.mocked(postActivityEntry);

let db: InstanceType<typeof Database>;
let env: Env;
beforeEach(() => {
  vi.clearAllMocks();
  db = prodSchemaDb();
  env = { DB: d1Adapter(db) } as unknown as Env;
});

function aiRequest(row: Record<string, unknown>) {
  insertRow(db, 'ai_requests', { prompt: 'a question', status: 'pending', project_slug: null, ...row });
}
function entry(row: Record<string, unknown>) {
  insertRow(db, 'activity_entries', { kind: 'comment', visibility: 'team', actor_slug: 'nick-ingraham', body: '@hermes ?', parent_id: null, ...row });
}
/** The ask (trigger) and, optionally, Hermes's 'Thinking...' placeholder threaded under it. */
function ask(id: string, entityType: string, entityId: string, opts: { visibility?: string; placeholder?: string } = {}) {
  entry({ id, entity_type: entityType, entity_id: entityId, visibility: opts.visibility ?? 'team' });
  if (opts.placeholder) {
    entry({
      id: opts.placeholder, entity_type: entityType, entity_id: entityId, visibility: opts.visibility ?? 'team',
      actor_slug: 'claude-ai', body: 'Thinking about this... (AI response pending)', parent_id: id,
    });
  }
}
const ae = (id: string) => db.prepare('SELECT body, answered_at FROM activity_entries WHERE id = ?').get(id) as { body: string; answered_at: string | null };
const aiRow = (id: string) => db.prepare('SELECT status, response, responded_at FROM ai_requests WHERE id = ?').get(id) as Record<string, unknown>;
const notifications = (sourceId: string) =>
  db.prepare("SELECT recipient_slug, type, title, body, link FROM notifications WHERE source_type = 'ai_request' AND source_id = ?").all(sourceId) as Array<Record<string, unknown>>;

function makeRequest(body: unknown): Request {
  return new Request('https://example.com/api/ai-requests/test-id/response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleUpdateAIResponse — T4 Hermes response lane', () => {
  it('task_comment: updates the placeholder body in place and stamps answered_at; the ai_request is completed', async () => {
    aiRequest({ id: 'ai-1', source_type: 'task_comment', source_id: 'ae-trigger-1' });
    ask('ae-trigger-1', 'task', 'task-123', { placeholder: 'ae-placeholder-1' });

    const res = await handleUpdateAIResponse('ai-1', makeRequest({ response: 'Here is my answer to your question.' }), env);

    expect(res.status).toBe(200);
    expect(ae('ae-placeholder-1').body).toBe('Here is my answer to your question.');
    expect(ae('ae-placeholder-1').answered_at).toBeTruthy();
    expect(aiRow('ai-1')).toMatchObject({ status: 'completed', response: 'Here is my answer to your question.' });
    expect(aiRow('ai-1').responded_at).toBeTruthy();
    expect(mockPostActivity).not.toHaveBeenCalled();
  });

  it('answers land in the asking thread: another thread\'s placeholder on the same entity is left alone (#98)', async () => {
    aiRequest({ id: 'ai-thr', source_type: 'task_comment', source_id: 'ae-ask-b' });
    ask('ae-ask-a', 'task', 'task-thr', { placeholder: 'ae-ph-a' });
    ask('ae-ask-b', 'task', 'task-thr', { placeholder: 'ae-ph-b' });

    await handleUpdateAIResponse('ai-thr', makeRequest({ response: 'Answer for B.' }), env);

    expect(ae('ae-ph-b').body).toBe('Answer for B.');
    expect(ae('ae-ph-a').body).toMatch(/^Thinking about this/);
  });

  it('task_comment: inserts a fresh comment when no placeholder exists', async () => {
    insertRow(db, 'projects', { id: 'proj-111', slug: 'p-111', title: 'P', category: 'MNCCORE' });
    insertRow(db, 'tasks', { id: 'task-456', title: 'T', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: 'proj-111' });
    aiRequest({ id: 'ai-2', source_type: 'task_comment', source_id: 'ae-trigger-2' });
    ask('ae-trigger-2', 'task', 'task-456');

    const res = await handleUpdateAIResponse('ai-2', makeRequest({ response: 'Task analysis complete.' }), env);

    expect(res.status).toBe(200);
    expect(mockPostActivity).toHaveBeenCalledOnce();
    const call = mockPostActivity.mock.calls[0][0];
    expect(call).toMatchObject({
      entityType: 'task', entityId: 'task-456', kind: 'comment', actorSlug: 'claude-ai',
      body: 'Task analysis complete.', fireSideEffects: false, taskProjectId: 'proj-111', parentId: 'ae-trigger-2',
    });
  });

  it('project_comment: updates placeholder body in place when placeholder exists', async () => {
    aiRequest({ id: 'ai-3', source_type: 'project_comment', source_id: 'ae-trigger-3', project_slug: 'my-proj' });
    ask('ae-trigger-3', 'project', 'proj-789', { placeholder: 'ae-ph-project-1' });

    const res = await handleUpdateAIResponse('ai-3', makeRequest({ response: 'Project review done.' }), env);

    expect(res.status).toBe(200);
    expect(ae('ae-ph-project-1').body).toBe('Project review done.');
    expect(mockPostActivity).not.toHaveBeenCalled();
  });

  it('project_comment: inserts fresh comment when no placeholder exists', async () => {
    aiRequest({ id: 'ai-4', source_type: 'project_comment', source_id: 'ae-trigger-4', project_slug: 'my-proj' });
    ask('ae-trigger-4', 'project', 'proj-999');

    const res = await handleUpdateAIResponse('ai-4', makeRequest({ response: 'Project notes summarized.' }), env);

    expect(res.status).toBe(200);
    expect(mockPostActivity).toHaveBeenCalledOnce();
    const call = mockPostActivity.mock.calls[0][0];
    expect(call).toMatchObject({ entityType: 'project', entityId: 'proj-999', actorSlug: 'claude-ai', fireSideEffects: false });
    expect(call.taskProjectId).toBeUndefined();
  });

  it('inherits author visibility from the triggering entry', async () => {
    aiRequest({ id: 'ai-5', source_type: 'task_comment', source_id: 'ae-trigger-5' });
    ask('ae-trigger-5', 'task', 'task-me', { visibility: 'author' });

    await handleUpdateAIResponse('ai-5', makeRequest({ response: 'Private answer.' }), env);

    expect(mockPostActivity).toHaveBeenCalledOnce();
    expect(mockPostActivity.mock.calls[0][0].visibility).toBe('author');
  });

  it('defaults to team visibility when triggering entry is team', async () => {
    aiRequest({ id: 'ai-6', source_type: 'task_comment', source_id: 'ae-trigger-6' });
    ask('ae-trigger-6', 'task', 'task-team');

    await handleUpdateAIResponse('ai-6', makeRequest({ response: 'Team answer.' }), env);

    expect(mockPostActivity.mock.calls[0][0].visibility).toBe('team');
  });

  // ── Self-gating: source_id that doesn't resolve → no timeline write ──────────

  it('does not write to timeline when source_id does not resolve to an activity_entries row', async () => {
    // 'direct' stands in for any source whose source_id isn't an activity_entries
    // id — also a legacy daily_thought task/date key, or a deleted entry.
    aiRequest({ id: 'ai-7', source_type: 'direct', source_id: 'some-id' });
    const before = (db.prepare('SELECT COUNT(*) AS n FROM activity_entries').get() as { n: number }).n;

    const res = await handleUpdateAIResponse('ai-7', makeRequest({ response: 'Direct answer.' }), env);

    expect(res.status).toBe(200);
    expect(mockPostActivity).not.toHaveBeenCalled();
    expect((db.prepare('SELECT COUNT(*) AS n FROM activity_entries').get() as { n: number }).n).toBe(before);
    expect(aiRow('ai-7').status).toBe('completed');
  });

  it('daily_thought (day ask) WRITES the answer back, routed by the entry\'s own entity_type', async () => {
    // source_type='daily_thought' was NOT in the old allowlist, so a day ask's
    // answer would never have threaded back. Now it does.
    aiRequest({ id: 'ai-day', source_type: 'daily_thought', source_id: 'ae-day-root' });
    ask('ae-day-root', 'day', '2026-07-22', { visibility: 'author', placeholder: 'ae-day-ph' });

    const res = await handleUpdateAIResponse('ai-day', makeRequest({ response: 'Focus on the grant today.' }), env);
    expect(res.status).toBe(200);
    expect(ae('ae-day-ph').body).toBe('Focus on the grant today.');
  });

  it('does not write to timeline when status is failed', async () => {
    aiRequest({ id: 'ai-8', source_type: 'task_comment', source_id: 'ae-trigger-8' });
    ask('ae-trigger-8', 'task', 'task-fail', { placeholder: 'ae-ph-8' });

    const res = await handleUpdateAIResponse('ai-8', makeRequest({ response: 'Error occurred.', status: 'failed' }), env);

    expect(res.status).toBe(200);
    expect(mockPostActivity).not.toHaveBeenCalled();
    expect(ae('ae-ph-8').body).toMatch(/^Thinking about this/);
    expect(aiRow('ai-8').status).toBe('failed');
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  it('returns 400 when response body is empty, and changes nothing', async () => {
    aiRequest({ id: 'ai-x', source_type: 'direct', source_id: 's' });
    const res = await handleUpdateAIResponse('ai-x', makeRequest({ response: '  ' }), env);
    expect(res.status).toBe(400);
    expect(aiRow('ai-x').status).toBe('pending');
  });

  it('returns 400 for invalid status', async () => {
    aiRequest({ id: 'ai-x', source_type: 'direct', source_id: 's' });
    const res = await handleUpdateAIResponse('ai-x', makeRequest({ response: 'ok', status: 'bogus' }), env);
    expect(res.status).toBe(400);
    expect(aiRow('ai-x').status).toBe('pending');
  });

  it('returns 404 when ai_request row not found after update', async () => {
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
  it('inserts notification for daily_thought completion with requested_by set', async () => {
    aiRequest({ id: 'ai-n1', source_type: 'daily_thought', source_id: '2026-06-25', requested_by: 'ingra107@umn.edu', prompt: 'What should I focus on today?' });

    const res = await handleUpdateAIResponse('ai-n1', makeRequest({ response: 'Focus on the manuscript revision.' }), env);

    expect(res.status).toBe(200);
    const rows = notifications('ai-n1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient_slug: 'nick-ingraham', type: 'update', body: null, link: '/today' });
    expect(rows[0].title as string).toContain('Hermes replied to:');
  });

  it('daily_thought notification with a task-keyed source_id links to ?openTask= (#521)', async () => {
    aiRequest({ id: 'ai-n1b', source_type: 'daily_thought', source_id: 'task_01hqz3x9k2v8m4n6p7q8r9s0', requested_by: 'ingra107@umn.edu' });
    await handleUpdateAIResponse('ai-n1b', makeRequest({ response: 'Finish the draft first.' }), env);
    expect(notifications('ai-n1b')).toMatchObject([{ link: '/portal/my-tasks?openTask=task_01hqz3x9k2v8m4n6p7q8r9s0' }]);
  });

  it('does not insert notification when requested_by is null', async () => {
    aiRequest({ id: 'ai-n2', source_type: 'daily_thought', source_id: '2026-06-25', requested_by: null });
    await handleUpdateAIResponse('ai-n2', makeRequest({ response: 'Answer.' }), env);
    expect(notifications('ai-n2')).toEqual([]);
  });

  it('a retried response POST does not notify twice (idempotent)', async () => {
    aiRequest({ id: 'ai-n3', source_type: 'daily_thought', source_id: '2026-06-25', requested_by: 'ingra107@umn.edu' });
    await handleUpdateAIResponse('ai-n3', makeRequest({ response: 'Answer.' }), env);
    await handleUpdateAIResponse('ai-n3', makeRequest({ response: 'Answer.' }), env);
    expect(notifications('ai-n3')).toHaveLength(1);
  });

  it('does not insert notification when status=failed', async () => {
    aiRequest({ id: 'ai-n4', source_type: 'daily_thought', source_id: '2026-06-25', requested_by: 'ingra107@umn.edu' });
    await handleUpdateAIResponse('ai-n4', makeRequest({ response: 'Error.', status: 'failed' }), env);
    expect(notifications('ai-n4')).toEqual([]);
  });

  it('task_comment notification links to /portal/my-tasks?open=<entity_id>', async () => {
    aiRequest({ id: 'ai-n5', source_type: 'task_comment', source_id: 'ae-trigger-n5', requested_by: 'ingra107@umn.edu' });
    ask('ae-trigger-n5', 'task', 'task-n5');
    await handleUpdateAIResponse('ai-n5', makeRequest({ response: 'Task analysis done.' }), env);
    expect(notifications('ai-n5')).toMatchObject([{ link: '/portal/my-tasks?open=task-n5' }]);
  });

  it('project_comment notification links to /portal/projects/:slug', async () => {
    aiRequest({ id: 'ai-n6', source_type: 'project_comment', source_id: 'ae-trigger-n6', project_slug: 'lpv-paper', requested_by: 'ingra107@umn.edu' });
    ask('ae-trigger-n6', 'project', 'proj-n6');
    await handleUpdateAIResponse('ai-n6', makeRequest({ response: 'Project is on track.' }), env);
    expect(notifications('ai-n6')).toMatchObject([{ link: '/portal/projects/lpv-paper' }]);
  });

  it('uses artifact URL from response text as link when present (all source_types)', async () => {
    aiRequest({ id: 'ai-n7', source_type: 'task_comment', source_id: 'ae-trigger-n7', requested_by: 'ingra107@umn.edu' });
    ask('ae-trigger-n7', 'task', 'task-n7');
    const responseWithArtifact = 'Here is your summary: https://mn-ccore-lab.pages.dev/portal/artifacts/art_abc123def456';
    await handleUpdateAIResponse('ai-n7', makeRequest({ response: responseWithArtifact }), env);
    // Artifact URL → relative path extracted; /portal/my-tasks link not used.
    expect(notifications('ai-n7')).toMatchObject([{ link: '/portal/artifacts/art_abc123def456' }]);
  });

  it('artifact_comment notification links to /portal/artifacts/:entity_id', async () => {
    aiRequest({ id: 'ai-n8', source_type: 'artifact_comment', source_id: 'ae-trigger-n8', requested_by: 'ingra107@umn.edu' });
    ask('ae-trigger-n8', 'artifact', 'art_deadbeef');
    await handleUpdateAIResponse('ai-n8', makeRequest({ response: 'Artifact revised.' }), env);
    expect(notifications('ai-n8')).toMatchObject([{ link: '/portal/artifacts/art_deadbeef' }]);
  });
});

// ── handleCreateAIRequest: entity context derivation ───────────────────────────
//
// A typed "@hermes …" prefix on a task compose surface posts source_type
// 'daily_thought' + source_id=<task_id> with NO context. The fenced listener
// resolves ai_requests.context to orient itself; without the token it answered
// with zero awareness of the task. The route derives the token from source_id.

describe('handleCreateAIRequest — entity context derivation', () => {
  async function createAndGetContext(body: Record<string, unknown>): Promise<unknown> {
    const req = new Request('https://example.com/api/ai-requests', { method: 'POST', body: JSON.stringify(body) });
    const res = await handleCreateAIRequest(req, { email: 'nick@umn.edu', name: 'Nick' } as never, env);
    expect(res.status).toBe(201);
    const { data } = await res.json() as { data: { id: string } };
    const row = db.prepare('SELECT context, requested_by FROM ai_requests WHERE id = ?').get(data.id) as { context: string | null; requested_by: string };
    expect(row.requested_by).toBe('nick@umn.edu');
    return row.context;
  }

  it('derives "task: <id>" for a typed @hermes prefix on a task (daily_thought + task_ id)', async () => {
    expect(await createAndGetContext({ source_type: 'daily_thought', source_id: 'task_01KWKFBXABCDEFGHJKMNPQRSTV', prompt: 'draft a reply to Trung' }))
      .toBe('task: task_01KWKFBXABCDEFGHJKMNPQRSTV');
  });

  it('derives "project: <id>" for a proj_ source_id', async () => {
    expect(await createAndGetContext({ source_type: 'daily_thought', source_id: 'proj_01KWKFBXABCDEFGHJKMNPQRSTV', prompt: 'what is left here?' }))
      .toBe('project: proj_01KWKFBXABCDEFGHJKMNPQRSTV');
  });

  it('leaves an explicit caller context untouched (dispatchHermes mention lane)', async () => {
    expect(await createAndGetContext({ source_type: 'task_comment', source_id: 'deadbeefdeadbeefdeadbeefdeadbeef', prompt: 'thoughts?', context: 'task: task_01EXPLICIT' }))
      .toBe('task: task_01EXPLICIT');
  });

  it('stores NULL for a date-key source_id (Today bar has no entity)', async () => {
    expect(await createAndGetContext({ source_type: 'daily_thought', source_id: '2026-07-09', prompt: 'what should I focus on?' })).toBeNull();
  });

  it('stores NULL for an activity-entry source_id with no caller context', async () => {
    expect(await createAndGetContext({ source_type: 'lab_question', source_id: 'deadbeefdeadbeefdeadbeefdeadbeef', prompt: 'question' })).toBeNull();
  });
});
