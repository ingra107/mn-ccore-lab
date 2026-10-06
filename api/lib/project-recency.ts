// project-recency.ts — the ONE derivation of "when was this project last worked
// on", for every browser consumer (PB #8236, 2026-10-05).
//
// Two signals feed it, and neither is enough alone:
//   - the activity rollup: MAX(activity_entries.created_at) for the project's
//     own rows plus its tasks' rows (#95). It freezes for a project worked only
//     through PB field writes, because those writes post no timeline line, on
//     purpose (mutations.ts advanceProjectOwnMovement's docstring).
//   - projects.last_meaningful_movement (LMM): advanced on a child task's
//     completion (advanceProjectMovement) and on the project's own content
//     edits (advanceProjectOwnMovement, Hub 29964d57). NULL on projects never
//     moved since the column existed.
//     Known false-fresh direction: LMM moves on ANY non-bookkeeping PB field
//     write (mutations.ts PROJECT_MOVEMENT_EXCLUDED_FIELDS), so a bulk PB
//     metadata pass reads as fresh work -- 16 projects, 3 of them done, were
//     stamped 2026-09-16 13:16-13:42 that way.
//
// Before this, only the Projects-list SORT merged them (src/pages/Projects.tsx
// projectRecencyMs); the "Xd ago" chip, the Today page's stale list and
// relevance signal, and ProjectDetail's "Last activity" read the raw rollup and
// still froze. Merging once here, at the projection every one of them reads,
// leaves nothing for a consumer to forget.
//
// Compared as INSTANTS, never as strings. The rollup is stored space-separated
// UTC ('YYYY-MM-DD HH:MM:SS') and LMM is canonical space-separated UTC too, but
// a legacy or Hub-UI value can be ISO with a zone, and a lexical compare of
// mixed shapes picks the wrong winner (the bug mutations.ts normalizeToUtcSpaceSep
// documents). An unparseable value is ignored, never allowed to win.

import { dbStampToIso } from './time';

function instantMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(dbStampToIso(value));
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The later of the activity rollup and last_meaningful_movement, as the ISO
 * form dbStampToIso gives; null when neither parses.
 */
export function lastWorkedIso(activityLatest: unknown, lastMeaningfulMovement: unknown): string | null {
  const a = instantMs(activityLatest);
  const m = instantMs(lastMeaningfulMovement);
  if (a === null && m === null) return null;
  if (m === null || (a !== null && a >= m)) return dbStampToIso(activityLatest as string);
  return dbStampToIso(lastMeaningfulMovement as string);
}
