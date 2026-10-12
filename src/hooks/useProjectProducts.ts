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
 *  rows (the forwarding rule mirrors a single product's stage onto the
 *  project), and activity. */
function refresh(qc: ReturnType<typeof useQueryClient>, slug: string) {
  qc.invalidateQueries({ queryKey: key(slug) })
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['activity'] })
}

/** Set a product's stage from its ladder. Optimistic, rolled back with the
 *  Worker's own reason if the write is refused. */
export function useSetProductStage(slug: string) {
  const qc = useQueryClient()
  const { showError } = useUndoToast()
  return useMutation({
    mutationFn: ({ productId, stage }: { productId: string; stage: string; label: string }) =>
      setProductStage(productId, stage),
    onMutate: async ({ productId, stage, label }) => {
      await qc.cancelQueries({ queryKey: key(slug) })
      const previous = qc.getQueryData<ProjectProducts>(key(slug))
      if (previous) {
        qc.setQueryData<ProjectProducts>(key(slug), {
          ...previous,
          products: previous.products.map((p): ProductRow =>
            p.id === productId ? { ...p, stage, stage_label: label } : p,
          ),
        })
      }
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key(slug), ctx.previous)
      showError(`Could not save stage — ${reason(err)}`)
    },
    onSettled: () => refresh(qc, slug),
  })
}

export function useSetProductHome(slug: string) {
  const qc = useQueryClient()
  const { showError, showSuccess } = useUndoToast()
  return useMutation({
    mutationFn: (productId: string) => setProductHome(productId),
    onSuccess: () => showSuccess('Home product changed'),
    onError: (err) => showError(`Could not change the home product — ${reason(err)}`),
    onSettled: () => refresh(qc, slug),
  })
}

export function useAddProduct(slug: string) {
  const qc = useQueryClient()
  const { showError, showSuccess } = useUndoToast()
  return useMutation({
    mutationFn: (input: NewProductInput) => addProduct(input),
    onSuccess: () => showSuccess('Product added'),
    onError: (err) => showError(`Could not add the product — ${reason(err)}`),
    onSettled: () => refresh(qc, slug),
  })
}
