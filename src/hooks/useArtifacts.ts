// useArtifacts — react-query hooks for the Artifacts Reference Gallery (schema-v104).
//
// Design ref: docs/superpowers/specs/2026-07-23-artifacts-reference-gallery-design.md.
//
// One place for the gallery + tag reads and the add/remove-tag mutations, shared
// by ArtifactsGalleryPage (the index) and ArtifactPage (the per-artifact editor)
// so the two surfaces can't drift on cache keys or invalidation. Matches the
// useApiData idiom: live API first, { data, count } envelope, staleTime, and the
// standard useMutation → invalidate pattern already used on ArtifactPage.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/** A gallery card row — artifact metadata WITHOUT body_md (the server omits it). */
export interface GalleryArtifact {
  id: string
  title: string
  version: number
  task_id: string | null
  project_id: string | null
  created_by: string
  content_type?: string
  visibility?: string
  created_at: string
  updated_at: string
  tags: string[]
}

export interface ArtifactTagCount {
  tag: string
  count: number
}

/** Tagged artifacts, newest-first. `tag` narrows server-side to one tag. */
export function useArtifactGallery(tag?: string) {
  return useQuery<GalleryArtifact[]>({
    queryKey: ['artifact-gallery', tag ?? null],
    queryFn: async () => {
      const qs = tag ? `?tag=${encodeURIComponent(tag)}` : ''
      const res = await fetch(`/api/artifacts/gallery${qs}`)
      if (!res.ok) return []
      const data = await res.json() as { data?: GalleryArtifact[] }
      return data.data ?? []
    },
    staleTime: 30 * 1000,
  })
}

/**
 * Ids of shelved artifacts whose TITLE or BODY matches `q`.
 *
 * Only ids come back: bodies are far too big to ship to a card grid, so the
 * match happens server-side and the page unions these ids into the shelf it
 * already holds. Empty/blank `q` never hits the network.
 */
export function useArtifactBodySearch(q: string) {
  const term = q.trim()
  return useQuery<string[]>({
    queryKey: ['artifact-search', term],
    queryFn: async () => {
      const res = await fetch(`/api/artifacts/search?q=${encodeURIComponent(term)}`)
      if (!res.ok) return []
      const data = await res.json() as { data?: string[] }
      return data.data ?? []
    },
    enabled: term.length > 0,
    staleTime: 30 * 1000,
    // keep the last matches on screen while the next query is in flight, so
    // typing does not flash the shelf empty between keystrokes
    placeholderData: (prev) => prev,
  })
}

/** Distinct tags + usage counts — filter chips + editor autocomplete. */
export function useArtifactTags() {
  return useQuery<ArtifactTagCount[]>({
    queryKey: ['artifact-tags'],
    queryFn: async () => {
      const res = await fetch('/api/artifact-tags')
      if (!res.ok) return []
      const data = await res.json() as { data?: ArtifactTagCount[] }
      return data.data ?? []
    },
    staleTime: 30 * 1000,
  })
}

/** Add/remove a tag on one artifact. Optimistically patches the single-artifact
 *  cache (['artifact', id].tags), then invalidates the gallery + tag list so
 *  every surface reconciles. Normalization is server-authoritative — the
 *  optimistic value is a best-effort echo; onSettled invalidation reconciles it. */
export function useArtifactTagMutations(artifactId: string) {
  const qc = useQueryClient()
  const key = ['artifact', artifactId]

  // Optimistically rewrite the detail cache's tags; return the snapshot so a
  // failed mutation can roll back. `context` on error carries that snapshot.
  const patchTags = async (fn: (tags: string[]) => string[]) => {
    await qc.cancelQueries({ queryKey: key })
    const prev = qc.getQueryData<{ tags?: string[] } | null>(key)
    if (prev) qc.setQueryData(key, { ...prev, tags: fn(prev.tags ?? []) })
    return { prev }
  }
  const rollback = (ctx: { prev?: { tags?: string[] } | null } | undefined) => {
    if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev)
  }
  const settle = () => {
    qc.invalidateQueries({ queryKey: ['artifact-gallery'] })
    qc.invalidateQueries({ queryKey: ['artifact-tags'] })
    qc.invalidateQueries({ queryKey: key })
  }

  const addTag = useMutation({
    mutationFn: async (tag: string) => {
      const res = await fetch(`/api/artifacts/${artifactId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      if (!res.ok) throw new Error('Failed to add tag')
      return res.json() as Promise<{ data: { tags: string[] } }>
    },
    onMutate: (tag: string) => patchTags((tags) => [...new Set([...tags, tag.trim().toLowerCase()])].sort()),
    onError: (_e, _tag, ctx) => rollback(ctx),
    onSettled: settle,
  })

  const removeTag = useMutation({
    mutationFn: async (tag: string) => {
      const res = await fetch(`/api/artifacts/${artifactId}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to remove tag')
      return res.json() as Promise<{ data: { tags: string[] } }>
    },
    onMutate: (tag: string) => patchTags((tags) => tags.filter((t) => t !== tag)),
    onError: (_e, _tag, ctx) => rollback(ctx),
    onSettled: settle,
  })

  return { addTag, removeTag }
}
