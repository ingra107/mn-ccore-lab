import React from 'react'

export interface FieldProps {
  label?: string
  required?: boolean
  hint?: string
  htmlFor?: string
  /** id on the rendered <label> — for callers that need aria-labelledby
   * pointing at the label (e.g. a role="group" wrapper that isn't itself
   * a labelable element, so htmlFor alone doesn't associate). */
  labelId?: string
  children: React.ReactNode
  noContainer?: boolean
}

/**
 * Shared labeled-field wrapper.
 *
 * Codifies the dominant form-field pattern across modal forms:
 *   - sentence-case label (12px, 500, --sk-t2: Today's small-label voice) with
 *     optional required '*'. There is no uppercase or micro variant.
 *   - children wrapped in a div.field-container (reuses existing CSS class) OR bare (noContainer)
 *   - optional hint line below
 *
 * Design tokens are baked in — never literal px.
 * Both light + dark themes work via theme-aware CSS custom properties.
 */
export default function Field({ label, required, hint, htmlFor, labelId, children, noContainer }: FieldProps) {
  return (
    <div>
      {label && (
        <label
          htmlFor={htmlFor}
          id={labelId}
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--sk-t2)',
            marginBottom: 'var(--sp-xs)',
          }}
        >
          {label}
          {required && (
            <span
              aria-hidden="true"
              style={{ color: 'var(--job-danger)', marginLeft: 'var(--sp-xs)' }}
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
