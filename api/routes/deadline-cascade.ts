import type { Env } from '../helpers';
import { json, error, assertProjectVisible, resolveAndGuardProject } from '../helpers';

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
  //
  // P4-exemption (2026-05-28): withExistingRowProject is NOT used here because
  // this is a GET read path that takes project_id from the URL (not an UPDATE
  // on an existing row by row-id). resolveAndGuardProject is the correct primitive
  // for this pattern — it canonicalizes the project_id slug and gates visibility
  // in a single SELECT, which is exactly what withExistingRowProject does internally
  // for its table lookup. The P4 codex flag referred to Update handlers that
  // hand-roll SELECT + assertProjectVisible; this GET handler was already
  // correctly structured and needs no further migration.
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
