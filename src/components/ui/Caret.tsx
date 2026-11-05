/**
 * Caret: the one caret, a typed triangle at 11px (.caret in index.css). It marks a
 * control that opens or folds: `down` opens a menu or is unfolded, `right` is
 * folded, `up` folds again or sorts ascending. Lucide chevrons are for verbs that
 * move something (previous task, move up), never for a picker.
 */
const GLYPH = { down: '▾', up: '▴', right: '▸' } as const

export function Caret({ dir = 'down', className }: { dir?: keyof typeof GLYPH; className?: string }) {
  return <span aria-hidden="true" className={`caret${className ? ` ${className}` : ''}`}>{GLYPH[dir]}</span>
}

export default Caret
