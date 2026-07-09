import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Compass, PlusCircle, Users,
  Check, ChevronDown, ChevronUp, ArrowRight,
  PartyPopper, X, Rocket,
} from 'lucide-react'
import { useOnboarding } from '../hooks/useOnboarding'
import {
  ONBOARDING_STEPS,
  DAY_MILESTONES,
  DAY_LABELS,
  CATEGORY_META,
} from '../data/onboarding'
import type { OnboardingStep } from '../data/onboarding'
import type { LucideIcon } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

const CATEGORY_ICONS: Record<OnboardingStep['category'], LucideIcon> = {
  setup: Settings,
  explore: Compass,
  contribute: PlusCircle,
  connect: Users,
}

export default function OnboardingChecklist() {
  const {
    completedSteps,
    dismissed,
    currentDay,
    totalSteps,
    completedCount,
    progress,
    allComplete,
    nextStep,
    completeStep,
    dismiss,
  } = useOnboarding()

  const [expanded, setExpanded] = useState(true)

  if (dismissed && !allComplete) return null

  // Congratulations state
  if (allComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
        style={{
          borderRadius: 'var(--radius-2xl)',
          padding: '1.5rem',
          background: `linear-gradient(135deg, rgba(45,138,138,0.06) 0%, ${withAlpha(ACCENT_GOLD, 6)} 100%)`,
          border: '1px solid rgba(45,138,138,0.15)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb, var(--teal) 12%, transparent)',
            }}
          >
            <PartyPopper {...ICON_PROPS} size={20} style={{ color: 'var(--teal)' }} />
          </div>
          <div className="flex-1">
            <h3 style={{
              fontWeight: 400,
              fontSize: 16,
              color: 'var(--ink)',
              margin: 0,
            }}>
              Welcome to the team!
            </h3>
            <p style={{
              fontSize: 13,
              color: 'var(--slate)',
              margin: 'var(--sp-xs) 0 0 0',
            }}>
              You completed all {totalSteps} onboarding steps. You are officially a full member.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.75 }}
            title="Dismiss"
          >
            <X {...ICON_PROPS} size={16} />
          </button>
        </div>
      </motion.div>
    )
  }

  // Collapsed view: just progress bar + next step
  if (!expanded) {
    return (
      <motion.div
        layout
        className="mb-5"
        style={{
          borderRadius: 'var(--radius-2xl)',
          padding: '1rem 1.25rem',
          // Recipe A: lift above the dark page bg (gold border + shadow = edge).
          background: 'var(--surface-2)',
          border: `1px solid ${withAlpha(ACCENT_GOLD, 12)}`,
          boxShadow: 'var(--shadow-card)',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(true)}
        whileHover={{ y: -1, boxShadow: 'var(--shadow-card-hover)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <div className="flex items-center gap-3">
          <Rocket {...ICON_PROPS} size={16} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span style={{
                fontWeight: 600,
                fontSize: 13,
                color: 'var(--ink)',
              }}>
                Onboarding
              </span>
              <span style={{
                fontSize: 10,
                color: 'var(--teal)',
                fontWeight: 600,
              }}>
                {completedCount}/{totalSteps}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{
              height: 4,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--teal-active)',
              overflow: 'hidden',
            }}>
              <motion.div
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{
                  height: '100%',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--teal-solid)',
                }}
              />
            </div>
            {nextStep && (
              <p className="mt-1.5 text-xs truncate" style={{
                color: 'var(--slate)',
                opacity: 0.85,
              }}>
                Next: {nextStep.title}
              </p>
            )}
          </div>
          <ChevronDown {...ICON_PROPS} size={16} style={{ color: 'var(--slate)', opacity: 0.75, flexShrink: 0 }} />
        </div>
      </motion.div>
    )
  }

  // Full expanded view
  const stepsByDay = DAY_MILESTONES.map((day) => ({
    day,
    label: DAY_LABELS[day],
    steps: ONBOARDING_STEPS.filter((s) => s.day === day),
  }))

  return (
    <motion.div
      layout
      className="mb-5"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 'var(--radius-2xl)',
        padding: '1.5rem',
        // Recipe A: lift above the dark page bg (gold border + shadow = edge).
        background: 'var(--surface-2)',
        border: `1px solid ${withAlpha(ACCENT_GOLD, 12)}`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--gold-active)',
            flexShrink: 0,
          }}
        >
          <Rocket {...ICON_PROPS} size={16} style={{ color: 'var(--gold)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 style={{
              fontWeight: 400,
              fontSize: 16,
              color: 'var(--ink)',
              margin: 0,
            }}>
              30-Day Onboarding
            </h3>
            <div className="flex items-center gap-2">
              <span style={{
                fontSize: 11,
                color: 'var(--teal)',
                fontWeight: 600,
              }}>
                Day {currentDay}
              </span>
              <button
                onClick={() => setExpanded(false)}
                className="p-1 rounded transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 'var(--ink-label)' }}
                title="Collapse"
              >
                <ChevronUp {...ICON_PROPS} size={14} />
              </button>
            </div>
          </div>
          <p style={{
            fontSize: 12,
            color: 'var(--slate)',
            margin: '2px 0 0 0',
            opacity: 0.85,
          }}>
            Learn the lab by doing real tasks in the system
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span style={{
            fontSize: 10,
            color: 'var(--slate)',
            opacity: 0.75,
          }}>
            Progress
          </span>
          <span style={{
            fontSize: 10,
            color: 'var(--teal)',
            fontWeight: 600,
          }}>
            {completedCount}/{totalSteps} ({progress}%)
          </span>
        </div>
        <div style={{
          height: 6,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--teal-active)',
          overflow: 'hidden',
        }}>
          <motion.div
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              height: '100%',
              borderRadius: 'var(--radius-sm)',
              background: progress === 100
                ? 'linear-gradient(90deg, var(--teal), var(--gold))'
                : 'var(--teal)',
            }}
          />
        </div>
      </div>

      {/* Steps by day milestone */}
      <div className="flex flex-col gap-4">
        {stepsByDay.map(({ day, label, steps }) => {
          const allDone = steps.every((s) => completedSteps.includes(s.id))
          const unlocked = currentDay >= day

          return (
            <div key={day}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 'var(--radius-circle)',
                    background: allDone ? 'var(--teal-solid)' : unlocked ? 'var(--gold)' : 'var(--slate)',
                    opacity: allDone ? 1 : unlocked ? 0.8 : 0.25,
                    flexShrink: 0,
                  }}
                />
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: allDone ? 'var(--teal)' : unlocked ? 'var(--ink)' : 'var(--slate)',
                  opacity: allDone ? 0.8 : unlocked ? 0.85 : 0.85,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}>
                  {label}
                  {allDone && ' -- Complete'}
                </span>
              </div>

              {/* Steps */}
              <div className="flex flex-col gap-1 ml-1">
                <AnimatePresence>
                  {steps.map((step) => {
                    const done = completedSteps.includes(step.id)
                    const CategoryIcon = CATEGORY_ICONS[step.category]
                    const meta = CATEGORY_META[step.category]

                    return (
                      <motion.div
                        key={step.id}
                        layout
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-2.5 py-2 px-2 rounded-lg transition-colors"
                        style={{
                          opacity: !unlocked ? 0.85 : 1,
                          background: done ? 'var(--teal-hover)' : 'transparent',
                        }}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={() => !done && unlocked && completeStep(step.id)}
                          disabled={done || !unlocked}
                          className="mt-0.5 flex-shrink-0 transition-all"
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 'var(--radius-md)',
                            border: done
                              ? '2px solid var(--teal)'
                              : '2px solid rgba(45,138,138,0.25)',
                            background: done ? 'var(--teal-solid)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: done || !unlocked ? 'default' : 'pointer',
                            padding: 0,
                          }}
                          title={done ? 'Completed' : unlocked ? 'Mark as done' : `Unlocks on Day ${day}`}
                        >
                          {done && <Check size={11} style={{ color: 'var(--ink-bright, #fff)' }} strokeWidth={3} />}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <CategoryIcon
                              size={12}
                              style={{ color: meta.color, opacity: done ? 0.85 : 0.85, flexShrink: 0 }}
                            />
                            <span style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: done ? 'var(--slate)' : 'var(--ink)',
                              textDecoration: done ? 'line-through' : 'none',
                              opacity: done ? 0.85 : 1,
                            }}>
                              {step.title}
                            </span>
                          </div>
                          <p style={{
                            fontSize: 11,
                            color: 'var(--slate)',
                            margin: '2px 0 0 0',
                            opacity: done ? 0.85 : 0.85,
                            lineHeight: 1.4,
                          }}>
                            {step.description}
                          </p>
                        </div>

                        {/* Go link */}
                        {step.link && !done && unlocked && (
                          <Link
                            to={step.link}
                            className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-[var(--teal-hover)] flex-shrink-0"
                            style={{
                              fontSize: 10,
                              color: 'var(--teal)',
                              textDecoration: 'none',
                              border: '1px solid rgba(45,138,138,0.15)',
                            }}
                          >
                            Go <ArrowRight {...ICON_PROPS} size={10} />
                          </Link>
                        )}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer: dismiss */}
      <div
        className="flex items-center justify-between mt-4 pt-3"
        style={{ borderTop: `1px solid ${withAlpha(ACCENT_GOLD, 10)}` }}
      >
        <span style={{
          fontSize: 10,
          color: 'var(--slate)',
          opacity: 0.75,
        }}>
          Legitimate Peripheral Participation
        </span>
        <button
          onClick={dismiss}
          className="text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          style={{
            fontSize: 10,
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          Dismiss checklist
        </button>
      </div>
    </motion.div>
  )
}
