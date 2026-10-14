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

// Real migrated schema, no stubbed DB: the stubs above answered any SQL, so a
// SELECT naming a column the table lacks passed here and 500'd in prod
// (expertise tags, calendar feeds, subtasks; overnight audit 2026-10-14).
describe('idempotentDelete() on the real schema', () => {
  it('hard-deletes rows of tables with and without a project column', async () => {
    const { prodSchemaDb, d1Adapter, insertRow } = await import('../test-support/prod-schema-db')
    const db = prodSchemaDb()
    const env = { DB: d1Adapter(db) } as unknown as Env
    insertRow(db, 'expertise_tags', { id: 'e1', member_slug: 'nate-mesfin', tag: 'Sepsis' })
    const tables = ['expertise_tags']
    for (const table of tables) {
      const res = await idempotentDelete({ table, id: 'e1', mode: 'hard', request: new Request('https://x'), env })
      expect(res.status, table).toBe(200)
      expect((await res.json() as { data: { idempotent: boolean } }).data.idempotent, table).toBe(false)
    }
    for (const table of ['user_calendar_feeds', 'task_subtasks', 'conference_submissions', 'paper_project_links']) {
      const projectColumn = table === 'paper_project_links' ? 'project_slug' : undefined
      const res = await idempotentDelete({ table, id: 'absent', mode: 'hard', request: new Request('https://x'), env, projectColumn })
      expect(res.status, table).toBe(200)
    }
  })

  it('throws when a named project column does not exist, rather than skipping the gate', async () => {
    const { prodSchemaDb, d1Adapter, insertRow } = await import('../test-support/prod-schema-db')
    const db = prodSchemaDb()
    const env = { DB: d1Adapter(db) } as unknown as Env
    insertRow(db, 'expertise_tags', { id: 'e2', member_slug: 'nate-mesfin', tag: 'ARDS' })
    await expect(idempotentDelete({ table: 'expertise_tags', id: 'e2', mode: 'hard', request: new Request('https://x'), env, projectColumn: 'project_slug' }))
      .rejects.toThrow(/no column project_slug/)
  })
})
