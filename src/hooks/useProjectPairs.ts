import { useCallback, useMemo } from 'react'
import { useAllProjectProducts } from './useProjectProducts'
import { useProjectPickerList } from './useProjectPickerList'
import {
  buildPairOptions, pairLabelFor, pairValueFor, withCurrent, type PairOption, type PairProject,
} from '../lib/projectPairs'

/** The Project ~ Product pair picker's data: options, the value a task stands
 *  on, and the name a task row shows. Reads the same project cache the project
 *  chip labels itself from, and the bulk product read the lists use. */
export function useProjectPairs() {
  const { data: projects = [] } = useProjectPickerList()
  const { data: bulk } = useAllProjectProducts()
  const byProject = bulk?.byProject
  const list = projects as PairProject[]

  const options = useMemo<PairOption[]>(() => buildPairOptions(list, byProject ?? {}), [list, byProject])
  const valueFor = useCallback(
    (slug: string | null | undefined, productId?: string | null) => pairValueFor(slug, productId, list, byProject ?? {}),
    [list, byProject],
  )
  const labelFor = useCallback(
    (baseName: string, slug: string | null | undefined, productId?: string | null) =>
      pairLabelFor(baseName, slug, productId, list, byProject ?? {}),
    [list, byProject],
  )
  const optionsWith = useCallback((current: string) => withCurrent(options, current, list), [options, list])
  return { options, valueFor, labelFor, optionsWith, projects: list }
}

/** The name a task row shows for its project: "Project ~ Product" when the
 *  project has 2+ products. */
export function usePairName(
  task: { project_id?: string | null; product_id?: string | null } | null | undefined, baseName: string,
): string {
  const { labelFor } = useProjectPairs()
  return task ? labelFor(baseName, task.project_id, task.product_id) : baseName
}
