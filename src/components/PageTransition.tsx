import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PageTransitionProps {
  children: ReactNode
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

export default function PageTransition({ children, transitionKey }: PageTransitionProps) {
  return (
    <motion.div
      key={transitionKey}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={pageTransition}
    >
      {children}
    </motion.div>
  )
}
