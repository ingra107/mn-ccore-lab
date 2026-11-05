/**
 * Caret: the one caret, a typed triangle at 11px (.caret in index.css draws it, so
 * it is never part of a label's text). It marks a control that opens or folds:
 * `down` opens a menu or is unfolded, `right` is folded, `up` folds again or sorts
 * ascending. Lucide chevrons are for verbs that move something (previous task,
 * move up), never for a picker.
 */
export function Caret({ dir = 'down', className }: { dir?: 'down' | 'up' | 'right'; className?: string }) {
  return <span aria-hidden="true" className={`caret${dir === 'down' ? '' : ` caret-${dir}`}${className ? ` ${className}` : ''}`} />
}

export default Caret
