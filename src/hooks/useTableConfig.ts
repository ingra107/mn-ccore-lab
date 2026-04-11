import { useState, useCallback, useRef, useEffect } from 'react'

export interface SortConfig {
  key: string
  asc: boolean
}

export interface TableConfig {
  sortKey: string
  sortAsc: boolean
  /** Multi-column sort: first is primary, second is secondary. Max 2. */
  sorts: SortConfig[]
  columnWidths: Record<string, number>
  columnOrder?: string[]
  filters: Record<string, string>
}

const CONFIG_VERSION = 2

function loadConfig(tableId: string, defaults: TableConfig): TableConfig {
  try {
    const raw = localStorage.getItem(`table-config-${tableId}`)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    if (parsed._v !== CONFIG_VERSION) return defaults
    return {
      sortKey: parsed.sortKey ?? defaults.sortKey,
      sortAsc: parsed.sortAsc ?? defaults.sortAsc,
      sorts: parsed.sorts ?? defaults.sorts,
      columnWidths: parsed.columnWidths ?? defaults.columnWidths,
      columnOrder: parsed.columnOrder ?? defaults.columnOrder,
      filters: parsed.filters ?? defaults.filters,
    }
  } catch {
    return defaults
  }
}

function saveConfig(tableId: string, config: TableConfig) {
  try {
    localStorage.setItem(
      `table-config-${tableId}`,
      JSON.stringify({ ...config, _v: CONFIG_VERSION }),
    )
  } catch {
    // localStorage full or unavailable
  }
}

export function useTableConfig(tableId: string, defaults: TableConfig) {
  const [config, setConfig] = useState<TableConfig>(() => loadConfig(tableId, defaults))
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)
  configRef.current = config

  // Debounced save on every config change
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveConfig(tableId, config), 300)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [tableId, config])

  /** Regular click: replace sort entirely (single-column sort) */
  const setSortKey = useCallback((key: string) => {
    setConfig(prev => {
      if (prev.sortKey === key) {
        const newAsc = !prev.sortAsc
        return { ...prev, sortAsc: newAsc, sorts: [{ key, asc: newAsc }] }
      }
      return { ...prev, sortKey: key, sortAsc: true, sorts: [{ key, asc: true }] }
    })
  }, [])

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
  }, [])

  const setColumnWidth = useCallback((col: string, width: number) => {
    setConfig(prev => ({
      ...prev,
      columnWidths: { ...prev.columnWidths, [col]: width },
    }))
  }, [])

  const setColumnWidths = useCallback((widths: Record<string, number>) => {
    setConfig(prev => ({
      ...prev,
      columnWidths: widths,
    }))
  }, [])

  const setColumnOrder = useCallback((order: string[]) => {
    setConfig(prev => ({
      ...prev,
      columnOrder: order,
    }))
  }, [])

  const setFilter = useCallback((key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }))
  }, [])

  const reset = useCallback(() => {
    setConfig(defaults)
    try { localStorage.removeItem(`table-config-${tableId}`) } catch { /* noop */ }
  }, [tableId, defaults])

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
