import { useCallback } from 'react'
import { useUserPref } from './useUserPref'

// useTableConfig -- a table's sort, column widths, column order and filters,
// one per-person pref per table ('tableConfig.<tableId>', useUserPref): the
// same on every device the person signs in on (PB #911). Widths are pixels,
// so they follow too (Nick asked for an identical view). The store sends the
// value 300 ms after the last change, so a column drag is one write.

interface SortConfig {
  key: string
  asc: boolean
}

interface TableConfig {
  sortKey: string
  sortAsc: boolean
  /** Multi-column sort: first is primary, second is secondary. Max 2. */
  sorts: SortConfig[]
  columnWidths: Record<string, number>
  columnOrder?: string[]
  filters: Record<string, string>
  /** Shape version; a stored config from another shape reads as the defaults. */
  _v?: number
}

const CONFIG_VERSION = 2

function readConfig(stored: unknown, defaults: TableConfig): TableConfig {
  const parsed = (stored && typeof stored === 'object' ? stored : {}) as Partial<TableConfig>
  if (parsed._v !== CONFIG_VERSION) return defaults
  return {
    sortKey: parsed.sortKey ?? defaults.sortKey,
    sortAsc: parsed.sortAsc ?? defaults.sortAsc,
    sorts: parsed.sorts ?? defaults.sorts,
    columnWidths: parsed.columnWidths ?? defaults.columnWidths,
    columnOrder: parsed.columnOrder ?? defaults.columnOrder,
    filters: parsed.filters ?? defaults.filters,
    _v: CONFIG_VERSION,
  }
}

export function useTableConfig(tableId: string, defaults: TableConfig) {
  const validate = useCallback((stored: unknown) => readConfig(stored, defaults), [defaults])
  const [config, setStored, reset] = useUserPref<TableConfig>(`tableConfig.${tableId}`, defaults, validate)
  const setConfig = useCallback((update: (prev: TableConfig) => TableConfig) => {
    setStored((prev) => ({ ...update(prev), _v: CONFIG_VERSION }))
  }, [setStored])

  /** Regular click: replace sort entirely (single-column sort) */
  const setSortKey = useCallback((key: string) => {
    setConfig(prev => {
      if (prev.sortKey === key) {
        const newAsc = !prev.sortAsc
        return { ...prev, sortAsc: newAsc, sorts: [{ key, asc: newAsc }] }
      }
      return { ...prev, sortKey: key, sortAsc: true, sorts: [{ key, asc: true }] }
    })
  }, [setConfig])

  /** Shift+Click: add as secondary sort (max 2 levels) */
  const addSecondarySort = useCallback((key: string) => {
    setConfig(prev => {
      const currentSorts = prev.sorts.length > 0 ? prev.sorts : [{ key: prev.sortKey, asc: prev.sortAsc }]

      // If this key is already in sorts, toggle its direction
      const existingIdx = currentSorts.findIndex(s => s.key === key)
      if (existingIdx >= 0) {
        const updated = [...currentSorts]
        updated[existingIdx] = { ...updated[existingIdx], asc: !updated[existingIdx].asc }
        return {
          ...prev,
          sorts: updated,
          sortKey: updated[0].key,
          sortAsc: updated[0].asc,
        }
      }

      // Add as secondary (keep only primary + this new one, max 2)
      const newSorts: SortConfig[] = [currentSorts[0], { key, asc: true }]
      return {
        ...prev,
        sorts: newSorts,
        sortKey: newSorts[0].key,
        sortAsc: newSorts[0].asc,
      }
    })
  }, [setConfig])

  const setColumnWidth = useCallback((col: string, width: number) => {
    setConfig(prev => ({
      ...prev,
      columnWidths: { ...prev.columnWidths, [col]: width },
    }))
  }, [setConfig])

  const setColumnWidths = useCallback((widths: Record<string, number>) => {
    setConfig(prev => ({
      ...prev,
      columnWidths: widths,
    }))
  }, [setConfig])

  const setColumnOrder = useCallback((order: string[]) => {
    setConfig(prev => ({
      ...prev,
      columnOrder: order,
    }))
  }, [setConfig])

  const setFilter = useCallback((key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }))
  }, [setConfig])

  return {
    config,
    setSortKey,
    addSecondarySort,
    setColumnWidth,
    setColumnWidths,
    setColumnOrder,
    setFilter,
    reset,
  }
}
