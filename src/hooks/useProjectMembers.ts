/** TanStack Query hooks for project membership (#145). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addProjectMember,
  fetchMemberProjects,
  fetchProjectMembers,
  removeProjectMember,
  type ProjectMembersResult,
} from '../lib/projectMembersApi'
import { removedSelfOutOfProject } from '../lib/projectMembersRules'

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

export function useRemoveProjectMember(ref: string, userSlug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => removeProjectMember(ref, slug),
    onSuccess: (res: ProjectMembersResult, removedSlug: string) => {
      // Drop the cached list only when the caller removed THEMSELF (the project
      // is no longer theirs to read). An empty list after removing someone else
      // is a real, empty list: keep it.
      if (removedSelfOutOfProject(res, removedSlug, userSlug)) {
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
