import { useEffect, useState } from 'react'
import {
  useProjectUpdates, useComments, useRevisions, useProjectLinkLibrary, useProjectPapers,
  useProjectPublications, useTasks, useInsightSuggestions, useConferences,
} from './useApiData'
import { useProjectFiles } from './useProjectFiles'
import { useProjectProducts } from './useProjectProducts'
import { useProjectMembers } from './useProjectMembers'
import { useMyProjectFolder } from './useMyProjectFolder'

/**
 * Start the queries a project page makes as soon as the URL names the project.
 *
 * ProjectDetail used to resolve the project from the list first and only then
 * mount the inner page whose hooks key off `project.slug`: the list, then ~20
 * sub-queries, then a third round (33-34 calls in three serial waves on the
 * phone profile). The slug is already in the URL, so none of these has to wait
 * for the list. The same hooks, called here with the URL slug, hit the same
 * cache keys as the page and its children, so each request is made once and the
 * inner page reads a warm cache.
 *
 * Two stages. The above-the-fold data (tasks, updates, comments, members) goes
 * out with the list. Sending all ~14 at once made the requests contend with
 * each other on a slow link and delayed the ones the first screen needs (a late
 * skeleton in 4 of 12 loads); the below-the-fold rest (files, papers, links,
 * revisions, products, documents, conferences, insights, folder) starts after
 * the first paint.
 *
 * Results are deliberately not returned: this is the one place that decides
 * what starts early, and a reader of the data uses the hook itself.
 */
export function useProjectDetailQueries(slug: string | undefined): void {
  const ref = slug ?? ''
  // Above the fold: with the list.
  useTasks({ project: ref }, { enabled: !!slug })
  useProjectUpdates(ref)
  useComments(ref)
  useProjectMembers(slug)

  // Below the fold: after the first paint (and never for a slug that was dropped).
  const [releasedFor, setReleasedFor] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!slug) return
    const id = window.setTimeout(() => setReleasedFor(slug), 0)
    return () => window.clearTimeout(id)
  }, [slug])
  const late = !!slug && releasedFor === slug
  const lateRef = late ? ref : ''
  useRevisions(lateRef)
  useProjectLinkLibrary(lateRef)
  useProjectPapers(lateRef)
  useProjectPublications(late ? slug : undefined)
  useProjectFiles(late ? slug : undefined)
  useProjectProducts(late ? (slug ?? null) : null)
  useMyProjectFolder(late ? slug : undefined)
  useInsightSuggestions(lateRef)
  useConferences(lateRef)
}
