import { useState, useCallback, useEffect } from 'react'

export interface WatchItem {
  id: string
  type: 'project' | 'task' | 'person' | 'meeting'
  label: string
  slug?: string
  addedAt: string
}

const STORAGE_KEY = 'mnccore-watchlist-v1'

function load(): WatchItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchItem[]>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const watch = useCallback((item: Omit<WatchItem, 'addedAt'>) => {
    setItems(prev => {
      if (prev.some(i => i.id === item.id && i.type === item.type)) return prev
      return [...prev, { ...item, addedAt: new Date().toISOString() }]
    })
  }, [])

  const unwatch = useCallback((id: string, type: string) => {
    setItems(prev => prev.filter(i => !(i.id === id && i.type === type)))
  }, [])

  const isWatching = useCallback((id: string, type: string) => {
    return items.some(i => i.id === id && i.type === type)
  }, [items])

  return { items, watch, unwatch, isWatching }
}
