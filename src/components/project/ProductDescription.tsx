import { useState } from 'react'
import { useDescribeProduct } from '../../hooks/useProjectProducts'
import { productLabel, type ProductRow } from '../../lib/products'

// The selected product's own description, above the project description on the
// Overview (Nick, 2026-10-12: "there should be a description too that's a
// little bit different"; the project description stays the umbrella). A member
// edits it in place: click, type, leave the box to save. Written through the
// project's product route (action 'describe'), open to the project's members.

interface Props {
  slug: string
  product: ProductRow
  canEdit: boolean
}

export default function ProductDescription({ slug, product, canEdit }: Props) {
  const save = useDescribeProduct(slug)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const text = product.description ?? ''

  function begin() {
    if (!canEdit) return
    setDraft(text)
    setEditing(true)
  }
  function commit() {
    setEditing(false)
    if (draft.trim() !== text.trim()) save.mutate({ productId: product.id, description: draft })
  }

  return (
    <div data-testid="product-description" style={{ marginBottom: 'var(--sp-lg)' }}>
      <div style={{ fontSize: 11, color: 'var(--sk-t3)', marginBottom: 'var(--sp-xs)' }}>
        {productLabel(product)} description
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit()
          }}
          rows={3}
          aria-label={`${productLabel(product)} description`}
          data-testid="product-description-input"
          style={{
            width: '100%', fontSize: 'var(--value-size)', color: 'var(--ink)', background: 'var(--sk-card)',
            border: '1px solid var(--sk-line2)', borderRadius: 'var(--radius-md)', padding: '6px 8px', resize: 'vertical',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={begin}
          disabled={!canEdit}
          data-testid="product-description-text"
          style={{
            display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0,
            fontSize: 'var(--value-size)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
            color: text ? 'var(--ink)' : 'var(--slate)', cursor: canEdit ? 'text' : 'default', minHeight: 44,
          }}
        >
          {text || (canEdit ? `Add what ${productLabel(product)} is...` : 'No description yet')}
        </button>
      )}
    </div>
  )
}
