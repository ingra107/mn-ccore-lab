import { createContext, useContext, useState, useEffect } from 'react'

export interface AuthUser {
  email: string
  name?: string
  isAuthenticated: boolean
}

const defaultUser: AuthUser = {
  email: '',
  isAuthenticated: false,
}

// Cloudflare Access injects a JWT in the Cf-Access-Jwt-Assertion header.
// On the client side, we check for the cookie that Access sets (CF_Authorization).
// If it exists, the user is authenticated and we can decode basic claims.

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function getAuthFromCookie(): AuthUser {
  const cookies = document.cookie.split(';').reduce((acc, c) => {
    const [key, ...val] = c.trim().split('=')
    acc[key] = val.join('=')
    return acc
  }, {} as Record<string, string>)

  const token = cookies['CF_Authorization']
  if (!token) return defaultUser

  const payload = decodeJwtPayload(token)
  if (!payload) return defaultUser

  return {
    email: (payload.email as string) || '',
    name: (payload.name as string) || (payload.email as string)?.split('@')[0] || '',
    isAuthenticated: true,
  }
}

// Also support fetching auth status from the API for more reliable detection
async function fetchAuthStatus(): Promise<AuthUser> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (res.ok) {
      const data = await res.json()
      return {
        email: data.email || '',
        name: data.name || '',
        isAuthenticated: true,
      }
    }
  } catch {
    // API not available or not authenticated
  }
  return getAuthFromCookie()
}

export interface AuthContextValue {
  user: AuthUser
  isAuthenticated: boolean
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextValue>({
  user: defaultUser,
  isAuthenticated: false,
  isLoading: true,
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

// Hook for the provider to manage auth state
export function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<AuthUser>(defaultUser)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // First try cookie (instant)
    const cookieUser = getAuthFromCookie()
    if (cookieUser.isAuthenticated) {
      setUser(cookieUser)
      setIsLoading(false)
      return
    }

    // Then try API (async, more reliable)
    fetchAuthStatus().then((apiUser) => {
      setUser(apiUser)
      setIsLoading(false)
    })
  }, [])

  return {
    user,
    isAuthenticated: user.isAuthenticated,
    isLoading,
  }
}
