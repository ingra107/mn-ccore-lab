import { useState, useCallback, useRef, useEffect } from 'react'

export interface TableConfig {
  sortKey: string
  sortAsc: boolean
  columnWidths: Record<string, number>
  filters: Record<string, string>
}

const CONFIG_VERSION = 1

function loadConfig(tableId: string, defaults: TableConfig): TableConfig {
  try {
    const raw = localStorage.getItem(`table-config-${tableId}`)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    if (parsed._v !== CONFIG_VERSION) return defaults
    return {
      sortKey: parsed.sortKey ?? defaults.sortKey,
      sortAsc: parsed.sortAsc ?? defaults.sortAsc,
      columnWidths: parsed.columnWidths ?? defaults.columnWidths,
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

  const setSortKey = useCallback((key: string) => {
    setConfig(prev => {
      if (prev.sortKey === key) {
        return { ...prev, sortAsc: !prev.sortAsc }
      }
      return { ...prev, sortKey: key, sortAsc: true }
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
    setColumnWidth,
    setColumnWidths,
    setFilter,
    reset,
  }
}
