import { useCallback, useSyncExternalStore } from 'react'

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

// One module-level store shared by every useDarkMode() caller (Sidebar,
// Layout, PortalLayout). Before, each call kept its own useState, so a theme
// change made in one component left the others (the sidebar wordmark) on the
// old value, and an OS scheme change updated the html class but no state.
interface ThemeState { mode: ThemeMode; isDark: boolean }

function compute(mode: ThemeMode): ThemeState {
  return { mode, isDark: mode === 'dark' || (mode === 'system' && getSystemPreference()) }
}

let state: ThemeState = compute(getInitialMode())
const listeners = new Set<() => void>()
let mq: MediaQueryList | null = null

function applyToDom() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', state.isDark)
}

function update(mode: ThemeMode) {
  state = compute(mode)
  applyToDom()
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, mode)
  listeners.forEach((l) => l())
}

function onSystemChange() {
  if (state.mode !== 'system') return
  state = compute('system')
  applyToDom()
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    // Re-read in case storage changed while nobody was subscribed.
    state = compute(getInitialMode())
    applyToDom()
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onSystemChange)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && mq) {
      mq.removeEventListener('change', onSystemChange)
      mq = null
    }
  }
}

function getSnapshot() { return state }

export function useDarkMode() {
  const { mode, isDark } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const toggle = useCallback(() => {
    update(state.mode === 'light' ? 'dark' : state.mode === 'dark' ? 'system' : 'light')
  }, [])

  const setTheme = useCallback((newMode: ThemeMode) => {
    update(newMode)
  }, [])

  return { isDark, mode, toggle, setTheme }
}
