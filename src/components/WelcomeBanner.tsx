import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, ArrowRight, X } from 'lucide-react'
import { useOnboarding } from '../hooks/useOnboarding'
import { spring } from '../lib/animations'

export default function WelcomeBanner() {
  const { completedCount, totalSteps, progress, allComplete, dismissed, dismiss, nextStep } = useOnboarding()

  if (dismissed || allComplete) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={spring.default}
        className="mb-5 relative overflow-hidden"
        style={{
          borderRadius: 12,
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(45,138,138,0.08) 0%, rgba(45,138,138,0.03) 100%)',
          border: '1px solid rgba(45,138,138,0.15)',
        }}
      >
        <div className="flex items-center gap-4">
          {/* Progress ring */}
          <div style={{ width: 44, height: 44, position: 'relative', flexShrink: 0 }}>
            <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="22" cy="22" r="18" fill="none" stroke="color-mix(in srgb, var(--teal) 12%, transparent)" strokeWidth="3" />
              <motion.circle
                cx="22" cy="22" r="18" fill="none"
                stroke="var(--teal)" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 18 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 18 * (1 - progress / 100) }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: 'var(--teal)',
              }}>
                {completedCount}/{totalSteps}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Rocket size={14} style={{ color: 'var(--teal)' }} />
              <span style={{
                fontSize: 14, fontWeight: 500, color: 'var(--ink)',
              }}>
                Welcome to MN-CCORE Hub
              </span>
            </div>
            {nextStep && (
              <p style={{
                fontSize: 12, color: 'var(--slate)',
                margin: '4px 0 0 0', opacity: 0.7,
              }}>
                Next: {nextStep.title}
              </p>
            )}
          </div>

          {/* CTA */}
          <Link
            to="/personal"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
            style={{
              color: 'var(--teal)',
              border: '1px solid rgba(45,138,138,0.2)',
              textDecoration: 'none',
              background: 'rgba(45,138,138,0.05)',
            }}
          >
            Get Started <ArrowRight size={12} />
          </Link>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="p-1 rounded transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] flex-shrink-0"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.3 }}
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
