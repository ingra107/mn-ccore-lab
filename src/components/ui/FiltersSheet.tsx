import type { ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import Modal from './Modal'
import { Button } from './Button'

/**
 * Phone headers (Nick's mock, 2026-11-05): a page's filters sit behind one Filters
 * control so rows start higher. The button carries how many are on, so a filtered
 * list never looks like the whole list. The sheet is the shared Modal (a bottom
 * sheet below 1024px).
 */
export function FiltersButton({ count, open, onClick }: { count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="tk-filters-btn hit-area"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={count > 0 ? `Filters, ${count} on` : 'Filters'}
      data-set={count > 0 ? 'true' : undefined}
    >
      <SlidersHorizontal size={13} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      Filters
      {count > 0 && <span className="tk-filters-n">{count}</span>}
    </button>
  )
}

export function FiltersSheet({ open, onClose, count, onClear, children }: {
  open: boolean
  onClose: () => void
  count: number
  onClear: () => void
  children: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      footer={
        <>
          {count > 0 && <Button variant="ghost" type="button" onClick={onClear} style={{ marginRight: 'auto' }}>Clear all</Button>}
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="tk-fsheet">{children}</div>
    </Modal>
  )
}

/** One labelled group inside the sheet. */
export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tk-fsheet-sec" aria-label={label}>
      <h3>{label}</h3>
      {children}
    </section>
  )
}
