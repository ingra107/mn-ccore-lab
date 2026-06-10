// api/lib/activity-entry.ts — THE single write primitive for the unified
// activity timeline (Design C, schema-v77). Every human/AI message that used to
// land in task_comments / task_updates (and, in later phases, comments /
// project_updates) writes through postActivityEntry() instead.
//
// Owns, in one place:
//   - validation (kind ∈ STORED_KINDS; update_type required-iff kind='update';
//     known entity_type; entity existence)
//   - @me policy (body prefix OR explicit visibility option → visibility='author')
//   - project_id derivation (task → its project_id; project → entity_id)
//   - id mint ('ae_<random>'), created_at UTC via SQL datetime('now')
//   - source_table/source_id idempotency (partial UNIQUE index)
//   - @mention notifications (preserving the per-kind source_type semantics the
//     existing notification consumers depend on)
//   - Hermes (@hermes|@claude) dispatch + 'Thinking...' placeholder (now itself
//     an activity_entries row), with author-only visibility inheritance
//
// Design ref: docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md
// It deliberately does NOT write the legacy activity_log — existing logActivity()
// call sites stay as-is and are not duplicated here.

import type { AuthUser, Env } from '../helpers';
import { generateId, parseMentions, actorSlugFromRequest, isPiRequest } from '../helpers';
import {
  STORED_KINDS,
  UPDATE_TYPES,
  VISIBILITIES,
  isStoredKind,
  isUpdateType,
  isVisibility,
  type StoredKind,
  type Visibility,
} from '../../shared/activityKinds';

export type EntityType = 'task' | 'project';

// Hermes trigger: @hermes / @claude. DETECT_RE gates dispatch (word-boundary so
// '@claudette' doesn't fire); STRIP_RE removes the mention from the AI prompt
// (global, no word-boundary so trailing punctuation goes too). Module-scope so
// the literals aren't recompiled per write.
const HERMES_DETECT_RE = /@(hermes|claude)\b/i;
const HERMES_STRIP_RE = /@(hermes|claude)/gi;

export interface PostActivityEntryInput {
  env: Env;
  /** The authenticated caller (drives @mention notification title + Hermes requested_by). */
  user: AuthUser;
  entityType: EntityType;
  /** task id or project id (project id-or-slug already resolved by the caller). */
  entityId: string;
  kind: StoredKind;
  /** Raw body as typed by the user — @me prefix is stripped here, not by the caller. */
  body: string;
  /** Canonical actor slug (already resolved via resolveActor at the route layer). */
  actorSlug: string;
  /** Sub-kind for kind='update'. Defaults to 'progress' when kind='update' and unset. */
  updateType?: string | null;
  /**
   * Explicit visibility from a composer toggle. When omitted, the @me body
   * prefix decides. An explicit 'author' wins regardless of the prefix.
   */
  visibility?: Visibility;
  /** Pre-derived project_id for a task entry (saves a SELECT when the caller already has it). */
  taskProjectId?: string | null;
  /** Backfill idempotency: original table + row id. When set, INSERT OR IGNORE + return existing on conflict. */
  sourceTable?: string | null;
  sourceId?: string | null;
  /** kind-specific extras, serialized to metadata_json. */
  metadata?: Record<string, unknown> | null;
  /**
   * When false, suppress the @mention notification + Hermes dispatch side
   * effects (used by the Hermes placeholder/response writes themselves so an
   * AI reply that quotes @someone doesn't re-fire notifications/AI loops).
   * Defaults to true.
   */
  fireSideEffects?: boolean;
}

export type PostActivityEntryResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string; status: number };

/**
 * Apply the @me policy. A trimmed body of exactly '@me' or starting with '@me '
 * (case-insensitive) → author-only, prefix stripped from the stored body. An
 * explicit visibility option of 'author' forces author-only without requiring
 * the prefix (the composer-toggle path). Returns the effective visibility +
 * the body to store.
 */
function applyMePolicy(
  rawBody: string,
  explicit: Visibility | undefined,
): { visibility: Visibility; body: string } {
  const trimmed = rawBody.trim();
  const lower = trimmed.toLowerCase();
  let visibility: Visibility = 'team';
  let body = trimmed;
  if (lower === '@me') {
    visibility = 'author';
    body = '';
  } else if (lower.startsWith('@me ')) {
    visibility = 'author';
    body = trimmed.slice(4).trim();
  }
  // An explicit composer-toggle 'author' wins even without the prefix.
  if (explicit === 'author') visibility = 'author';
  return { visibility, body };
}

/**
 * THE unified activity write. See module header. Returns { ok, row } on success
 * (row is the freshly-read activity_entries record in its canonical shape) or
 * { ok:false, error, status } so the route layer controls the HTTP response.
 */
export async function postActivityEntry(input: PostActivityEntryInput): Promise<PostActivityEntryResult> {
  const {
    env,
    user,
    entityType,
    entityId,
    kind,
    actorSlug,
    sourceTable = null,
    sourceId = null,
    metadata = null,
    fireSideEffects = true,
  } = input;

  // ── validation ────────────────────────────────────────────────────────────
  if (!isStoredKind(kind)) {
    return { ok: false, error: `kind must be one of ${STORED_KINDS.join('|')}`, status: 400 };
  }
  if (entityType !== 'task' && entityType !== 'project') {
    return { ok: false, error: `unknown entity_type "${entityType}" (expected 'task'|'project')`, status: 400 };
  }
  if (input.visibility !== undefined && !isVisibility(input.visibility)) {
    return { ok: false, error: `visibility must be one of ${VISIBILITIES.join('|')}`, status: 400 };
  }

  // update_type is required-iff kind='update'. 'progress' default is acceptable.
  let updateType: string | null = null;
  if (kind === 'update') {
    const ut = (input.updateType ?? 'progress') as string;
    if (!isUpdateType(ut)) {
      return { ok: false, error: `update_type must be one of ${UPDATE_TYPES.join('|')}`, status: 400 };
    }
    updateType = ut;
  } else if (input.updateType) {
    // update_type only valid when kind='update'; reject a stray sub-kind on
    // other kinds so the contract stays tight.
    return { ok: false, error: `update_type is only valid when kind='update'`, status: 400 };
  }

  // ── @me policy (strip prefix, decide visibility) ───────────────────────────
  const { visibility, body } = applyMePolicy(input.body, input.visibility);
  if (!body.trim()) {
    return { ok: false, error: 'body required', status: 400 };
  }

  // ── entity existence + project_id derivation ───────────────────────────────
  let projectId: string | null;
  if (entityType === 'task') {
    if (input.taskProjectId !== undefined) {
      // Caller already resolved the task (e.g. via guardTaskProject) — trust it.
      projectId = input.taskProjectId;
    } else {
      const task = await env.DB.prepare(
        'SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL'
      ).bind(entityId).first<{ project_id: string | null }>();
      if (!task) return { ok: false, error: 'Task not found', status: 404 };
      projectId = task.project_id ?? null;
    }
  } else {
    // project entity: project_id = entity_id; confirm the project row exists.
    const proj = await env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? LIMIT 1'
    ).bind(entityId).first<{ id: string }>();
    if (!proj) return { ok: false, error: 'Project not found', status: 404 };
    projectId = entityId;
  }

  // ── mentions (store on the row regardless of side-effect dispatch) ──────────
  const mentions = parseMentions(body).filter((slug) => slug !== actorSlug);
  const mentionsJson = mentions.length > 0 ? JSON.stringify(mentions) : null;

  // ── insert (idempotent when a backfill source is provided) ─────────────────
  const id = generateId(); // 'ae_'-prefix is conceptual; generateId() mints a hex id (matches comments/updates legacy ids)
  const cols = `(id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, source_table, source_id, created_at)`;
  const vals = `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
  const binds = [
    id,
    entityType,
    entityId,
    projectId,
    kind,
    visibility,
    actorSlug,
    body,
    mentionsJson,
    updateType,
    metadata ? JSON.stringify(metadata) : null,
    sourceTable,
    sourceId,
  ] as const;

  let row: Record<string, unknown> | null;
  if (sourceTable) {
    // Backfill path: INSERT OR IGNORE may skip on a UNIQUE(source_table,
    // source_id) conflict, where RETURNING yields nothing — so insert, then
    // resolve the canonical row (the freshly-inserted one, or the pre-existing
    // one on conflict). Idempotency: a re-run never duplicates.
    await env.DB.prepare(`INSERT OR IGNORE INTO activity_entries ${cols} ${vals}`).bind(...binds).run();
    row = await env.DB.prepare('SELECT * FROM activity_entries WHERE id = ?').bind(id).first<Record<string, unknown>>();
    if (!row) {
      row = await env.DB.prepare(
        'SELECT * FROM activity_entries WHERE source_table = ? AND source_id = ? LIMIT 1'
      ).bind(sourceTable, sourceId).first<Record<string, unknown>>();
    }
  } else {
    // Normal path: no conflict possible, so RETURNING * gives the canonical row
    // in one round trip.
    row = await env.DB.prepare(`INSERT INTO activity_entries ${cols} ${vals} RETURNING *`).bind(...binds).first<Record<string, unknown>>();
  }

  // ── side effects: @mention notifications + Hermes dispatch ──────────────────
  if (fireSideEffects) {
    // Notifications. We PRESERVE the historical per-kind source_type semantics so
    // existing notification consumers (delete-cascade cleanup keyed on
    // source_type IN ('task','task_comment'); notification click-through links)
    // keep working unchanged:
    //   kind='comment' (task)  → source_type='task_comment' (was handleAddTaskComment)
    //   kind='update'  (task)  → source_type='task'         (was handlePostTaskUpdate)
    //   other task kinds       → source_type='task'
    // The link always targets the TASK/PROJECT (?open=), not the entry row, so
    // the click lands on the entity the user cares about.
    try {
      await fireMentionNotifications(env, {
        entityType,
        entityId,
        kind,
        mentions,
        actorName: user.name || user.email,
        bodyPreview: body.slice(0, 200),
      });
    } catch (e) {
      console.error('postActivityEntry: mention notifications failed:', e);
    }

    // Hermes: @hermes|@claude fires the existing ai_requests insert + a
    // 'Thinking about this...' placeholder for ALL kinds (Nick: note-vs-comment
    // distinction is noise). The placeholder is itself an activity_entries row
    // (kind='comment', actor_slug='claude-ai'). When the triggering entry is
    // author-only (@me), the placeholder INHERITS visibility='author' so the AI
    // reply can't leak the note to the team.
    if (HERMES_DETECT_RE.test(body)) {
      try {
        await dispatchHermes(env, {
          entityType,
          entityId,
          entryId: id,
          projectId,
          body,
          visibility,
          requestedBy: user.email,
        });
      } catch (e) {
        console.error('postActivityEntry: Hermes dispatch failed:', e);
      }
    }
  }

  return { ok: true, row: row ?? {} };
}

async function fireMentionNotifications(
  env: Env,
  args: {
    entityType: EntityType;
    entityId: string;
    kind: StoredKind;
    mentions: string[];
    actorName: string;
    bodyPreview: string;
  },
): Promise<void> {
  if (args.mentions.length === 0) return;
  // Preserve historical source_type so the existing delete-cascade
  // (DELETE notifications WHERE source_type IN ('task','task_comment')) and
  // click-through consumers keep matching.
  const sourceType =
    args.entityType === 'task'
      ? args.kind === 'comment'
        ? 'task_comment'
        : 'task'
      : 'project';
  const link =
    args.entityType === 'task'
      ? `/tasks?open=${args.entityId}`
      : `/projects?open=${args.entityId}`;
  const verb = args.kind === 'comment' ? 'mentioned you' : 'mentioned you in a task note';
  const title = `${args.actorName} ${verb}`;
  const stmt = env.DB.prepare(
    'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  await env.DB.batch(
    args.mentions.map((slug) =>
      stmt.bind(generateId(), slug, 'mention', sourceType, args.entityId, title, args.bodyPreview, link)
    )
  );
}

async function dispatchHermes(
  env: Env,
  args: {
    entityType: EntityType;
    entityId: string;
    entryId: string;
    projectId: string | null;
    body: string;
    visibility: Visibility;
    requestedBy: string;
  },
): Promise<void> {
  const aiPrompt = args.body.replace(HERMES_STRIP_RE, '').trim();
  if (aiPrompt.length <= 5) return;

  // source_type mirrors the legacy task-comment Hermes path so the listener
  // routes the response back correctly. Project entities use 'project_comment'
  // (the existing project Hermes convention).
  const sourceType = args.entityType === 'task' ? 'task_comment' : 'project_comment';
  const projectSlug = args.projectId;
  const aiId = generateId();
  await env.DB.prepare(
    'INSERT INTO ai_requests (id, source_type, source_id, project_slug, prompt, context, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(aiId, sourceType, args.entryId, projectSlug, aiPrompt, `${args.entityType}: ${args.entityId}`, args.requestedBy).run();

  // Placeholder so the UI shows "Thinking..." immediately. It is an
  // activity_entries comment authored by claude-ai. fireSideEffects=false so the
  // placeholder doesn't recurse into Hermes/mention dispatch. It inherits the
  // triggering entry's visibility so an author-only (@me) question can't leak
  // via the public AI reply.
  await postActivityEntry({
    env,
    user: { email: 'claude-ai', name: 'Hermes' },
    entityType: args.entityType,
    entityId: args.entityId,
    kind: 'comment',
    body: 'Thinking about this... (AI response pending)',
    actorSlug: 'claude-ai',
    visibility: args.visibility,
    taskProjectId: args.entityType === 'task' ? args.projectId : undefined,
    fireSideEffects: false,
  });
}

// ── Read-side visibility gate ──────────────────────────────────────────────────
//
// Every projection / feed read of activity_entries MUST apply the visibility
// gate IN SQL so author-only (@me) rows never reach the wire for the wrong
// caller. Policy:
//   - API-key / PI callers (server-to-server, canSeePb=true) see ALL rows —
//     including author-only. PB is Nick's own system: his @me notes must flow to
//     /process via the recent feeds. (A browser PI is also canSeePb=true; that's
//     intended — the PI is the author of his own @me notes anyway.)
//   - Browser (team) callers see team rows PLUS their own author-only rows:
//     `visibility='team' OR actor_slug=<their slug>`.

export interface ActivityVisibilityGate {
  /** SQL predicate to AND into the WHERE clause, qualified to the given alias. */
  clause: string;
  /** Bind values for the clause (0 or 1 entries). */
  binds: string[];
}

/**
 * Build the activity_entries visibility gate for a read.
 *
 * @param request  incoming request (used to resolve the browser actor slug)
 * @param env      worker env
 * @param column   the fully-qualified visibility/actor column prefix
 *                 (e.g. 'ae' → `ae.visibility` / `ae.actor_slug`; '' → bare).
 */
export async function activityVisibilityGate(
  request: Request,
  env: Env,
  column = '',
): Promise<ActivityVisibilityGate> {
  const p = column ? `${column}.` : '';
  // canSeePb: API-key + PI callers see everything (including author-only).
  if (await isPiRequest(request, env)) {
    return { clause: '1=1', binds: [] };
  }
  const slug = await actorSlugFromRequest(request, env);
  if (!slug) {
    // Unauthenticated / unresolvable actor: team-only.
    return { clause: `${p}visibility = 'team'`, binds: [] };
  }
  return { clause: `(${p}visibility = 'team' OR ${p}actor_slug = ?)`, binds: [slug] };
}
