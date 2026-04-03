// ── Transition Constants ──
// Material Design 3: 100-150ms micro, 250-300ms panels
// Apple HIG: 150ms quick, 250ms standard
// Use these for Framer Motion `transition` props

export const FAST = { duration: 0.15, ease: [0.0, 0.0, 0.2, 1.0] }
export const PANEL = { duration: 0.25, ease: [0.0, 0.0, 0.2, 1.0] }
export const STAGGER = { staggerChildren: 0.04 }
