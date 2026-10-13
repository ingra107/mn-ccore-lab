import { useMemo } from 'react'
import { useAllProjectProducts } from './useProjectProducts'
import { useProjectPickerList } from './useProjectPickerList'
import type { QuickAddContext } from '../lib/parseQuickAdd'
import type { PairProject } from '../lib/projectPairs'

/** The live project and product lists the quick-add parser resolves
 *  "#project~product" against. Same two reads the pair pickers use.
 *  undefined until the project list has loaded with rows (and after a failed
 *  fetch, which the list reports as empty): the parser then falls back to the
 *  static lookup instead of dropping every #project. */
export function useQuickAddContext(): QuickAddContext | undefined {
  const { data: projects } = useProjectPickerList()
  const { data: bulk } = useAllProjectProducts()
  const byProject = bulk?.byProject
  return useMemo(
    () => (projects && projects.length > 0
      ? { projects: projects as PairProject[], productsByProject: byProject ?? {} }
      : undefined),
    [projects, byProject],
  )
}
