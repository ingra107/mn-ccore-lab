/**
 * "I have the launcher installed" -- the Settings switch that shows the Open
 * folder and Work on in Claude buttons next to a folder path.
 *
 * A browser cannot tell whether a mnccore:// handler is installed: a link to a
 * scheme nobody handles does nothing, silently. So the person says so, here.
 *
 * Stored per BROWSER (localStorage), not per account, because the launcher is
 * installed per COMPUTER: Casey's office desktop may have it and his phone
 * never will, and buttons that do nothing on the phone are worse than none.
 * Unset means: on for a PI (Nick's two laptops carry the PB launcher, and the
 * buttons were already there for him), off for everyone else.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { useAuth } from './useAuth'

export const LAUNCHER_STORAGE_KEY = 'mnccore.launcherInstalled.v1'

const listeners = new Set<() => void>()

function read(): 'yes' | 'no' | null {
  try {
    const v = window.localStorage.getItem(LAUNCHER_STORAGE_KEY)
    return v === 'yes' || v === 'no' ? v : null
  } catch {
    return null // storage blocked: treat as unset, the default applies
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => { if (e.key === LAUNCHER_STORAGE_KEY) cb() }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

export function useLauncherInstalled(): [boolean, (installed: boolean) => void] {
  const { user } = useAuth()
  const stored = useSyncExternalStore(subscribe, read, () => null)
  const installed = stored === null ? Boolean(user?.isPi) : stored === 'yes'
  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(LAUNCHER_STORAGE_KEY, next ? 'yes' : 'no')
    } catch {
      /* storage blocked: the switch cannot persist; nothing else to do */
    }
    listeners.forEach((l) => l())
  }, [])
  return [installed, set]
}
