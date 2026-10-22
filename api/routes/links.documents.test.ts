// links.documents.test.ts -- project documents on `links` (PB backlog #151).
//
// Runs on the migration-chain database (api/test-support/prod-schema-db.ts):
// schema-v145's link_kinds table and its links.kind FK, the partial UNIQUE on
// the live natural key, the seq triggers and FK enforcement are the real ones.
// Every claim reads the STORED rows.
//
// The two tests codex specified for the reconciled plan:
//   (a) an invalid kind is refused on EVERY path -- /api/mutations, a direct
//       applyInsert/applyUpdate call, a link route and raw SQL -- and a 15th
//       vocabulary row works with no code change (write -> pull -> label);
//   (b) the lifecycle archive -> sync -> writer replay -> restore keeps the task
//       link's identity and count; the project page collapses it into
//       Archived, then restores it under "From tasks"; no project copy is
//       created; Gmail never reaches "From tasks"; a task moved to another
//       project carries its link's state.
// Plus promote (COPY, idempotent), add-document, and the task-card dedup.
//
// Decision: PB Context/Decisions/2026-10-22-project-documents-on-links.md.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Env, AuthUser } from '../helpers'
import { handleMutations, applyInsert, applyUpdate, type Mutation } from './mutations'
import {
  handleGetLinks, handleGetProjectLinks, handleGetTaskLinks,
  handleUpdateLink, handlePromoteLink, handleCreateProjectLink,
} from './links'
import { mirrorArtifactLink } from '../lib/artifact-link-mirror'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { nowInstant } from '../lib/time'

const API_KEY = 'test-api-key'
const USER: AuthUser = { email: 'ingra107@umn.edu', slug: 'nick-ingraham', isPi: true }
const PROJ = 'proj_01DOCS0000000000000000000A'
const OTHER = 'proj_01DOCS0000000000000000000B'
const TASK = 'task_01DOCS0000000000000000001'
const DOC = 'https://docs.google.com/document/d/1DOCSAIMS/edit'
const GMAIL = 'https://mail.google.com/mail/u/1/#inbox/1a0e5f718220a235'

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db), PB_API_KEY: API_KEY } as unknown as Env
  insertRow(db, 'projects', { id: PROJ, slug: 'docs-a', title: 'Docs A', category: 'MNCCORE' })
  insertRow(db, 'projects', { id: OTHER, slug: 'docs-b', title: 'Docs B', category: 'MNCCORE' })
  insertRow(db, 'tasks', {
    id: TASK, title: 'Draft aims', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: PROJ,
  })
})

const post = (path: string, body: unknown) => new Request(`https://h${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify(body),
})
const get = (path: string) => new Request(`https://h${path}`, { headers: { Authorization: `Bearer ${API_KEY}` } })

function seedLink(id: string, extra: Record<string, unknown> = {}) {
  return insertRow(db, 'links', {
    id, owner_table: 'tasks', owner_id: TASK, role: 'key', type: 'google_doc',
    canonical_url: DOC, short_title: 'Aims', sort_order: 0, ...extra,
  })
}
const row = (id: string) => db.prepare('SELECT * FROM links WHERE id = ?').get(id) as Record<string, unknown> | undefined
const liveCount = (ownerTable: string, ownerId: string) =>
  (db.prepare('SELECT COUNT(*) n FROM links WHERE owner_table = ? AND owner_id = ? AND deleted_at IS NULL').get(ownerTable, ownerId) as { n: number }).n

function mut(over: Partial<Mutation>): Mutation {
  return {
    mutation_id: `mut_${Math.random().toString(36).slice(2, 12)}`, origin_machine: 'home',
    table: 'links', op: 'insert', record_id: `link_${Math.random().toString(36).slice(2, 12)}`,
    base_seq: null, base_row_hash: null, client_ts: nowInstant(), issued_at: nowInstant(), ...over,
  }
}

async function viaMutations(m: Mutation): Promise<{ status: string; reason?: string }> {
  const res = await handleMutations(post('/api/mutations', { mutations: [m] }), USER, env)
  const body = (await res.json()) as { results: Array<{ status: string; reason?: string }> }
  return body.results[0]
}

type ProjectPage = { links: Array<Record<string, unknown>>; taskLinks: Array<Record<string, unknown>>; kinds: Array<{ key: string; label: string }> }
async function projectPage(slug = 'docs-a'): Promise<ProjectPage> {
  const res = await handleGetProjectLinks(slug, get(`/api/projects/${slug}/links`), env, true)
  expect(res.status).toBe(200)
  return (await res.json()) as ProjectPage
}

// ── (a) kind is refused on every path; a new kind is data ─────────────────────

describe('links.kind: the link_kinds foreign key is the domain (schema-v145)', () => {
  it('seeds exactly Nick\'s 14 kinds, Other last', () => {
    const kinds = (db.prepare('SELECT key, label FROM link_kinds ORDER BY sort_order').all() as { key: string; label: string }[])
    expect(kinds.map((k) => k.label)).toEqual([
      'Aims', 'IRB / regulatory', 'Grant application', 'Manuscript draft', 'Analysis code', 'Slide deck',
      'Data dictionary', 'Dataset', 'Protocol', 'Reviewer response', 'Meeting notes', 'Submission',
      'Publication', 'Other',
    ])
  })

  it('refuses an unknown kind through /api/mutations (insert and update)', async () => {
    const ins = await viaMutations(mut({
      payload: { owner_table: 'tasks', owner_id: TASK, role: 'key', type: 'web', canonical_url: 'https://x.test/a', short_title: 'a', sort_order: 0, kind: 'folder' },
    }))
    expect(ins.status).toBe('error')
    expect(ins.reason ?? '').toMatch(/FOREIGN KEY/)
    seedLink('link_A')
    const upd = await viaMutations(mut({ op: 'update', record_id: 'link_A', patch: { kind: 'draft' } }))
    expect(upd.status).toBe('error')
    expect(row('link_A')!.kind).toBeNull()
  })

  it('refuses an unknown kind through a direct applyInsert / applyUpdate (the paths processOne never sees)', async () => {
    await expect(applyInsert(env, mut({
      payload: { owner_table: 'tasks', owner_id: TASK, role: 'key', type: 'web', canonical_url: 'https://x.test/b', short_title: 'b', sort_order: 0, kind: 'link' },
    }), USER)).rejects.toThrow(/FOREIGN KEY/)
    seedLink('link_B')
    await expect(applyUpdate(env, mut({ op: 'update', record_id: 'link_B', patch: { kind: 'nope' } }), USER)).rejects.toThrow(/FOREIGN KEY/)
    expect(row('link_B')!.kind).toBeNull()
  })

  it('refuses an unknown kind through the link route, as a 400 a person can read', async () => {
    seedLink('link_C')
    const res = await handleUpdateLink('link_C', post('/api/links/link_C', { kind: 'Draft' }), USER, env)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/not a link kind/)
    expect(row('link_C')!.kind).toBeNull()
  })

  it('refuses an unknown kind on raw SQL', () => {
    seedLink('link_D')
    expect(() => db.prepare("UPDATE links SET kind = 'folder' WHERE id = 'link_D'").run()).toThrow(/FOREIGN KEY/)
    expect(() => insertRow(db, 'links', {
      id: 'link_E', owner_table: 'projects', owner_id: PROJ, type: 'web', canonical_url: 'https://x.test/e', short_title: 'e', kind: 'x',
    })).toThrow(/FOREIGN KEY/)
  })

  it('NULL is Unfiled and always allowed', async () => {
    seedLink('link_F', { kind: 'aims' })
    const res = await handleUpdateLink('link_F', post('/api/links/link_F', { kind: null }), USER, env)
    expect(res.status).toBe(200)
    expect(row('link_F')!.kind).toBeNull()
  })

  it('a 15th kind is one INSERT: it writes, the PB pull carries it, the page labels it -- no code change', async () => {
    db.prepare("INSERT INTO link_kinds (key, label, sort_order) VALUES ('budget', 'Budget', 125)").run()
    seedLink('link_G')
    const res = await handleUpdateLink('link_G', post('/api/links/link_G', { kind: 'budget' }), USER, env)
    expect(res.status).toBe(200)
    expect(row('link_G')!.kind).toBe('budget')
    // pull: the PB sync lane's GET /links carries the column.
    const pull = await handleGetLinks(new URL('https://h/api/links?include_deleted=1'), get('/api/links'), env)
    const pulled = ((await pull.json()) as { data: Array<Record<string, unknown>> }).data.find((r) => r.id === 'link_G')!
    expect(pulled.kind).toBe('budget')
    // label: the project page ships the vocabulary with the row.
    const page = await projectPage()
    expect(page.kinds.find((k) => k.key === 'budget')?.label).toBe('Budget')
    expect(page.taskLinks.find((l) => l.id === 'link_G')?.kind).toBe('budget')
  })
})

// ── (b) the archive lifecycle of a task's document ────────────────────────────

describe('a task document: archive -> sync -> writer replay -> restore', () => {
  it('keeps the task link\'s identity and count, never makes a project copy, and the page follows', async () => {
    // A task holds a doc in a slot (the Hub mirrors the slot into links) and a Gmail thread.
    const slot = await applyUpdate(env, mut({
      table: 'tasks', op: 'update', record_id: TASK, origin_machine: 'work',
      base_seq: (db.prepare('SELECT seq FROM tasks WHERE id = ?').get(TASK) as { seq: number }).seq,
      patch: { key_link_1: DOC, key_link_1_desc: 'Aims' },
    }), USER)
    expect(slot.status).toBe('accepted')
    seedLink('link_gmail', { type: 'gmail_thread', canonical_url: GMAIL, short_title: 'Thread', sort_order: 5 })
    // A mailbox link classifies as `web`; it is still Gmail (2026-10-22, live page).
    seedLink('link_gmail_box', { type: 'web', canonical_url: 'https://mail.google.com/mail/?authuser=umn#drafts', short_title: 'Drafts', sort_order: 6 })
    const taskDoc = db.prepare("SELECT id FROM links WHERE owner_table = 'tasks' AND owner_id = ? AND canonical_url = ?").get(TASK, DOC) as { id: string }
    const id = taskDoc.id
    const count0 = liveCount('tasks', TASK)

    // On the page: "From tasks" holds the doc, never the Gmail thread.
    let page = await projectPage()
    expect(page.taskLinks.map((l) => l.id)).toEqual([id])
    expect(page.taskLinks[0]).toMatchObject({ task_id: TASK, task_title: 'Draft aims', role: 'key', owner_table: 'tasks' })

    // Archive from the project page.
    const a = await handleUpdateLink(id, post(`/api/links/${id}`, { role: 'archive' }), USER, env)
    expect(a.status).toBe(200)
    expect(row(id)!.role).toBe('archive')

    // Sync: the PB pull lane sees the same row, archived.
    const pull = await handleGetLinks(new URL('https://h/api/links?include_deleted=1'), get('/api/links'), env)
    const pulled = ((await pull.json()) as { data: Array<Record<string, unknown>> }).data.filter((r) => r.canonical_url === DOC)
    expect(pulled.map((r) => [r.id, r.role])).toEqual([[id, 'archive']])

    // Writer replay: a later slot write that still holds the URL, and the
    // artifact mirror's any-role pre-check, must not grow a key copy.
    const replay = await applyUpdate(env, mut({
      table: 'tasks', op: 'update', record_id: TASK, origin_machine: 'work',
      base_seq: (db.prepare('SELECT seq FROM tasks WHERE id = ?').get(TASK) as { seq: number }).seq,
      patch: { key_link_1_desc: 'Specific aims' },
    }), USER)
    expect(replay.status).toBe('accepted')
    expect(liveCount('tasks', TASK)).toBe(count0)
    expect(row(id)!.role).toBe('archive')

    // The task keeps it: its own read returns every role.
    const card = await handleGetTaskLinks(TASK, get(`/api/tasks/${TASK}/links`), env, true)
    const own = ((await card.json()) as { links: Array<Record<string, unknown>> }).links
    expect(own.find((l) => l.id === id)?.role).toBe('archive')

    // The page collapses it: still a task row (Archived group), no project copy.
    page = await projectPage()
    expect(page.taskLinks.map((l) => [l.id, l.role])).toEqual([[id, 'archive']])
    expect(liveCount('projects', PROJ)).toBe(0)

    // Restore: the SAME row goes back to key; it is not promoted.
    const r = await handleUpdateLink(id, post(`/api/links/${id}`, { role: 'key' }), USER, env)
    expect(r.status).toBe(200)
    expect(row(id)!.role).toBe('key')
    expect(liveCount('tasks', TASK)).toBe(count0)
    expect(liveCount('projects', PROJ)).toBe(0)
    page = await projectPage()
    expect(page.taskLinks.map((l) => [l.id, l.role])).toEqual([[id, 'key']])
  })

  it('clearing the slot of an archived task link tombstones it (cold review #2)', async () => {
    const seqOf = () => (db.prepare('SELECT seq FROM tasks WHERE id = ?').get(TASK) as { seq: number }).seq
    expect((await applyUpdate(env, mut({
      table: 'tasks', op: 'update', record_id: TASK, origin_machine: 'work', base_seq: seqOf(),
      patch: { key_link_1: DOC, key_link_1_desc: 'Aims' },
    }), USER)).status).toBe('accepted')
    const { id } = db.prepare("SELECT id FROM links WHERE owner_table = 'tasks' AND owner_id = ? AND canonical_url = ?").get(TASK, DOC) as { id: string }
    expect((await handleUpdateLink(id, post(`/api/links/${id}`, { role: 'archive' }), USER, env)).status).toBe(200)
    expect((await applyUpdate(env, mut({
      table: 'tasks', op: 'update', record_id: TASK, origin_machine: 'work', base_seq: seqOf(),
      patch: { key_link_1: null, key_link_1_desc: null },
    }), USER)).status).toBe('accepted')
    expect(row(id)!.deleted_at).not.toBeNull()
    expect(liveCount('tasks', TASK)).toBe(0)
  })

  it('a task moved to another project carries its link and the link\'s state', async () => {
    seedLink('link_M', { role: 'archive' })
    db.prepare('UPDATE tasks SET project_id = ?, product_id = NULL WHERE id = ?').run(OTHER, TASK)
    expect((await projectPage('docs-a')).taskLinks).toEqual([])
    const b = await projectPage('docs-b')
    expect(b.taskLinks.map((l) => [l.id, l.role])).toEqual([['link_M', 'archive']])
  })

  it('the artifact mirror leaves an archived artifact link archived', async () => {
    const art = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_0a1b2c3d'
    seedLink('link_art', { type: 'artifact', canonical_url: art, role: 'archive' })
    expect(await mirrorArtifactLink(env, 'tasks', TASK, art, 'Hermes: Plan', USER)).toBe('already_present')
    expect(liveCount('tasks', TASK)).toBe(1)
  })

  it('a key/archive collision on restore is a 409; neither row is deleted', async () => {
    seedLink('link_old', { role: 'archive' })
    seedLink('link_new', { role: 'key' })
    const res = await handleUpdateLink('link_old', post('/api/links/link_old', { role: 'key' }), USER, env)
    expect(res.status).toBe(409)
    expect(liveCount('tasks', TASK)).toBe(2)
  })
})

// ── promote, add, and the read-time exclusions ────────────────────────────────

describe('promote: COPY a task document onto its project', () => {
  it('copies type/url/title/kind, leaves the task row untouched, and is idempotent', async () => {
    seedLink('link_P', { kind: 'aims' })
    const before = row('link_P')
    const res = await handlePromoteLink('link_P', post('/api/links/link_P/promote', {}), USER, env)
    expect(res.status).toBe(201)
    const copy = db.prepare("SELECT * FROM links WHERE owner_table = 'projects' AND owner_id = ? AND deleted_at IS NULL").all(PROJ) as Record<string, unknown>[]
    expect(copy).toHaveLength(1)
    expect(copy[0]).toMatchObject({ role: 'key', type: 'google_doc', canonical_url: DOC, short_title: 'Aims', kind: 'aims' })
    expect(row('link_P')).toEqual(before)
    // Again: no second row.
    const again = await handlePromoteLink('link_P', post('/api/links/link_P/promote', {}), USER, env)
    expect(again.status).toBe(200)
    expect(liveCount('projects', PROJ)).toBe(1)
    // "From tasks" no longer lists it (the project shows it once, under "On every task").
    const page = await projectPage()
    expect(page.taskLinks).toEqual([])
    expect(page.links.filter((l) => l.canonical_url === DOC)).toHaveLength(1)
  })

  it('restores the project\'s archived copy instead of inserting a second', async () => {
    seedLink('link_P2')
    insertRow(db, 'links', { id: 'link_PA', owner_table: 'projects', owner_id: PROJ, role: 'archive', type: 'google_doc', canonical_url: DOC, short_title: 'Aims' })
    const res = await handlePromoteLink('link_P2', post('/api/links/link_P2/promote', {}), USER, env)
    expect(res.status).toBe(200)
    expect(row('link_PA')!.role).toBe('key')
    expect(liveCount('projects', PROJ)).toBe(1)
  })

  it('refuses a project link, and a task with no project', async () => {
    insertRow(db, 'links', { id: 'link_PP', owner_table: 'projects', owner_id: PROJ, type: 'web', canonical_url: 'https://x.test/p', short_title: 'p' })
    expect((await handlePromoteLink('link_PP', post('/x', {}), USER, env)).status).toBe(400)
    db.prepare('UPDATE tasks SET project_id = NULL, product_id = NULL WHERE id = ?').run(TASK)
    seedLink('link_NP')
    expect((await handlePromoteLink('link_NP', post('/x', {}), USER, env)).status).toBe(400)
  })
})

describe('add document from the project page', () => {
  it('normalizes the URL, files a project key row with its kind, and is idempotent', async () => {
    const res = await handleCreateProjectLink('docs-a', post('/api/projects/docs-a/links', { url: `${DOC}?usp=sharing`, title: 'Aims v2', kind: 'aims' }), USER, env)
    expect(res.status).toBe(201)
    const rows = db.prepare("SELECT * FROM links WHERE owner_table = 'projects' AND owner_id = ?").all(PROJ) as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ role: 'key', type: 'google_doc', canonical_url: DOC, kind: 'aims' })
    const again = await handleCreateProjectLink('docs-a', post('/x', { url: DOC, kind: 'protocol' }), USER, env)
    expect(again.status).toBe(200)
    expect(liveCount('projects', PROJ)).toBe(1)
    expect(row(rows[0].id as string)!.kind).toBe('protocol')
  })

  it('refuses an unknown kind (FK) and a Gmail URL that names nothing', async () => {
    expect((await handleCreateProjectLink('docs-a', post('/x', { url: 'https://x.test/k', kind: 'folder' }), USER, env)).status).toBe(400)
    expect((await handleCreateProjectLink('docs-a', post('/x', { url: 'https://mail.google.com/mail/u/1/#inbox' }), USER, env)).status).toBe(400)
    expect(liveCount('projects', PROJ)).toBe(0)
  })
})

describe('task card: one document, one chip (W6)', () => {
  it('drops an inherited project link whose URL the task already holds', async () => {
    seedLink('link_T1')
    insertRow(db, 'links', { id: 'link_P1', owner_table: 'projects', owner_id: PROJ, type: 'google_doc', canonical_url: DOC, short_title: 'Aims' })
    insertRow(db, 'links', { id: 'link_P2b', owner_table: 'projects', owner_id: PROJ, type: 'web', canonical_url: 'https://x.test/only-project', short_title: 'p' })
    const res = await handleGetTaskLinks(TASK, get(`/api/tasks/${TASK}/links`), env, true)
    const body = (await res.json()) as { links: Array<{ id: string }>; projectLinks: Array<{ id: string }> }
    expect(body.links.map((l) => l.id)).toEqual(['link_T1'])
    expect(body.projectLinks.map((l) => l.id)).toEqual(['link_P2b'])
  })
})
