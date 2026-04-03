// ── Spring Physics Presets ──
// Replaces duration-based easing with physically-modeled springs.
// stiffness ~200, damping ~20 is the 2026 consensus default.

export const spring = {
  /** Dropdowns, tooltips, context menus — fast & precise */
  snappy: { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 },
  /** Side panels, modals, detail views — natural & smooth */
  default: { type: 'spring' as const, stiffness: 200, damping: 20, mass: 1 },
  /** Page transitions, large containers — slow & graceful */
  gentle: { type: 'spring' as const, stiffness: 120, damping: 18, mass: 1.2 },
  /** Completion checkmarks, celebration moments — playful overshoot */
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 15, mass: 0.6 },
}

// ── Stagger Container / Item (spring-based) ──

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring.default,
  },
}
