// meeting-activity.ts — the `meeting` entity feed (#124).
//
// Nick, on a meeting page: "I need a way to interact with meetings … whether
// it's activity logs or something with hermes or a quick session, just like we
// do with comments and stuff elsewhere." A meeting was the last first-class
// surface in the Hub with no conversation on it — you could read the debrief
// and you could not ask anything about it.
//
// So it becomes an entity_type on the ONE activity store, exactly as `day` did.
// Every property follows from that and nothing here re-implements it: @me
// visibility, @mentions, threaded replies, dismiss, and the @hermes dispatch all
// come from postActivityEntry, and the read and the post are the same pair `day`
// uses (api/lib/entity-activity-routes.ts). The read shape is identical to the
// task / day / artifact feeds, so the frontend reuses ActivityThread with no new
// renderer.
//
// Unlike `day`, a meeting has a real table, so existence is a real lookup
// (postActivityEntry does it). project_id stays NULL — see the meeting entry in
// ENTITY_CONFIG for why a multi-project meeting must not charge its talk to one project.

import { makeEntityActivityRoutes } from '../lib/entity-activity-routes';

// GET  /api/meetings/:id/activity — the meeting's conversation ROOTS (newest-first),
//   each with a viewer-specific reply_count.
// POST /api/meetings/:id/activity — say something on a meeting. Body:
//   { content, author_slug?, visibility? }
//
// Defaults TEAM-visible, unlike `day`. A meeting page is a shared team surface —
// the whole point of talking there is that the people who were in the room can
// read it. A private note is still one keystroke away: the `@me ` body prefix
// (or the composer's lock toggle), and the @hermes-prefix composer posts
// visibility:'author' the way the task lane already does.
//
// ⚠️ The caller KEEPS the `@hermes` token in `content`. The STORED body is what
// HERMES_DETECT_RE is tested against — stripping it is a silent no-op that
// typechecks.
const meeting = makeEntityActivityRoutes('meeting', {
  validateId: (id) => (id?.trim() ? null : 'meeting id required'),
  defaultVisibility: (requested) => (requested === 'author' ? 'author' : 'team'),
});

export const handleGetMeetingActivity = meeting.get;
export const handlePostMeetingActivity = meeting.post;
