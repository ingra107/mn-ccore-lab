import { useState, useEffect, useCallback } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'mn-ccore-theme'

function getSystemPreference(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  // Migrate old boolean storage
  const oldStored = localStorage.getItem('mn-ccore-dark-mode')
  if (oldStored === 'true') return 'dark'
  if (oldStored === 'false') return 'light'
  return 'system'
}

export function useDarkMode() {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode)

  const isDark = mode === 'dark' || (mode === 'system' && getSystemPreference())

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem(STORAGE_KEY, mode)
  }, [isDark, mode])

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const root = document.documentElement
      if (mq.matches) root.classList.add('dark')
      else root.classList.remove('dark')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const toggle = useCallback(() => {
    setMode(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light')
  }, [])

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode)
  }, [])

  return { isDark, mode, toggle, setTheme }
}
