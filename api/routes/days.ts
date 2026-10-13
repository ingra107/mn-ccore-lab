// days.ts — the `day` entity feed (Hermes wave, Phase 3).
//
// A "day" is a civil-date bucket (YYYY-MM-DD) for Today-bar conversations. There
// is NO `days` table by design (§3.1): the date key IS its own existence proof,
// so postActivityEntry validates the SHAPE, and every reader here re-validates
// the date param against the same regex. project_id is always NULL for day rows,
// which structurally excludes them from every project-keyed reader (health,
// insights, project feed) — a Today-bar ask must never move a project score.
//
// The feed is shape-identical to the task/artifact activity feeds so the frontend
// reuses ActivityThread / ActivityEntryItem with no new renderer. The read and the
// post themselves are api/lib/entity-activity-routes.ts (shared with `meeting`);
// what is day-specific is only the id check and the audience.

import { makeEntityActivityRoutes } from '../lib/entity-activity-routes';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET  /api/days/:date/activity — the day's conversation ROOTS (newest-first), each
//   with a viewer-specific reply_count. Day threads default PRIVATE, so the
//   visibility gate means user X sees X's own day threads (+ any shared); the
//   PI/API-key caller sees all (Rule 70).
// POST /api/days/:date/activity — start (or add to) a day conversation. Body:
//   { content, author_slug?, visibility? }. Day threads default PRIVATE (owner §0.1
//   / §7 Q1): the pre-wave daily_thought lane stored the thought in requester-scoped
//   ai_requests, so a morning thought was never team-visible; keep that now that it
//   lands in team-readable activity_entries. An explicit share ({ visibility:'team' })
//   opts in.
//
// ⚠️ The caller KEEPS the `@hermes` token in `content` (§3.4). Under unification the
// stored body is what HERMES_DETECT_RE is tested against — strip it and Hermes never
// fires (a silent no-op that typechecks).
const day = makeEntityActivityRoutes('day', {
  validateId: (date) => (DATE_RE.test(date) ? null : 'date must be a YYYY-MM-DD civil date'),
  defaultVisibility: (requested) => (requested === 'team' ? 'team' : 'author'),
});

export const handleGetDayActivity = day.get;
export const handlePostDayActivity = day.post;
