// shared/activityKinds.ts — the ONE enum source for the unified activity
// timeline (Design C, schema-v77). Imported by BOTH the API (api/lib/*,
// api/routes/*) and the UI (src/*) via relative import so the kind vocabulary
// can never drift between the write primitive and the renderer.
//
// Stored vs derived (per the approved design,
// docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md):
//   - STORED_KINDS go in activity_entries.kind.
//   - The project-feed render kinds ('task-comment', etc.) are DERIVED at render
//     from (entity_type, kind) — they are NEVER stored.

/** Stored values for activity_entries.kind. */
export const STORED_KINDS = ['comment', 'update', 'completion', 'system'] as const;
export type StoredKind = (typeof STORED_KINDS)[number];

/**
 * Sub-kind for kind='update' (activity_entries.update_type). Matches the
 * current task-update UI labels. Only meaningful when kind==='update'.
 */
export const UPDATE_TYPES = ['progress', 'blocker', 'result', 'question', 'session'] as const;
export type UpdateType = (typeof UPDATE_TYPES)[number];

/** activity_entries.visibility. 'author' = author-only (the @me / composer-toggle note). */
export const VISIBILITIES = ['team', 'author'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export function isStoredKind(v: unknown): v is StoredKind {
  return typeof v === 'string' && (STORED_KINDS as readonly string[]).includes(v);
}

export function isUpdateType(v: unknown): v is UpdateType {
  return typeof v === 'string' && (UPDATE_TYPES as readonly string[]).includes(v);
}

export function isVisibility(v: unknown): v is Visibility {
  return typeof v === 'string' && (VISIBILITIES as readonly string[]).includes(v);
}

/**
 * Derived render kind for a row. NEVER stored — computed at render time from the
 * row's entity_type + stored kind. For entity_type='task' this prefixes the
 * stored kind with 'task-' so a project feed can render task-originated rows
 * distinctly (task-comment | task-update | task-completion | task-system).
 * For other entity types the stored kind passes through unprefixed.
 */
export function deriveRenderKind(entityType: string, kind: StoredKind): string {
  if (entityType === 'task') return `task-${kind}`;
  return kind;
}

// ── Task-feed filter taxonomy ─────────────────────────────────────────────────

/** Subset-filter labels used by TaskActivityFeed. */
export const TASK_FEED_FILTERS = ['all', 'discussion', 'notes', 'system'] as const;
export type TaskFeedFilter = (typeof TASK_FEED_FILTERS)[number];

/** Subset-filter labels used by ActivityStream (project feed). */
export const STREAM_FILTERS = ['all', 'notes', 'comments', 'task-activity'] as const;
export type StreamFilter = (typeof STREAM_FILTERS)[number];

/**
 * Returns true if a row's stored kind (plus optional entityType) passes through
 * the given feed filter.
 *
 * Replaces the two private `matchesFilter` functions that were formerly
 * duplicated in TaskActivityFeed and ActivityStream — same logic, one place.
 *
 * @param filter      - The active filter pill value.
 * @param entityType  - activity_entries.entity_type ('task' | 'project' | ...).
 * @param kind        - activity_entries.kind (StoredKind).
 */
export function filterMatchesKind(
  filter: TaskFeedFilter | StreamFilter,
  entityType: string,
  kind: StoredKind,
): boolean {
  if (filter === 'all') return true;

  // ── TaskActivityFeed filters ──────────────────────────────────────────────
  if (filter === 'discussion') return kind === 'comment';
  if (filter === 'notes')      return kind === 'update';
  if (filter === 'system')     return kind === 'completion' || kind === 'system';

  // ── ActivityStream filters ────────────────────────────────────────────────
  // 'task-activity' matches any row whose entity originates from a task.
  if (filter === 'task-activity') return entityType === 'task';
  // 'comments' matches only project-entity comment rows (not task-sourced ones).
  if (filter === 'comments') return kind === 'comment' && entityType !== 'task';

  return true;
}
