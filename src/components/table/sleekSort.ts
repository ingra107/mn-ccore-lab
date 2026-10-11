// Sort state for SleekTable headers (components/table/SleekRows.tsx). Kept in
// its own module so SleekRows.tsx exports only components (react-refresh).

export type SleekSort = { key: string; dir: 'asc' | 'desc' } | null

/** The header sort cycle: a new column sorts ascending, then descending, then clears. */
export function nextSleekSort(cur: SleekSort, key: string): SleekSort {
  if (!cur || cur.key !== key) return { key, dir: 'asc' }
  return cur.dir === 'asc' ? { key, dir: 'desc' } : null
}
