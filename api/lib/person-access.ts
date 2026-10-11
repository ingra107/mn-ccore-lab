// Per-person activity is private to the person and the PI (Nick, 2026-10-11:
// "Members see only their own"). Three routes answer by member slug or list
// every member's activity; each asks this one function who may see whom.
//
//   GET /api/team/pulse                  -> pulseScope: all rows, or the viewer's own
//   GET /api/analytics/contributions     -> mayReadPerson: the slug asked for
//   GET /api/team/:slug/contributions    -> mayReadPerson: the slug asked for
//
// The service key (PB) and a PI read everyone. A signed-in member reads only the
// row whose slug is theirs. Anyone else (nobody, a non-member) reads no one.
import type { Viewer } from './viewer-db';

export function mayReadPerson(viewer: Viewer, isPi: boolean, slug: string): boolean {
  if (viewer.kind === 'service' || isPi) return true;
  return viewer.kind === 'person' && viewer.slug !== '' && viewer.slug.toLowerCase() === slug.toLowerCase();
}

/** What a person-keyed list may hold: every row, or one slug's. */
export type PulseScope = { all: true } | { all: false; self: string | null };

export function pulseScope(viewer: Viewer, isPi: boolean): PulseScope {
  if (viewer.kind === 'service' || isPi) return { all: true };
  return { all: false, self: viewer.kind === 'person' && viewer.slug ? viewer.slug : null };
}
