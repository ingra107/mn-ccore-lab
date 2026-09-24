// links.role.test.ts -- POST /api/links/:id/role (#2089 archive/restore, #2093 domain)
//
// The route's own decisions are under test: the generated links.role domain,
// the project-owner-only rule a domain can never express, the visibility gate,
// and the exact mutation it hands the write path. applyUpdate itself is mocked
// -- its CAS/commit behaviour has its own suites (mutations.*.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env, AuthUser } from '../helpers';

const applyUpdate = vi.fn();
vi.mock('./mutations', () => ({ applyUpdate: (...args: unknown[]) => applyUpdate(...args) }));

import { handleSetLinkRole } from './links';
import enumDomains from '../enum-domains.generated.json';

const USER: AuthUser = { email: 'ingra107@umn.edu', slug: 'nick-ingraham', isPi: true };

type Row = Record<string, unknown>;

function makeEnv(links: Record<string, Row>, projects: Record<string, Row> = {}): Env {
  const prepare = (sql: string) => {
    let vals: unknown[] = [];
    const stmt = {
      bind: (...v: unknown[]) => { vals = v; return stmt; },
      first: async () => {
        if (/FROM links/i.test(sql)) return links[vals[0] as string] ?? null;
        if (/FROM projects/i.test(sql)) return projects[vals[0] as string] ?? null;
        return null;
      },
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 0 } }),
    };
    return stmt;
  };
  return { DB: { prepare } } as unknown as Env;
}

function req(body: unknown): Request {
  return new Request('https://mn-ccore-lab.pages.dev/api/links/x/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const PROJECT_LINK: Row = { id: 'link_P', owner_table: 'projects', owner_id: 'proj_A', role: 'key' };
const TASK_LINK: Row = { id: 'link_T', owner_table: 'tasks', owner_id: 'task_A', role: 'key' };
const PROJECTS = { proj_A: { id: 'proj_A', category: 'CLIF' } };

beforeEach(() => {
  applyUpdate.mockReset();
  applyUpdate.mockResolvedValue({ mutation_id: 'mut_x', status: 'accepted', canonical_payload: { id: 'link_P', role: 'archive' } });
});

describe('links.role enum domain (generated, #2093)', () => {
  it('ships in the Hub copy as exactly key|archive, non-nullable, no derived', () => {
    const role = (enumDomains as { tables: Record<string, Record<string, unknown>> }).tables.links.role;
    expect(role).toEqual({ canonical: ['key', 'archive'], legacy_aliases: {}, nullable: false });
  });
});

describe('handleSetLinkRole', () => {
  it('archives a project link through applyUpdate with a hub_ui origin and a role-only patch', async () => {
    const res = await handleSetLinkRole('link_P', req({ role: 'archive' }), USER, makeEnv({ link_P: PROJECT_LINK }, PROJECTS));
    expect(res.status).toBe(200);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    const mut = applyUpdate.mock.calls[0][1];
    expect(mut).toMatchObject({
      table: 'links', op: 'update', record_id: 'link_P',
      patch: { role: 'archive' }, base_seq: null,
    });
    expect(mut.origin_machine).toMatch(/^hub_ui:/);
    expect(await res.json()).toEqual({ data: { id: 'link_P', role: 'archive' } });
  });

  it('canonicalizes case forward (Archive -> archive)', async () => {
    await handleSetLinkRole('link_P', req({ role: 'Archive' }), USER, makeEnv({ link_P: PROJECT_LINK }, PROJECTS));
    expect(applyUpdate.mock.calls[0][1].patch).toEqual({ role: 'archive' });
  });

  it.each([['keys'], ['derived'], [''], [null], [42]])('rejects role %j with 400 and writes nothing', async (role) => {
    const res = await handleSetLinkRole('link_P', req({ role }), USER, makeEnv({ link_P: PROJECT_LINK }, PROJECTS));
    expect(res.status).toBe(400);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('refuses a task-owned link: archive there is a silent tombstone', async () => {
    const res = await handleSetLinkRole('link_T', req({ role: 'archive' }), USER, makeEnv({ link_T: TASK_LINK }, PROJECTS));
    expect(res.status).toBe(400);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('404s a missing or tombstoned link', async () => {
    const res = await handleSetLinkRole('link_gone', req({ role: 'archive' }), USER, makeEnv({}, PROJECTS));
    expect(res.status).toBe(404);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('403s a Peripheral Brain project link for a non-PI caller', async () => {
    const env = makeEnv({ link_P: PROJECT_LINK }, { proj_A: { id: 'proj_A', category: 'Peripheral Brain' } });
    const res = await handleSetLinkRole('link_P', req({ role: 'archive' }), { ...USER, isPi: false }, env);
    expect(res.status).toBe(403);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op read when the role already matches', async () => {
    const res = await handleSetLinkRole('link_P', req({ role: 'key' }), USER, makeEnv({ link_P: PROJECT_LINK }, PROJECTS));
    expect(res.status).toBe(200);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('surfaces a refused write as 409 so the page rolls back', async () => {
    applyUpdate.mockResolvedValue({ mutation_id: 'mut_x', status: 'conflict', reason: 'cas' });
    const res = await handleSetLinkRole('link_P', req({ role: 'archive' }), USER, makeEnv({ link_P: PROJECT_LINK }, PROJECTS));
    expect(res.status).toBe(409);
  });

  it('400s a body that is not JSON', async () => {
    const res = await handleSetLinkRole('link_P', req('not json'), USER, makeEnv({ link_P: PROJECT_LINK }, PROJECTS));
    expect(res.status).toBe(400);
  });
});
