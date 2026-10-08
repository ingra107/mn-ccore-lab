// project-publications.test.ts — #129 published output on a project.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's regex stub recorded each .run() and returned changes=1 for
// any INSERT, so "links with role primary" meant "these three values were
// bound", and the ON CONFLICT upsert, the role column and the idempotent
// delete were never run. Here the link is read back from project_publications,
// a re-link proves the upsert changes the role, and every refusal leaves the
// table empty.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env } from '../helpers';
import {
  handleGetProjectPublications,
  handleLinkProjectPublication,
  handleUnlinkProjectPublication,
  handleGetAllProjectPublications,
  PUBLICATION_ROLES,
} from './project-publications';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

const TEST_KEY = 'test-mode-key-129';
const PROJ_ID = 'proj_01HTESTREADMISSIONS000000';
const PROJ_SLUG = 'clif-icu-readmissions';
const PUB_ID = 'amagai-2025-icu-readmission-epidemiology';

let db: InstanceType<typeof Database>;
let env: Env;
function seed(category = 'CLIF') {
  insertRow(db, 'projects', { id: PROJ_ID, slug: PROJ_SLUG, title: 'ICU Readmissions', category });
  insertRow(db, 'publications', { id: PUB_ID, title: 'ICU Readmissions', authors: '["Amagai S"]', year: 2025 });
}
beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY } as unknown as Env;
});

const links = () => db.prepare('SELECT project_id, publication_id, role FROM project_publications WHERE project_id = ?').all(PROJ_ID);

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as import('../helpers').AuthUser;

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
  beforeEach(() => seed());

  it('links with role primary by default and stores the typed project id', async () => {
    const res = await handleLinkProjectPublication(PROJ_SLUG, post(`/api/projects/${PROJ_SLUG}/publications`, { publication_id: PUB_ID }), user, env);
    expect(res.status).toBe(201);
    expect(links()).toEqual([{ project_id: PROJ_ID, publication_id: PUB_ID, role: 'primary' }]);
  });

  it('accepts every listed role (a re-link updates the role on the one row) and rejects an unlisted one', async () => {
    for (const role of PUBLICATION_ROLES) {
      const res = await handleLinkProjectPublication(PROJ_SLUG, post('/x', { publication_id: PUB_ID, role }), user, env);
      expect(res.status).toBe(201);
      expect(links()).toEqual([{ project_id: PROJ_ID, publication_id: PUB_ID, role }]);
    }
    const before = links();
    const res = await handleLinkProjectPublication(PROJ_SLUG, post('/x', { publication_id: PUB_ID, role: 'main' }), user, env);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Invalid role "main"/);
    expect(links()).toEqual(before);
  });

  it('404s an unknown publication and writes nothing', async () => {
    const res = await handleLinkProjectPublication(PROJ_SLUG, post('/x', { publication_id: 'nope' }), user, env);
    expect(res.status).toBe(404);
    expect(links()).toEqual([]);
  });

  it('400s a missing publication_id', async () => {
    const res = await handleLinkProjectPublication(PROJ_SLUG, post('/x', {}), user, env);
    expect(res.status).toBe(400);
    expect(links()).toEqual([]);
  });
});

describe('PB visibility on link', () => {
  it('a non-PI cannot link on a Peripheral Brain project (403 from the visibility gate)', async () => {
    seed('Peripheral Brain');
    const req = new Request('https://mn-ccore-lab.pages.dev/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'eddington@umn.edu' },
      body: JSON.stringify({ publication_id: PUB_ID }),
    });
    const res = await handleLinkProjectPublication(
      PROJ_SLUG, req, { email: 'eddington@umn.edu', name: 'Casey', slug: 'casey-eddington' } as import('../helpers').AuthUser, env,
    );
    expect(res.status).toBe(403);
    expect(links()).toEqual([]);
  });
});

describe('POST /api/projects/:slug/publications/:pubId/delete', () => {
  beforeEach(() => seed());

  it('deletes by the (project, publication) pair; a second delete is 200 with idempotent:true', async () => {
    insertRow(db, 'project_publications', { project_id: PROJ_ID, publication_id: PUB_ID, role: 'primary' });
    const res = await handleUnlinkProjectPublication(PROJ_SLUG, PUB_ID, get('/x'), user, env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { deleted: boolean } }).data.deleted).toBe(true);
    expect(links()).toEqual([]);

    const again = await handleUnlinkProjectPublication(PROJ_SLUG, PUB_ID, get('/x'), user, env);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { data: { idempotent: boolean } }).data.idempotent).toBe(true);
  });
});

describe('GET /api/projects/:slug/publications', () => {
  it('returns the joined rows with role + count, 400 on an unknown project', async () => {
    seed();
    insertRow(db, 'project_publications', { project_id: PROJ_ID, publication_id: PUB_ID, role: 'primary' });
    const res = await handleGetProjectPublications(PROJ_SLUG, get('/x'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string; role: string; title: string }[]; count: number };
    expect(body.data).toMatchObject([{ id: PUB_ID, role: 'primary', title: 'ICU Readmissions' }]);
    expect(body.count).toBe(1);

    const missing = await handleGetProjectPublications('ghost', get('/x'), env);
    expect(missing.status).toBe(400);
  });
});

describe('GET /api/project-publications', () => {
  it('hides links on a Peripheral Brain project from a caller without PB visibility', async () => {
    seed('Peripheral Brain');
    insertRow(db, 'project_publications', { project_id: PROJ_ID, publication_id: PUB_ID, role: 'primary' });
    const ours = (rows: Array<Record<string, unknown>>) => rows.filter((r) => JSON.stringify(r).includes(PUB_ID));

    const hidden = await handleGetAllProjectPublications(env, false);
    expect(hidden.status).toBe(200);
    expect(ours((await hidden.json() as { data: Array<Record<string, unknown>> }).data)).toEqual([]);

    const shown = await handleGetAllProjectPublications(env, true);
    expect(ours((await shown.json() as { data: Array<Record<string, unknown>> }).data)).toHaveLength(1);
  });
});
