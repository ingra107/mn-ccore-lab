/** TanStack Query hooks for the project directory and requests to join (schema-v139). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  decideJoinRequest,
  fetchJoinRequests,
  fetchProjectListing,
  fetchProjectDirectory,
  requestToJoin,
  setProjectListing,
  type JoinDecision,
} from '../lib/projectJoinApi'
import { isJoinApprover } from '../../shared/joinApprovers'

const DIRECTORY_KEY = ['project-directory'] as const
const REQUESTS_KEY = ['join-requests'] as const
const listingKey = (ref: string) => ['project-listing', ref] as const

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
    mutationFn: ({ id, decision, note }: { id: string; decision: JoinDecision; note: string | null }) =>
      decideJoinRequest(id, decision, note),
    // Refetch on success AND on a 409 (the other approver decided first).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: REQUESTS_KEY })
      void qc.invalidateQueries({ queryKey: DIRECTORY_KEY })
    },
  })
}

export function useProjectListing(ref: string | undefined) {
  return useQuery({
    queryKey: listingKey(ref ?? ''),
    queryFn: async () => (await fetchProjectListing(ref as string)).data,
    enabled: Boolean(ref),
    staleTime: 30_000,
    retry: false,
  })
}

export function useSetProjectListing(ref: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (change: { blurb?: string | null; hidden?: boolean }) => setProjectListing(ref, change),
    onSuccess: (res) => {
      qc.setQueryData(listingKey(ref), res.data)
      void qc.invalidateQueries({ queryKey: DIRECTORY_KEY })
    },
  })
}
