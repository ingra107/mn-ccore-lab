import { useEffect } from 'react'

/**
 * Companion for the DD-7 mobile compose-sheet pattern. When `open`, locks
 * body scroll (prevents iOS rubber-band) and wires Esc-to-close. The caller
 * handles the sheet JSX + positioning; this hook just owns the chrome.
 */
export function useComposeSheet(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
}
