import { itemMarker, productLabel, type ProductRow } from '../../lib/products'

// A small product marker and re-tag control for a project's files, revisions
// and activity (schema-v131). Nick, 2026-10-12: untagged items are project-wide
// and show under every product with a small "project" marker; tagged items
// carry their product's name. A member re-tags an item with the select.
//
// Shown only for a project with 2+ products: with one there is nothing to tell
// apart, and the tab reads as it always did.

interface Props {
  /** The item's product_id, or null/undefined for project-wide. */
  productId: string | null | undefined
  products: readonly ProductRow[]
  /** What the item is, for the select's name ("Product of notes.pdf"). */
  itemLabel: string
  /** Present for a member: the select re-tags the item. */
  onChange?: (productId: string | null) => void
  testId?: string
}

export default function ProductTag({ productId, products, itemLabel, onChange, testId = 'item-product' }: Props) {
  const marker = itemMarker(productId, products)
  // A tag on a product that is no longer live reads as project-wide.
  const scope = productId && products.some((p) => p.id === productId) ? 'product' : 'project'
  if (marker === null) return null
  if (!onChange) {
    return (
      <>
        <span className="pt-mark" data-testid={testId} data-scope={scope}>{marker}</span>
        <style>{TAG_CSS}</style>
      </>
    )
  }
  return (
    <>
      <select
        className="pt-select"
        value={productId && products.some((p) => p.id === productId) ? productId : ''}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Product of ${itemLabel}`}
        data-testid={testId}
        data-scope={scope}
      >
        <option value="">project</option>
        {products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
      </select>
      <style>{TAG_CSS}</style>
    </>
  )
}

const TAG_CSS = `
.pt-mark { font-size: 11px; color: var(--sk-t3); white-space: nowrap; }
.pt-select {
  max-width: 160px; background: transparent; border: 0; padding: 2px 0; font-size: 11px;
  color: var(--sk-t3); cursor: pointer; text-overflow: ellipsis;
}
.pt-select:hover { color: var(--sk-t1); }
.pt-select:focus-visible { outline: 2px solid var(--job-accent); outline-offset: 1px; }
@media (pointer: coarse), (max-width: 640px) { .pt-select { min-height: 44px; } }
@media (max-width: 640px) { .pt-select { max-width: 104px; } }
`
