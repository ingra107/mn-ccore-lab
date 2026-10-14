// The Grants page's data: grant products (GET /api/grants/timeline) and the
// writes the page makes through the member route (POST /api/projects/:slug/products):
// 'terms' for inline edits and Gantt drags, 'milestone' for post-award
// milestones. A milestone is a task, so marking it done is the task path.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useUndoToast } from '../components/UndoToast'
import { reason } from '../lib/writeFailures'
import type { GrantMilestone, GrantProduct, GrantsTimeline } from '../lib/grants'

export const GRANTS_KEY = ['grants-timeline'] as const

export function useGrantProducts() {
  return useQuery({
    queryKey: GRANTS_KEY,
    queryFn: async (): Promise<GrantsTimeline> => {
      const body = (await fetchApi<unknown>('/api/grants/timeline')) as unknown as Partial<GrantsTimeline>
      return { data: body.data ?? [], kinds: body.kinds ?? [] }
    },
    staleTime: 60 * 1000,
  })
}

export type GrantTermFields = Partial<Pick<GrantProduct,
  'venue' | 'due_date' | 'deadline' | 'period_start' | 'period_end' | 'amount_usd'>>

interface TermVars {
  slug: string
  productId: string
  fields: GrantTermFields
  /** What the screen showed: the seq and the old values (compare-and-swap). */
  seen: { seq: number; values: GrantTermFields }
  /** Toast words ("K23 moved to Jan 2023"). */
  label: string
  /** An undo of a change: no further undo toast. */
  undo?: boolean
}

function patchRow(qc: ReturnType<typeof useQueryClient>, id: string, patch: Partial<GrantProduct>) {
  qc.setQueryData<GrantsTimeline>(GRANTS_KEY, (old) => old && {
    ...old, data: old.data.map((g) => (g.id === id ? { ...g, ...patch } : g)),
  })
}

/** Set a grant's venue, dates or amount. Optimistic on that row; a refusal
 *  refetches the truth and says why. The undo toast appears once the write
 *  lands, and its undo is itself a compare-and-swap on the new seq. */
export function useSetGrantTerms() {
  const qc = useQueryClient()
  const { showUndo, showError } = useUndoToast()
  const m = useMutation({
    mutationFn: async (v: TermVars) => {
      const body = (await fetchApi<unknown>(`/api/projects/${encodeURIComponent(v.slug)}/products`, {
        method: 'POST',
        body: JSON.stringify({ action: 'terms', product_id: v.productId, fields: v.fields, base_seq: v.seen.seq, from: v.seen.values }),
      })) as unknown as { product?: Partial<GrantProduct> & { seq: number } }
      if (!body?.product) throw new Error('the Worker answered without the product')
      return body.product
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: GRANTS_KEY })
      patchRow(qc, v.productId, v.fields)
    },
    onSuccess: (written, v) => {
      const keys = Object.keys(v.fields) as (keyof GrantTermFields)[]
      const landed = Object.fromEntries(keys.map((k) => [k, written[k] ?? null])) as GrantTermFields
      patchRow(qc, v.productId, { ...landed, seq: written.seq })
      if (v.undo) return
      showUndo(v.label, () => m.mutate({
        slug: v.slug, productId: v.productId, fields: v.seen.values, label: v.label, undo: true,
        seen: { seq: written.seq, values: landed },
      }))
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: GRANTS_KEY })
      showError(`Could not save — ${reason(err)}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: GRANTS_KEY })
      qc.invalidateQueries({ queryKey: ['projects-products'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })
  return m
}

export function useAddGrantMilestone() {
  const qc = useQueryClient()
  const { showSuccess, showError } = useUndoToast()
  return useMutation({
    mutationFn: async (v: { slug: string; productId: string; title: string; due_date: string | null; deadline: string | null }) => {
      const body = (await fetchApi<unknown>(`/api/projects/${encodeURIComponent(v.slug)}/products`, {
        method: 'POST',
        body: JSON.stringify({ action: 'milestone', product_id: v.productId, title: v.title, due_date: v.due_date, deadline: v.deadline }),
      })) as unknown as { milestone?: GrantMilestone }
      if (!body?.milestone) throw new Error('the Worker answered without the milestone')
      return body.milestone
    },
    onSuccess: (ms) => showSuccess(`Milestone added: ${ms.title}`),
    onError: (err) => showError(`Could not add the milestone — ${reason(err)}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: GRANTS_KEY })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
