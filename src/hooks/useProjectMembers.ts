/** TanStack Query hooks for project membership (#145). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addProjectMember,
  fetchMemberProjects,
  fetchProjectMembers,
  removeProjectMember,
  type ProjectMembersResult,
} from '../lib/projectMembersApi'

const membersKey = (ref: string) => ['project-members', ref] as const

export function useProjectMembers(ref: string | undefined) {
  return useQuery({
    queryKey: membersKey(ref ?? ''),
    queryFn: async () => (await fetchProjectMembers(ref as string)).data,
    enabled: Boolean(ref),
    staleTime: 30_000,
    retry: false,
  })
}

export function useAddProjectMember(ref: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => addProjectMember(ref, slug),
    onSuccess: (res: ProjectMembersResult) => {
      qc.setQueryData(membersKey(ref), res.data)
      void qc.invalidateQueries({ queryKey: ['member-projects'] })
    },
  })
}

export function useRemoveProjectMember(ref: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => removeProjectMember(ref, slug),
    onSuccess: (res: ProjectMembersResult) => {
      // data is [] when the caller removed themself: the project is no longer
      // theirs to read, so drop its cached list and the project lists too.
      if (res.data.length === 0) {
        qc.removeQueries({ queryKey: membersKey(ref) })
        void qc.invalidateQueries({ queryKey: ['projects'] })
      } else {
        qc.setQueryData(membersKey(ref), res.data)
      }
      void qc.invalidateQueries({ queryKey: ['member-projects'] })
    },
  })
}

export function useMemberProjects(slug: string | undefined) {
  return useQuery({
    queryKey: ['member-projects', slug ?? ''],
    queryFn: async () => (await fetchMemberProjects(slug as string)).data,
    enabled: Boolean(slug),
    staleTime: 30_000,
    retry: false,
  })
}
