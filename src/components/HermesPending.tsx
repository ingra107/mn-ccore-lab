/**
 * HermesPending — the "Hermes is thinking" placeholder card.
 *
 * Shown in place of the literal `'Thinking about this... (AI response pending)'`
 * string that the backend writes as the `claude-ai` answer the instant a
 * `@hermes` mention is detected (api/routes/questions.ts:41, projects.ts:45).
 * The real answer lands later via the ai-request queue + polling, at which
 * point the answer content changes and the renderer swaps to <HermesResponse>.
 *
 * This component:
 *   - uses the brand HermesMark (gold Mercury glyph, NOT lucide Sparkles —
 *     Critical Rule #29) with the one-shot entrance pulse,
 *   - shows three softly-pulsing dots so the card reads as "in progress",
 *   - counts the elapsed time since the question was asked,
 *   - subscribes to the shared realtime bus so it re-renders / stops its
 *     interval promptly when an answer arrives (belt-and-suspenders alongside
 *     the version-poll-driven query invalidation that actually swaps content).
 *
 * Animation is transform-only (scale/translate) — never opacity 0 → 1 — per
 * Critical Rule #44 so axe-core's contrast checker doesn't trip mid-mount.
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import HermesMark from './HermesMark'
import { getRealtimeBus } from '../lib/realtimeBus'

/** The exact placeholder content the backend writes for a pending Hermes
 *  answer. Match against this — don't re-type the literal at call sites. */
export const HERMES_PENDING_PLACEHOLDER = 'Thinking about this... (AI response pending)'

/** True when an answer's content is the backend pending placeholder. */
export function isHermesPending(content: string | null | undefined): boolean {
  return (content ?? '').trim() === HERMES_PENDING_PLACEHOLDER
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export default function HermesPending({ askedAt }: { askedAt: string }) {
  const asked = new Date(askedAt).getTime()
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - asked) / 1000)),
  )

  useEffect(() => {
    if (Number.isNaN(asked)) return
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - asked) / 1000)))
    }, 1000)
    // Nudge a re-render when realtime traffic arrives (an answer write bumps
    // the version, which is what actually triggers the query refetch that
    // swaps this card out). Touching state forces React to re-evaluate.
    const bus = getRealtimeBus()
    const unsub = bus.subscribe(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - asked) / 1000)))
    })
    return () => {
      window.clearInterval(id)
      unsub()
    }
  }, [asked])

  return (
    <motion.div
      initial={{ scale: 0.98, y: 2 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label="Hermes is composing an answer"
    >
      <HermesMark size={16} variant="avatar" pulse />
      <span
        className="text-sm"
        style={{ color: 'var(--ink)', fontStyle: 'italic' }}
      >
        Hermes is thinking
      </span>
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: 'var(--radius-circle)',
              background: 'var(--gold)',
              display: 'inline-block',
            }}
            animate={{ y: [0, -3, 0] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.15,
            }}
          />
        ))}
      </span>
      <span
        className="ml-auto"
        style={{
          fontSize: '10px',
          color: 'var(--slate)',
          opacity: 0.75,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatElapsed(elapsed)}
      </span>
    </motion.div>
  )
}
