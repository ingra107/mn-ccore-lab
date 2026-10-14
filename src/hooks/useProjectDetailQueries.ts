import {
  useProjectUpdates, useComments, useRevisions, useProjectLinks, useProjectPapers,
  useProjectPublications, useTasks, useInsightSuggestions, useProjectDocuments, useConferences,
} from './useApiData'
import { useProjectFiles } from './useProjectFiles'
import { useProjectProducts } from './useProjectProducts'
import { useProjectMembers } from './useProjectMembers'
import { useMyProjectFolder } from './useMyProjectFolder'

/**
 * Start every query a project page makes the moment the URL names the project.
 *
 * ProjectDetail used to resolve the project from the list first and only then
 * mount the inner page whose hooks key off `project.slug`: the list, then ~20
 * sub-queries, then a third wave (three serial rounds, 33-34 calls, measured
 * 2026-10-14). The slug is already in the URL, so none of these has to wait for
 * the list. The same hooks, called here with the URL slug, hit the same cache
 * keys as the page and its children, so each request is made once and the inner
 * page reads a warm cache.
 *
 * Results are deliberately not returned: this is the one place that decides
 * what starts early, and a reader of the data uses the hook itself.
 */
export function useProjectDetailQueries(slug: string | undefined): void {
  const ref = slug ?? ''
  useProjectUpdates(ref)
  useComments(ref)
  useRevisions(ref)
  useProjectLinks(ref)
  useProjectPapers(ref)
  useProjectPublications(slug)
  useProjectFiles(slug)
  useTasks({ project: ref }, { enabled: !!slug })
  useProjectProducts(slug ?? null)
  useProjectMembers(slug)
  useMyProjectFolder(slug)
  useInsightSuggestions(ref)
  useProjectDocuments(ref)
  useConferences(ref)
}
