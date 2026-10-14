import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import PageTransition from './PageTransition'

/**
 * The portal's page cross-fade: the routed page, keyed by pathname, inside
 * AnimatePresence so the old page fades out before the new one fades in.
 *
 * It renders the outlet ELEMENT (useOutlet), never a live <Outlet />.
 * AnimatePresence keeps the exiting page mounted for its fade, and a live
 * <Outlet /> inside it re-reads the router and renders the NEW page there. That
 * throwaway copy ran the new page's effects: it consumed one-shot URL params
 * (?create=true from the command palette's "Log Decision") and then unmounted,
 * so the real page mounted with the param already stripped and no modal open.
 * The element from useOutlet() is fixed to the render that made it, so the
 * exiting copy keeps showing the old page.
 */
export default function RouteTransition() {
  const location = useLocation()
  const outlet = useOutlet()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition key={location.pathname} transitionKey={location.pathname}>
        {outlet}
      </PageTransition>
    </AnimatePresence>
  )
}
