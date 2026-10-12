/** My folder for a project (schema-v127, api/routes/project-member-folders.ts). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'

export interface MyFolder {
  folder_path: string
  updated_at: string
}

export interface MyFolderResult {
  data: MyFolder | null
  /** True when the caller is a member of the project (only members keep a folder). */
  can_set: boolean
  project_id: string
}

const base = (ref: string) => `/api/projects/${encodeURIComponent(ref)}/my-folder`
const key = (ref: string) => ['my-project-folder', ref] as const

export function useMyProjectFolder(ref: string | undefined) {
  return useQuery({
    queryKey: key(ref ?? ''),
    queryFn: async () => (await fetchApi<MyFolder | null>(base(ref as string))) as unknown as MyFolderResult,
    enabled: Boolean(ref),
    staleTime: 60_000,
    retry: false,
  })
}

export function useSetMyProjectFolder(ref: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (folderPath: string) =>
      (await fetchApi<MyFolder>(base(ref), { method: 'POST', body: JSON.stringify({ folder_path: folderPath }) })) as unknown as MyFolderResult,
    onSuccess: (res) => qc.setQueryData(key(ref), res),
  })
}

export function useClearMyProjectFolder(ref: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => (await fetchApi<null>(base(ref), { method: 'DELETE' })) as unknown as MyFolderResult,
    onSuccess: (res) => qc.setQueryData(key(ref), res),
  })
}
