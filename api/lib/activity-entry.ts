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
import { generateId, parseMentions, actorSlugFromRequest, isPiRequest, actorSlug } from '../helpers';

// The pending-placeholder body. Written here, matched by the response handler
// (api/routes/ai-requests.ts) and rendered as <HermesPending> by the UI
// (src/components/hermesPendingUtil.ts). One literal, three consumers — do not
// reword it without updating all three.
const HERMES_PENDING_BODY = 'Thinking about this... (AI response pending)';

// #98 thread-context bounds. A follow-up needs the recent exchange, not the
// whole history: unbounded, one long thread would blow the model's context and
// bury the actual question at the end of a wall of text.
const THREAD_CONTEXT_MAX_MESSAGES = 12;
const THREAD_CONTEXT_MAX_CHARS = 8000;
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
// Hermes trigger regexes — SSOT in lib/hermes-mention.ts (shared with
// routes/questions.ts so the trigger pattern can't drift between surfaces).
import { HERMES_DETECT_RE, HERMES_STRIP_RE } from './hermes-mention';
// Artifact key_link at-source hook (Phase 1, 2026-06-23): a comment posted on a
// task whose body carries an artifact portal URL links that artifact into a free
// key_link slot in the SAME atomic batch as the comment insert — mirroring the
// CREATE path (routes/artifacts.ts). Closes the residual the /process band-aid
// (PB _capture_artifacts) was covering; that sweep becomes a pure safety-net.
import { matchAllArtifactUrls, artifactIdFromUrl } from './artifact-url';
import { resolveKeyLinkSlot, hermesKeyLinkDesc, type TaskKeyLinkRow } from './key-link';
// #196: mirror artifact URLs into the synced `links` table (P5 readers) too —
// the slot write alone is invisible to TODAY.md / the Hub link panel.
import { mirrorArtifactLink } from './artifact-link-mirror';

export type EntityType = 'task' | 'project' | 'artifact' | 'day';

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
  /**
   * For project entities: the project's slug, used to preserve the legacy
   * mention-notification link shape (`/projects/<slug>`). Optional — when
   * absent the link falls back to `/projects?open=<entityId>`.
   */
  projectSlug?: string | null;
  /** Backfill idempotency: original table + row id. When set, INSERT OR IGNORE + return existing on conflict. */
  sourceTable?: string | null;
  sourceId?: string | null;
  /** kind-specific extras, serialized to metadata_json. */
  metadata?: Record<string, unknown> | null;
  /**
   * #98 threading. When set, this entry is a REPLY to that entry id.
   *
   * The parent is AUTHORITATIVE for identity: entity_type, entity_id and
   * project_id are copied from it and any caller-supplied values are ignored,
   * so a client can never graft a reply onto a different entity than the
   * comment it appears under. Threads are ONE level deep — replying to a reply
   * is rejected rather than silently re-parented, so `parent_id IS NULL` stays
   * a reliable "is a root" test for every feed.
   *
   * Visibility inherits DOWNWARD only: a reply under an @me root is forced
   * author-only (you cannot widen a private thread by answering it), while a
   * reply may still narrow itself to @me under a team root.
   */
  parentId?: string | null;
  /**
   * When false, suppress the @mention notification + Hermes dispatch side
   * effects (used by the Hermes placeholder/response writes themselves so an
   * AI reply that quotes @someone doesn't re-fire notifications/AI loops).
   * Defaults to true.
   */
  fireSideEffects?: boolean;
}

export type PostActivityEntryResult =
  | {
      ok: true;
      row: Record<string, unknown>;
      /**
       * Set only on the artifact key_link at-source path (task comment whose body
       * carried artifact URL[s]). Mirrors the CREATE path's `linkSkipped`:
       *   'already_linked' — every URL was already in a slot (idempotent no-op)
       *   'slots_full'     — at least one URL had no free slot to land in
       * Absent when no artifact URL was present, every URL linked cleanly, or the
       * entity wasn't a task. The route surfaces it as `linkSkipped` on the
       * response so a non-zero slots_full count is a visible signal.
       */
      linkSkipped?: 'already_linked' | 'slots_full';
    }
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
    kind,
    actorSlug,
    sourceTable = null,
    sourceId = null,
    metadata = null,
    fireSideEffects = true,
  } = input;
  // #98: identity is mutable because a reply INHERITS it from its parent (see
  // the parent-resolution block below). Roots keep exactly what the caller passed.
  let entityType = input.entityType;
  let entityId = input.entityId;
  const parentId = input.parentId ?? null;

  // ── validation ────────────────────────────────────────────────────────────
  if (!isStoredKind(kind)) {
    return { ok: false, error: `kind must be one of ${STORED_KINDS.join('|')}`, status: 400 };
  }
  if (entityType !== 'task' && entityType !== 'project' && entityType !== 'artifact' && entityType !== 'day') {
    return { ok: false, error: `unknown entity_type "${entityType}" (expected 'task'|'project'|'artifact'|'day')`, status: 400 };
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

  // ── #98 parent resolution (reply writes) ───────────────────────────────────
  // Runs BEFORE the @me policy so an author-only root can force its replies
  // author-only, and before entity derivation so the parent's identity is what
  // gets derived against.
  let parentVisibility: Visibility | null = null;
  let parentHiddenAt: string | null = null;
  if (parentId) {
    // activity-hidden-exempt: write-path parent resolution — reads the parent to
    // INHERIT its hidden_at (and visibility) onto the reply; must see a hidden parent.
    const parent = await env.DB.prepare(
      'SELECT id, parent_id, entity_type, entity_id, kind, visibility, hidden_at FROM activity_entries WHERE id = ?'
    ).bind(parentId).first<{
      id: string; parent_id: string | null; entity_type: string;
      entity_id: string; kind: string; visibility: string; hidden_at: string | null;
    }>();
    if (!parent) {
      return { ok: false, error: 'Parent activity entry not found', status: 404 };
    }
    // One level. Replying to a reply is an ERROR, not a silent re-parent onto
    // the root: silently re-parenting would make the UI's reply target differ
    // from where the reply lands, and `parent_id IS NULL` must stay a reliable
    // root test for every feed query.
    if (parent.parent_id) {
      return { ok: false, error: 'Replies are one level deep — reply to the thread root', status: 400 };
    }
    // Lifecycle rows (system/completion) are generated narration, not something
    // a person said; they are not conversational roots.
    if (parent.kind !== 'comment' && parent.kind !== 'update') {
      return { ok: false, error: `Cannot reply to a '${parent.kind}' entry`, status: 400 };
    }
    // Parent is authoritative for identity — see PostActivityEntryInput.parentId.
    entityType = parent.entity_type as EntityType;
    entityId = parent.entity_id;
    parentVisibility = parent.visibility === 'author' ? 'author' : 'team';
    // Inherit the thread's hidden state so a reply to a dismissed root is born
    // hidden too — a late reply must not leak the thread back into any feed (§2.2).
    parentHiddenAt = parent.hidden_at ?? null;
  }

  // ── @me policy (strip prefix, decide visibility) ───────────────────────────
  const { visibility: ownVisibility, body } = applyMePolicy(input.body, input.visibility);
  // Downward-only inheritance: a private thread stays private no matter how the
  // reply was composed; a team thread can still take a private reply.
  const visibility: Visibility = parentVisibility === 'author' ? 'author' : ownVisibility;
  if (!body.trim()) {
    return { ok: false, error: 'body required', status: 400 };
  }

  // ── entity existence + project_id derivation ───────────────────────────────
  let projectId: string | null;
  // Cached by the existence lookup so the owner-notification side effect below
  // doesn't need a second SELECT on the same row (simplify pass 2026-06-11).
  let taskMeta: { assignee: string | null; title: string | null } | null = null;
  if (entityType === 'task') {
    if (input.taskProjectId !== undefined) {
      // Caller already resolved the task (e.g. via guardTaskProject) — trust it.
      projectId = input.taskProjectId;
    } else {
      const task = await env.DB.prepare(
        'SELECT project_id, assignee, title FROM tasks WHERE id = ? AND deleted_at IS NULL'
      ).bind(entityId).first<{ project_id: string | null; assignee: string | null; title: string | null }>();
      if (!task) return { ok: false, error: 'Task not found', status: 404 };
      projectId = task.project_id ?? null;
      taskMeta = { assignee: task.assignee ?? null, title: task.title ?? null };
    }
  } else if (entityType === 'artifact') {
    // artifact entity: project_id = the artifact's origin project_id (so artifact
    // activity rolls up into that project's whole-picture feed when it has one).
    // Confirm the artifact row exists.
    const art = await env.DB.prepare(
      'SELECT project_id FROM artifacts WHERE id = ? LIMIT 1'
    ).bind(entityId).first<{ project_id: string | null }>();
    if (!art) return { ok: false, error: 'Artifact not found', status: 404 };
    projectId = art.project_id ?? null;
  } else if (entityType === 'project') {
    // project entity: project_id = entity_id; confirm the project row exists.
    const proj = await env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? LIMIT 1'
    ).bind(entityId).first<{ id: string }>();
    if (!proj) return { ok: false, error: 'Project not found', status: 404 };
    projectId = entityId;
  } else {
    // day entity (validated above). There is NO `days` table by design: a day row
    // would carry a PK and nothing else, so the civil-date key IS its own
    // existence proof — the SHAPE check is the existence check. Fail closed on
    // anything else so a client can't mint an entity namespace by posting
    // entity_type='day' with an arbitrary entity_id. project_id is ALWAYS NULL: a
    // Today-bar ask must never move a project's health score (§3.2).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entityId)) {
      return { ok: false, error: 'day entity_id must be a YYYY-MM-DD civil date', status: 400 };
    }
    projectId = null;
  }

  // ── mentions (store on the row regardless of side-effect dispatch) ──────────
  const mentions = parseMentions(body).filter((slug) => slug !== actorSlug);
  const mentionsJson = mentions.length > 0 ? JSON.stringify(mentions) : null;

  // ── insert (idempotent when a backfill source is provided) ─────────────────
  const id = generateId(); // 'ae_'-prefix is conceptual; generateId() mints a hex id (matches comments/updates legacy ids)
  // hidden_at is the LAST bind (index 14), appended AFTER parent_id so indices
  // 0-13 are unchanged — phase4-correctness.test.ts's positional asserts (ph[1],
  // ph[2], ph[4], ph[6]) and the INSERT↔column-list contract stay green (§2.3
  // bind-order landmine). NULL for a root; inherited from the parent for a reply.
  const cols = `(id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, source_table, source_id, parent_id, hidden_at, created_at)`;
  const vals = `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
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
    parentId,
    parentHiddenAt,
  ] as const;

  let row: Record<string, unknown> | null;
  let linkSkipped: 'already_linked' | 'slots_full' | undefined;
  if (sourceTable) {
    // Backfill path: INSERT OR IGNORE may skip on a UNIQUE(source_table,
    // source_id) conflict, where RETURNING yields nothing — so insert, then
    // resolve the canonical row (the freshly-inserted one, or the pre-existing
    // one on conflict). Idempotency: a re-run never duplicates. The key_link
    // hook is NOT folded here — backfill is the PB-migration replay path, not a
    // live comment post; the live paths (routes/tasks.ts, ai-requests.ts) never
    // set sourceTable, so the at-source hook below covers every live comment.
    await env.DB.prepare(`INSERT OR IGNORE INTO activity_entries ${cols} ${vals}`).bind(...binds).run();
    // activity-hidden-exempt: write-path read-back of the row just inserted
    row = await env.DB.prepare('SELECT * FROM activity_entries WHERE id = ?').bind(id).first<Record<string, unknown>>();
    if (!row) {
      // activity-hidden-exempt: write-path read-back on UNIQUE(source_table,source_id) conflict
      row = await env.DB.prepare(
        'SELECT * FROM activity_entries WHERE source_table = ? AND source_id = ? LIMIT 1'
      ).bind(sourceTable, sourceId).first<Record<string, unknown>>();
    }
  } else {
    // ── artifact key_link at-source hook ──────────────────────────────────────
    // When a comment lands on a TASK and its body carries one or more artifact
    // portal URLs, link each into a free key_link slot in the SAME DB.batch() as
    // the comment insert — so the comment cannot post without its links landing
    // together (Level-1 atomicity, mirroring routes/artifacts.ts:199). Build the
    // UPDATE statements first, then batch [insert, ...updates].
    const artifactUrls =
      entityType === 'task' && kind === 'comment' ? matchAllArtifactUrls(body) : [];

    const insertStmt = env.DB.prepare(
      `INSERT INTO activity_entries ${cols} ${vals} RETURNING *`
    ).bind(...binds);

    if (artifactUrls.length === 0) {
      // Common path: no artifact URL — single-statement insert, RETURNING * in
      // one round trip (unchanged from before the hook).
      row = await insertStmt.first<Record<string, unknown>>();
    } else {
      const linkResult = await buildArtifactKeyLinkUpdates(env, entityId, artifactUrls);
      linkSkipped = linkResult.linkSkipped;
      if (linkResult.updates.length === 0) {
        // Nothing to link (all already-present and/or no free slots) — plain
        // insert. linkSkipped still reports the reason.
        row = await insertStmt.first<Record<string, unknown>>();
      } else {
        // Atomic: comment insert + every key_link UPDATE in one batch. The first
        // batch result holds the RETURNING * row from the insert.
        const results = await env.DB.batch([insertStmt, ...linkResult.updates]);
        row = (results[0]?.results as Record<string, unknown>[] | undefined)?.[0] ?? null;
        if (!row) {
          // Defensive: re-read if the batch driver didn't surface RETURNING rows.
          // activity-hidden-exempt: write-path read-back of the row just inserted
          row = await env.DB.prepare('SELECT * FROM activity_entries WHERE id = ?').bind(id).first<Record<string, unknown>>();
        }
      }
      // #196: mirror each artifact URL into the synced links table so the P5
      // readers (TODAY.md, Hub link panel) render it — independent of slot
      // availability (uncapped) and idempotent. Runs after the comment+slot
      // batch; never throws (slot is the recoverable fallback).
      for (const url of artifactUrls) {
        const desc = await artifactDescForUrl(env, url);
        await mirrorArtifactLink(env, 'tasks', entityId, url, desc, user);
      }
    }
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
        projectSlug: input.projectSlug ?? null,
      });
    } catch (e) {
      console.error('postActivityEntry: mention notifications failed:', e);
    }

    // Owner re-notification (Nick 2026-06-11: "things should renotify me if i
    // have a comment or something"): a team-visible comment/update on a task
    // notifies the task's ASSIGNEE even without an @mention, so activity on
    // your stuff re-lights the bell. Skips: author-only (@me) entries (notify
    // no one), self-activity (actor == assignee), and assignees already
    // covered by the richer "mentioned you" notification above. Link is the
    // direct portal deep-link — opens the task editor, not "another page".
    if (visibility === 'team' && entityType === 'task' && (kind === 'comment' || kind === 'update')) {
      try {
        const t = taskMeta ?? await env.DB.prepare(
          'SELECT assignee, title FROM tasks WHERE id = ? AND deleted_at IS NULL'
        ).bind(entityId).first<{ assignee: string | null; title: string | null }>();
        const assignee = t?.assignee;
        if (assignee && assignee !== actorSlug && !mentions.includes(assignee)) {
          const actorName = user.name || user.email;
          const verb = kind === 'comment' ? 'commented on' : 'posted an update on';
          const title = `${actorName} ${verb} "${(t?.title ?? 'your task').slice(0, 80)}"`;
          await env.DB.prepare(
            'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(
            generateId(),
            assignee,
            'update',
            kind === 'comment' ? 'task_comment' : 'task',
            entityId,
            title,
            body.slice(0, 200),
            `/portal/my-tasks?open=${entityId}`,
          ).run();
        }
      } catch (e) {
        console.error('postActivityEntry: owner notification failed:', e);
      }
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
          // #98: the thread this ask belongs to. A reply's root is its parent;
          // a root's own thread is itself. Hermes answers INTO that thread
          // rather than starting a new one, and gets the preceding exchange as
          // context so a follow-up ("make that email shorter") means something.
          threadRootId: parentId ?? id,
        });
      } catch (e) {
        console.error('postActivityEntry: Hermes dispatch failed:', e);
      }
    }
  }

  return { ok: true, row: row ?? {}, ...(linkSkipped ? { linkSkipped } : {}) };
}

// ── artifact key_link at-source: build the UPDATE statements ──────────────────
// Given a task id and the artifact URLs found in a comment body, resolve a free
// key_link slot for each (left-to-right) and return the prepared UPDATE
// statements to fold into the comment-insert batch. Reuses resolveKeyLinkSlot +
// hermesKeyLinkDesc (SSOT lib/key-link.ts) so the slot rules match the CREATE
// path. The slot picture is tracked locally across the loop so two URLs in one
// comment don't both grab slot 1.
//
// linkSkipped semantics (mirrors routes/artifacts.ts): 'already_linked' when
// every URL was already present, 'slots_full' when at least one URL had no free
// slot. undefined when ≥1 URL produced a fresh UPDATE.
async function buildArtifactKeyLinkUpdates(
  env: Env,
  taskId: string,
  urls: string[],
): Promise<{ updates: D1PreparedStatement[]; linkSkipped: 'already_linked' | 'slots_full' | undefined }> {
  const task = await env.DB
    .prepare('SELECT key_link_1, key_link_2, key_link_3 FROM tasks WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(taskId)
    .first<TaskKeyLinkRow>();
  if (!task) {
    // Task gone/deleted between the entity check and here — nothing to link.
    // (postActivityEntry already 404s a missing task before this point on the
    // non-caller-provided path; this is the belt-and-braces read.)
    return { updates: [], linkSkipped: undefined };
  }

  // Mutable slot view so sequential URLs fill distinct slots.
  const slots: TaskKeyLinkRow = {
    key_link_1: task.key_link_1,
    key_link_2: task.key_link_2,
    key_link_3: task.key_link_3,
  };
  const updates: D1PreparedStatement[] = [];
  let anyAlreadyPresent = false;
  let anyFull = false;

  for (const url of urls) {
    const { slot, alreadyPresent } = resolveKeyLinkSlot(slots, url);
    if (alreadyPresent) {
      anyAlreadyPresent = true;
      continue;
    }
    if (slot === null) {
      anyFull = true;
      continue;
    }
    const desc = await artifactDescForUrl(env, url);
    updates.push(
      env.DB.prepare(
        `UPDATE tasks SET key_link_${slot} = ?, key_link_${slot}_desc = ? WHERE id = ?`
      ).bind(url, desc, taskId),
    );
    // Reflect the write in the local view so the next URL skips this slot.
    slots[`key_link_${slot}` as keyof TaskKeyLinkRow] = url;
  }

  // Reason only matters when nothing fresh was written. slots_full dominates
  // already_linked (a full task is the actionable signal).
  let linkSkipped: 'already_linked' | 'slots_full' | undefined;
  if (updates.length === 0) {
    if (anyFull) linkSkipped = 'slots_full';
    else if (anyAlreadyPresent) linkSkipped = 'already_linked';
  } else if (anyFull) {
    // Some landed, some didn't fit — still surface the full signal.
    linkSkipped = 'slots_full';
  }
  return { updates, linkSkipped };
}

// Description for a key_link from an artifact URL: prefer the artifact's title
// (`Hermes: <title>`), fall back to a generic label when the row isn't found
// (e.g. URL from a different deploy, or artifact deleted). Never throws.
async function artifactDescForUrl(env: Env, url: string): Promise<string> {
  const artId = artifactIdFromUrl(url);
  if (artId) {
    const art = await env.DB
      .prepare('SELECT title FROM artifacts WHERE id = ? LIMIT 1')
      .bind(artId)
      .first<{ title: string | null }>();
    if (art?.title) return hermesKeyLinkDesc(art.title);
  }
  return hermesKeyLinkDesc('artifact');
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
    projectSlug?: string | null;
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
      : args.entityType === 'artifact'
        ? 'artifact_comment'
        : 'project';
  const link =
    args.entityType === 'task'
      // Direct portal deep-link (2026-06-11) — opens the task editor without
      // the legacy /tasks redirect hop. Old /tasks?open= links still work via
      // the NavigateKeepSearch shim in App.tsx.
      ? `/portal/my-tasks?open=${args.entityId}`
      : args.entityType === 'artifact'
        ? `/portal/artifacts/${args.entityId}`
        : args.projectSlug
          ? `/projects/${args.projectSlug}` // legacy project-mention link shape
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
    /** #98: the thread root this ask belongs to (a root's own id, or a reply's parent). */
    threadRootId?: string;
  },
): Promise<void> {
  const aiPrompt = args.body.replace(HERMES_STRIP_RE, '').trim();
  if (aiPrompt.length <= 5) return;

  // source_type mirrors the legacy task-comment Hermes path so the listener
  // routes the response back correctly. Project entities use 'project_comment'
  // (the existing project Hermes convention); artifacts use 'artifact_comment'
  // so the listener takes the revision path (fetch artifact + comments →
  // regenerate → POST /:id/revise) instead of a plain comment reply. A 'day'
  // ask reuses the pre-existing 'daily_thought' type — verified listener-safe
  // (§9.9): daily_thought takes the listener's DEFAULT path, so no cross-repo
  // change is needed for the day lane, and _postHermesResponse routes the answer
  // back by the TRIGGERING ENTRY's entity_type, not by source_type.
  const sourceType =
    args.entityType === 'task'
      ? 'task_comment'
      : args.entityType === 'artifact'
        ? 'artifact_comment'
        : args.entityType === 'day'
          ? 'daily_thought'
          : 'project_comment';
  const projectSlug = args.projectId;
  const aiId = generateId();

  // context is the listener's entity-routing token ("task: <id>" / "project: <id>").
  // NULL for 'day': the external hub_ai_listener has never parsed a "day: <date>"
  // token, and a bare date needs no entity block. §9.9 verified the listener
  // treats a NULL/falsy context as "no entity" (two independent falsy guards),
  // so this needs no cross-repo lockstep. This also matches today's behavior —
  // deriveEntityContext() already returns null for a date-key source_id.
  const context = args.entityType === 'day' ? null : `${args.entityType}: ${args.entityId}`;

  // #98 multi-turn. Nick: "if I wanted it to do something different with the
  // email, it would have the context of what it did in the prior post."
  //
  // The transcript rides in the PROMPT, not in `context`. `context` is an
  // entity-routing token ("task: <id>") that the external PB listener parses to
  // build its own entity block — changing that field's grammar would break
  // every already-deployed listener, and this must not require a cross-repo
  // lockstep. The listener already feeds `prompt` to the model verbatim, so a
  // fenced envelope reaches it with no listener change at all.
  //
  // Bounded: the root plus the most recent messages, oldest-first, ending just
  // before the message that triggered this dispatch. Pending placeholders are
  // excluded (they carry no content), and the visibility filter matches what
  // the ASKER can see, so a thread transcript can never surface a sibling the
  // requester isn't allowed to read.
  let prompt = aiPrompt;
  // Transcript memory. For a 'day' entity it is DAY-scoped (owner 9.1.5: "day-page
  // memory reach = today only, hidden INCLUDED") — every ask on a given day sees
  // that day's OTHER conversations, so "remember what we talked about this
  // morning" works across separate threads, not just within one. For every other
  // entity it stays THREAD-scoped (this root + its replies). Both are
  // requester-scoped + visibility-gated in SQL, so a transcript can never surface
  // a sibling the asker can't read; hidden rows ARE included (dismiss ≠ forget).
  const dayScoped = args.entityType === 'day';
  const scopeClause = dayScoped ? `entity_type = 'day' AND entity_id = ?1` : `(id = ?1 OR parent_id = ?1)`;
  const scopeBind = dayScoped ? args.entityId : args.threadRootId;
  if (scopeBind) {
    try {
      // activity-hidden-exempt: Hermes transcript (thread- or day-scoped). Owner
      // requirement 9.1.5: dismiss must not mean forget — Hermes sees hidden
      // rows. Requester-scoped + visibility-gated in the WHERE below regardless.
      const priorRes = await env.DB.prepare(
        `SELECT actor_slug, body, created_at FROM activity_entries
          WHERE ${scopeClause}
            AND id != ?2
            AND kind = 'comment'
            AND body != ?3
            AND (visibility = 'team' OR actor_slug = ?4)
          ORDER BY created_at ASC, id ASC`
      ).bind(scopeBind, args.entryId, HERMES_PENDING_BODY, actorSlug(args.requestedBy)).all<{
        actor_slug: string; body: string; created_at: string;
      }>();
      const prior = (priorRes.results ?? []).slice(-THREAD_CONTEXT_MAX_MESSAGES);
      if (prior.length > 0) {
        const transcript = prior
          .map((m) => `[${m.actor_slug === 'claude-ai' ? 'assistant hermes' : `user ${m.actor_slug}`} at ${m.created_at}]\n${m.body}`)
          .join('\n\n')
          .slice(-THREAD_CONTEXT_MAX_CHARS);
        const scopeAttr = dayScoped ? `day="${args.entityId}"` : `root_id="${args.threadRootId}"`;
        prompt =
          `<activity_thread_context version="1" ${scopeAttr}>\n${transcript}\n</activity_thread_context>\n\n` +
          `<current_request>\n${aiPrompt}\n</current_request>`;
      }
    } catch (e) {
      // Context is an ENHANCEMENT — never let assembling it lose the question.
      console.error('dispatchHermes: thread context assembly failed:', e);
    }
  }

  await env.DB.prepare(
    'INSERT INTO ai_requests (id, source_type, source_id, project_slug, prompt, context, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(aiId, sourceType, args.entryId, projectSlug, prompt, context, args.requestedBy).run();

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
    body: HERMES_PENDING_BODY,
    actorSlug: 'claude-ai',
    visibility: args.visibility,
    taskProjectId: args.entityType === 'task' ? args.projectId : undefined,
    fireSideEffects: false,
    // #98: answer INSIDE the thread that asked. Without this the placeholder
    // (and the response that replaces it) landed as a new ROOT on the entity,
    // so asking Hermes a follow-up inside a thread pushed its answer out of
    // that thread entirely — the conversation visibly came apart.
    parentId: args.threadRootId ?? null,
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
  rootColumn?: string,
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
  if (rootColumn) {
    // #98 reply reads. A reply inherits author-only from its root, so under an
    // @me thread EVERY child is visibility='author' — including Hermes's answer,
    // whose actor_slug is 'claude-ai', not the viewer's. Without the third arm
    // the thread's own owner could not read the reply he asked for. The arm is
    // scoped to roots the viewer AUTHORED, so it widens nothing: an author-only
    // root is already invisible to everyone else, hence so are its children.
    const r = `${rootColumn}.`;
    return {
      clause: `(${p}visibility = 'team' OR ${p}actor_slug = ? OR (${r}visibility = 'author' AND ${r}actor_slug = ?))`,
      binds: [slug, slug],
    };
  }
  return { clause: `(${p}visibility = 'team' OR ${p}actor_slug = ?)`, binds: [slug] };
}

/**
 * The hidden-thread gate (schema v102 `hidden_at`). AND this into EVERY read of
 * activity_entries that feeds a timeline, a queue, a badge, or a score. A missed
 * site leaks a dismissed thread silently — `scripts/check-activity-reads.mjs` is
 * the executable check that no read escapes this or an `activity-hidden-exempt:`
 * marker.
 *
 * Hidden is a property of the THREAD: the root and every child carry the same
 * `hidden_at` (postActivityEntry inherits it, and hide/unhide updates root +
 * children together), so this is always a FLAT predicate — never a join.
 *
 * @param alias    column prefix (e.g. 'ae' → `ae.hidden_at`; '' → bare).
 * @param include  the "Show hidden" affordance — the three per-entity feeds pass
 *                 true to reveal dismissed threads on demand; everything else
 *                 (queues, badges, scores, search) never does. Returns `1=1` so
 *                 the call site is uniform whether or not hidden is shown.
 */
export function activityHiddenClause(alias = '', include = false): string {
  if (include) return '1=1';
  return `${alias ? alias + '.' : ''}hidden_at IS NULL`;
}
