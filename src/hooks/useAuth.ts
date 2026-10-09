import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { setEmailDirectory, slugForEmail } from '../lib/emailSlug'
import { getPersonInfo } from '../data/team'

export interface AuthUser {
  email: string
  /** The user's team slug (`nick-ingraham`), resolved by the Worker from
   *  team_members.email (#8945). '' until known. Every "who am I" site reads
   *  this; nothing derives it from the email string. */
  slug: string
  name?: string
  isAuthenticated: boolean
  isPi: boolean
  /** False only when the Worker said this signed-in email is on no
   *  team_members row (2026-10-08). Cloudflare Access lets any @umn.edu
   *  account sign in; such a non-member gets the members-only page, and 403
   *  from every member route. True otherwise, including while unknown (cookie
   *  first paint, an API that did not confirm the session): the API is the
   *  gate, this only picks the page. */
  isMember: boolean
  /** True only for the site admin (Nick). Gates the "Show all projects (admin)"
   *  switch on the Projects page (#145). The Worker enforces the capability;
   *  this only decides whether to draw the switch. False until /api/auth/me
   *  says otherwise, so the cookie first paint never shows it. */
  canShowAllProjects: boolean
  /** True only when isPi came from /api/auth/me. False on the cookie first
   *  paint, while the API has not answered, and when it failed (the fallback
   *  is the cookie user, whose isPi is false by construction). So
   *  `!isPi && piResolved` means "known non-PI", and `!piResolved` means
   *  "unknown" -- a caller whose wrong guess would leak (a launch seed posted
   *  as team-visible text) must refuse on unknown, not treat it as non-PI. */
  piResolved: boolean
}

const defaultUser: AuthUser = {
  email: '',
  slug: '',
  isAuthenticated: false,
  isPi: false,
  isMember: false,
  canShowAllProjects: false,
  piResolved: false,
}

// The last slug and email directory /api/auth/me returned, so a cookie first
// paint renders the right person (and other people's stored emails) before
// the API answers. A cache of the Worker's answer, never a source: hydration
// always overwrites it. A slug is cached only for a confirmed member, so a
// cached slug also means "this device has seen this email answer as a member".
const SLUG_CACHE_PREFIX = 'hub:auth-slug:'
const DIRECTORY_CACHE_KEY = 'hub:auth-directory'
type DirectoryRow = { email: string; slug: string }
function cacheDirectory(rows: DirectoryRow[]): void {
  try { localStorage.setItem(DIRECTORY_CACHE_KEY, JSON.stringify(rows)) } catch { /* storage off: directory arrives with the API */ }
}
function loadCachedDirectory(): void {
  try {
    const raw = localStorage.getItem(DIRECTORY_CACHE_KEY)
    const rows = raw ? JSON.parse(raw) : null
    if (Array.isArray(rows)) setEmailDirectory(rows)
  } catch { /* corrupt or no storage: render prefixes until the API answers */ }
}
function cachedSlug(email: string): string {
  if (!email) return ''
  try { return localStorage.getItem(SLUG_CACHE_PREFIX + email.toLowerCase()) ?? '' } catch { return '' }
}
function cacheSlug(email: string, slug: string): void {
  if (!email || !slug) return
  try { localStorage.setItem(SLUG_CACHE_PREFIX + email.toLowerCase(), slug) } catch { /* storage off: first paint waits for the API */ }
}
function forgetDirectory(): void {
  setEmailDirectory([])
  try { localStorage.removeItem(DIRECTORY_CACHE_KEY) } catch { /* storage off: nothing cached */ }
}
function forgetSlug(email: string): void {
  if (!email) return
  try { localStorage.removeItem(SLUG_CACHE_PREFIX + email.toLowerCase()) } catch { /* storage off: nothing cached */ }
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

  // Cookie-based path is a first-paint optimization; it cannot know isPi or
  // isMember (those answers live server-side). Hydrates via /api/auth/me.
  // With no cached slug (cached only for a confirmed member) the provider
  // keeps loading until the API answers, so a non-member never sees a flash
  // of the portal.
  const email = (payload.email as string) || ''
  loadCachedDirectory()
  const slug = cachedSlug(email) || slugForEmail(email)
  return {
    email,
    slug,
    name: (payload.name as string) || nameFromEmail(slug, email) || '',
    isAuthenticated: true,
    isPi: false,
    isMember: true,
    canShowAllProjects: false,
    piResolved: false,
  }
}

// Produce a readable display name for the cookie first paint, from the cached
// slug when there is one, so `ingra107@umn.edu` renders as "Nicholas Ingraham"
// instead of "Ingra107". Falls back to the raw local-part.
function nameFromEmail(knownSlug: string, email: string): string {
  if (!email) return ''
  const slug = knownSlug || slugForEmail(email)
  if (slug) {
    const person = getPersonInfo(slug)
    if (person.name && person.name !== 'Unknown' && !person.name.includes('@')) {
      return person.name
    }
  }
  return email.split('@')[0]
}

/**
 * Turn an /api/auth/me body into the auth user, or null when unauthenticated.
 * The slug is the Worker's when it sent one. A Worker older than #8945 sends
 * none (Pages can ship first): fall back to the cached slug, then to the
 * directory/email-prefix resolution, so a signed-in user always has THEIR
 * slug and never an empty one that a caller would replace with a default.
 */
export function authUserFromMe(data: {
  authenticated?: boolean; email?: string; name?: string; isPi?: boolean
  isMember?: boolean; slug?: string; directory?: unknown; canShowAllProjects?: boolean
} | null | undefined): AuthUser | null {
  if (!data?.authenticated) return null
  const email = data.email || ''
  if (data.isMember === false) {
    // Not on the team: no slug, no directory. Forget what this device cached
    // while a member used it (their slug, and the member email directory, which
    // a non-member must not be able to read out of localStorage).
    forgetSlug(email)
    forgetDirectory()
    return { email, slug: '', name: data.name || '', isAuthenticated: true, isPi: false, isMember: false, canShowAllProjects: false, piResolved: true }
  }
  if (Array.isArray(data.directory)) {
    setEmailDirectory(data.directory as DirectoryRow[])
    cacheDirectory(data.directory as DirectoryRow[])
  }
  const slug = data.slug || cachedSlug(email) || slugForEmail(email)
  if (data.slug) cacheSlug(email, data.slug)
  // A Worker older than this field sends none: treat the session as a member,
  // as before. The API, not this flag, decides access.
  return { email, slug, name: data.name || '', isAuthenticated: true, isPi: Boolean(data.isPi), isMember: true,
    canShowAllProjects: data.canShowAllProjects === true, piResolved: true }
}

// Also support fetching auth status from the API for more reliable detection
async function fetchAuthStatus(): Promise<AuthUser> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (res.ok) {
      const user = authUserFromMe(await res.json())
      if (user) return user
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
  // First try cookie (instant paint — isPi=false until API hydrates).
  // getAuthFromCookie() reads synchronously-available document.cookie, so the
  // initial value is decided via lazy init instead of an effect.
  const [user, setUser] = useState<AuthUser>(() => {
    const cookieUser = getAuthFromCookie()
    return cookieUser.isAuthenticated ? cookieUser : defaultUser
  })
  // Still loading until the Worker has confirmed the slug at least once for
  // this email: a first-ever cookie paint only has the email-prefix guess.
  const [isLoading, setIsLoading] = useState(() => {
    const cookieUser = getAuthFromCookie()
    return !cookieUser.isAuthenticated || !cachedSlug(cookieUser.email)
  })

  useEffect(() => {
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
