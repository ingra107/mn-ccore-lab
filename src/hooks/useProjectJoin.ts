/** TanStack Query hooks for the project directory and requests to join (schema-v139). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  decideJoinRequest,
  fetchJoinRequests,
  fetchProjectBlurb,
  fetchProjectDirectory,
  requestToJoin,
  setProjectBlurb,
} from '../lib/projectJoinApi'
import { isJoinApprover } from '../../shared/joinApprovers'

const DIRECTORY_KEY = ['project-directory'] as const
const REQUESTS_KEY = ['join-requests'] as const
const blurbKey = (ref: string) => ['project-blurb', ref] as const

export function useProjectDirectory(enabled = true) {
  return useQuery({
    queryKey: DIRECTORY_KEY,
    queryFn: async () => (await fetchProjectDirectory()).data,
    enabled,
    staleTime: 30_000,
    retry: false,
  })
}

export function useRequestToJoin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, note }: { projectId: string; note: string | null }) => requestToJoin(projectId, note),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: DIRECTORY_KEY }) },
  })
}

/** Nick and Nate only; for anyone else the query never runs. */
export function useJoinRequests(slug: string | undefined) {
  return useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: async () => (await fetchJoinRequests()).data,
    enabled: isJoinApprover(slug),
    staleTime: 30_000,
    retry: false,
  })
}

export function useDecideJoinRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'decline'; note: string | null }) =>
      decideJoinRequest(id, decision, note),
    // Refetch on success AND on a 409 (the other approver decided first).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: REQUESTS_KEY })
      void qc.invalidateQueries({ queryKey: DIRECTORY_KEY })
    },
  })
}

export function useProjectBlurb(ref: string | undefined) {
  return useQuery({
    queryKey: blurbKey(ref ?? ''),
    queryFn: async () => (await fetchProjectBlurb(ref as string)).data,
    enabled: Boolean(ref),
    staleTime: 30_000,
    retry: false,
  })
}

export function useSetProjectBlurb(ref: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (blurb: string | null) => setProjectBlurb(ref, blurb),
    onSuccess: (res) => {
      qc.setQueryData(blurbKey(ref), res.data)
      void qc.invalidateQueries({ queryKey: DIRECTORY_KEY })
    },
  })
}
