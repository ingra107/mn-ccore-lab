import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { emailToSlug } from '../lib/emailSlug'
import { getPersonInfo } from '../data/team'

interface AuthUser {
  email: string
  name?: string
  isAuthenticated: boolean
  isPi: boolean
}

const defaultUser: AuthUser = {
  email: '',
  isAuthenticated: false,
  isPi: false,
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

  // Cookie-based path is a first-paint optimization; it cannot know isPi
  // (that answer lives server-side). Hydrates to true via /api/auth/me.
  const email = (payload.email as string) || ''
  return {
    email,
    name: (payload.name as string) || nameFromEmail(email) || '',
    isAuthenticated: true,
    isPi: false,
  }
}

// Produce a readable display name from an email address. Routes through the
// team LUT so `ingra107@umn.edu` renders as "Nicholas Ingraham" instead of
// "Ingra107". Falls back to the raw local-part if the email prefix isn't
// in the team directory.
function nameFromEmail(email: string): string {
  if (!email) return ''
  const slug = emailToSlug(email)
  if (slug) {
    const person = getPersonInfo(slug)
    if (person.name && person.name !== 'Unknown' && !person.name.includes('@')) {
      return person.name
    }
  }
  return email.split('@')[0]
}

// Also support fetching auth status from the API for more reliable detection
async function fetchAuthStatus(): Promise<AuthUser> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (res.ok) {
      const data = await res.json()
      if (data.authenticated) {
        return {
          email: data.email || '',
          name: data.name || '',
          isAuthenticated: true,
          isPi: Boolean(data.isPi),
        }
      }
    }
  } catch {
    // API not available or not authenticated
  }
  return getAuthFromCookie()
}

interface AuthContextValue {
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
    // First try cookie (instant paint — isPi=false until API hydrates)
    const cookieUser = getAuthFromCookie()
    if (cookieUser.isAuthenticated) {
      setUser(cookieUser)
      setIsLoading(false)
    }

    // Always hit API to get authoritative isPi (cookie cannot know it)
    fetchAuthStatus().then((apiUser) => {
      setUser(apiUser)
      setIsLoading(false)
    })
  }, [])

  // Memoize so the AuthContext value is referentially stable across renders
  // that didn't actually change auth state. Without this every re-render
  // of AuthProvider hands all `useAuth()` consumers a new object and
  // forces them to re-render too.
  return useMemo(
    () => ({
      user,
      isAuthenticated: user.isAuthenticated,
      isLoading,
    }),
    [user, isLoading],
  )
}
