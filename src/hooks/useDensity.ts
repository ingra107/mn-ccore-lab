import { useState, useEffect, useCallback } from 'react'

export type Density = 'comfortable' | 'compact'

const LS_KEY = 'mn-ccore-density'

export function useDensity() {
  const [density, setDensityState] = useState<Density>(() => {
    if (typeof window === 'undefined') return 'comfortable'
    return (localStorage.getItem(LS_KEY) as Density) || 'comfortable'
  })

  // Apply CSS class to root element
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('density-comfortable', 'density-compact')
    root.classList.add(`density-${density}`)
  }, [density])

  const setDensity = useCallback((d: Density) => {
    setDensityState(d)
    localStorage.setItem(LS_KEY, d)
  }, [])

  const toggle = useCallback(() => {
    setDensity(density === 'comfortable' ? 'compact' : 'comfortable')
  }, [density, setDensity])

  return { density, setDensity, toggle }
}
