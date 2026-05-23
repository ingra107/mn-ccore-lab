import { useState, useCallback, useMemo } from 'react'
import { ONBOARDING_STEPS } from '../data/onboarding'
import { localDateKey } from '../lib/dateUtils'

const STORAGE_KEY = 'mnccore-onboarding-v1'

interface OnboardingState {
  startDate: string
  completedSteps: string[]
  dismissed: boolean
}

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as OnboardingState
      // Validate shape
      if (parsed.startDate && Array.isArray(parsed.completedSteps)) {
        return parsed
      }
    }
  } catch {
    // corrupted -- reset
  }
  // Auto-start: set startDate to today for new users
  const fresh: OnboardingState = {
    startDate: localDateKey(),
    completedSteps: [],
    dismissed: false,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
  } catch {
    // localStorage unavailable
  }
  return fresh
}

function saveState(state: OnboardingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage full or unavailable
  }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(loadState)

  const completeStep = useCallback((stepId: string) => {
    setState((prev) => {
      if (prev.completedSteps.includes(stepId)) return prev
      const next = {
        ...prev,
        completedSteps: [...prev.completedSteps, stepId],
      }
      saveState(next)
      return next
    })
  }, [])

  const dismiss = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, dismissed: true }
      saveState(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    const fresh: OnboardingState = {
      startDate: localDateKey(),
      completedSteps: [],
      dismissed: false,
    }
    saveState(fresh)
    setState(fresh)
  }, [])

  const currentDay = useMemo(() => {
    const start = new Date(state.startDate + 'T00:00:00')
    const now = new Date()
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(1, diff + 1) // Day 1 on start date
  }, [state.startDate])

  const totalSteps = ONBOARDING_STEPS.length
  const completedCount = state.completedSteps.length
  const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0
  const allComplete = completedCount >= totalSteps

  const nextStep = useMemo(() => {
    return ONBOARDING_STEPS.find((s) => !state.completedSteps.includes(s.id)) ?? null
  }, [state.completedSteps])

  // Audit caught: WelcomeBanner shown to returning users who never
  // explicitly dismissed it. Auto-stale after 7 days from startDate
  // (the user is no longer "new" by then). Explicit dismiss still wins.
  const stale = currentDay > 7

  return {
    startDate: state.startDate,
    completedSteps: state.completedSteps,
    dismissed: state.dismissed || stale,
    currentDay,
    totalSteps,
    completedCount,
    progress,
    allComplete,
    nextStep,
    completeStep,
    dismiss,
    reset,
  }
}
