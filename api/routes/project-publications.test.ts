// project-publications.test.ts — #129 published output on a project.
//
// Regex-routed D1 stub, same shape as member-featured-publications.test.ts.
// `written` records every .run() so a test can assert WHAT was written and
// THAT nothing was written on a rejected request.

import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import {
  handleGetProjectPublications,
  handleLinkProjectPublication,
  handleUnlinkProjectPublication,
  handleGetAllProjectPublications,
  PUBLICATION_ROLES,
} from './project-publications';

const TEST_KEY = 'test-mode-key-129';
const PROJ_ID = 'proj_01HTESTREADMISSIONS000000';
const PROJ_SLUG = 'clif-icu-readmissions';
const PUB_ID = 'amagai-2025-icu-readmission-epidemiology';

interface Written { sql: string; binds: unknown[] }

interface StubStmt {
  bind: (...args: unknown[]) => StubStmt;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
}

function makeDb(opts: {
  projectExists?: boolean;
  projectCategory?: string | null;
  publicationExists?: boolean;
  linked?: Record<string, unknown>[];
  deleteChanges?: number;
  written: Written[];
}) {
  return {
    prepare: (sql: string) => {
      const binds: unknown[] = [];
      const stmt: StubStmt = {
        bind: (...args: unknown[]) => { binds.push(...args); return stmt; },
        run: async () => {
          opts.written.push({ sql, binds: [...binds] });
          const changes = /^DELETE FROM project_publications/.test(sql.trim())
            ? (opts.deleteChanges ?? 1)
            : 1;
          return { success: true, meta: { changes } };
        },
        first: async () => {
          if (/FROM projects WHERE \(id = \? OR slug = \?\)/.test(sql)) {
            return opts.projectExists === false
              ? null
              : { id: PROJ_ID, slug: PROJ_SLUG, category: opts.projectCategory ?? 'CLIF' };
          }
          if (/FROM publications WHERE id = \?/.test(sql)) {
            return opts.publicationExists === false ? null : { id: PUB_ID, title: 'ICU Readmissions' };
          }
          return null; // lab_settings PI lookup → fallback list
        },
        all: async () => {
          if (/FROM project_publications pp/.test(sql)) {
            return { results: opts.linked ?? [] };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
    batch: async () => [],
  };
}

function makeEnv(db: unknown): Env {
  return { DB: db, TEST_MODE_KEY: TEST_KEY } as unknown as Env;
}

const user = { email: 'ingra107@umn.edu', name: 'Nick' } as import('../helpers').AuthUser;

function post(path: string, body: unknown): Request {
  return new Request(`https://mn-ccore-lab.pages.dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'ingra107@umn.edu' },
    body: JSON.stringify(body),
  });
}
function get(path: string): Request {
  return new Request(`https://mn-ccore-lab.pages.dev${path}`, {
    headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'ingra107@umn.edu' },
  });
}

describe('POST /api/projects/:slug/publications', () => {
  it('links with role primary by default and writes the typed project id', async () => {
    const written: Written[] = [];
    const res = await handleLinkProjectPublication(
      PROJ_SLUG, post(`/api/projects/${PROJ_SLUG}/publications`, { publication_id: PUB_ID }), user, makeEnv(makeDb({ written })),
    );
    expect(res.status).toBe(201);
    const ins = written.find((w) => /INSERT INTO project_publications/.test(w.sql));
    expect(ins?.binds).toEqual([PROJ_ID, PUB_ID, 'primary']);
    expect(ins?.sql).toMatch(/ON CONFLICT\(project_id, publication_id\) DO UPDATE SET role/);
  });

  it('accepts every listed role and rejects an unlisted one before touching the DB', async () => {
    for (const role of PUBLICATION_ROLES) {
      const written: Written[] = [];
      const res = await handleLinkProjectPublication(
        PROJ_SLUG, post('/x', { publication_id: PUB_ID, role }), user, makeEnv(makeDb({ written })),
      );
      expect(res.status).toBe(201);
    }
    const written: Written[] = [];
    const res = await handleLinkProjectPublication(
      PROJ_SLUG, post('/x', { publication_id: PUB_ID, role: 'main' }), user, makeEnv(makeDb({ written })),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Invalid role "main"/);
    expect(written).toEqual([]);
  });

  it('404s an unknown publication and writes nothing', async () => {
    const written: Written[] = [];
    const res = await handleLinkProjectPublication(
      PROJ_SLUG, post('/x', { publication_id: 'nope' }), user, makeEnv(makeDb({ written, publicationExists: false })),
    );
    expect(res.status).toBe(404);
    expect(written).toEqual([]);
  });

  it('400s a missing publication_id', async () => {
    const written: Written[] = [];
    const res = await handleLinkProjectPublication(PROJ_SLUG, post('/x', {}), user, makeEnv(makeDb({ written })));
    expect(res.status).toBe(400);
    expect(written).toEqual([]);
  });

  it('a non-PI cannot link on a Peripheral Brain project (403 from the visibility gate)', async () => {
    const written: Written[] = [];
    const req = new Request('https://mn-ccore-lab.pages.dev/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'eddington@umn.edu' },
      body: JSON.stringify({ publication_id: PUB_ID }),
    });
    const res = await handleLinkProjectPublication(
      PROJ_SLUG, req, { email: 'eddington@umn.edu', name: 'Casey' } as import('../helpers').AuthUser,
      makeEnv(makeDb({ written, projectCategory: 'Peripheral Brain' })),
    );
    expect(res.status).toBe(403);
    expect(written).toEqual([]);
  });
});

describe('POST /api/projects/:slug/publications/:pubId/delete', () => {
  it('deletes by the (project, publication) pair', async () => {
    const written: Written[] = [];
    const res = await handleUnlinkProjectPublication(PROJ_SLUG, PUB_ID, get('/x'), user, makeEnv(makeDb({ written })));
    expect(res.status).toBe(200);
    const del = written.find((w) => /^DELETE FROM project_publications/.test(w.sql.trim()));
    expect(del?.binds).toEqual([PROJ_ID, PUB_ID]);
    expect(((await res.json()) as { data: { deleted: boolean } }).data.deleted).toBe(true);
  });

  it('is idempotent: a second delete is 200 with idempotent:true', async () => {
    const written: Written[] = [];
    const res = await handleUnlinkProjectPublication(
      PROJ_SLUG, PUB_ID, get('/x'), user, makeEnv(makeDb({ written, deleteChanges: 0 })),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { idempotent: boolean } }).data.idempotent).toBe(true);
  });
});

describe('GET /api/projects/:slug/publications', () => {
  it('returns the joined rows with role + count, 400 on an unknown project', async () => {
    const linked = [{ id: PUB_ID, title: 'ICU Readmissions', year: 2025, role: 'primary' }];
    const res = await handleGetProjectPublications(PROJ_SLUG, get('/x'), makeEnv(makeDb({ written: [], linked })));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string; role: string }[]; count: number };
    expect(body.data[0].role).toBe('primary');
    expect(body.count).toBe(1);

    const missing = await handleGetProjectPublications('ghost', get('/x'), makeEnv(makeDb({ written: [], projectExists: false })));
    expect(missing.status).toBe(400);
  });
});

describe('GET /api/project-publications', () => {
  it('binds the PB-visibility flag the caller carries', async () => {
    let seen: unknown[] = [];
    const db = {
      prepare: (sql: string) => {
        const binds: unknown[] = [];
        const stmt = {
          bind: (...a: unknown[]) => { binds.push(...a); return stmt; },
          all: async () => { seen = [...binds]; expect(sql).toMatch(/JOIN publications p/); return { results: [] }; },
          first: async () => null,
          run: async () => ({ success: true, meta: { changes: 0 } }),
        };
        return stmt;
      },
      batch: async () => [],
    };
    const res = await handleGetAllProjectPublications(get('/x'), makeEnv(db), false);
    expect(res.status).toBe(200);
    expect(seen).toEqual([0]);
    await handleGetAllProjectPublications(get('/x'), makeEnv(db), true);
    expect(seen).toEqual([1]);
  });
});
