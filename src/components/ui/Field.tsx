import React from 'react'

export interface FieldProps {
  label?: string
  required?: boolean
  hint?: string
  htmlFor?: string
  children: React.ReactNode
  noContainer?: boolean
  /**
   * Label scale. Modal forms split into two intentional sizes:
   *   'label' (default) → --text-label (11px), the standard form-field label.
   *   'micro'           → --text-micro (10px) + 0.06em tracking + 0.85 opacity,
   *                       the denser label used by surfaces like the Decision
   *                       modal. Keeping it a variant (not a hard-coded 10px in
   *                       each modal) lets those surfaces adopt Field without a
   *                       visual shift.
   */
  size?: 'label' | 'micro'
}

/**
 * Shared labeled-field wrapper.
 *
 * Codifies the dominant form-field pattern across modal forms:
 *   - uppercase label (--slate / --weight-ui) with optional required '*'
 *   - children wrapped in a div.field-container (reuses existing CSS class) OR bare (noContainer)
 *   - optional hint line below
 *
 * Design tokens are baked in — never literal px.
 * Both light + dark themes work via theme-aware CSS custom properties.
 */
export default function Field({ label, required, hint, htmlFor, children, noContainer, size = 'label' }: FieldProps) {
  const micro = size === 'micro'
  return (
    <div>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{
            display: 'block',
            fontSize: micro ? 'var(--text-micro)' : 'var(--text-label)',
            fontWeight: 'var(--weight-ui)',
            color: 'var(--slate)',
            opacity: micro ? 0.85 : undefined,
            marginBottom: 'var(--sp-xs)',
            textTransform: 'uppercase',
            letterSpacing: micro ? '0.06em' : '0.04em',
          }}
        >
          {label}
          {required && (
            <span
              aria-hidden="true"
              style={{ color: 'var(--maroon)', marginLeft: 'var(--sp-xs)' }}
            >
              *
            </span>
          )}
        </label>
      )}

      {noContainer ? (
        children
      ) : (
        <div className="field-container">
          {children}
        </div>
      )}

      {hint && (
        <p
          style={{
            fontSize: 'var(--text-micro)',
            color: 'var(--slate)',
            opacity: 0.7,
            marginTop: 'var(--sp-xs)',
          }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
