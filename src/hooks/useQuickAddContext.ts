import { useMemo } from 'react'
import { useAllProjectProducts } from './useProjectProducts'
import { useProjectPickerList } from './useProjectPickerList'
import type { QuickAddContext } from '../lib/parseQuickAdd'
import type { PairProject } from '../lib/projectPairs'

/** The live project and product lists the quick-add parser resolves
 *  "#project~product" against. Same two reads the pair pickers use. */
export function useQuickAddContext(): QuickAddContext {
  const { data: projects = [] } = useProjectPickerList()
  const { data: bulk } = useAllProjectProducts()
  const byProject = bulk?.byProject
  return useMemo(
    () => ({ projects: projects as PairProject[], productsByProject: byProject ?? {} }),
    [projects, byProject],
  )
}
