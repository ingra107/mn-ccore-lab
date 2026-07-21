import { useQuery } from '@tanstack/react-query'

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
 */
export function useProjectPickerList() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) return []
      const data = await res.json()
      return data.data as { slug: string; title: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
