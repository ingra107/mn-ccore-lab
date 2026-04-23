import { useState, useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import { getUserRoleFromAuth, ROLE_LABELS } from '../lib/roleDefaults'
import type { UserRole } from '../lib/roleDefaults'

const OVERRIDE_KEY = 'hub-role-override'
const ROLE_INIT_PREFIX = 'dashboard-role-initialized-'

interface UseUserRoleReturn {
  /** The effective role (override > detected > default) */
  role: UserRole
  /** The role detected from auth, before any override */
  detectedRole: UserRole
  /** Whether the current role came from a manual override */
  isOverridden: boolean
  /** Set a manual role override (persists to localStorage) */
  setRoleOverride: (role: UserRole) => void
  /** Clear the manual override, revert to detected role */
  clearRoleOverride: () => void
  /** Display label for current role */
  roleLabel: string
  /** Check if role-based defaults have been initialized for a given role */
  isRoleInitialized: (role: UserRole) => boolean
  /** Mark a role's defaults as initialized (prevents resetting after manual customization) */
  markRoleInitialized: (role: UserRole) => void
}

function getStoredOverride(): UserRole | null {
  try {
    const stored = localStorage.getItem(OVERRIDE_KEY)
    if (stored && ['pi', 'fellow', 'coordinator', 'default'].includes(stored)) {
      return stored as UserRole
    }
  } catch { /* no localStorage */ }
  return null
}

export function useUserRole(): UseUserRoleReturn {
  const { user, isAuthenticated } = useAuth()

  // Detect role from auth
  const detectedRole: UserRole = useMemo(() => {
    if (!isAuthenticated || !user?.email) return 'default'
    return getUserRoleFromAuth(user)
  }, [isAuthenticated, user])

  // Override state from localStorage
  const [override, setOverrideState] = useState<UserRole | null>(getStoredOverride)

  const role = override ?? detectedRole

  const setRoleOverride = useCallback((newRole: UserRole) => {
    setOverrideState(newRole)
    try {
      localStorage.setItem(OVERRIDE_KEY, newRole)
    } catch { /* ignore */ }
  }, [])

  const clearRoleOverride = useCallback(() => {
    setOverrideState(null)
    try {
      localStorage.removeItem(OVERRIDE_KEY)
    } catch { /* ignore */ }
  }, [])

  const isRoleInitialized = useCallback((r: UserRole): boolean => {
    try {
      return localStorage.getItem(ROLE_INIT_PREFIX + r) === 'true'
    } catch { return false }
  }, [])

  const markRoleInitialized = useCallback((r: UserRole): void => {
    try {
      localStorage.setItem(ROLE_INIT_PREFIX + r, 'true')
    } catch { /* ignore */ }
  }, [])

  return {
    role,
    detectedRole,
    isOverridden: override !== null,
    setRoleOverride,
    clearRoleOverride,
    roleLabel: ROLE_LABELS[role],
    isRoleInitialized,
    markRoleInitialized,
  }
}

export type { UserRole }
