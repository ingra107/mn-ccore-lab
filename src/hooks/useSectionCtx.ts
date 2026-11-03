// useSectionCtx: the inputs lib/taskSections.sectionForTask needs, for a surface
// that holds no project map of its own (the task drawers). Today and My Tasks
// build the same value from the lists they already hold.

import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { useProjects } from './useApiData'
import type { SectionCtx } from '../lib/taskSections'

export function useSectionCtx(viewerSlug?: string): SectionCtx {
  const { user } = useAuth()
  const projects = useProjects()
  const data = projects.data
  const projectsBySlug = useMemo(() => {
    const m: SectionCtx['projectsBySlug'] = new Map()
    for (const p of data ?? []) m.set(p.slug, { slug: p.slug, category: p.category ?? null })
    return m
  }, [data])
  return { viewerSlug: viewerSlug ?? user?.slug ?? '', projectsBySlug }
}
