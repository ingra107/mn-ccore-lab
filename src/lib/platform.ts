/** Modifier key label for shortcut hints: the command glyph on Apple devices, "Ctrl" elsewhere. */
export function modKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl'
}

/** Open the global command palette (it listens for Cmd/Ctrl+K on document). */
export function openCommandPalette(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}
