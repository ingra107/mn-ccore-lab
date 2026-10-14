import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { reason } from '../lib/writeFailures'
import { useUndoToast } from '../components/UndoToast'
import { suggestPaperLink } from './mutations/useProjectMutations'
import {
  addProduct,
  publishedAPaper,
  describeProduct,
  NO_ROLES,
  setProductEvent,
  setProductHome,
  tagItem,
  type TaggableItem,
  setProductStage,
  type EventFields,
  type NewProductInput,
  type ProductRow,
  type ProductsByProject,
  type ProjectProducts,
  type WrittenProduct,
} from '../lib/products'

const key = (slug: string) => ['project-products', slug] as const
const BULK_KEY = ['projects-products'] as const

/** Every visible project's products, for the list views (Projects stage cell,
 *  Manuscripts stage and drag). One request; the Worker scopes it to the
 *  caller's projects. */
export function useAllProjectProducts() {
  return useQuery({
    queryKey: BULK_KEY,
    queryFn: async (): Promise<ProductsByProject> => {
      const data = (await fetchApi<unknown>('/api/projects/products')) as unknown as Partial<ProductsByProject>
      return { byProject: data.byProject ?? {}, kinds: data.kinds ?? [], roles: data.roles ?? NO_ROLES }
    },
    staleTime: 30 * 1000,
  })
}

/** The live products of one project, with every kind's ladder. Visible to the
 *  project's members (the Worker applies the membership gate). */
export function useProjectProducts(slug: string | null) {
  return useQuery({
    queryKey: key(slug ?? ''),
    queryFn: async (): Promise<ProjectProducts> => {
      const data = (await fetchApi<unknown>(`/api/projects/${encodeURIComponent(slug ?? '')}/products`)) as unknown as Partial<ProjectProducts>
      return { products: data.products ?? [], kinds: data.kinds ?? [], roles: data.roles ?? NO_ROLES }
    },
    staleTime: 30 * 1000,
    enabled: !!slug,
  })
}

/** Refresh everything a product edit can change: its own list, the project
 *  rows (their home_* stage fields are joined from the home product), the
 *  bulk product read the lists use, the Grants page, and activity. */
function refresh(qc: ReturnType<typeof useQueryClient>, slug: string) {
  qc.invalidateQueries({ queryKey: key(slug) })
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: BULK_KEY })
  // The Grants page lists grant products (useGrantProducts' key).
  qc.invalidateQueries({ queryKey: ['grants-timeline'] })
  qc.invalidateQueries({ queryKey: ['activity'] })
}

/** Patch one product in the cached lists, the project's and the bulk one
 *  (never a whole-list snapshot: two quick moves must not restore each
 *  other's stale copy). */
function patchCached(
  qc: ReturnType<typeof useQueryClient>, slug: string, productId: string, patch: Partial<ProductRow>,
) {
  const one = (p: ProductRow): ProductRow => (p.id === productId ? { ...p, ...patch } : p)
  const cur = qc.getQueryData<ProjectProducts>(key(slug))
  if (cur) qc.setQueryData<ProjectProducts>(key(slug), { ...cur, products: cur.products.map(one) })
  const bulk = qc.getQueryData<ProductsByProject>(BULK_KEY)
  if (bulk) {
    const byProject: Record<string, ProductRow[]> = {}
    for (const [pid, list] of Object.entries(bulk.byProject)) byProject[pid] = list.map(one)
    qc.setQueryData<ProductsByProject>(BULK_KEY, { ...bulk, byProject })
  }
}

interface StageVars {
  /** The project's slug: the write goes to POST /api/projects/:slug/products. */
  slug: string
  productId: string
  stage: string
  label: string
  productName: string
  /** The seq and stage this screen showed: the Worker refuses if it moved. */
  seen: { seq: number; stage: string; label: string }
  /** An undo of a move: no further undo toast. */
  undo?: boolean
}

/** Set a product's stage from its ladder. Optimistic on that one product; a
 *  refusal refetches the truth and says why in plain words. The undo toast
 *  appears only once the write has landed, and its undo is itself a
 *  compare-and-swap against the seq the move produced. */
export function useSetProductStage() {
  const qc = useQueryClient()
  const { showError, showUndo, showInfo } = useUndoToast()
  const m = useMutation({
    mutationFn: (v: StageVars): Promise<WrittenProduct> =>
      setProductStage(v.slug, v.productId, v.stage, { seq: v.seen.seq, stage: v.seen.stage }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key(v.slug) })
      await qc.cancelQueries({ queryKey: BULK_KEY })
      patchCached(qc, v.slug, v.productId, { stage: v.stage, stage_label: v.label })
    },
    onSuccess: (written, v) => {
      patchCached(qc, v.slug, v.productId, { stage: written.stage, stage_label: written.stage_label, seq: written.seq })
      if (v.undo) return
      // #129: a manuscript reaching its terminal rung (Published) is the paper
      // coming out, so offer to link the matching publication.
      if (publishedAPaper(written)) suggestPaperLink(qc, showInfo, v.slug)
      showUndo(`${v.productName} → ${written.stage_label}`, () =>
        m.mutate({
          slug: v.slug, productId: v.productId, stage: v.seen.stage, label: v.seen.label, productName: v.productName,
          seen: { seq: written.seq, stage: written.stage, label: written.stage_label }, undo: true,
        }),
      )
    },
    onError: (err, v) => {
      qc.invalidateQueries({ queryKey: key(v.slug) })
      qc.invalidateQueries({ queryKey: BULK_KEY })
      showError(`Could not save stage — ${reason(err)}`)
    },
    onSettled: (_d, _e, v) => refresh(qc, v.slug),
  })
  return m
}

export function useSetProductHome(slug: string) {
  const qc = useQueryClient()
  const { showError, showSuccess } = useUndoToast()
  return useMutation({
    mutationFn: (productId: string) => setProductHome(slug, productId),
    onSuccess: () => showSuccess('Home product changed'),
    onError: (err) => showError(`Could not change the home product — ${reason(err)}`),
    onSettled: () => refresh(qc, slug),
  })
}

export function useAddProduct(slug: string) {
  const qc = useQueryClient()
  const { showError, showSuccess } = useUndoToast()
  return useMutation({
    mutationFn: (input: NewProductInput) => addProduct(slug, input),
    onSuccess: () => showSuccess('Product added'),
    onError: (err) => showError(`Could not add the product — ${reason(err)}`),
    onSettled: () => refresh(qc, slug),
  })
}

/** Save a product's own description (under the project description). */
export function useDescribeProduct(slug: string) {
  const qc = useQueryClient()
  const { showError } = useUndoToast()
  return useMutation({
    mutationFn: (v: { productId: string; description: string }) => describeProduct(slug, v.productId, v.description),
    onError: (err) => showError(`Could not save the description — ${reason(err)}`),
    onSettled: () => refresh(qc, slug),
  })
}

/** Save a product's event date and Nick's role (schema-v135). Optimistic on
 *  that product; a refusal refetches the truth and says why in plain words. */
export function useSetProductEvent(slug: string) {
  const qc = useQueryClient()
  const { showError, showSuccess } = useUndoToast()
  return useMutation({
    mutationFn: (v: { productId: string; fields: Partial<EventFields>; seen: { seq: number; values: Partial<EventFields> } }) =>
      setProductEvent(slug, v.productId, v.fields, v.seen),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key(slug) })
      await qc.cancelQueries({ queryKey: BULK_KEY })
      patchCached(qc, slug, v.productId, v.fields)
    },
    onSuccess: (written, v) => {
      patchCached(qc, slug, v.productId, {
        seq: written.seq,
        event_date: written.event_date ?? null,
        nick_author_position: written.nick_author_position ?? null,
        nick_event_role: written.nick_event_role ?? null,
      })
      showSuccess('Saved')
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: key(slug) })
      qc.invalidateQueries({ queryKey: BULK_KEY })
      showError(`Could not save — ${reason(err)}`)
    },
    onSettled: () => refresh(qc, slug),
  })
}

/** Re-tag a file, revision or activity entry with a product, or null for
 *  project-wide. The row changes in place on the next read of its tab. */
export function useTagItem(slug: string) {
  const qc = useQueryClient()
  const { showError } = useUndoToast()
  return useMutation({
    mutationFn: (v: { item: TaggableItem; id: string; productId: string | null }) => tagItem(slug, v.item, v.id, v.productId),
    onError: (err) => showError(`Could not change the product — ${reason(err)}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['attachments', 'project'] })
      qc.invalidateQueries({ queryKey: ['revisions'] })
      qc.invalidateQueries({ queryKey: ['project-activity', slug] })
    },
  })
}
