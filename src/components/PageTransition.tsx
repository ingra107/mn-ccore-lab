import { motion } from 'framer-motion'
import { useState } from 'react'
import { useOutlet } from 'react-router-dom'

interface PageTransitionProps {
  /** Unique key per route — required for AnimatePresence to detect route changes */
  transitionKey?: string
}

const pageVariants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

// Linear-style: ~150ms cross-fade with subtle y-translate
const pageTransition = {
  duration: 0.15,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
}

/**
 * The route's page, wrapped in the enter/exit fade. It renders the matched
 * route itself (it takes no children), so the outlet is always FROZEN per page.
 *
 * Why: under `<AnimatePresence mode="wait">` the exiting wrapper stays mounted
 * for its exit animation. A live `<Outlet />` inside it re-resolves against the
 * NEW location, so the next page mounted once inside the exiting wrapper, ran
 * its effects (consuming `?create=true` / `?open=` and stripping the param),
 * then unmounted and mounted again fresh with the param already gone. That is
 * how Lab overview's "+ Task" opened the Create Task modal and lost it within a
 * second (prod probe 2026-10-14). Capturing the outlet element at mount keeps
 * the exiting copy on the OLD page, so the new page mounts exactly once.
 */
export default function PageTransition({ transitionKey }: PageTransitionProps) {
  const outlet = useOutlet()
  const [frozen] = useState(outlet)
  return (
    <motion.div
      key={transitionKey}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={pageTransition}
    >
      {frozen}
    </motion.div>
  )
}
