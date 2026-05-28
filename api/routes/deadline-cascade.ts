import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, assertProjectVisible, projectRefToCanonical, resolveAndGuardProject } from '../helpers';

// ── Types ──────────────────────────────────────────────────

interface DeadlineDep {
  id: string;
  upstream_id: string;
  upstream_type: string;
  downstream_id: string;
  downstream_type: string;
  lag_days: number;
  notes: string | null;
  created_at: string;
}

interface DeadlineNode {
  id: string;
  type: 'milestone' | 'task' | 'deadline';
  title: string;
  due_date: string | null;
  status: string;
  project_id: string | null;
  project_title: string | null;
}

interface CascadeGraph {
  nodes: DeadlineNode[];
  dependencies: DeadlineDep[];
}

// ── Helpers ────────────────────────────────────────────────

async function fetchNodeById(id: string, type: string, env: Env): Promise<DeadlineNode | null> {
  if (type === 'milestone') {
    const row = await env.DB.prepare(
      'SELECT m.id, m.title, m.target_date as due_date, m.status, m.project_id, p.title as project_title FROM milestones m LEFT JOIN projects p ON m.project_id = p.slug WHERE m.id = ?'
    ).bind(id).first();
    if (!row) return null;
    return {
      id: row.id as string,
      type: 'milestone',
      title: row.title as string,
      due_date: row.due_date as string | null,
      status: row.status as string,
      project_id: row.project_id as string | null,
      project_title: row.project_title as string | null,
    };
  }
  if (type === 'task') {
    const row = await env.DB.prepare(
      'SELECT t.id, COALESCE(t.title, t.description) as title, t.due_date, t.status, t.project_id, p.title as project_title FROM tasks t LEFT JOIN projects p ON t.project_id = p.slug WHERE t.id = ?'
    ).bind(id).first();
    if (!row) return null;
    return {
      id: row.id as string,
      type: 'task',
      title: row.title as string,
      due_date: row.due_date as string | null,
      status: row.status as string,
      project_id: row.project_id as string | null,
      project_title: row.project_title as string | null,
    };
  }
  // For 'deadline' type, check both tables
  const milestone = await env.DB.prepare(
    'SELECT m.id, m.title, m.target_date as due_date, m.status, m.project_id, p.title as project_title FROM milestones m LEFT JOIN projects p ON m.project_id = p.slug WHERE m.id = ?'
  ).bind(id).first();
  if (milestone) {
    return {
      id: milestone.id as string,
      type: 'milestone',
      title: milestone.title as string,
      due_date: milestone.due_date as string | null,
      status: milestone.status as string,
      project_id: milestone.project_id as string | null,
      project_title: milestone.project_title as string | null,
    };
  }
  const task = await env.DB.prepare(
    'SELECT t.id, COALESCE(t.title, t.description) as title, t.due_date, t.status, t.project_id, p.title as project_title FROM tasks t LEFT JOIN projects p ON t.project_id = p.slug WHERE t.id = ?'
  ).bind(id).first();
  if (task) {
    return {
      id: task.id as string,
      type: 'task',
      title: task.title as string,
      due_date: task.due_date as string | null,
      status: task.status as string,
      project_id: task.project_id as string | null,
      project_title: task.project_title as string | null,
    };
  }
  return null;
}

// Traverse dependency graph downstream from a node, computing shifted dates
function computeImpact(
  startId: string,
  newDate: string,
  deps: DeadlineDep[],
  nodeMap: Map<string, DeadlineNode>,
): { id: string; type: string; title: string; original_date: string | null; projected_date: string; shift_days: number }[] {
  const results: { id: string; type: string; title: string; original_date: string | null; projected_date: string; shift_days: number }[] = [];
  const visited = new Set<string>();

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    // Return YYYY-MM-DD via UTC getters to avoid .split/.slice lint ban
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // BFS traversal
  const queue: { id: string; effectiveDate: string }[] = [{ id: startId, effectiveDate: newDate }];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const downstream = deps.filter(d => d.upstream_id === current.id);

    for (const dep of downstream) {
      if (visited.has(dep.downstream_id)) continue;
      visited.add(dep.downstream_id);

      const node = nodeMap.get(dep.downstream_id);
      if (!node) continue;

      const projectedDate = addDays(current.effectiveDate, dep.lag_days);
      const originalDate = node.due_date;
      let shiftDays = 0;
      if (originalDate) {
        const orig = new Date(originalDate + 'T12:00:00Z');
        const proj = new Date(projectedDate + 'T12:00:00Z');
        shiftDays = Math.round((proj.getTime() - orig.getTime()) / (1000 * 60 * 60 * 24));
      }

      results.push({
        id: node.id,
        type: node.type,
        title: node.title,
        original_date: originalDate,
        projected_date: projectedDate,
        shift_days: shiftDays,
      });

      queue.push({ id: dep.downstream_id, effectiveDate: projectedDate });
    }
  }

  return results;
}

// ── GET /api/deadline-cascade?project_id= ──────────────────

export async function handleGetCascade(url: URL, request: Request, env: Env): Promise<Response> {
  const rawProjectId = url.searchParams.get('project_id');
  if (!rawProjectId) return error('project_id required', 400);

  // T2.4 (2026-05-28): resolveAndGuardProject combines canonicalize + visibility
  // gate into one DB round-trip (was two SELECTs).
  const { block, projectId } = await resolveAndGuardProject(request, env, rawProjectId);
  if (block) return block;

  // Get all milestones and tasks for this project
  const milestones = await env.DB.prepare(
    'SELECT m.id, m.title, m.target_date as due_date, m.status, m.project_id, p.title as project_title FROM milestones m LEFT JOIN projects p ON m.project_id = p.slug WHERE m.project_id = ? ORDER BY m.target_date ASC'
  ).bind(projectId).all();

  const tasks = await env.DB.prepare(
    'SELECT t.id, COALESCE(t.title, t.description) as title, t.due_date, t.status, t.project_id, p.title as project_title FROM tasks t LEFT JOIN projects p ON t.project_id = p.slug WHERE t.project_id = ? AND t.due_date IS NOT NULL ORDER BY t.due_date ASC'
  ).bind(projectId).all();

  const nodeIds = [
    ...(milestones.results || []).map(r => r.id as string),
    ...(tasks.results || []).map(r => r.id as string),
  ];

  if (nodeIds.length === 0) {
    return json({ data: { nodes: [], dependencies: [] } as CascadeGraph });
  }

  // Get all dependencies where either upstream or downstream is one of these nodes
  const placeholders = nodeIds.map(() => '?').join(',');
  const deps = await env.DB.prepare(
    `SELECT * FROM deadline_dependencies WHERE upstream_id IN (${placeholders}) OR downstream_id IN (${placeholders})`
  ).bind(...nodeIds, ...nodeIds).all();

  const nodes: DeadlineNode[] = [
    ...(milestones.results || []).map(r => ({
      id: r.id as string,
      type: 'milestone' as const,
      title: r.title as string,
      due_date: r.due_date as string | null,
      status: r.status as string,
      project_id: r.project_id as string | null,
      project_title: r.project_title as string | null,
    })),
    ...(tasks.results || []).map(r => ({
      id: r.id as string,
      type: 'task' as const,
      title: r.title as string,
      due_date: r.due_date as string | null,
      status: r.status as string,
      project_id: r.project_id as string | null,
      project_title: r.project_title as string | null,
    })),
  ];

  return json({
    data: {
      nodes,
      dependencies: (deps.results || []) as DeadlineDep[],
    } as CascadeGraph,
  });
}

// ── GET /api/deadline-cascade/impact?id=&type=&new_date= ───
//
// Phase 1b-extended: this returns the projected ripple from changing a single
// node's date. The starting node's project is known via id+type; if it
// resolves to a PB-category project, gate the call (non-PI must not learn
// downstream impact of a PB milestone). We gate at the entry point rather
// than filtering nodes from the result so PI-only graphs return 403, not
// "0 nodes shifted" — which would silently mislead the UI.
export async function handleGetImpact(url: URL, request: Request, env: Env): Promise<Response> {
  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type');
  const newDate = url.searchParams.get('new_date');

  if (!id || !type || !newDate) {
    return error('id, type, and new_date are required', 400);
  }

  const startProjId = await nodeProjectId(env, id, type);
  if (startProjId) {
    const block = await assertProjectVisible(request, env, startProjId);
    if (block) return block;
  }

  // Get all dependencies (full graph)
  const allDeps = await env.DB.prepare('SELECT * FROM deadline_dependencies').all();
  const deps = (allDeps.results || []) as DeadlineDep[];

  // Collect all node IDs referenced in the graph
  const nodeIdsSet = new Set<string>();
  nodeIdsSet.add(id);
  for (const dep of deps) {
    nodeIdsSet.add(dep.upstream_id);
    nodeIdsSet.add(dep.downstream_id);
  }

  // Batch fetch all nodes (two queries instead of N per-node queries)
  const nodeMap = new Map<string, DeadlineNode>();
  const nodeIds = [...nodeIdsSet];
  if (nodeIds.length > 0) {
    const placeholders = nodeIds.map(() => '?').join(',');

    const [milestoneRows, taskRows] = await Promise.all([
      env.DB.prepare(
        `SELECT m.id, m.title, m.target_date as due_date, m.status, m.project_id, p.title as project_title FROM milestones m LEFT JOIN projects p ON m.project_id = p.slug WHERE m.id IN (${placeholders})`
      ).bind(...nodeIds).all(),
      env.DB.prepare(
        `SELECT t.id, COALESCE(t.title, t.description) as title, t.due_date, t.status, t.project_id, p.title as project_title FROM tasks t LEFT JOIN projects p ON t.project_id = p.slug WHERE t.id IN (${placeholders})`
      ).bind(...nodeIds).all(),
    ]);

    for (const row of (milestoneRows.results || [])) {
      nodeMap.set(row.id as string, {
        id: row.id as string,
        type: 'milestone',
        title: row.title as string,
        due_date: row.due_date as string | null,
        status: row.status as string,
        project_id: row.project_id as string | null,
        project_title: row.project_title as string | null,
      });
    }
    // Tasks fill gaps not already covered by milestones
    for (const row of (taskRows.results || [])) {
      if (!nodeMap.has(row.id as string)) {
        nodeMap.set(row.id as string, {
          id: row.id as string,
          type: 'task',
          title: row.title as string,
          due_date: row.due_date as string | null,
          status: row.status as string,
          project_id: row.project_id as string | null,
          project_title: row.project_title as string | null,
        });
      }
    }
  }

  const impact = computeImpact(id, newDate, deps, nodeMap);
  return json({ data: impact });
}

// ── GET /api/deadline-cascade/all ──────────────────────────
// Phase 1b-extended: cross-project feed. For non-PI callers, filter the node
// list to non-PB projects AND drop any dependency edge whose either endpoint
// referenced a PB node — otherwise the response leaks PB node IDs via the
// dependency table even though their content is filtered out.
export async function handleGetAllCascades(env: Env, canSeePb = false): Promise<Response> {
  const pbFilter = canSeePb ? '' : " AND (p.category IS NULL OR p.category != 'Peripheral Brain')";

  const allDeps = await env.DB.prepare('SELECT * FROM deadline_dependencies ORDER BY created_at ASC').all();
  const depsRaw = (allDeps.results || []) as DeadlineDep[];

  // Also get all milestones and tasks with due dates for context
  const milestones = await env.DB.prepare(
    `SELECT m.id, m.title, m.target_date as due_date, m.status, m.project_id, p.title as project_title
     FROM milestones m
     LEFT JOIN projects p ON m.project_id = p.slug OR m.project_id = p.id
     WHERE m.target_date IS NOT NULL${pbFilter}
     ORDER BY m.target_date ASC`
  ).all();

  const tasks = await env.DB.prepare(
    `SELECT t.id, COALESCE(t.title, t.description) as title, t.due_date, t.status, t.project_id, p.title as project_title
     FROM tasks t
     LEFT JOIN projects p ON t.project_id = p.slug OR t.project_id = p.id
     WHERE t.due_date IS NOT NULL AND t.completed = 0${pbFilter}
     ORDER BY t.due_date ASC`
  ).all();

  const nodes: DeadlineNode[] = [
    ...(milestones.results || []).map(r => ({
      id: r.id as string,
      type: 'milestone' as const,
      title: r.title as string,
      due_date: r.due_date as string | null,
      status: r.status as string,
      project_id: r.project_id as string | null,
      project_title: r.project_title as string | null,
    })),
    ...(tasks.results || []).map(r => ({
      id: r.id as string,
      type: 'task' as const,
      title: r.title as string,
      due_date: r.due_date as string | null,
      status: r.status as string,
      project_id: r.project_id as string | null,
      project_title: r.project_title as string | null,
    })),
  ];

  // Drop edges whose either endpoint isn't in the (already PB-filtered) node set.
  const visibleNodeIds = new Set(nodes.map(n => n.id));
  const dependencies = canSeePb
    ? depsRaw
    : depsRaw.filter(d => visibleNodeIds.has(d.upstream_id) && visibleNodeIds.has(d.downstream_id));

  return json({ data: { nodes, dependencies } as CascadeGraph });
}

// ── POST /api/deadline-dependencies ────────────────────────

// Phase 1b-extended helper: resolve the parent project of a milestone/task node
// referenced by a deadline_dependencies row. Returns null when the node is
// project-less or not found (lookup is best-effort).
async function nodeProjectId(env: Env, nodeId: string, nodeType: string): Promise<string | null> {
  if (nodeType === 'milestone') {
    const r = await env.DB.prepare('SELECT project_id FROM milestones WHERE id = ?').bind(nodeId).first<{ project_id: string | null }>();
    return r?.project_id ?? null;
  }
  if (nodeType === 'task') {
    const r = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ?').bind(nodeId).first<{ project_id: string | null }>();
    return r?.project_id ?? null;
  }
  // 'deadline' — check milestones then tasks
  const m = await env.DB.prepare('SELECT project_id FROM milestones WHERE id = ?').bind(nodeId).first<{ project_id: string | null }>();
  if (m) return m.project_id ?? null;
  const t = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ?').bind(nodeId).first<{ project_id: string | null }>();
  return t?.project_id ?? null;
}

export async function handleCreateDeadlineDependency(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    upstream_id: string;
    upstream_type: string;
    downstream_id: string;
    downstream_type: string;
    lag_days?: number;
    notes?: string;
  };

  if (!body.upstream_id || !body.upstream_type) return error('upstream_id and upstream_type required', 400);
  if (!body.downstream_id || !body.downstream_type) return error('downstream_id and downstream_type required', 400);

  const validTypes = ['milestone', 'task', 'deadline'];
  if (!validTypes.includes(body.upstream_type)) return error(`Invalid upstream_type. Must be: ${validTypes.join(', ')}`, 400);
  if (!validTypes.includes(body.downstream_type)) return error(`Invalid downstream_type. Must be: ${validTypes.join(', ')}`, 400);

  if (body.upstream_id === body.downstream_id) return error('Cannot create self-referencing dependency', 400);

  // Phase 1b-extended: deadline_dependencies span a graph that can cross
  // projects. Gate BOTH endpoints (upstream + downstream) so a non-PI cannot
  // attach a PB milestone/task to a non-PB one (or vice versa) and use the
  // edge to leak/poison a PB cascade.
  const upstreamProjId = await nodeProjectId(env, body.upstream_id, body.upstream_type);
  if (upstreamProjId) {
    const block = await assertProjectVisible(request, env, upstreamProjId);
    if (block) return block;
  }
  const downstreamProjId = await nodeProjectId(env, body.downstream_id, body.downstream_type);
  if (downstreamProjId) {
    const block = await assertProjectVisible(request, env, downstreamProjId);
    if (block) return block;
  }

  // Check for duplicate
  const existing = await env.DB.prepare(
    'SELECT id FROM deadline_dependencies WHERE upstream_id = ? AND downstream_id = ?'
  ).bind(body.upstream_id, body.downstream_id).first();
  if (existing) return error('Dependency already exists', 409);

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO deadline_dependencies (id, upstream_id, upstream_type, downstream_id, downstream_type, lag_days, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.upstream_id, body.upstream_type, body.downstream_id, body.downstream_type, body.lag_days || 0, body.notes || null).run();

  await logActivity(env, 'deadline_dependency', `Dependency created: ${body.upstream_type} → ${body.downstream_type}`, actorSlug(user.email), id, 'deadline_dependency');

  const created = await env.DB.prepare('SELECT * FROM deadline_dependencies WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/deadline-dependencies/:id/delete ─────────────
// Hard-delete (deadline_dependencies has no deleted_at column).
// SEC-10.3: Idempotent — check meta.changes; repeat calls return 200 with
// idempotent:true instead of 404.
// Phase 1b-extended: gate on the existing edge's BOTH endpoints (mirrors
// handleCreateDeadlineDependency). If the row is already gone we return 200
// idempotent without leaking existence.
//
// Z4.3 exempt: deadline_dependencies straddles TWO project IDs (upstream_id +
// downstream_id). idempotentDelete() supports a single project_id gate via a
// single assertProjectVisible call; this handler needs a DOUBLE gate — one for
// the upstream node's project and one for the downstream node's project. Until
// idempotentDelete() gains a multi-project hook, this delete stays hand-rolled
// with the double gate preserved exactly as written below.
export async function handleDeleteDeadlineDependency(id: string, request: Request, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT upstream_id, upstream_type, downstream_id, downstream_type FROM deadline_dependencies WHERE id = ?'
  ).bind(id).first<{ upstream_id: string; upstream_type: string; downstream_id: string; downstream_type: string }>();
  if (existing) {
    const upstreamProjId = await nodeProjectId(env, existing.upstream_id, existing.upstream_type);
    if (upstreamProjId) {
      const block = await assertProjectVisible(request, env, upstreamProjId);
      if (block) return block;
    }
    const downstreamProjId = await nodeProjectId(env, existing.downstream_id, existing.downstream_type);
    if (downstreamProjId) {
      const block = await assertProjectVisible(request, env, downstreamProjId);
      if (block) return block;
    }
  }
  const result = await env.DB.prepare('DELETE FROM deadline_dependencies WHERE id = ?').bind(id).run();
  const changed = (result.meta?.changes ?? 0) > 0;
  return json({ data: { deleted: true, id, idempotent: !changed } });
}
