import { describe, it, expect } from 'vitest';
import { handlePBCapture } from './pb-sector';

// Minimal mock for D1Database — chains prepare().bind().run() and
// prepare().bind().all() calls without a real database.
function makeMockDb() {
  const stmt = {
    bind: (..._args: unknown[]) => stmt,
    run: () => Promise.resolve({ success: true, meta: {}, results: [] }),
    first: () => Promise.resolve(null),
    all: () => Promise.resolve({ success: true, meta: {}, results: [] }),
  };
  return {
    prepare: (_sql: string) => stmt,
    batch: (_stmts: unknown[]) => Promise.resolve([]),
  };
}

function makeMockEnv() {
  return {
    DB: makeMockDb(),
  };
}

describe('handlePBCapture — unsupported types', () => {
  it('returns 400 for type=note', async () => {
    const req = new Request('https://example/api/pb-sector/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'note', text: 'a note' }),
    });
    const env = makeMockEnv();
    const user = { id: 'u_test', email: 'test@example.com' };
    const response = await handlePBCapture(req, user as never, env as never);
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/unsupported.*type/i);
  });

  it('returns 400 for type=urgent', async () => {
    const req = new Request('https://example/api/pb-sector/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'urgent', text: 'something urgent' }),
    });
    const env = makeMockEnv();
    const user = { id: 'u_test', email: 'test@example.com' };
    const response = await handlePBCapture(req, user as never, env as never);
    expect(response.status).toBe(400);
  });

  it('still accepts type=task', async () => {
    const req = new Request('https://example/api/pb-sector/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'task', text: 'do thing' }),
    });
    const env = makeMockEnv();
    const user = { id: 'u_test', email: 'test@example.com' };
    const response = await handlePBCapture(req, user as never, env as never);
    expect(response.status).toBe(201);
  });

  it('still accepts type=idea', async () => {
    const req = new Request('https://example/api/pb-sector/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'idea', text: 'an idea' }),
    });
    const env = makeMockEnv();
    const user = { id: 'u_test', email: 'test@example.com' };
    const response = await handlePBCapture(req, user as never, env as never);
    expect(response.status).toBe(201);
  });
});
