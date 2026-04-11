import type { ReactNode } from 'react'

interface TableContainerProps {
  children: ReactNode
  className?: string
}

/**
 * Shared wrapper for data tables.
 * Provides the bordered container, density-aware classes, and overflow handling
 * that matches the project's table-container CSS pattern (index.css).
 */
export default function TableContainer({ children, className }: TableContainerProps) {
  return (
    <div className={`table-container${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
