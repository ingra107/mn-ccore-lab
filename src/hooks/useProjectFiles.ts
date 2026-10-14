import { useQuery } from '@tanstack/react-query'

/** Files attached to a project (tab count + Files tab). One query, one key. */
export function useProjectFiles(slug: string | undefined) {
  return useQuery<Array<unknown>>({
    queryKey: ['attachments', 'project', slug],
    queryFn: async () => {
      const res = await fetch(`/api/files?entity_type=project&entity_id=${slug}`)
      const json = await res.json() as { data: Array<unknown> }
      return json.data || []
    },
    enabled: !!slug,
  })
}
