import { motion } from 'framer-motion'
import HeartbeatLine from '../HeartbeatLine'

/**
 * PulseScene — fullscreen scene wrapper for kiosk cards.
 *
 * Each scene gets:
 *   - A slow Ken Burns zoom on the inner content (paused if reduced-motion).
 *   - A long fade-in (1.6s) — slower than any portal transition.
 *   - A small "pulse divider" heartbeat above the title for visual rhythm.
 *
 * Designed for 16:9 wall displays. Children render at 1.0 scale and slowly
 * climb to 1.06 over the 8s rotation interval.
 */

interface PulseSceneProps {
  eyebrow: string
  title: string
  subtitle?: string
  children: React.ReactNode
  /** Disable the Ken Burns scale animation (e.g. for chart-heavy scenes). */
  staticFrame?: boolean
}

export default function PulseScene({
  eyebrow,
  title,
  subtitle,
  children,
  staticFrame,
}: PulseSceneProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      // Phone: side padding drops to 24px and top/bottom padding clears the
      // absolute header and footer; safe-centering puts a scene that is
      // still too tall at the top instead of off both ends.
      className="absolute inset-0 flex flex-col items-center justify-center-safe px-6 pt-24 pb-24 sm:px-16 sm:py-12"
      aria-roledescription="kiosk slide"
    >
      <div
        className={staticFrame ? '' : 'pulse-kenburns'}
        style={{
          width: '100%',
          maxWidth: 1600,
          transformOrigin: 'center center',
          // Drives the @keyframes pulse-kenburns block in index.css.
          animation: staticFrame
            ? undefined
            : 'pulse-kenburns 9s ease-out forwards',
        }}
      >
        {/* Eyebrow row + heartbeat divider */}
        <div className="flex items-center gap-4 sm:gap-6 mb-4 sm:mb-8 opacity-90">
          {/* The 120px trace beside a tracked eyebrow wraps the eyebrow on a phone. */}
          <span className="hidden sm:inline-flex">
            <HeartbeatLine
              width={120}
              height={28}
              strokeWidth={1.5}
              variant="slow"
              color="var(--job-brand)"
            />
          </span>
          <span
            className="uppercase tracking-[0.32em] whitespace-nowrap"
            style={{
              fontFamily: 'var(--font-sans)',
              color: 'var(--job-brand)',
              fontWeight: 500,
              fontSize: 13,
              letterSpacing: '0.32em',
            }}
          >
            {eyebrow}
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: 'linear-gradient(to right, color-mix(in srgb, var(--job-brand) 35%, transparent), transparent)' }}
          />
        </div>

        {/* Title — display weight Fraunces */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontFamily: 'var(--font-display)',
            color: '#f5efe2',
            fontWeight: 500,
            fontSize: 'clamp(34px, 5.5vw, 84px)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {title}
        </motion.h2>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.75 }}
            transition={{ duration: 1.4, delay: 0.5 }}
            className="mt-4"
            style={{
              fontFamily: 'var(--font-sans)',
              color: '#e2e8f0',
              fontWeight: 400,
              fontSize: 'clamp(18px, 1.5vw, 24px)',
              maxWidth: 1200,
            }}
          >
            {subtitle}
          </motion.p>
        )}

        {/* Scene content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 sm:mt-12"
        >
          {children}
        </motion.div>
      </div>
    </motion.section>
  )
}
