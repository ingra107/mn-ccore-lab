/** Modifier key label for shortcut hints: the command glyph on Apple devices, "Ctrl" elsewhere. */
export function modKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl'
}

/** True on a touch-only device (no hover, coarse pointer): the same test
 *  index.css's .kbd-hint uses, for shortcut text CSS cannot reach, such as a
 *  placeholder. A phone has no Ctrl/Cmd+Enter, so the hint is noise there
 *  (artifact Discussion box, phone audit 2026-10-14). */
export function isTouchOnly(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

/** Open the global command palette (it listens for Cmd/Ctrl+K on document). */
export function openCommandPalette(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}
