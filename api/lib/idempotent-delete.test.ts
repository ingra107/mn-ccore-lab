import { describe, it, expect } from 'vitest';
import { idempotentDelete } from './idempotent-delete';
import type { Env } from '../helpers';

function envWithRow(row: any, deleteChanges = 1): Env {
  return {
    DB: {
      prepare: (_sql: string) => ({
        bind: () => ({
          first: async () => row,
          run: async () => ({ meta: { changes: deleteChanges } }),
        }),
      }),
    },
  } as unknown as Env;
}

// Tracking stub that records the SQL issued by prepare().bind().run().
// Used by M33 tombstone tests to assert the UPDATE SQL shape.
function envWithRowTracking(row: any) {
  let lastRunSql = '';
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => row,
          run: async () => {
            lastRunSql = sql;
            return { meta: { changes: 1 } };
          },
        }),
      }),
    },
    _lastRunSql: () => lastRunSql,
  } as unknown as Env & { _lastRunSql: () => string };
  return env as typeof env;
}

describe('idempotentDelete() — soft mode', () => {
  it('returns idempotent:true when row already soft-deleted', async () => {
    const env = envWithRow({ id: 'r1', deleted_at: '2026-05-28T00:00:00Z', project_id: null });
    const res = await idempotentDelete({
      table: 'submission_events',
      id: 'r1',
      mode: 'soft',
      request: new Request('https://x'),
      env,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ data: { id: 'r1', deleted: true, idempotent: true } });
  });

  it('returns idempotent:false when row is freshly soft-deleted', async () => {
    const env = envWithRow({ id: 'r1', deleted_at: null, project_id: null });
    const res = await idempotentDelete({
      table: 'submission_events',
      id: 'r1',
      mode: 'soft',
      request: new Request('https://x'),
      env,
    });
    const body = await res.json();
    expect(body).toMatchObject({ data: { id: 'r1', deleted: true, idempotent: false } });
  });

  it('returns 404 hiddenResource when row not found', async () => {
    const env = envWithRow(null);
    const res = await idempotentDelete({
      table: 'submission_events',
      id: 'r1',
      mode: 'soft',
      request: new Request('https://x'),
      env,
    });
    expect(res.status).toBe(404);
  });
});

// M33 regression tests (2026-05-29): Site 2 forward guard.
// idempotentDelete soft mode must co-set status='deleted' for tasks/projects
// so Hub tombstones read status='deleted' AND deleted_at IS NOT NULL.
// PB's pull guard (hub.py:1315-1339) refuses rows that set deleted_at without
// setting status — Site 2 was the Hub-UI-initiated soft-delete path.
describe('M33 forward guard — idempotentDelete() soft mode status co-set (Site 2)', () => {
  it('includes status=deleted in UPDATE SQL for tasks table', async () => {
    const env = envWithRowTracking({ id: 't1', deleted_at: null, project_id: null });
    await idempotentDelete({
      table: 'tasks',
      id: 't1',
      mode: 'soft',
      request: new Request('https://x'),
      env: env as unknown as Env,
    });
    const sql = (env as any)._lastRunSql();
    expect(sql).toContain("status = 'deleted'");
    expect(sql).toContain('deleted_at = datetime');
  });

  it('includes status=deleted in UPDATE SQL for projects table', async () => {
    const env = envWithRowTracking({ id: 'proj1', deleted_at: null, project_id: null });
    await idempotentDelete({
      table: 'projects',
      id: 'proj1',
      mode: 'soft',
      request: new Request('https://x'),
      env: env as unknown as Env,
    });
    const sql = (env as any)._lastRunSql();
    expect(sql).toContain("status = 'deleted'");
    expect(sql).toContain('deleted_at = datetime');
  });

  it('does NOT include status in UPDATE SQL for non-status-bearing tables (inbox_events)', async () => {
    // inbox_events is soft-delete capable but has no status column — must not co-set.
    const env = envWithRowTracking({ id: 'ie1', deleted_at: null, project_id: null });
    await idempotentDelete({
      table: 'inbox_events',
      id: 'ie1',
      mode: 'soft',
      request: new Request('https://x'),
      env: env as unknown as Env,
    });
    const sql = (env as any)._lastRunSql();
    expect(sql).not.toContain("status = 'deleted'");
    expect(sql).toContain('deleted_at = datetime');
  });
});

describe('idempotentDelete() — hard mode', () => {
  it('returns idempotent:false when DELETE affected a row', async () => {
    // envWithRow({ id, project_id: null }, 1): first() returns existing row,
    // run() returns changes=1.
    const env = envWithRow({ id: 'r1', project_id: null }, 1);
    const res = await idempotentDelete({
      table: 'conference_submissions',
      id: 'r1',
      mode: 'hard',
      request: new Request('https://x'),
      env,
    });
    const body = await res.json();
    expect(body).toMatchObject({ data: { id: 'r1', deleted: true, idempotent: false } });
  });

  it('returns idempotent:true when DELETE affected 0 rows (already gone)', async () => {
    // envWithRow(null, 0): first() returns null (no pre-flight row to gate on),
    // run() returns changes=0. Hard mode: missing row IS the idempotent case.
    const env = envWithRow(null, 0);
    const res = await idempotentDelete({
      table: 'conference_submissions',
      id: 'r1',
      mode: 'hard',
      request: new Request('https://x'),
      env,
    });
    const body = await res.json();
    expect(body).toMatchObject({ data: { id: 'r1', deleted: true, idempotent: true } });
  });
});
