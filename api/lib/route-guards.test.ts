import { describe, it, expect, vi } from 'vitest';
import { withProjectWrite, withOptionalProjectWrite } from './route-guards';
import type { Env } from '../helpers';

// Stub env that resolves any project ref as an MNCCORE project (not PB).
// Non-PI callers can see it (no 403 block).
function stubEnvWithProject(): Env {
  return {
    DB: {
      prepare: (_sql: string) => ({
        bind: () => ({
          first: async () => ({
            id: 'proj-1',
            slug: 'mnccore-proj',
            category: 'MNCCORE',
          }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    },
  } as unknown as Env;
}

// Stub env with no project found (resolve returns null).
function stubEnvNoProject(): Env {
  return {
    DB: {
      prepare: (_sql: string) => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    },
  } as unknown as Env;
}

const stubRequest = () => new Request('https://x/api/x', { method: 'POST' });

describe('withProjectWrite()', () => {
  it('calls the inner handler with the canonical projectId when project_id present', async () => {
    const inner = vi.fn(async (_req: Request, _env: Env, projectId: string) =>
      new Response(JSON.stringify({ projectId }), { headers: { 'Content-Type': 'application/json' } }),
    );
    const guard = withProjectWrite(inner);
    const res = await guard(stubRequest(), stubEnvWithProject(), { project_id: 'mnccore-proj' });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
    // projectId arg is the canonical typed PK (P2: proj.id, not slug)
    expect(inner.mock.calls[0][2]).toBe('proj-1');
  });

  it('returns 400 when body has no project_id', async () => {
    const inner = vi.fn();
    const guard = withProjectWrite(inner);
    const res = await guard(stubRequest(), stubEnvWithProject(), {});
    expect(res.status).toBe(400);
    expect(inner).not.toHaveBeenCalled();
  });

  it('returns 404 when project ref resolves to nothing', async () => {
    const inner = vi.fn();
    const guard = withProjectWrite(inner);
    const res = await guard(stubRequest(), stubEnvNoProject(), { project_id: 'nonexistent' });
    // resolveAndGuardProject returns a block (400 or 404) for unknown refs
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(inner).not.toHaveBeenCalled();
  });
});

describe('withOptionalProjectWrite()', () => {
  it('calls inner with null projectId when project_id is absent', async () => {
    const inner = vi.fn(async (_req: Request, _env: Env, projectId: string | null) =>
      new Response(JSON.stringify({ projectId }), { headers: { 'Content-Type': 'application/json' } }),
    );
    const guard = withOptionalProjectWrite(inner);
    const res = await guard(stubRequest(), stubEnvWithProject(), {});
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledWith(expect.anything(), expect.anything(), null, expect.anything());
  });

  it('calls inner with resolved projectId when project_id is present', async () => {
    const inner = vi.fn(async (_req: Request, _env: Env, projectId: string | null) =>
      new Response(JSON.stringify({ projectId }), { headers: { 'Content-Type': 'application/json' } }),
    );
    const guard = withOptionalProjectWrite(inner);
    const res = await guard(stubRequest(), stubEnvWithProject(), { project_id: 'mnccore-proj' });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
    // projectId arg is the canonical typed PK (P2: proj.id, not slug)
    expect(inner.mock.calls[0][2]).toBe('proj-1');
  });

  it('returns block when project_id is present but project not found', async () => {
    const inner = vi.fn();
    const guard = withOptionalProjectWrite(inner);
    const res = await guard(stubRequest(), stubEnvNoProject(), { project_id: 'nonexistent' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(inner).not.toHaveBeenCalled();
  });
});
