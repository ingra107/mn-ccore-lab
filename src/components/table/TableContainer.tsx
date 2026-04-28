import type { ReactNode } from 'react'

interface TableContainerProps {
  children: ReactNode
  className?: string
  /** Reserved for future use. ariaLabel was briefly applied with role="table",
   * but mixed role="grid" wrappers inside TableContainer caused axe
   * aria-required-children — accepted as a no-op for now (2026-04-18). */
  ariaLabel?: string
  /** Optional element id. Used by aria-controls handshakes — e.g. the
   *  Manuscripts category tablist points its tabs at the table id. */
  id?: string
}

/**
 * Shared wrapper for data tables.
 * Provides the bordered container, density-aware classes, and overflow handling
 * that matches the project's table-container CSS pattern (index.css).
 *
 * Intentionally role-free: some callers wrap data rows in role="grid" (Ideas,
 * Decisions) and some don't. Putting role="table" here would conflict with
 * inner grids. Callers that need semantic table roles should apply them
 * directly on their row wrappers.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function TableContainer({ children, className, ariaLabel: _ariaLabel, id }: TableContainerProps) {
  return (
    <div id={id} className={`table-container${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
