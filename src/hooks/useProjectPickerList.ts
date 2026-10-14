import { useMemo } from 'react'
import { useProjects } from './useApiData'

/**
 * The project list BEHIND the project picker (ProjectInlineGhostSelect).
 *
 * Extracted to its own file (2026-07-21) so that anything rendering an
 * affordance ALONGSIDE the picker resolves the project from the SAME cache the
 * picker's own label comes from.
 *
 * Why that matters — this is not a stylistic split. `useProjects()`
 * (hooks/useApiData) is a DIFFERENT query: its key is ['projects', params] and
 * in DEV it seeds `initialData` from a fixture. A caller that resolved a row's
 * project through THAT hook, while the chip beside it labelled itself from THIS
 * one, could show a project name in the chip and simultaneously fail to resolve
 * the very same slug for a sibling control. Not hypothetical: that is exactly
 * how TaskRowActions' navigation arrow silently failed to render against a live
 * local D1 — the chip said "ARDS Biomarker Pilot" while the arrow's lookup
 * returned nothing. Caught by tests/local/journeys/meeting-row-actions.spec.ts
 * only because the arrow was asserted on the same row that had just been
 * re-routed.
 *
 * One source removes the disagreement by construction instead of guarding
 * against it: two controls reading one cache cannot contradict each other.
 *
 * Update 2026-10-14: the picker no longer has a query of its own. It reads the
 * `useProjects()` cache (key ['projects', undefined]) through a select, so a
 * page that shows the project list and the picker beside it makes ONE
 * /api/projects request, not two (the old key ['projects'] was a second entry
 * for the same URL). The disagreement the note above guards against cannot
 * come back: there is still exactly one cache. In DEV that cache's fixture
 * seed is marked stale (initialDataUpdatedAt: 0 in useProjects), so the real
 * rows replace it on mount.
 */
export type ProjectPickerRow = { id?: string; slug: string; title: string; short_name?: string | null }

export function useProjectPickerList() {
  const query = useProjects()
  // Same row set as the list, trimmed to what a picker reads. Memoized on the
  // cache's own array so consumers keep a stable reference between renders.
  const data = useMemo<ProjectPickerRow[] | undefined>(
    () => query.data?.map((p) => ({ id: p.id, slug: p.slug, title: p.title, short_name: p.short_name })),
    [query.data],
  )
  return { ...query, data }
}
