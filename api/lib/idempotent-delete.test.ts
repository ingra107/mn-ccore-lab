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
