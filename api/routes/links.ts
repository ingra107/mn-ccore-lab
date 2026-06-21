// GET /links -- typed-link pull endpoint for PB sync (Phase 2, 2026-06-20)
//
// PB's pull leg (scripts/db/sync/drivers/hub.py::_apply_pull_links) calls:
//   GET /links?seq_after=N&limit=K&include_deleted=1
// and expects:
//   { data: [ { id, seq, owner_table, owner_id, role, type, canonical_url,
//               short_title, source_raw, sort_order, deleted_at,
//               created_at, updated_at, last_mutation_id }, ... ],
//     count: N }
//
// Parameters:
//   seq_after       integer  Only return rows with seq > N (incremental pull).
//                            Default = 0 (full pull). Must be non-negative.
//   include_deleted 1        Include soft-deleted rows (tombstones). Default off.
//   limit           integer  Cap on returned rows. Default 2000, max 5000.
//   owner_table     text     Filter by owner_table ('tasks'|'projects'). Optional.
//   owner_id        text     Filter by owner_id. Optional (requires owner_table).
//
// Auth: PI/API-key gate (same as /api/mutations -- this is a PB-facing endpoint).
//
// GET /api/tasks/:id/links -- frontend sub-resource (B3 Task 8, 2026-06-21)
//
// Returns the task's own live links plus the parent project's live links in one
// round-trip. Auth: authed (CF Access JWT -- no PI/API-key needed; frontend-
// accessible). Read-only: write path (slot-based) unchanged.
//
// Response: { links: StoredLink[], projectLinks: StoredLink[] }
// where StoredLink = { id, role, type, canonical_url, short_title, sort_order }
//
// GET /api/projects/:slug/links -- frontend sub-resource (B3 Task 8, 2026-06-21)
//
// Returns the project's own live links.
// Response: { links: StoredLink[] }
//
// Decision doc: Peripheral-Brain/Context/Decisions/2026-06-20-links-table.md

import type { Env } from '../types';
import { json, error, isPiRequest, assertProjectVisible } from '../helpers';

// Columns returned to the sync pull leg -- matches brain.db links columns that
// are identity-mapped to Hub (omits brain.db-local bookkeeping: sync_status,
// local_version, synced_at).
const LINKS_SELECT_COLS = [
  'id', 'owner_table', 'owner_id', 'role', 'type',
  'canonical_url', 'short_title', 'source_raw', 'sort_order',
  'deleted_at', 'seq', 'last_mutation_id',
  'created_at', 'updated_at',
].join(', ');

export async function handleGetLinks(url: URL, request: Request, env: Env): Promise<Response> {
  // PI/API-key gate -- links are PB-owned data; restrict to the sync lane.
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden -- PI access only', 403);
  }

  const seqAfterRaw = url.searchParams.get('seq_after');
  const limitRaw = url.searchParams.get('limit');
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  const ownerTable = url.searchParams.get('owner_table');
  const ownerId = url.searchParams.get('owner_id');

  // Validate seq_after.
  let seqAfter = 0;
  if (seqAfterRaw !== null) {
    seqAfter = Number.parseInt(seqAfterRaw, 10);
    if (!Number.isFinite(seqAfter) || seqAfter < 0) {
      return error('seq_after must be a non-negative integer', 400);
    }
  }

  // Validate owner_table if provided.
  if (ownerTable && ownerTable !== 'tasks' && ownerTable !== 'projects') {
    return error("owner_table must be 'tasks' or 'projects'", 400);
  }

  // Cap limit (default 2000, max 5000 -- mirrors tasks pull handler).
  const limit = limitRaw
    ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 2000, 1), 5000)
    : 2000;

  // Build query. include_deleted controls tombstone visibility; sync pull
  // always sends include_deleted=1 so it can mirror deletions.
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }
  if (seqAfter > 0) {
    conditions.push('seq > ?');
    params.push(seqAfter);
  }
  if (ownerTable) {
    conditions.push('owner_table = ?');
    params.push(ownerTable);
  }
  if (ownerId) {
    conditions.push('owner_id = ?');
    params.push(ownerId);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // ORDER BY seq ASC preserves the pull-cursor contract: clients advance their
  // local cursor to the max seq in the returned batch (same as tasks/projects).
  const query = `SELECT ${LINKS_SELECT_COLS} FROM links ${whereClause} ORDER BY seq ASC LIMIT ?`;
  params.push(limit);

  try {
    const result = await env.DB.prepare(query).bind(...params).all<Record<string, unknown>>();
    const rows = result.results ?? [];
    return json({ data: rows, count: rows.length });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // Table-not-found: migration not yet applied to this environment.
    if (/no such table/i.test(msg)) {
      return json({ data: [], count: 0 });
    }
    console.error('handleGetLinks error:', msg);
    return error(`DB error: ${msg}`, 500);
  }
}

// ── Frontend-accessible columns (B3 Task 8) ────────────────────────────────────
// Narrower projection than the sync lane: omits sync bookkeeping (seq,
// last_mutation_id, source_raw, deleted_at, created_at, updated_at).
// Consumers: TaskDetailPanel / ProjectDetail / KeyLinksEditor.
const FE_LINKS_COLS = 'id, role, type, canonical_url, short_title, sort_order';

// Shared query helper: fetch live (non-deleted) links for one owner, ordered
// by sort_order then id for a stable display sequence.
async function fetchOwnerLinks(
  env: Env,
  ownerTable: 'tasks' | 'projects',
  ownerId: string,
): Promise<Record<string, unknown>[]> {
  try {
    const res = await env.DB
      .prepare(
        `SELECT ${FE_LINKS_COLS} FROM links
         WHERE owner_table = ? AND owner_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, id ASC`,
      )
      .bind(ownerTable, ownerId)
      .all<Record<string, unknown>>();
    return res.results ?? [];
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) return [];
    throw e;
  }
}

// ── Derived project-field links (read-time union, 2026-06-21) ─────────────────
//
// Projects carry three fields that imply canonical links without requiring an
// explicit row in the `links` table. We union these in at read time so every
// project with e.g. a primary_folder surfaces a clickable chip automatically,
// without backfilling derived data into the links table.
//
// Derived link shape:
//   id           — stable synthetic key ('derived:folder' / 'derived:github' /
//                  'derived:box') so React keys are unique across renders.
//   role         — 'derived' (distinct from 'key'/'ref' explicit rows so callers
//                  can distinguish; the frontend StoredLinkChip renders both the
//                  same way).
//   type         — PB link type matching StoredLinkChip's iconForType() registry.
//   canonical_url — launchable URI:
//                   * local_folder: mnccore://open/<normalized_path> so
//                     StoredLinkChip's useProtocolLaunch fires the Windows
//                     handler directly (raw folder paths are NOT navigable in a
//                     browser; the WorkOnActions precedent confirms this URI).
//                   * github_repo / box_folder: the http URL as-is (http links
//                     open in a new tab via StoredLinkChip's isHttp branch).
//   short_title  — 'Project folder', extracted 'owner/repo' or 'repo', 'Box folder'.
//   sort_order   — 0 (derived links are appended AFTER explicit rows, so this
//                  value is used only for tie-breaking within the derived group).
//
// Dedup: if a derived canonical_url already appears in an explicit links-table
// row for the same project, the EXPLICIT row is kept (it may carry a curated
// title). Best-effort string equality on canonical_url.
//
// Order: explicit links-table rows first (sorted by sort_order then id, as
// returned by fetchOwnerLinks), then derived folder → github → box.

/** Mirrors urlClassify.ts normalizeLocalFolderPath — must stay in sync. */
function normalizeLocalFolderPath(raw: string): string {
  if (!raw) return '';
  let p = raw.trim();
  const isUnc = p.startsWith('\\\\') || p.startsWith('//');
  p = p.replace(/^file:\/\/\/?/i, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    /* leave p as-is on malformed escape */
  }
  p = p.replace(/\\/g, '/');
  if (isUnc) {
    p = '//' + p.replace(/^\/+/, '');
  }
  p = p.replace(/\/+$/, '');
  if (!p && isUnc) return '//';
  return p;
}

/** Extract 'owner/repo' (or 'repo' fallback) from a github.com URL. */
function githubShortTitle(url: string): string {
  try {
    const m = url.match(/github\.com\/([^/?#]+\/[^/?#]+)/i);
    if (m) return m[1].replace(/\.git$/i, '');
  } catch { /* ignore */ }
  return 'Repo';
}

interface ProjectLinkFields {
  primary_folder?: string | null;
  github_url?: string | null;
  box_url?: string | null;
}

interface DerivedLink {
  id: string;
  role: 'derived';
  type: string;
  canonical_url: string;
  short_title: string;
  sort_order: number;
}

/**
 * Build the derived typed-link entries for a project's canonical fields.
 * Returns only entries whose field is non-empty AND whose canonical_url is
 * not already present in the explicit links array (dedup by string equality).
 * Order: folder → github → box.
 */
function buildDerivedProjectLinks(
  fields: ProjectLinkFields,
  explicitLinks: Record<string, unknown>[],
): DerivedLink[] {
  // Build a set of explicit canonical_urls for dedup (O(n) lookup).
  const explicitUrls = new Set(
    explicitLinks.map(l => l.canonical_url as string).filter(Boolean),
  );

  const derived: DerivedLink[] = [];

  if (fields.primary_folder) {
    const normalized = normalizeLocalFolderPath(fields.primary_folder);
    const canonicalUrl = `mnccore://open/${normalized}`;
    if (!explicitUrls.has(canonicalUrl)) {
      derived.push({
        id: 'derived:folder',
        role: 'derived',
        type: 'local_folder',
        canonical_url: canonicalUrl,
        short_title: 'Project folder',
        sort_order: 0,
      });
    }
  }

  if (fields.github_url) {
    const url = fields.github_url.trim();
    if (url && !explicitUrls.has(url)) {
      derived.push({
        id: 'derived:github',
        role: 'derived',
        type: 'github_repo',
        canonical_url: url,
        short_title: githubShortTitle(url),
        sort_order: 0,
      });
    }
  }

  if (fields.box_url) {
    const url = fields.box_url.trim();
    if (url && !explicitUrls.has(url)) {
      derived.push({
        id: 'derived:box',
        role: 'derived',
        type: 'box_folder',
        canonical_url: url,
        short_title: 'Box folder',
        sort_order: 0,
      });
    }
  }

  return derived;
}

// ── fetchProjectWithLinks ───────────────────────────────────────────────────────
// Fetch the project's canonical-field values + explicit links in one call.
// Returns null when the project doesn't exist.
async function fetchProjectWithLinks(
  env: Env,
  projectId: string,
): Promise<{ fields: ProjectLinkFields; explicit: Record<string, unknown>[] } | null> {
  // Fetch the three derived-link source columns alongside the explicit links.
  // These are the only project columns we need here; no SELECT * needed.
  let fields: ProjectLinkFields;
  try {
    const row = await env.DB
      .prepare('SELECT primary_folder, github_url, box_url FROM projects WHERE id = ?')
      .bind(projectId)
      .first<ProjectLinkFields>();
    if (!row) return null;
    fields = row;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) return null;
    throw e;
  }

  const explicit = await fetchOwnerLinks(env, 'projects', projectId);
  return { fields, explicit };
}

// ── buildProjectLinks — shared helper ─────────────────────────────────────────
//
// Combines explicit links-table rows with derived canonical-field links for one
// project. Called by handleGetProjectLinks (per-project), handleGetTaskLinks
// (parent project), and handleGetAllProjectLinks (bulk).
//
// Explicit rows first (sort_order ASC, id ASC from the DB query), then derived
// folder → github → box. Dedup: explicit wins when canonical_url matches.
export function buildProjectLinks(
  fields: ProjectLinkFields,
  explicitRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const derived = buildDerivedProjectLinks(fields, explicitRows);
  return [...explicitRows, ...derived];
}

// GET /api/tasks/:id/links
// Returns { links: StoredLink[], projectLinks: StoredLink[] }.
// `links`        = task-owned live rows.
// `projectLinks` = parent project's live rows PLUS derived canonical-field links
//                  (primary_folder, github_url, box_url). Explicit rows first,
//                  then derived folder → github → box.
// Both arrays are empty when the owner has no live rows. No error if parent
// project is absent (unattached task).
export async function handleGetTaskLinks(
  taskId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // Resolve task existence + project visibility in one lookup (mirrors guardTaskProject).
  const task = await env.DB
    .prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
    .bind(taskId)
    .first<{ project_id: string | null }>();
  if (!task) return error('Task not found', 404);
  if (task.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id);
    if (block) return block;
  }

  // Fetch task links + project (explicit links + canonical fields) in parallel.
  const [taskLinks, projectData] = await Promise.all([
    fetchOwnerLinks(env, 'tasks', taskId),
    task.project_id
      ? fetchProjectWithLinks(env, task.project_id)
      : Promise.resolve(null),
  ]);

  const projectExplicit = projectData?.explicit ?? [];
  const projectLinks = projectData
    ? buildProjectLinks(projectData.fields, projectExplicit)
    : [];

  return json({ links: taskLinks, projectLinks });
}

// GET /api/projects/:slug/links
// Returns { links: StoredLink[] }.
// `links` = explicit links-table rows PLUS derived canonical-field links
//           (primary_folder, github_url, box_url). Explicit rows first,
//           then derived folder → github → box.
// `:slug` accepts the project's slug OR its typed PK (proj_*) -- resolves via
// the same two-arm lookup used in tasks.ts for project_id resolution.
export async function handleGetProjectLinks(
  slugOrId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // Resolve slug/PK to canonical row so we can gate visibility + get the PK.
  // Also fetch the three derived-link source columns in the same query.
  const project = await env.DB
    .prepare(
      'SELECT id, primary_folder, github_url, box_url FROM projects WHERE slug = ? OR id = ? LIMIT 1',
    )
    .bind(slugOrId, slugOrId)
    .first<{ id: string } & ProjectLinkFields>();
  if (!project) return error('Project not found', 404);

  // Gate: assertProjectVisible checks Peripheral Brain category for non-PI.
  const block = await assertProjectVisible(request, env, project.id);
  if (block) return block;

  const explicit = await fetchOwnerLinks(env, 'projects', project.id);
  const links = buildProjectLinks(project, explicit);

  return json({ links });
}

// GET /api/projects/links — bulk project-links (backlog #147)
//
// Returns all visible projects' links in ONE response so the Projects table can
// populate a links column without N+1 per-row fetches.
//
// Response shape:
//   { projects: { "<projectId>": StoredLink[] } }
//
// Keyed by project id (typed proj_* PK) so the frontend can do O(1) index
// lookups from a table row: `linksByProject[row.id] ?? []`.
//
// Efficiency: two bulk queries — no per-project loops:
//   Q1  SELECT id, primary_folder, github_url, box_url, category FROM projects
//         WHERE deleted_at IS NULL
//   Q2  SELECT id, role, type, canonical_url, short_title, sort_order,
//             owner_id FROM links
//         WHERE owner_table = 'projects' AND deleted_at IS NULL
//
// Q2 rows are grouped in memory by owner_id. Then for each visible project
// we call buildProjectLinks(fields, explicitRows) to union the derived links.
//
// Visibility: PB-category projects are filtered out for non-PI callers (same
// gate as assertProjectVisible / canSeePbProject). PI/API-key see all.
// Auth: authed (CF Access JWT — no PI/API-key required for non-PB projects).
export async function handleGetAllProjectLinks(
  request: Request,
  env: Env,
): Promise<Response> {
  // Determine caller's PI status once — used to gate PB-category projects.
  const callerIsPi = await isPiRequest(request, env);

  // Q1: fetch all live projects with the three derived-link source columns.
  // category is required for the visibility gate.
  type ProjectBulkRow = { id: string; category: string | null } & ProjectLinkFields;
  let projects: ProjectBulkRow[];
  try {
    const res = await env.DB
      .prepare(
        'SELECT id, primary_folder, github_url, box_url, category FROM projects WHERE deleted_at IS NULL',
      )
      .all<ProjectBulkRow>();
    projects = res.results ?? [];
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) return json({ projects: {} });
    console.error('handleGetAllProjectLinks Q1 error:', msg);
    return error(`DB error: ${msg}`, 500);
  }

  // Q2: fetch ALL live project-owned links in one shot.
  // Include owner_id so we can group in memory.
  const FE_LINKS_BULK_COLS = `${FE_LINKS_COLS}, owner_id`;
  type BulkLinkRow = Record<string, unknown> & { owner_id: string };
  let allLinks: BulkLinkRow[];
  try {
    const res = await env.DB
      .prepare(
        `SELECT ${FE_LINKS_BULK_COLS} FROM links
         WHERE owner_table = 'projects' AND deleted_at IS NULL
         ORDER BY sort_order ASC, id ASC`,
      )
      .all<BulkLinkRow>();
    allLinks = res.results ?? [];
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) {
      // links table not yet migrated; return derived-only links per project.
      allLinks = [];
    } else {
      console.error('handleGetAllProjectLinks Q2 error:', msg);
      return error(`DB error: ${msg}`, 500);
    }
  }

  // Group explicit links by owner_id in memory (O(n)).
  const explicitByProject = new Map<string, Record<string, unknown>[]>();
  for (const row of allLinks) {
    const pid = row.owner_id;
    if (!explicitByProject.has(pid)) explicitByProject.set(pid, []);
    // Omit owner_id from the final Link shape — callers don't need it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { owner_id: _oid, ...linkFields } = row;
    explicitByProject.get(pid)!.push(linkFields);
  }

  // Build the result map: { projectId → Link[] }.
  // Filter PB-category projects for non-PI callers.
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const proj of projects) {
    // Visibility gate: PB-category projects excluded for non-PI.
    // We have the category in hand from Q1 so no additional DB lookup needed.
    // isPiRequest was evaluated once above and cached in callerIsPi.
    if (proj.category === 'Peripheral Brain' && !callerIsPi) continue;

    const explicit = explicitByProject.get(proj.id) ?? [];
    result[proj.id] = buildProjectLinks(proj, explicit);
  }

  return json({ projects: result });
}
