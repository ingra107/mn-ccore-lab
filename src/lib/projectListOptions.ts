// Option sets for the inline editors on a project, in the Today card's
// grayscale (rules-ui-design #1: color is spent, not sprinkled). Shared by the
// Projects list and the project detail meta row so the two cannot drift.
// Status keeps color for blocked and waiting only; stage reads t2; group is
// muted t3. The label colors reach both the trigger and the menu through
// InlineSelect's `color`.
import { PROJECT_STATUS_OPTIONS } from './taskConstants'

export const LIST_T2 = 'var(--sk-t2)'
export const LIST_T3 = 'var(--sk-t3)'

export const STATUS_LIST_OPTIONS = PROJECT_STATUS_OPTIONS.map((o) => ({
  ...o,
  color: o.value === 'blocked' || o.value === 'waiting_external' ? o.color : LIST_T2,
}))

/** Stage options (value + label) recolored to t2. */
export function stageListOptions<S extends string>(stages: readonly S[], labels: Record<S, string>) {
  return stages.map((s) => ({ value: s, label: labels[s], color: LIST_T2 }))
}

/** Any category option set, recolored to muted t3. */
export function mutedCategoryOptions<T extends { value: string; label: string }>(options: T[]): (T & { color: string })[] {
  return options.map((o) => ({ ...o, color: LIST_T3 }))
}
