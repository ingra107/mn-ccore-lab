import React from 'react'

export interface FieldProps {
  label?: string
  required?: boolean
  hint?: string
  htmlFor?: string
  children: React.ReactNode
  noContainer?: boolean
}

/**
 * Shared labeled-field wrapper.
 *
 * Codifies the dominant form-field pattern across modal forms:
 *   - uppercase-ish label (--text-label / --weight-ui / --slate) with optional required '*'
 *   - children wrapped in a div.field-container (reuses existing CSS class) OR bare (noContainer)
 *   - optional hint line below
 *
 * Design tokens are baked in — never literal px.
 * Both light + dark themes work via theme-aware CSS custom properties.
 */
export default function Field({ label, required, hint, htmlFor, children, noContainer }: FieldProps) {
  return (
    <div>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{
            display: 'block',
            fontSize: 'var(--text-label)',
            fontWeight: 'var(--weight-ui)',
            color: 'var(--slate)',
            marginBottom: 'var(--sp-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
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
