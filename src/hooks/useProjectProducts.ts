import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useUndoToast } from '../components/UndoToast'
import {
  addProduct,
  setProductHome,
  setProductStage,
  type NewProductInput,
  type ProductRow,
  type ProjectProducts,
  type WrittenProduct,
} from '../lib/products'

const key = (slug: string) => ['project-products', slug] as const

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

function reason(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'request failed'
}

/** Refresh everything a product edit can change: its own list, the project
 *  rows (schema-v126 copies a single product's stage onto projects.stage when
 *  it is a project stage), the bulk product read the lists use, and activity. */
function refresh(qc: ReturnType<typeof useQueryClient>, slug: string) {
  qc.invalidateQueries({ queryKey: key(slug) })
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['projects-products'] })
  qc.invalidateQueries({ queryKey: ['activity'] })
}

/** Patch one product in the cached list (never a whole-list snapshot: two
 *  quick moves must not restore each other's stale copy). */
function patchCached(
  qc: ReturnType<typeof useQueryClient>, slug: string, productId: string, patch: Partial<ProductRow>,
) {
  const cur = qc.getQueryData<ProjectProducts>(key(slug))
  if (!cur) return
  qc.setQueryData<ProjectProducts>(key(slug), {
    ...cur,
    products: cur.products.map((p): ProductRow => (p.id === productId ? { ...p, ...patch } : p)),
  })
}

interface StageVars {
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
 *  refusal refetches the truth and shows the Worker's reason. The undo toast
 *  appears only once the write has landed, and its undo is itself a
 *  compare-and-swap against the seq the move produced. */
export function useSetProductStage(slug: string) {
  const qc = useQueryClient()
  const { showError, showUndo } = useUndoToast()
  const m = useMutation({
    mutationFn: (v: StageVars): Promise<WrittenProduct> =>
      setProductStage(slug, v.productId, v.stage, { seq: v.seen.seq, stage: v.seen.stage }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key(slug) })
      patchCached(qc, slug, v.productId, { stage: v.stage, stage_label: v.label })
    },
    onSuccess: (written, v) => {
      patchCached(qc, slug, v.productId, { stage: written.stage, stage_label: written.stage_label, seq: written.seq })
      if (v.undo) return
      showUndo(`${v.productName} → ${written.stage_label}`, () =>
        m.mutate({
          productId: v.productId, stage: v.seen.stage, label: v.seen.label, productName: v.productName,
          seen: { seq: written.seq, stage: written.stage, label: written.stage_label }, undo: true,
        }),
      )
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: key(slug) })
      showError(`Could not save stage — ${reason(err)}`)
    },
    onSettled: () => refresh(qc, slug),
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
