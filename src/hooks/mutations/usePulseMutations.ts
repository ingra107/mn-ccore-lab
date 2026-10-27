// What's new / Lab pulse writes (#156): Nick edits, approves or discards the
// release draft and posts announcements. Each refetches the pulse; the server
// refuses anyone but a signed-in PI, so these are offered only to the PI.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PULSE_QUERY_KEY } from '../usePulse'
import { useToast } from '../useToast'
import type { ReleaseBlurb } from '../../../shared/pulse'

async function post(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({})) as { error?: string; data?: unknown }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json.data
}

function usePulseWrite<V>(write: (v: V) => Promise<unknown>, done?: string) {
  const qc = useQueryClient()
  const { showSuccess, showError } = useToast()
  return useMutation({
    mutationFn: write,
    onSuccess: () => { if (done) showSuccess(done) },
    onError: (e: Error) => showError(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: PULSE_QUERY_KEY }),
  })
}

export const useEditRelease = () =>
  usePulseWrite((v: { id: string; title: string; blurbs: ReleaseBlurb[] }) => post(`/api/releases/${v.id}`, { action: 'edit', title: v.title, blurbs: v.blurbs }), 'Draft saved')
export const useApproveRelease = () =>
  // Approve names what Nick read; the server refuses it (409) if the draft changed since.
  usePulseWrite((v: { id: string; reviewed: { commitTo: string; title: string; blurbs: ReleaseBlurb[] } }) =>
    post(`/api/releases/${v.id}`, { action: 'approve', reviewed: v.reviewed }), 'Release published to the lab')
export const useDiscardRelease = () =>
  usePulseWrite((id: string) => post(`/api/releases/${id}`, { action: 'discard' }), 'Draft discarded')
export const usePostAnnouncement = () =>
  usePulseWrite((body: string) => post('/api/announcements', { body }), 'Announcement posted')
export const useDeleteAnnouncement = () =>
  usePulseWrite((id: string) => post(`/api/announcements/${id}/delete`, {}), 'Announcement removed')
