// handlePBCapture (POST /api/pb-sector/capture): only task and idea captures.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's stub accepted every write and every batch without reading
// them, so "still accepts type=task" only proved the route returned 201 -- a
// task the schema refuses would have passed. Here each accepted capture is read
// back from its table, and each refused one is checked to have written nothing.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { handlePBCapture } from './pb-sector';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';

let db: InstanceType<typeof Database>;
let env: { DB: ReturnType<typeof d1Adapter> };
beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db) };
});

const user = { id: 'u_test', email: 'test@example.com' };
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

function capture(body: unknown) {
  const req = new Request('https://example/api/pb-sector/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handlePBCapture(req, user as never, env as never);
}

describe('handlePBCapture — unsupported types', () => {
  it('returns 400 for type=note, and writes nothing', async () => {
    const before = { tasks: count('tasks'), ideas: count('ideas') };
    const response = await capture({ type: 'note', text: 'a note' });
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/unsupported.*type/i);
    expect({ tasks: count('tasks'), ideas: count('ideas') }).toEqual(before);
  });

  it('returns 400 for type=urgent', async () => {
    const response = await capture({ type: 'urgent', text: 'something urgent' });
    expect(response.status).toBe(400);
  });

  it('still accepts type=task, and the task is stored', async () => {
    const response = await capture({ type: 'task', text: 'do thing' });
    expect(response.status).toBe(201);
    const { data } = await response.json() as { data: { id: string; type: string } };
    expect(data.type).toBe('task');
    const row = db.prepare('SELECT title, deleted_at FROM tasks WHERE id = ?').get(data.id) as { title: string; deleted_at: string | null } | undefined;
    expect(row?.title).toBe('do thing');
    expect(row?.deleted_at).toBeNull();
  });

  it('still accepts type=idea, and the idea is stored', async () => {
    const response = await capture({ type: 'idea', text: 'an idea' });
    expect(response.status).toBe(201);
    const { data } = await response.json() as { data: { id: string } };
    // PB captures are Nick's: submitted_by is pinned, not the caller's email.
    expect(db.prepare('SELECT title, submitted_by, status FROM ideas WHERE id = ?').get(data.id)).toEqual({ title: 'an idea', submitted_by: 'nick-ingraham', status: 'new' });
  });
});
