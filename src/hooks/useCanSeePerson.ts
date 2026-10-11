import { useAuth } from './useAuth'

/**
 * May this viewer see `slug`'s per-person activity (contribution list, score)?
 * The member themselves and the PI: the server refuses anyone else with 403
 * (api/lib/person-access.ts), so this only keeps the page from asking and from
 * drawing an error for a card the viewer was never meant to have. isPi is false
 * until /api/auth/me answers, so a PI's cards appear a moment after first paint;
 * a wrong guess fails closed.
 */
export function useCanSeePerson(slug: string | undefined): boolean {
  const { user } = useAuth()
  if (!slug) return false
  return user.isPi || (user.slug !== '' && user.slug.toLowerCase() === slug.toLowerCase())
}
