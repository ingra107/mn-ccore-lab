import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useUndoToast } from '../components/UndoToast'
import {
  addProduct,
  setProductHome,
  setProductStage,
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
      return { byProject: data.byProject ?? {}, kinds: data.kinds ?? [] }
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
      return { products: data.products ?? [], kinds: data.kinds ?? [] }
    },
    staleTime: 30 * 1000,
    enabled: !!slug,
  })
}

/** The words a refusal toast shows. The product route answers a 4xx in plain
 *  words (api/routes/products.ts plainRefusal); anything else (a 5xx, a
 *  dropped connection) has no sentence for a person, so it gets one. */
export function reason(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  if (err instanceof Error && err.message && typeof status === 'number' && status < 500) return err.message
  return 'the Hub did not answer; try again.'
}

/** Refresh everything a product edit can change: its own list, the project
 *  rows (schema-v126 copies a sole manuscript product's stage onto
 *  projects.stage), the bulk product read the lists use, the Grants page,
 *  and activity. */
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
  const { showError, showUndo } = useUndoToast()
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
