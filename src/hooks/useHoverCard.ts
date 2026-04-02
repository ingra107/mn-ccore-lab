import { useState, useRef, useCallback, useEffect } from 'react'

interface HoverCardState {
  isVisible: boolean
  position: { x: number; y: number; placement: 'above' | 'below' }
  triggerRef: React.RefObject<HTMLElement | null>
  cardRef: React.RefObject<HTMLDivElement | null>
  handlers: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
  cardHandlers: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
}

const SHOW_DELAY = 300
const HIDE_DELAY = 200

export function useHoverCard(): HoverCardState {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number; placement: 'above' | 'below' }>({
    x: 0,
    y: 0,
    placement: 'below',
  })

  const triggerRef = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const cardHeight = 200 // estimated max card height
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const placement = spaceBelow >= cardHeight + 8 ? 'below' : spaceAbove >= cardHeight + 8 ? 'above' : 'below'

    const x = Math.min(rect.left, window.innerWidth - 328) // 320 + 8px margin
    const y = placement === 'below' ? rect.bottom + 6 : rect.top - 6

    setPosition({ x: Math.max(8, x), y, placement })
  }, [])

  const onTriggerEnter = useCallback(() => {
    clearTimers()
    showTimer.current = setTimeout(() => {
      calculatePosition()
      setIsVisible(true)
    }, SHOW_DELAY)
  }, [clearTimers, calculatePosition])

  const onTriggerLeave = useCallback(() => {
    clearTimers()
    hideTimer.current = setTimeout(() => {
      setIsVisible(false)
    }, HIDE_DELAY)
  }, [clearTimers])

  const onCardEnter = useCallback(() => {
    // Cancel the hide when mouse moves to the card
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const onCardLeave = useCallback(() => {
    clearTimers()
    hideTimer.current = setTimeout(() => {
      setIsVisible(false)
    }, HIDE_DELAY)
  }, [clearTimers])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  return {
    isVisible,
    position,
    triggerRef,
    cardRef,
    handlers: {
      onMouseEnter: onTriggerEnter,
      onMouseLeave: onTriggerLeave,
    },
    cardHandlers: {
      onMouseEnter: onCardEnter,
      onMouseLeave: onCardLeave,
    },
  }
}
