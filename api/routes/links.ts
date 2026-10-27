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
// Returns the project's own live links, plus (#151) the documents its tasks
// hold and the kind vocabulary.
// Response: { links: StoredLink[], taskLinks: TaskOwnedLink[], kinds: LinkKind[] }
//
// #151 (2026-10-22): a project document is a `links` row. Tier = owner_table
// ("On every task" = project-owned, "From tasks" = task-owned); kind = the
// links.kind FK into link_kinds (NULL = Unfiled); role key/archive means the
// same for both owners: archive stops a link propagating beyond its owner,
// and the owner keeps it.
//
// Decision doc: Peripheral-Brain/Context/Decisions/2026-06-20-links-table.md

import type { Env } from '../types';
import type { AuthUser } from '../helpers';
import { withoutPiOnlyLinks } from '../lib/pi-only-project-fields';
import { json, error, isPiRequest, assertProjectVisible, generateId, getValidationFlags } from '../helpers';
import { assertEnumDomain } from '../lib/enum-domains';
import { nowInstant } from '../lib/time';
import { applyInsert, applyUpdate } from './mutations';
import { normalizeLink } from '../../shared/pbLinks.generated';

// Columns returned to the sync pull leg -- matches brain.db links columns that
// are identity-mapped to Hub (omits brain.db-local bookkeeping: sync_status,
// local_version, synced_at).
const LINKS_SELECT_COLS = [
  'id', 'owner_table', 'owner_id', 'role', 'type',
  'canonical_url', 'short_title', 'source_raw', 'sort_order',
  'deleted_at', 'seq', 'last_mutation_id',
  'created_at', 'updated_at',
  // schema-v145 (#151): the semantic kind, FK into link_kinds. PB mig 153
  // caches it; apply v145 to prod BEFORE a Worker that selects it.
  'kind',
  // schema-v149: the product a project link belongs to (NULL = project-wide).
  // PB mig 154 caches it; apply v149 to prod BEFORE a Worker that selects it.
  'product_id',
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
// created_at/updated_at ride along so the project page can date each link
// (Nick 2026-08-25: "all links and documents and artifacts with time stamps").
// kind + owner_table (#151): the project page labels and filters by kind, and
// tells a project-owned row from a task-owned one.
// product_id (schema-v149): a product's current draft and its archived drafts.
const FE_LINKS_COLS =
  'id, owner_table, role, type, kind, product_id, canonical_url, short_title, sort_order, created_at, updated_at';

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

// A type alias, not an interface: an alias is assignable to Record<string, unknown>,
// so explicit rows and derived links share one array type.
type DerivedLink = {
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
//
// isPi false (a non-PI caller): no local_folder link, explicit or derived.
// Either is a path on the PI's own machine (an mnccore://open/<path> URL or a
// stored "~/Box/..." row), readable and usable only there (P7,
// api/lib/pi-only-project-fields.ts).
export function buildProjectLinks(
  fields: ProjectLinkFields,
  explicitRows: Record<string, unknown>[],
  isPi: boolean,
): Record<string, unknown>[] {
  const all = [...explicitRows, ...buildDerivedProjectLinks(fields, explicitRows)];
  return isPi ? all : withoutPiOnlyLinks(all);
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
  isPi: boolean,
): Promise<Response> {
  // Read through the caller's handle: a task the caller may not read is a 404.
  // A task can be visible without its project (it names the caller); the
  // project half below then reads nothing.
  const task = await env.DB
    .prepare('SELECT project_id, product_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
    .bind(taskId)
    .first<{ project_id: string | null; product_id: string | null }>();
  if (!task) return error('Task not found', 404);

  // Fetch task links + project (explicit links + canonical fields) in parallel.
  const [taskLinks, projectData] = await Promise.all([
    fetchOwnerLinks(env, 'tasks', taskId),
    task.project_id
      ? fetchProjectWithLinks(env, task.project_id)
      : Promise.resolve(null),
  ]);

  // Task cards inherit only role='key' project links. An archived link is still
  // LIVE (it renders, dated, on the project page) but it has been superseded, so
  // it must not follow the project onto every task -- which is how the July R1
  // reviewer-response doc and the retired R1 checklist were still showing on an
  // August R2 task. PB's twin is BrainDB.current_project_links (#151), its one
  // role-filtered read (the TODAY.md renderer this used to cite is retired).
  //
  // Derived links (primary_folder / github_url / box_url) are NOT filtered:
  // they are computed from live project fields, so they are current by
  // construction and carry no role of their own.
  //
  // schema-v149: a product's current draft follows the project onto the tasks
  // of THAT product only (tasks.product_id, v124), so a task on manuscript A
  // never shows manuscript B's draft. Project-wide key rows reach every task;
  // a product-scoped archived draft reaches none.
  const projectExplicit = (projectData?.explicit ?? []).filter((row) => {
    const role = row.role ?? 'key';
    const productId = (row.product_id as string | null | undefined) ?? null;
    if (role === 'key') return productId === null;
    return role === 'current_draft' && productId !== null && productId === task.product_id;
  });
  // One document, one chip (#151 W6): a project link whose URL the task also
  // holds itself (a promoted COPY, or the same URL filed twice) is shown once,
  // as the task's own. Every task surface (TaskDetailPanel, TaskDetailDrawer,
  // MyTasks InlineDetail) reads this endpoint, so this is the one dedup site.
  // The task's own rows are never filtered, by role or otherwise: a task keeps
  // its archived links.
  const taskUrls = new Set(taskLinks.map((l) => l.canonical_url as string));
  const projectLinks = projectData
    ? buildProjectLinks(projectData.fields, projectExplicit, isPi)
        .filter((l) => !taskUrls.has(l.canonical_url as string))
    : [];

  return json({ links: isPi ? taskLinks : withoutPiOnlyLinks(taskLinks), projectLinks });
}

// Gmail threads and drafts are a task's correspondence, never one of the
// project's documents (Nick, 2026-10-22 desk G1: "Keep them off").
const NOT_A_DOCUMENT_TYPES = ['gmail_thread', 'gmail_draft'] as const;

/**
 * The documents a project's live tasks hold, for its "From tasks" tier (#151).
 *
 * Read through the caller's handle (env.DB), so a task the caller may not read
 * contributes nothing. Done tasks count: a document outlives its task. Every
 * role comes back: a task's archived row belongs in the project's Archived
 * group. Two exclusions at read time, so the client cannot render what it
 * never receives:
 *   - Gmail threads/drafts (NOT_A_DOCUMENT_TYPES), and any other mail.google.com
 *     URL: a mailbox link (e.g. the drafts folder) classifies as `web`, and on
 *     2026-10-22 two of them reached "From tasks" on the live page;
 *   - any URL the project already holds, in any role or derived (`heldUrls`):
 *     a promoted COPY shows once, under "On every task", and a URL the project
 *     archived is the project's to restore.
 */
async function fetchProjectTaskLinks(
  env: Env,
  projectId: string,
  heldUrls: ReadonlySet<string>,
): Promise<Record<string, unknown>[]> {
  const cols = FE_LINKS_COLS.split(', ').map((c) => `l.${c}`).join(', ');
  let rows: Record<string, unknown>[];
  try {
    const res = await env.DB
      .prepare(
        `SELECT ${cols}, l.owner_id AS task_id, t.title AS task_title
           FROM links l JOIN tasks t ON t.id = l.owner_id
          WHERE l.owner_table = 'tasks' AND l.deleted_at IS NULL
            AND t.project_id = ? AND t.deleted_at IS NULL
            AND l.type NOT IN (${NOT_A_DOCUMENT_TYPES.map(() => '?').join(', ')})
            AND l.canonical_url NOT LIKE 'https://mail.google.com/%'
          ORDER BY l.created_at ASC, l.id ASC`,
      )
      .bind(projectId, ...NOT_A_DOCUMENT_TYPES)
      .all<Record<string, unknown>>();
    rows = res.results ?? [];
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) return [];
    throw e;
  }
  return rows.filter((r) => !heldUrls.has(r.canonical_url as string));
}

/** The kind vocabulary (schema-v145), in display order. A new kind is one
 *  INSERT into link_kinds; this read and every chip pick it up with no deploy. */
async function fetchLinkKinds(env: Env): Promise<Record<string, unknown>[]> {
  try {
    const res = await env.DB
      .prepare('SELECT key, label, sort_order FROM link_kinds ORDER BY sort_order ASC, key ASC')
      .all<Record<string, unknown>>();
    return res.results ?? [];
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) return [];
    throw e;
  }
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
  isPi: boolean,
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

  // Gate: assertProjectVisible (membership, through the caller's handle).
  const block = await assertProjectVisible(request, env, project.id);
  if (block) return block;

  const explicit = await fetchOwnerLinks(env, 'projects', project.id);
  // Held = every URL the project shows in any role, derived included; the
  // PI-only filter applies after, so a member's view shadows the same rows.
  const all = buildProjectLinks(project, explicit, true);
  const held = new Set(all.map((l) => l.canonical_url as string));
  const links = isPi ? all : withoutPiOnlyLinks(all);
  const [taskRows, kinds] = await Promise.all([
    fetchProjectTaskLinks(env, project.id, held),
    fetchLinkKinds(env),
  ]);
  const taskLinks = isPi ? taskRows : withoutPiOnlyLinks(taskRows);

  return json({ links, taskLinks, kinds });
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
//   Q1  SELECT id, primary_folder, github_url, box_url FROM projects
//         WHERE deleted_at IS NULL
//   Q2  SELECT id, role, type, canonical_url, short_title, sort_order,
//             owner_id FROM links
//         WHERE owner_table = 'projects' AND deleted_at IS NULL
//
// Q2 rows are grouped in memory by owner_id. Then for each visible project
// we call buildProjectLinks(fields, explicitRows) to union the derived links.
//
// Visibility: both queries read through the caller's handle, so only the
// projects the caller is on (and their links) come back.
export async function handleGetAllProjectLinks(
  request: Request,
  env: Env,
): Promise<Response> {
  // P7: only a PI or the PB key receives the PI-only local-folder links. A
  // privilege, not a visibility rule: which projects come back is the handle's.
  const callerIsPi = await isPiRequest(request, env);
  // Q1: fetch the caller's live projects with the three derived-link source columns.
  type ProjectBulkRow = { id: string } & ProjectLinkFields;
  let projects: ProjectBulkRow[];
  try {
    const res = await env.DB
      .prepare(
        'SELECT id, primary_folder, github_url, box_url FROM projects WHERE deleted_at IS NULL',
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
    const { owner_id: _oid, ...linkFields } = row;
    explicitByProject.get(pid)!.push(linkFields);
  }

  // Build the result map: { projectId → Link[] }.
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const proj of projects) {
    const explicit = explicitByProject.get(proj.id) ?? [];
    result[proj.id] = buildProjectLinks(proj, explicit, callerIsPi);
  }

  return json({ projects: result });
}

// ── Link writes from the Hub UI (#2089, #151) ─────────────────────────────────
//
// Three routes, all through applyInsert / applyUpdate with a `hub_ui:` origin
// (the artifact-link-mirror.ts precedent). Neither runs processOne's gate
// stack, which is why:
//   - `role` is checked against the generated links.role domain (#2093) here,
//     explicitly and unconditionally;
//   - `kind` is NOT checked by code at all. links.kind REFERENCES
//     link_kinds(key) (schema-v145), so D1 refuses an unknown kind on this
//     path, on /api/mutations and on raw SQL alike. kindRefused() turns that
//     refusal into a 400 a person can read.
//
// Authorization: the caller must be able to read the link's owner. A project
// link is gated by assertProjectVisible on its project; a task link by the
// task being readable through the caller's handle AND, when it has one, its
// project being visible (#151: task owners may archive their own documents).

type LinkRow = {
  id: string; owner_table: string; owner_id: string; role: string;
  canonical_url: string; type: string; short_title: string; source_raw: string | null;
  kind: string | null; product_id: string | null;
};

const LINK_ROW_COLS = 'id, owner_table, owner_id, role, canonical_url, type, short_title, source_raw, kind, product_id';

async function liveLink(env: Env, linkId: string): Promise<LinkRow | null> {
  return env.DB
    .prepare(`SELECT ${LINK_ROW_COLS} FROM links WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(linkId)
    .first<LinkRow>();
}

/** The project a link belongs to: its owner for a project link, the task's
 *  project for a task link (null when the task has none). `block` is the
 *  response to return when the caller may not touch this owner. */
async function guardLinkOwner(
  request: Request, env: Env, row: LinkRow,
): Promise<{ block: Response | null; projectId: string | null }> {
  if (row.owner_table === 'projects') {
    return { block: await assertProjectVisible(request, env, row.owner_id), projectId: row.owner_id };
  }
  // Read through the caller's handle: a task the caller may not read is a 404.
  const task = await env.DB
    .prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
    .bind(row.owner_id)
    .first<{ project_id: string | null }>();
  if (!task) return { block: error('Link not found', 404), projectId: null };
  if (!task.project_id) return { block: null, projectId: null };
  return { block: await assertProjectVisible(request, env, task.project_id), projectId: task.project_id };
}

function isForeignKeyFailure(e: unknown): boolean {
  return /FOREIGN KEY constraint failed|SQLITE_CONSTRAINT_FOREIGNKEY/.test(e instanceof Error ? e.message : String(e));
}

function isUniqueFailure(e: unknown): boolean {
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/.test(e instanceof Error ? e.message : String(e));
}

function kindRefused(kind: unknown): Response {
  return error(`${JSON.stringify(kind)} is not a link kind (see GET /api/projects/:slug/links "kinds")`, 400);
}

function mutationRefused(res: { status: string; reason?: string }): Response {
  const message = `mutation ${res.status}: ${res.reason ?? ''}`;
  return json({ error: message, rejected: res.status, message }, 409);
}

/** kind from a body: absent -> undefined (leave it), null/'' -> null (Unfiled),
 *  a string -> itself (the FK decides), anything else -> a 400. */
function bodyKind(body: Record<string, unknown>): { kind?: string | null; bad?: Response } {
  if (!('kind' in body)) return {};
  const k = body.kind;
  if (k === null || k === '') return { kind: null };
  if (typeof k === 'string') return { kind: k };
  return { bad: kindRefused(k) };
}

async function patchLink(
  env: Env, user: AuthUser, linkId: string, patch: Record<string, unknown>, origin: string,
): Promise<Awaited<ReturnType<typeof applyUpdate>>> {
  const flags = await getValidationFlags(env);
  return applyUpdate(env, {
    mutation_id: generateId('mut'),
    origin_machine: `hub_ui:${origin}`,
    table: 'links',
    op: 'update',
    record_id: linkId,
    base_seq: null,
    base_row_hash: null,
    patch,
    depends_on: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  }, user, flags);
}

async function insertProjectLink(
  env: Env, user: AuthUser, projectId: string,
  fields: { type: string; canonical_url: string; short_title: string; source_raw: string | null; kind: string | null },
  origin: string,
): Promise<Awaited<ReturnType<typeof applyInsert>>> {
  const maxRow = await env.DB
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM links
               WHERE owner_table = 'projects' AND owner_id = ? AND deleted_at IS NULL`)
    .bind(projectId)
    .first<{ m: number }>();
  const payload: Record<string, unknown> = {
    owner_table: 'projects',
    owner_id: projectId,
    role: 'key',
    type: fields.type,
    canonical_url: fields.canonical_url,
    short_title: fields.short_title,
    source_raw: fields.source_raw,
    sort_order: (maxRow?.m ?? -1) + 1,
  };
  if (fields.kind !== null) payload.kind = fields.kind;
  return applyInsert(env, {
    mutation_id: generateId('mut'),
    origin_machine: `hub_ui:${origin}`,
    table: 'links',
    op: 'insert',
    record_id: `link_${generateId()}`,
    base_seq: null,
    base_row_hash: null,
    payload,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  }, user);
}

/** The project's live PROJECT-WIDE row for a URL, preferring role='key'. A
 *  product's draft rows (product_id set, schema-v149) are the current-draft
 *  route's, so adding or promoting a document never re-roles one. */
async function projectRowFor(env: Env, projectId: string, url: string): Promise<LinkRow | null> {
  return env.DB
    .prepare(
      `SELECT ${LINK_ROW_COLS} FROM links
        WHERE owner_table = 'projects' AND owner_id = ? AND canonical_url = ? AND deleted_at IS NULL
          AND product_id IS NULL
        ORDER BY CASE role WHEN 'key' THEN 0 ELSE 1 END LIMIT 1`,
    )
    .bind(projectId, url)
    .first<LinkRow>();
}

async function feRow(env: Env, linkId: string): Promise<unknown> {
  return env.DB.prepare(`SELECT ${FE_LINKS_COLS} FROM links WHERE id = ?`).bind(linkId).first();
}

// POST /api/links/:id -- change one link's role and/or kind (#2089, #151)
// (also mounted at the pre-#151 path POST /api/links/:id/role for one release)
//
// Body: { role?: 'key' | 'archive', kind?: string | null }. Response:
// { data: <canonical links row> }.
//
// role has ONE meaning for both owners (#151): archive = the link stops
// propagating beyond its owner, and the owner keeps it. A project link
// archived leaves its tasks' cards (handleGetTaskLinks inherits key rows
// only); a task link archived stays on its own task (no owner read filters
// its own rows by role) and moves to the project page's Archived group. So a
// task link may be archived and restored here; restoring sets the TASK row
// back to key, and never makes it a project link (promote is its own route).
// The refusal that stood here ("a task has no archived group") guarded a
// state #151 renders, and is deleted, as is PB's twin in
// _refuse_invalid_link_write.
//
// Checks: role in the generated domain (#2093); the caller may touch the
// owner (guardLinkOwner); a role move that would collide with a live row of
// the same owner + role + URL is a 409 (idx_links_owner_role_url), never a
// silent delete of either row; an unknown kind is a 400 (the FK).
export async function handleUpdateLink(
  linkId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error('JSON body required', 400);
  }
  if (!body || typeof body !== 'object') return error('JSON body required', 400);
  const patch: Record<string, unknown> = {};
  if ('role' in body) {
    const fields: Record<string, unknown> = { role: body.role };
    const enumErr = assertEnumDomain('links', fields);
    if (enumErr) return error(enumErr, 400);
    patch.role = fields.role;
  }
  const k = bodyKind(body);
  if (k.bad) return k.bad;
  if (k.kind !== undefined) patch.kind = k.kind;
  if (Object.keys(patch).length === 0) return error('Body names role and/or kind', 400);

  const row = await liveLink(env, linkId);
  if (!row) return error('Link not found', 404);
  const { block } = await guardLinkOwner(request, env, row);
  if (block) return block;

  if ('role' in patch && patch.role === row.role) delete patch.role;
  if ('kind' in patch && (patch.kind ?? null) === (row.kind ?? null)) delete patch.kind;
  if (Object.keys(patch).length === 0) return json({ data: await feRow(env, linkId) });

  if ('role' in patch) {
    // The pre-check gives the plain message; the catch below covers a
    // concurrent writer. Neither row is ever deleted to make room.
    const clash = await env.DB
      .prepare(
        `SELECT id FROM links
          WHERE owner_table = ? AND owner_id = ? AND role = ? AND canonical_url = ?
            AND product_id IS ? AND deleted_at IS NULL AND id != ? LIMIT 1`,
      )
      .bind(row.owner_table, row.owner_id, patch.role as string, row.canonical_url, row.product_id ?? null, linkId)
      .first<{ id: string }>();
    if (clash) return roleClash(patch.role as string, row.owner_table);
  }

  let res: Awaited<ReturnType<typeof applyUpdate>>;
  try {
    res = await patchLink(env, user, linkId, patch, 'handleUpdateLink');
  } catch (e) {
    if (isForeignKeyFailure(e)) return kindRefused(patch.kind);
    if (isUniqueFailure(e)) return roleClash(String(patch.role ?? row.role), row.owner_table);
    throw e;
  }
  if (res.status !== 'accepted' && res.status !== 'merged_clean') {
    if (/FOREIGN KEY/.test(res.reason ?? '')) return kindRefused(patch.kind);
    return mutationRefused(res);
  }
  return json({ data: res.canonical_payload ?? null });
}

// POST /api/links/:id/promote -- put a task's document on its project (#151)
//
// COPY (Nick's pick): the task keeps its own row, untouched; the project gets
// a role='key' row with the same type / canonical_url / short_title / kind,
// so the document shows "On every task". Idempotent on the live natural key:
//   - the project already holds the URL at key -> that row, no write;
//   - the project holds it archived -> that row flips back to key;
//   - else a new project row.
// Response: { data: <the project row>, created: boolean }.
export async function handlePromoteLink(
  linkId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const row = await liveLink(env, linkId);
  if (!row) return error('Link not found', 404);
  if (row.owner_table !== 'tasks') return error('Only a task link can be promoted to its project', 400);
  const { block, projectId } = await guardLinkOwner(request, env, row);
  if (block) return block;
  if (!projectId) return error('This task has no project to promote the link to', 400);

  const existing = await projectRowFor(env, projectId, row.canonical_url);
  if (existing && existing.role === 'key') {
    return json({ data: await feRow(env, existing.id), created: false });
  }
  if (existing) {
    const res = await patchLink(env, user, existing.id, { role: 'key' }, 'handlePromoteLink');
    if (res.status !== 'accepted' && res.status !== 'merged_clean') return mutationRefused(res);
    return json({ data: await feRow(env, existing.id), created: false });
  }
  let res: Awaited<ReturnType<typeof applyInsert>>;
  try {
    res = await insertProjectLink(env, user, projectId, {
      type: row.type, canonical_url: row.canonical_url, short_title: row.short_title,
      source_raw: row.source_raw, kind: row.kind ?? null,
    }, 'handlePromoteLink');
  } catch (e) {
    // A concurrent promote of the same URL took the natural key first.
    if (isUniqueFailure(e)) {
      const won = await projectRowFor(env, projectId, row.canonical_url);
      if (won) return json({ data: await feRow(env, won.id), created: false });
    }
    throw e;
  }
  if (res.status !== 'accepted' && res.status !== 'merged_clean') return mutationRefused(res);
  const id = (res.canonical_payload?.id as string | undefined) ?? null;
  return json({ data: id ? await feRow(env, id) : res.canonical_payload ?? null, created: true }, 201);
}

// POST /api/projects/:slug/links -- add a document to a project (#151)
//
// Body: { url: string, title?: string, kind?: string | null }. The project
// page's "Add document" form, which replaces the retired project_documents
// form (schema-v146 drops that table). The URL is normalized on the Worker
// with the same generated contract PB uses (shared/pbLinks.generated.ts), so
// a Hub-added row and a PB-added one collapse on the natural key. Layout B has
// no project-only tier, so the row is role='key': it shows "On every task".
// Idempotent: a URL the project holds at key gets only its kind set (when the
// body names one); one it holds archived flips back to key.
// Response: { data: <the project row>, created: boolean }.
export async function handleCreateProjectLink(
  slugOrId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error('JSON body required', 400);
  }
  if (!body || typeof body !== 'object') return error('JSON body required', 400);
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return error('url is required', 400);
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  const k = bodyKind(body);
  if (k.bad) return k.bad;

  const project = await env.DB
    .prepare('SELECT id FROM projects WHERE (slug = ? OR id = ?) AND deleted_at IS NULL LIMIT 1')
    .bind(slugOrId, slugOrId)
    .first<{ id: string }>();
  if (!project) return error('Project not found', 404);
  const block = await assertProjectVisible(request, env, project.id);
  if (block) return block;

  const link = normalizeLink(url, { titleHint: title });
  if (!link) return error(`${JSON.stringify(url)} holds no recognizable link`, 400);
  // A Gmail URL that names no thread and no draft addresses nothing (PB #1867;
  // the normalizer files it as plain `web`). Same refusal PB's add_link makes.
  if (/^https?:\/\/mail\.google\.com\//i.test(link.canonical_url)
      && link.type !== 'gmail_thread' && link.type !== 'gmail_draft') {
    return error('That Gmail URL names no thread or draft', 400);
  }

  const existing = await projectRowFor(env, project.id, link.canonical_url);
  try {
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (existing.role !== 'key') patch.role = 'key';
      if (k.kind !== undefined && (k.kind ?? null) !== (existing.kind ?? null)) patch.kind = k.kind;
      if (Object.keys(patch).length > 0) {
        const res = await patchLink(env, user, existing.id, patch, 'handleCreateProjectLink');
        if (res.status !== 'accepted' && res.status !== 'merged_clean') {
          if (/FOREIGN KEY/.test(res.reason ?? '')) return kindRefused(k.kind);
          return mutationRefused(res);
        }
      }
      return json({ data: await feRow(env, existing.id), created: false });
    }
    const res = await insertProjectLink(env, user, project.id, {
      type: link.type, canonical_url: link.canonical_url, short_title: link.short_title,
      source_raw: link.source_raw ?? null, kind: k.kind ?? null,
    }, 'handleCreateProjectLink');
    if (res.status !== 'accepted' && res.status !== 'merged_clean') {
      if (/FOREIGN KEY/.test(res.reason ?? '')) return kindRefused(k.kind);
      return mutationRefused(res);
    }
    const id = (res.canonical_payload?.id as string | undefined) ?? null;
    return json({ data: id ? await feRow(env, id) : res.canonical_payload ?? null, created: true }, 201);
  } catch (e) {
    if (isForeignKeyFailure(e)) return kindRefused(k.kind);
    if (isUniqueFailure(e)) {
      const won = await projectRowFor(env, project.id, link.canonical_url);
      if (won) return json({ data: await feRow(env, won.id), created: false });
    }
    throw e;
  }
}

function roleClash(role: string, ownerTable: string): Response {
  const owner = ownerTable === 'tasks' ? 'task' : 'project';
  const message = role === 'archive'
    ? 'This URL is already in the archived group'
    : `Another current link on this ${owner} already has this URL`;
  return json({ error: message, rejected: 'error', message }, 409);
}
